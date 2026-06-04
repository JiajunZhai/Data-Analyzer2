export type FieldType = 'dimension' | 'measure';

export type AggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max';

export type ValueAxis = 'rows' | 'columns';

export interface Field {
  name: string;
  type: FieldType;
  dataType: 'string' | 'number' | 'date';
  aggregation?: AggregationType;
  isCalculated?: boolean;
  isMapped?: boolean;
}

export interface CalculatedField {
  name: string;
  formula: string;
  fields: string[];
}

export interface PivotField {
  field: Field;
  aggregation?: AggregationType;
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
}

export interface ScenarioMapping {
  lookupMap: Map<string, string>;
  appCodes: string[];
  scenarioCount: number;
  mappedRowCount: number;
}
