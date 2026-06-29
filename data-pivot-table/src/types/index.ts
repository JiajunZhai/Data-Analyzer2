export type FieldType = 'dimension' | 'measure';

export type DimensionType = 'Attribute' | 'Behavior';
export type DimensionCategory = DimensionType;

export type AggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max';

export type ValueAxis = 'rows' | 'columns';

export interface Field {
  name: string;
  type: FieldType;
  dataType: 'string' | 'number' | 'date';
  aggregation?: AggregationType;
  isCalculated?: boolean;
  isMapped?: boolean;
  dimensionType?: DimensionType;
  dimensionCategory?: DimensionCategory;
}

export interface CalculatedField {
  name: string;
  formula: string;
  fields: string[];
}

export interface ValueFormatConfig {
  decimals?: number; // 0-6, 不设置则使用默认值
  thousandsSeparator?: boolean; // 千分位分隔符，默认 true
  displayAs?: 'value' | 'percentage';
}

export interface SortConfig {
  type: 'column' | 'dimension' | 'total';
  value: string; // 列索引字符串 或 维度名
  direction: 'asc' | 'desc';
}

export interface PivotField {
  field: Field;
  aggregation?: AggregationType;
  format?: ValueFormatConfig; // 仅值字段有意义
}

export interface PivotConfig {
  rows: PivotField[];
  columns: PivotField[];
  values: PivotField[];
  filters: PivotField[];
}

export interface DataRow {
  [key: string]: string | number | Date;
}

export interface ColumnLevel {
  value: string;
  colspan: number;
  startIndex?: number;
}

export interface FilterConfig {
  fieldName: string;
  selectedValues: string[];
}

export interface PivotTotalRow {
  label: string;
  values: number[];
  totalValues: number[];
  valueFieldNames: string[];
  totalValueFieldNames: string[];
}

export interface PivotTreeNode {
  id: string;
  label: string;
  path: string[];
  depth: number;
  data: number[];
  rowTotalValues: number[];
  rowIndex?: number;
  children: PivotTreeNode[];
}

export interface PivotResult {
  rowHeaders: string[][]; // 二维数组，每行包含多个维度值
  rowDimensions: string[]; // 行维度名称，如 ['国家', '日期']
  rowTree?: PivotTreeNode[];
  columnHeaders: string[];
  columnLevels: ColumnLevel[][];
  data: number[][];
  rowTotals: number[];
  columnTotals: number[];
  grandTotal: number;
  colFieldNames: string[];
  valueFieldNames: string[];
  valueAxis: ValueAxis;
  rowValueFieldNames: string[];
  columnValueFieldNames: string[];
  rowTotalValues: number[][];
  totalColumnHeaders: string[];
  totalColumnValueFieldNames: string[];
  totalRows: PivotTotalRow[];
  valueFormats?: Record<string, ValueFormatConfig>; // 指标名 → 格式配置
}
