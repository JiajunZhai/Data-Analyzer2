import type { Field, FieldType, DataRow } from '../types';

const DIMENSION_FIELDS = ['日期', '国家', '应用', '渠道', '版本', '广告场景'];

const MEASURE_FIELDS = ['注册用户', '曝光人数', '曝光次数', '广告收益', '点击次数'];

export function detectFieldTypes(headers: string[], data: DataRow[]): Field[] {
  return headers.map(header => {
    if (DIMENSION_FIELDS.includes(header)) {
      const dataType = header === '日期' ? 'date' as const : 'string' as const;
      return { name: header, type: 'dimension' as FieldType, dataType };
    }
    
    if (MEASURE_FIELDS.includes(header)) {
      return { name: header, type: 'measure' as FieldType, dataType: 'number' as const };
    }
    
    const values = data.map(row => row[header]).filter(v => v !== '' && v !== null && v !== undefined);
    
    if (values.length === 0) {
      return { name: header, type: 'dimension' as FieldType, dataType: 'string' as const };
    }

    const isNumeric = values.every(v => !isNaN(Number(v)));
    const isDate = values.every(v => isValidDate(String(v)));
    
    let dataType: 'string' | 'number' | 'date' = 'string';
    if (isNumeric) dataType = 'number';
    else if (isDate) dataType = 'date';

    const uniqueCount = new Set(values).size;
    const totalCount = values.length;
    const uniqueRatio = uniqueCount / totalCount;

    let type: FieldType;
    if (dataType === 'number' && uniqueRatio > 0.5) {
      type = 'measure';
    } else {
      type = 'dimension';
    }

    return { name: header, type, dataType };
  });
}

function isValidDate(str: string): boolean {
  if (!str) return false;
  const date = new Date(str);
  return !isNaN(date.getTime()) && str.length >= 8;
}

export function getDimensions(fields: Field[]): Field[] {
  return fields.filter(f => f.type === 'dimension');
}

export function getMeasures(fields: Field[]): Field[] {
  return fields.filter(f => f.type === 'measure');
}
