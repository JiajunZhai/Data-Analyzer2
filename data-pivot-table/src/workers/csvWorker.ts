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
    else if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    )
      cjkCount++;
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
  } catch {
    /* fallback */
  }

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
    else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else current += char;
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

type DataRow = Record<string, string | number>;

// ============ 数据预处理（内联，避免外部依赖） ============

const COUNTRY_MAP: Record<string, string> = {};
const BEHAVIOR_DIMENSIONS = [
  '标准广告场景',
  'standard_scene',
  '广告场景',
  '聚合广告场景',
  '广告类型',
  '变现渠道',
  '广告变现渠道',
];

const CALCULATED_METRICS: Record<string, { formula: string; fields: string[] }> = {
  eCPM: { formula: '(广告收益 / 曝光次数) * 1000', fields: ['广告收益', '曝光次数'] },
  CTR: { formula: '点击次数 / 曝光次数', fields: ['点击次数', '曝光次数'] },
  ARPU: { formula: '广告收益 / 注册用户', fields: ['广告收益', '注册用户'] },
  渗透率: { formula: '曝光人数 / 注册用户', fields: ['曝光人数', '注册用户'] },
  IPU: { formula: '曝光次数 / 注册用户', fields: ['曝光次数', '注册用户'] },
  '收益占比%': { formula: '(广告收益 / 总广告收益) * 100', fields: ['广告收益', '总广告收益'] },
};

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseCell(value: string): string | number {
  const num = Number(value);
  return Number.isNaN(num) ? value : num;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function isAllBehaviorRow(row: DataRow): boolean {
  for (let i = 0; i < BEHAVIOR_DIMENSIONS.length; i++) {
    if (
      String(row[BEHAVIOR_DIMENSIONS[i]] ?? '')
        .trim()
        .toUpperCase() === 'ALL'
    ) {
      return true;
    }
  }
  return false;
}

function getMappedCountry(value: unknown): string {
  const code = String(value ?? '').trim();
  return code ? (COUNTRY_MAP[code.toLowerCase()] ?? code) : '';
}

function getRegisterLookupKey(row: DataRow): string {
  const date = String(row.安装日期 ?? row.日期 ?? '').trim();
  const app = String(row.应用 ?? row.app_code ?? '').trim();
  const country = getMappedCountry(row.国家);
  const channel = String(row.买量渠道 ?? row.渠道 ?? '').trim();
  const version = String(row.版本 ?? '').trim();
  return `${date}\u001f${app}\u001f${country}\u001f${channel}\u001f${version}`;
}

function addCalculatedMetrics(row: DataRow, totalRevenue: number): void {
  const revenue = toNumber(row.广告收益);
  const impressions = toNumber(row.曝光次数);
  const clicks = toNumber(row.点击次数);
  const impressionUsers = toNumber(row.曝光人数);
  const registeredUsers = toNumber(row.注册用户);

  row.总广告收益 = totalRevenue;
  row.eCPM = safeDivide(revenue, impressions) * 1000;
  row.CTR = safeDivide(clicks, impressions);
  row.ARPU = safeDivide(revenue, registeredUsers);
  row.渗透率 = safeDivide(impressionUsers, registeredUsers);
  row.IPU = safeDivide(impressions, registeredUsers);
  row['收益占比%'] = safeDivide(revenue, totalRevenue) * 100;
}

// ============ 字段检测 ============

const ATTRIBUTE_DIMENSIONS = new Set([
  '安装日期',
  '日期',
  '国家',
  '应用',
  'app_code',
  '买量渠道',
  '渠道',
  '版本',
  '生命周期',
]);
const BEHAVIOR_DIMENSIONS_SET = new Set([
  '标准广告场景',
  'standard_scene',
  '广告场景',
  '聚合广告场景',
  '广告类型',
  '变现渠道',
  '广告变现渠道',
]);
const DIMENSION_FIELDS = [
  '日期',
  '国家',
  '应用',
  'app_code',
  '买量渠道',
  '渠道',
  '版本',
  '标准广告场景',
  'standard_scene',
  '聚合广告场景',
  '广告类型',
  '变现渠道',
  '广告变现渠道',
  '广告场景',
  '生命周期',
  '安装日期',
];
const MEASURE_FIELDS = ['注册用户', '活跃用户', '曝光人数', '曝光次数', '广告收益', '点击次数'];

interface Field {
  name: string;
  type: 'dimension' | 'measure';
  dataType: 'string' | 'number' | 'date';
  isCalculated?: boolean;
  dimensionType?: 'Attribute' | 'Behavior';
  dimensionCategory?: 'Attribute' | 'Behavior';
}

function detectFieldTypes(headers: string[], data: DataRow[]): Field[] {
  return headers.map((header) => {
    if (DIMENSION_FIELDS.includes(header)) {
      const dimensionType = BEHAVIOR_DIMENSIONS_SET.has(header)
        ? 'Behavior'
        : ATTRIBUTE_DIMENSIONS.has(header)
          ? 'Attribute'
          : undefined;
      return {
        name: header,
        type: 'dimension',
        dataType: header === '日期' ? 'date' : 'string',
        dimensionType,
        dimensionCategory: dimensionType,
      };
    }
    if (MEASURE_FIELDS.includes(header)) {
      return { name: header, type: 'measure', dataType: 'number' };
    }
    const values = data
      .slice(0, 1000)
      .map((r) => r[header])
      .filter((v) => v !== '' && v != null);
    if (values.length === 0) return { name: header, type: 'dimension', dataType: 'string' };
    const isNumeric = values.every((v) => !Number.isNaN(Number(v)));
    const uniqueCount = new Set(values).size;
    const type = isNumeric && uniqueCount / values.length > 0.5 ? 'measure' : 'dimension';
    return { name: header, type, dataType: isNumeric ? 'number' : 'string' };
  });
}

// ============ 主处理流程 ============

const CHUNK_SIZE = 1024 * 1024; // 1MB

interface WorkerInput {
  file?: File;
  fileBuffer?: ArrayBuffer;
  countryMapping?: Record<string, string>;
}

self.onmessage = async (e: MessageEvent) => {
  const { file, fileBuffer, countryMapping } = e.data as WorkerInput;

  try {
    // 加载国家映射
    if (countryMapping) {
      Object.assign(COUNTRY_MAP, countryMapping);
    }

    if (!file && !fileBuffer) {
      throw new Error('缺少文件数据');
    }

    const fileSize = file?.size ?? fileBuffer?.byteLength ?? 0;
    let firstBytes: Uint8Array;
    if (file) {
      firstBytes = new Uint8Array(await file.slice(0, Math.min(8192, file.size)).arrayBuffer());
    } else {
      const buffer = fileBuffer;
      if (!buffer) throw new Error('缺少文件数据');
      firstBytes = new Uint8Array(buffer.slice(0, Math.min(8192, buffer.byteLength)));
    }
    const decoder = detectDecoder(firstBytes);

    // 第一遍：逐行解析，同步计算全局总收益和 ALL 行注册用户映射
    const headers: string[] = [];
    const rows: DataRow[] = [];
    let buffer = '';
    let isFirstLine = true;
    let totalRevenue = 0;
    const registeredUserLookup = new Map<string, number>();

    let lineCount = 0;
    const appendDataRow = (values: string[]) => {
      const obj: DataRow = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = parseCell(values[i] ?? '');
      }

      totalRevenue += toNumber(obj.广告收益);

      if (isAllBehaviorRow(obj)) {
        const val = Number(obj.注册用户);
        if (!Number.isNaN(val) && val > 0) registeredUserLookup.set(getRegisterLookupKey(obj), val);
      }

      rows.push(obj);
      lineCount++;
    };

    const processDecodedText = (text: string, progress: number) => {
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

        appendDataRow(parseCSVLine(trimmed));

        if (lineCount % 50000 === 0) {
          self.postMessage({
            type: 'progress',
            phase: 'parsing',
            progress,
            rowCount: lineCount,
          });
        }
      }
    };

    if (file) {
      const reader = file.stream().getReader();
      let bytesRead = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesRead += value.byteLength;
        const text = decoder.decode(value, { stream: true });
        processDecodedText(text, fileSize > 0 ? bytesRead / fileSize : 1);
      }
    } else if (fileBuffer) {
      const fileBytes = new Uint8Array(fileBuffer);
      let offset = 0;

      while (offset < fileSize) {
        const end = Math.min(offset + CHUNK_SIZE, fileSize);
        const chunk = fileBytes.slice(offset, end);
        const text = decoder.decode(chunk, { stream: true });

        processDecodedText(text, fileSize > 0 ? end / fileSize : 1);
        offset = end;
      }
    }

    const decoderTail = decoder.decode();
    if (decoderTail) {
      processDecodedText(decoderTail, 1);
    }

    // 处理最后一行
    if (buffer.trim()) {
      if (isFirstLine) {
        headers.push(...parseCSVLine(buffer.trim()));
      } else {
        appendDataRow(parseCSVLine(buffer.trim()));
      }
    }

    self.postMessage({
      type: 'progress',
      phase: 'preprocessing',
      progress: 0.9,
      rowCount: rows.length,
    });

    // 第二遍：原地预处理（不创建新数组）
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // 国家映射
      row.国家 = getMappedCountry(row.国家);

      // 注册用户回填
      const regUsers = Number(row.注册用户);
      const isDetailRow = !isAllBehaviorRow(row);
      if ((!regUsers || regUsers === 0) && isDetailRow) {
        const fallback = registeredUserLookup.get(getRegisterLookupKey(row));
        if (fallback && fallback > 0) row.注册用户 = fallback;
      }

      // 计算字段
      addCalculatedMetrics(row, totalRevenue);

      if (i % 50000 === 0) {
        self.postMessage({
          type: 'progress',
          phase: 'preprocessing',
          progress: 0.9 + 0.1 * (i / rows.length),
          rowCount: rows.length,
        });
      }
    }

    // 字段检测
    const fields = detectFieldTypes(headers, rows);
    const calculatedFields: Field[] = Object.keys(CALCULATED_METRICS).map((name) => ({
      name,
      type: 'measure' as const,
      dataType: 'number' as const,
      isCalculated: true,
    }));

    // 发送最终结果（包含完整数据，标记已预处理）
    self.postMessage({
      type: 'done',
      headers,
      fields: [...fields, ...calculatedFields],
      data: rows,
      rowCount: rows.length,
      preprocessed: true,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : '文件解析失败',
    });
  }
};
