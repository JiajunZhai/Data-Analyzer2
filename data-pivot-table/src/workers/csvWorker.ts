/**
 * CSV 大文件解析 Web Worker
 * 在后台线程完成：编码检测 → CSV 解析 → 数据预处理 → 字段检测
 * 主线程只接收最终结果，不会被阻塞
 */

// ============ 编码检测 ============

function hasGarbledText(text: string): boolean {
  if (text.includes('\uFFFD')) return true;
  let cjkCount = 0;
  let highByteCount = 0;
  let asciiCount = 0;
  const sampleLength = Math.min(text.length, 2000);
  for (let i = 0; i < sampleLength; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) asciiCount++;
    else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0x3000 && code <= 0x303f) || (code >= 0xff00 && code <= 0xffef)) cjkCount++;
    else highByteCount++;
  }
  const nonAsciiLength = sampleLength - asciiCount;
  if (nonAsciiLength === 0) return false;
  if (nonAsciiLength > 0 && highByteCount / nonAsciiLength > 0.3) return true;
  if (highByteCount > 10 && cjkCount === 0) return true;
  return false;
}

function detectDecoder(firstBytes: Uint8Array): TextDecoder {
  const hasBOM = firstBytes[0] === 0xef && firstBytes[1] === 0xbb && firstBytes[2] === 0xbf;
  if (hasBOM) return new TextDecoder('utf-8');

  const sample = firstBytes.slice(0, Math.min(8192, firstBytes.length));
  const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
  if (!hasGarbledText(utf8Decoder.decode(sample))) return new TextDecoder('utf-8');

  try {
    const gbkDecoder = new TextDecoder('gbk', { fatal: false });
    if (!hasGarbledText(gbkDecoder.decode(sample))) return new TextDecoder('gbk');
  } catch { /* fallback */ }

  return new TextDecoder('utf-8');
}

// ============ CSV 解析 ============

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current.trim().replace(/^"|"$/g, '')); current = ''; }
    else current += char;
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

type DataRow = Record<string, string | number>;

// ============ 数据预处理（内联，避免外部依赖） ============

const COUNTRY_MAP: Record<string, string> = {};

const CALCULATED_METRICS: Record<string, { formula: string; fields: string[] }> = {
  eCPM: { formula: '(广告收益 / 曝光次数) * 1000', fields: ['广告收益', '曝光次数'] },
  CTR: { formula: '点击次数 / 曝光次数', fields: ['点击次数', '曝光次数'] },
  ARPU: { formula: '广告收益 / 注册用户', fields: ['广告收益', '注册用户'] },
  渗透率: { formula: '曝光人数 / 注册用户', fields: ['曝光人数', '注册用户'] },
  IPU: { formula: '曝光次数 / 注册用户', fields: ['曝光次数', '注册用户'] },
  '收益占比%': { formula: '(广告收益 / 总广告收益) * 100', fields: ['广告收益', '总广告收益'] },
};

const SAFE_EXPR_PATTERN = /^[\d\s+\-*/().]+$/;
function safeEval(expr: string): number {
  if (!SAFE_EXPR_PATTERN.test(expr)) return 0;
  try {
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch { return 0; }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const calculatedFieldRegexes = new Map<string, RegExp[]>();
for (const [name, config] of Object.entries(CALCULATED_METRICS)) {
  calculatedFieldRegexes.set(name, [...config.fields].sort((a, b) => b.length - a.length).map(f => new RegExp(escapeRegExp(f), 'g')));
}

// ============ 字段检测 ============

const DIMENSION_FIELDS = ['日期', '国家', '应用', '渠道', '版本', '标准广告场景', '聚合广告场景'];
const MEASURE_FIELDS = ['注册用户', '曝光人数', '曝光次数', '广告收益', '点击次数'];

interface Field {
  name: string;
  type: 'dimension' | 'measure';
  dataType: 'string' | 'number' | 'date';
  isCalculated?: boolean;
}

function detectFieldTypes(headers: string[], data: DataRow[]): Field[] {
  return headers.map((header) => {
    if (DIMENSION_FIELDS.includes(header)) {
      return { name: header, type: 'dimension', dataType: header === '日期' ? 'date' : 'string' };
    }
    if (MEASURE_FIELDS.includes(header)) {
      return { name: header, type: 'measure', dataType: 'number' };
    }
    const values = data.slice(0, 1000).map(r => r[header]).filter(v => v !== '' && v != null);
    if (values.length === 0) return { name: header, type: 'dimension', dataType: 'string' };
    const isNumeric = values.every(v => !isNaN(Number(v)));
    const uniqueCount = new Set(values).size;
    const type = isNumeric && uniqueCount / values.length > 0.5 ? 'measure' : 'dimension';
    return { name: header, type, dataType: isNumeric ? 'number' : 'string' };
  });
}

// ============ 主处理流程 ============

const CHUNK_SIZE = 1024 * 1024; // 1MB

self.onmessage = async (e: MessageEvent) => {
  const { fileBuffer, countryMapping } = e.data;

  try {
    // 加载国家映射
    if (countryMapping) {
      Object.assign(COUNTRY_MAP, countryMapping);
    }

    const fileBytes = new Uint8Array(fileBuffer);
    const fileSize = fileBytes.length;
    const decoder = detectDecoder(fileBytes);

    // 第一遍：逐行解析，同步计算全局总收益和 ALL 行注册用户映射
    const headers: string[] = [];
    const rows: DataRow[] = [];
    let buffer = '';
    let isFirstLine = true;
    let totalRevenue = 0;
    const registeredUserLookup = new Map<string, number>();

    let offset = 0;
    let lineCount = 0;

    while (offset < fileSize) {
      const end = Math.min(offset + CHUNK_SIZE, fileSize);
      const chunk = fileBytes.slice(offset, end);
      const isLast = end >= fileSize;
      const text = decoder.decode(chunk, { stream: !isLast });

      const fullText = buffer + text;
      const parts = fullText.split('\n');
      buffer = parts.pop() || '';

      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (isFirstLine) {
          headers.push(...parseCSVLine(trimmed));
          isFirstLine = false;
          continue;
        }

        const values = parseCSVLine(trimmed);
        const obj: DataRow = {};
        for (let i = 0; i < headers.length; i++) {
          const val = values[i] ?? '';
          obj[headers[i]] = isNaN(Number(val)) ? val : Number(val);
        }

        // 累计总收益
        totalRevenue += Number(obj['广告收益']) || 0;

        // 收集 ALL 行注册用户
        const scene = String(obj['标准广告场景'] ?? obj['聚合广告场景'] ?? '').trim().toUpperCase();
        if (scene === 'ALL') {
          const date = String(obj['日期'] ?? '').trim();
          const app = String(obj['应用'] ?? '').trim();
          const country = String(obj['国家'] ?? '').trim();
          const key = `${date}\u001f${app}\u001f${country}`;
          const val = Number(obj['注册用户']);
          if (!Number.isNaN(val) && val > 0) registeredUserLookup.set(key, val);
        }

        rows.push(obj);
        lineCount++;

        if (lineCount % 50000 === 0) {
          self.postMessage({ type: 'progress', phase: 'parsing', progress: offset / fileSize, rowCount: lineCount });
        }
      }

      offset = end;
    }

    // 处理最后一行
    if (buffer.trim()) {
      if (isFirstLine) {
        headers.push(...parseCSVLine(buffer.trim()));
      } else {
        const values = parseCSVLine(buffer.trim());
        const obj: DataRow = {};
        for (let i = 0; i < headers.length; i++) {
          const val = values[i] ?? '';
          obj[headers[i]] = isNaN(Number(val)) ? val : Number(val);
        }
        rows.push(obj);
      }
    }

    self.postMessage({ type: 'progress', phase: 'preprocessing', progress: 0.9, rowCount: rows.length });

    // 第二遍：原地预处理（不创建新数组）
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // 国家映射
      const code = String(row['国家'] ?? '');
      if (code && COUNTRY_MAP[code.toLowerCase()]) {
        row['国家'] = COUNTRY_MAP[code.toLowerCase()];
      }

      // 注册用户回填
      const regUsers = Number(row['注册用户']);
      const scene = String(row['标准广告场景'] ?? row['聚合广告场景'] ?? '').trim().toUpperCase();
      if ((!regUsers || regUsers === 0) && scene !== 'ALL') {
        const date = String(row['日期'] ?? '').trim();
        const app = String(row['应用'] ?? '').trim();
        const country = String(row['国家'] ?? '').trim();
        const key = `${date}\u001f${app}\u001f${country}`;
        const fallback = registeredUserLookup.get(key);
        if (fallback && fallback > 0) row['注册用户'] = fallback;
      }

      // 计算字段
      row['总广告收益'] = totalRevenue;
      for (const [metricName, config] of Object.entries(CALCULATED_METRICS)) {
        const regexes = calculatedFieldRegexes.get(metricName)!;
        let formula = config.formula;
        config.fields.forEach((fieldName, idx) => {
          const value = fieldName === '总广告收益' ? totalRevenue : (Number(row[fieldName]) || 0);
          formula = formula.replace(regexes[idx], String(value));
        });
        row[metricName] = safeEval(formula);
      }

      if (i % 50000 === 0) {
        self.postMessage({ type: 'progress', phase: 'preprocessing', progress: 0.9 + 0.1 * (i / rows.length), rowCount: rows.length });
      }
    }

    // 字段检测
    const fields = detectFieldTypes(headers, rows);
    const calculatedFields: Field[] = Object.keys(CALCULATED_METRICS).map(name => ({
      name,
      type: 'measure' as const,
      dataType: 'number' as const,
      isCalculated: true,
    }));

    // 发送最终结果（包含完整数据）
    self.postMessage({
      type: 'done',
      headers,
      fields: [...fields, ...calculatedFields],
      data: rows,
      rowCount: rows.length,
    });

  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : '文件解析失败' });
  }
};
