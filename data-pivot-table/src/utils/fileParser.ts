import type { DataRow } from '../types';
import { readAsTextWithAutoEncoding, readFileChunked } from './encodingUtils';

/**
 * 解析CSV行，正确处理引号内的逗号
 * 例如: "北京, 上海",test → ["北京, 上海", "test"]
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

export interface ParseProgress {
  phase: 'reading' | 'parsing' | 'done';
  progress: number; // 0-1
  rowCount: number;
}

export async function parseExcelFile(file: File): Promise<{ headers: string[]; data: DataRow[] }> {
  // 动态导入 xlsx，减少首屏 bundle 大小
  const XLSX = await import('xlsx');

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as (
          | string
          | number
        )[][];

        if (jsonData.length === 0) {
          reject(new Error('文件为空'));
          return;
        }

        const headers = jsonData[0].map(String);
        const rows = jsonData.slice(1).map((row) => {
          const obj: DataRow = {};
          headers.forEach((header, index) => {
            obj[header] = row[index] ?? '';
          });
          return obj;
        });

        resolve({ headers, data: rows });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 流式解析 CSV 文件
 * 分块读取文件，逐行解析，避免将整个文件加载到内存
 */
export async function parseCSVFileChunked(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<{ headers: string[]; data: DataRow[] }> {
  const lines: DataRow[] = [];
  let headers: string[] = [];
  let buffer = ''; // 跨块的不完整行缓冲
  let isFirstChunk = true;
  let rowCount = 0;

  for await (const chunk of readFileChunked(file)) {
    // 将上一个块的残留与当前块拼接
    const fullText = buffer + chunk.text;

    // 按换行分割，最后一行可能是不完整的（被截断）
    const parts = fullText.split('\n');
    buffer = parts.pop() || ''; // 最后一个元素可能不完整，留到下一块处理

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (isFirstChunk) {
        headers = parseCSVLine(trimmed);
        isFirstChunk = false;
        continue;
      }

      const values = parseCSVLine(trimmed);
      const obj: DataRow = {};
      for (let i = 0; i < headers.length; i++) {
        const val = values[i] ?? '';
        obj[headers[i]] = isNaN(Number(val)) ? val : Number(val);
      }
      lines.push(obj);
      rowCount++;

      // 每处理 10000 行报告一次进度
      if (rowCount % 10000 === 0) {
        onProgress?.({ phase: 'parsing', progress: chunk.progress, rowCount });
      }
    }

    onProgress?.({ phase: 'reading', progress: chunk.progress, rowCount });
  }

  // 处理最后一个残留行
  if (buffer.trim()) {
    if (isFirstChunk) {
      headers = parseCSVLine(buffer.trim());
    } else {
      const values = parseCSVLine(buffer.trim());
      const obj: DataRow = {};
      for (let i = 0; i < headers.length; i++) {
        const val = values[i] ?? '';
        obj[headers[i]] = isNaN(Number(val)) ? val : Number(val);
      }
      lines.push(obj);
    }
  }

  if (headers.length === 0) {
    throw new Error('文件为空');
  }

  onProgress?.({ phase: 'done', progress: 1, rowCount: lines.length });
  return { headers, data: lines };
}

/**
 * 小文件使用原始方式解析（保持兼容）
 */
export function parseCSVFile(file: File): Promise<{ headers: string[]; data: DataRow[] }> {
  // 大于 10MB 的文件使用分块解析
  if (file.size > 10 * 1024 * 1024) {
    return parseCSVFileChunked(file);
  }

  return new Promise((resolve, reject) => {
    readAsTextWithAutoEncoding(
      file,
      (text) => {
        try {
          const lines = text.split('\n').filter((line) => line.trim());

          if (lines.length === 0) {
            reject(new Error('文件为空'));
            return;
          }

          const headers = parseCSVLine(lines[0]);
          const rows = lines.slice(1).map((line) => {
            const values = parseCSVLine(line);
            const obj: DataRow = {};
            headers.forEach((header, index) => {
              const val = values[index] ?? '';
              obj[header] = isNaN(Number(val)) ? val : Number(val);
            });
            return obj;
          });

          resolve({ headers, data: rows });
        } catch (error) {
          reject(error);
        }
      },
      (error) => reject(error)
    );
  });
}

export function parseMappingCSV(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    readAsTextWithAutoEncoding(
      file,
      (text) => {
        try {
          const lines = text.split('\n').filter((line) => line.trim());

          if (lines.length < 2) {
            reject(new Error('映射表至少需要包含表头和一行数据'));
            return;
          }

          const headers = parseCSVLine(lines[0]);
          const rows = lines.slice(1).map((line) => parseCSVLine(line));

          resolve({ headers, rows });
        } catch (error) {
          reject(error);
        }
      },
      (error) => reject(error)
    );
  });
}
