import type { DataRow, FilterConfig, PivotField, PivotResult, ValueFormatConfig } from '../types';
import { BASE_METRICS } from './calculatedField';

export type ExportObjectType = 'pivot' | 'filtered-data' | 'config' | 'analysis';
export type ExportFormat = 'xlsx' | 'csv' | 'json';

export interface PivotExportOptions {
  includeRowTotal: boolean;
  includeColumnTotal: boolean;
  includeConfigSheet: boolean;
}

export interface PivotExportInput {
  result: PivotResult;
  datasetName?: string;
  rowFields: PivotField[];
  colFields: PivotField[];
  valueFields: PivotField[];
  filterConfigs: FilterConfig[];
  options: PivotExportOptions;
}

export interface PivotConfigExportInput {
  datasetName?: string;
  rowFields: PivotField[];
  colFields: PivotField[];
  valueFields: PivotField[];
  filterConfigs: FilterConfig[];
  showRowTotal: boolean;
  showColumnTotal: boolean;
}

export const XLSX_ROW_LIMIT = 1_048_576;

const CSV_MIME = 'text/csv;charset=utf-8';
const JSON_MIME = 'application/json;charset=utf-8';

export function filterRowsByConfigs(data: DataRow[], filterConfigs: FilterConfig[]): DataRow[] {
  if (filterConfigs.length === 0) return data;

  const filterSets = filterConfigs.map((filter) => ({
    fieldName: filter.fieldName,
    values: new Set(filter.selectedValues.map(String)),
  }));

  return data.filter((row) =>
    filterSets.every((filter) => filter.values.has(String(row[filter.fieldName] ?? '')))
  );
}

export function getDataHeaders(fields: { name: string }[], data: DataRow[]): string[] {
  const headers = new Set<string>(fields.map((field) => field.name));
  for (const row of data.slice(0, 200)) {
    Object.keys(row).forEach((key) => {
      headers.add(key);
    });
  }
  return Array.from(headers);
}

export function downloadCsv(filename: string, headers: string[], rows: DataRow[]): void {
  const csvRows = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(',')),
  ];
  downloadBlob(`\uFEFF${csvRows.join('\r\n')}`, filename, CSV_MIME);
}

export function downloadJson(filename: string, payload: unknown): void {
  downloadBlob(JSON.stringify(payload, null, 2), filename, JSON_MIME);
}

export async function downloadPivotXlsx(input: PivotExportInput, filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const pivotSheet = XLSX.utils.aoa_to_sheet(buildPivotSheetRows(input.result, input.options));
  XLSX.utils.book_append_sheet(workbook, pivotSheet, '透视表');

  if (input.options.includeConfigSheet) {
    const configSheet = XLSX.utils.aoa_to_sheet(buildConfigSheetRows(input));
    XLSX.utils.book_append_sheet(workbook, configSheet, '字段配置');
  }

  XLSX.writeFile(workbook, filename, { compression: true });
}

export function buildPivotConfigPayload(input: PivotConfigExportInput) {
  return {
    schemaVersion: 1,
    type: 'pivot-config',
    datasetName: input.datasetName ?? '',
    exportedAt: new Date().toISOString(),
    rowFields: serializePivotFields(input.rowFields),
    colFields: serializePivotFields(input.colFields),
    valueFields: serializePivotFields(input.valueFields),
    filters: input.filterConfigs,
    totals: {
      rowTotal: input.showRowTotal,
      columnTotal: input.showColumnTotal,
    },
  };
}

export function createExportFilename(
  datasetName: string | undefined,
  objectType: ExportObjectType,
  format: ExportFormat
): string {
  const date = new Date().toISOString().slice(0, 10);
  const dataset = sanitizeFilePart(datasetName?.trim() || 'dataset');
  const typePart: Record<ExportObjectType, string> = {
    pivot: 'pivot',
    'filtered-data': 'filtered-data',
    config: 'config',
    analysis: 'analysis',
  };
  return `${dataset}-${typePart[objectType]}-${date}.${format}`;
}

function buildPivotSheetRows(
  result: PivotResult,
  options: PivotExportOptions
): (string | number)[][] {
  const dimensionHeaders =
    result.rowDimensions.length > 0
      ? result.rowDimensions
      : Array.from({ length: Math.max(1, result.rowHeaders[0]?.length ?? 1) }, (_, index) =>
          index === 0 ? '行维度' : `行维度 ${index + 1}`
        );
  const dataHeaders = result.columnHeaders.map(formatColumnHeader);
  const totalHeaders = options.includeRowTotal
    ? result.totalColumnHeaders.map((header, index) =>
        header ? `行总计 / ${formatColumnHeader(header)}` : `行总计 ${index + 1}`
      )
    : [];

  const rows: (string | number)[][] = [[...dimensionHeaders, ...dataHeaders, ...totalHeaders]];

  result.rowHeaders.forEach((rowHeader, rowIndex) => {
    const cells = result.data[rowIndex] ?? [];
    const totalCells = options.includeRowTotal ? (result.rowTotalValues[rowIndex] ?? []) : [];
    rows.push([
      ...dimensionHeaders.map((_, index) => rowHeader[index] ?? ''),
      ...cells.map((value, index) =>
        formatExportValue(value, result.columnValueFieldNames[index], result.valueFormats)
      ),
      ...totalCells.map((value, index) =>
        formatExportValue(value, result.totalColumnValueFieldNames[index], result.valueFormats)
      ),
    ]);
  });

  if (options.includeColumnTotal && result.totalRows.length > 0) {
    result.totalRows.forEach((totalRow) => {
      rows.push([
        totalRow.label,
        ...Array.from({ length: Math.max(0, dimensionHeaders.length - 1) }, () => ''),
        ...totalRow.values.map((value, index) =>
          formatExportValue(value, totalRow.valueFieldNames[index], result.valueFormats)
        ),
        ...(options.includeRowTotal
          ? totalRow.totalValues.map((value, index) =>
              formatExportValue(value, totalRow.totalValueFieldNames[index], result.valueFormats)
            )
          : []),
      ]);
    });
  }

  return rows;
}

function buildConfigSheetRows(input: PivotExportInput): (string | number)[][] {
  return [
    ['数据源', input.datasetName ?? ''],
    ['导出时间', new Date().toLocaleString('zh-CN')],
    [''],
    ['区域', '字段', '聚合', '格式'],
    ...serializePivotFields(input.rowFields).map((field) => [
      '行字段',
      field.name,
      field.aggregation,
      '',
    ]),
    ...serializePivotFields(input.colFields).map((field) => [
      '列字段',
      field.name,
      field.aggregation,
      '',
    ]),
    ...serializePivotFields(input.valueFields).map((field) => [
      '值字段',
      field.name,
      field.aggregation,
      field.format ? JSON.stringify(field.format) : '',
    ]),
    [''],
    ['筛选字段', '选中值'],
    ...input.filterConfigs.map((filter) => [filter.fieldName, filter.selectedValues.join('、')]),
  ];
}

function serializePivotFields(fields: PivotField[]) {
  return fields.map((field) => ({
    name: field.field.name,
    type: field.field.type,
    dataType: field.field.dataType,
    aggregation: field.aggregation ?? field.field.aggregation ?? 'sum',
    format: field.format,
    isCalculated: field.field.isCalculated ?? false,
  }));
}

function formatExportValue(
  value: number,
  metricName?: string,
  valueFormats?: Record<string, ValueFormatConfig>
): string | number {
  if (!Number.isFinite(value) || value === 0) return '';
  const formatConfig = metricName ? valueFormats?.[metricName] : undefined;
  if (formatConfig) {
    const decimals = formatConfig.decimals ?? 2;
    if (formatConfig.displayAs === 'percentage') return `${(value * 100).toFixed(decimals)}%`;
    return Number(value.toFixed(decimals));
  }
  if (metricName === '渗透率' || metricName === 'CTR') return `${(value * 100).toFixed(2)}%`;
  if (metricName === '收益占比%') return `${value.toFixed(2)}%`;
  if (metricName === 'ARPU') return Number(value.toFixed(4));
  if (metricName === 'eCPM' || metricName === 'IPU') return Number(value.toFixed(2));
  if (metricName === '广告收益') return Number(value.toFixed(2));
  if (BASE_METRICS.includes(metricName || '')) return Math.round(value);
  return Number(value.toFixed(2));
}

function formatColumnHeader(header: string): string {
  return header.split('\u001f').filter(Boolean).join(' / ') || '总计';
}

function escapeCsvCell(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadBlob(content: BlobPart, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}
