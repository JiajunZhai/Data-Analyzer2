import * as XLSX from 'xlsx';
import type { DataRow } from '../types';

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

export function parseExcelFile(file: File): Promise<{ headers: string[]; data: DataRow[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as (string | number)[][];
        
        if (jsonData.length === 0) {
          reject(new Error('文件为空'));
          return;
        }

        const headers = jsonData[0].map(String);
        const rows = jsonData.slice(1).map(row => {
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

export function parseCSVFile(file: File): Promise<{ headers: string[]; data: DataRow[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          reject(new Error('文件为空'));
          return;
        }

        const headers = parseCSVLine(lines[0]);
        const rows = lines.slice(1).map(line => {
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
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

export function parseMappingCSV(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          reject(new Error('映射表至少需要包含表头和一行数据'));
          return;
        }

        const headers = parseCSVLine(lines[0]);
        const rows = lines.slice(1).map(line => parseCSVLine(line));

        resolve({ headers, rows });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}
