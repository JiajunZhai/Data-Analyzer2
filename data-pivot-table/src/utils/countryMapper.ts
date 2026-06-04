import type { DataRow } from '../types';
import countryMapping from '../data/countryMapping.json';

const map: Record<string, string> = countryMapping;

export function getCountryName(code: string): string {
  return map[code.toLowerCase()] ?? code;
}

export function applyCountryMapping(
  data: DataRow[],
  fieldName: string = '国家'
): DataRow[] {
  return data.map(row => {
    const code = String(row[fieldName] ?? '');
    if (!code) return row;
    return { ...row, [fieldName]: getCountryName(code) };
  });
}
