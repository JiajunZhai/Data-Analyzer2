import type { Field } from '../types';

export type SpatialZoneId = 'rows' | 'columns' | 'values';

// 判断字段类型（维度 or 指标）
export const getFieldType = (field: Field): 'dimension' | 'metric' => {
  return field.type === 'measure' ? 'metric' : 'dimension';
};

// 判断目标区是否接受该字段类型
export const canDropToZone = (
  fieldType: 'dimension' | 'metric',
  targetZoneId: SpatialZoneId
): boolean => {
  if (targetZoneId === 'values') {
    return fieldType === 'metric';
  }
  return fieldType === 'dimension';
};

// 生成可排序 ID
export const getSpatialSortableId = (zoneId: SpatialZoneId, fieldName: string) =>
  `${zoneId}::${fieldName}`;
