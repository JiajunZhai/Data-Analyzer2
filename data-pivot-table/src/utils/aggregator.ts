import type {
  AggregationType,
  ColumnLevel,
  DataRow,
  FilterConfig,
  PivotField,
  PivotResult,
  PivotTotalRow,
  PivotTreeNode,
  ValueAxis,
} from '../types';
import { BASE_METRICS, calculateMetricFromAggregates, isCalculatedMetric } from './calculatedField';

const KEY_SEPARATOR = '\u001f';
const TOTAL_LABEL = '总计';
const RAW_SCENARIO_FIELD = '广告场景';
const MAPPED_SCENARIO_FIELD = '实际场景';
const ALL_SCENARIO_VALUE = 'ALL';
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

type MetricSeriesMap = Record<string, number[]>;

interface KeyInfo {
  key: string;
  parts: string[];
}

interface DisplayColumn {
  key: string;
  sourceColumnKey: string;
  parts: string[];
  valueField: PivotField;
}

interface DisplayRow {
  key: string;
  sourceRowKey: string;
  label: string;
  valueField: PivotField;
}

export function aggregateData(
  data: DataRow[],
  rowFields: PivotField[],
  colFields: PivotField[],
  valueFields: PivotField[],
  filterConfigs: FilterConfig[] = [],
  valueAxis: ValueAxis = 'columns'
): PivotResult {
  let filteredData = data;

  filterConfigs.forEach((filter) => {
    filteredData = filteredData.filter((row) =>
      filter.selectedValues.includes(String(row[filter.fieldName]))
    );
  });

  filteredData = normalizeScenarioRows(filteredData, rowFields, colFields, filterConfigs);

  const metricNames = getMetricNames(valueFields);

  const constants: Record<string, number> = {};
  if (filteredData.length > 0) {
    // 动态计算筛选后的总广告收益，确保收益占比逻辑正确
    const filteredTotalRevenue = filteredData.reduce(
      (sum, row) => sum + (Number(row['广告收益']) || 0),
      0
    );
    constants['总广告收益'] = filteredTotalRevenue;
  }

  const rowKeyParts = new Map<string, string[]>();
  const colKeyParts = new Map<string, string[]>();
  const rowKeys = new Set<string>();
  const colKeys = new Set<string>();
  const baseDataMap = new Map<string, Map<string, MetricSeriesMap>>();

  filteredData.forEach((row) => {
    const rowInfo = getKeyInfo(row, rowFields);
    const colInfo = getKeyInfo(row, colFields);

    rowKeys.add(rowInfo.key);
    colKeys.add(colInfo.key);
    rowKeyParts.set(rowInfo.key, rowInfo.parts);
    colKeyParts.set(colInfo.key, colInfo.parts);

    const cellData = ensureCellData(baseDataMap, rowInfo.key, colInfo.key, metricNames);
    metricNames.forEach((metric) => {
      const value = Number(row[metric]);
      if (!isNaN(value)) {
        cellData[metric].push(value);
      }
    });
  });

  const sortedRowKeys = sortKeys(Array.from(rowKeys));
  const sortedColKeys = sortKeys(Array.from(colKeys));

  const rowTotalsByKey = buildRowTotals(sortedRowKeys, sortedColKeys, baseDataMap, metricNames);
  const columnTotalsByKey = buildColumnTotals(
    sortedRowKeys,
    sortedColKeys,
    baseDataMap,
    metricNames
  );
  const grandTotalData = mergeMany(Array.from(columnTotalsByKey.values()), metricNames);

  if (valueAxis === 'rows') {
    return buildRowsValueResult({
      sortedRowKeys,
      sortedColKeys,
      rowKeyParts,
      colKeyParts,
      baseDataMap,
      rowTotalsByKey,
      columnTotalsByKey,
      grandTotalData,
      metricNames,
      rowFields,
      colFields,
      valueFields,
      valueAxis,
      constants,
    });
  }

  return buildColumnsValueResult({
    sortedRowKeys,
    sortedColKeys,
    rowKeyParts,
    colKeyParts,
    baseDataMap,
    rowTotalsByKey,
    columnTotalsByKey,
    grandTotalData,
    metricNames,
    rowFields,
    colFields,
    valueFields,
    valueAxis,
    constants,
  });
}

function normalizeScenarioRows(
  data: DataRow[],
  rowFields: PivotField[],
  colFields: PivotField[],
  filterConfigs: FilterConfig[]
): DataRow[] {
  if (data.length === 0 || !data.some((row) => isAllScenarioRow(row))) {
    return data;
  }

  const scenarioFieldNames = new Set([RAW_SCENARIO_FIELD, MAPPED_SCENARIO_FIELD]);
  const hasScenarioDimension = [...rowFields, ...colFields].some((field) =>
    scenarioFieldNames.has(field.field.name)
  );
  const hasScenarioFilter = filterConfigs.some((filter) =>
    scenarioFieldNames.has(filter.fieldName)
  );

  if (hasScenarioDimension) {
    return data.filter((row) => !isAllScenarioRow(row));
  }

  if (!hasScenarioFilter) {
    return data.filter((row) => isAllScenarioRow(row));
  }

  return data;
}

function isAllScenarioRow(row: DataRow): boolean {
  return (
    String(row[RAW_SCENARIO_FIELD] ?? '')
      .trim()
      .toUpperCase() === ALL_SCENARIO_VALUE
  );
}

interface BuildResultOptions {
  sortedRowKeys: string[];
  sortedColKeys: string[];
  rowKeyParts: Map<string, string[]>;
  colKeyParts: Map<string, string[]>;
  baseDataMap: Map<string, Map<string, MetricSeriesMap>>;
  rowTotalsByKey: Map<string, MetricSeriesMap>;
  columnTotalsByKey: Map<string, MetricSeriesMap>;
  grandTotalData: MetricSeriesMap;
  metricNames: string[];
  rowFields: PivotField[];
  colFields: PivotField[];
  valueFields: PivotField[];
  valueAxis: ValueAxis;
  constants: Record<string, number>;
}

function buildColumnsValueResult(options: BuildResultOptions): PivotResult {
  const {
    sortedRowKeys,
    sortedColKeys,
    rowKeyParts,
    colKeyParts,
    baseDataMap,
    rowTotalsByKey,
    columnTotalsByKey,
    grandTotalData,
    metricNames,
    colFields,
    rowFields,
    valueFields,
    valueAxis,
    constants,
  } = options;

  const displayColumns = buildDisplayColumns(
    sortedColKeys,
    colKeyParts,
    colFields.length,
    valueFields
  );
  const columnHeaders = displayColumns.map((column) => column.key);
  const valueFieldNames = valueFields.map((field) => field.field.name);
  const hasValueLevel = valueFields.length > 1 || colFields.length === 0;
  const columnDepth = colFields.length + (hasValueLevel ? 1 : 0);
  const columnLevels = generateColumnLevels(columnHeaders, columnDepth);

  const data = sortedRowKeys.map((rowKey) =>
    displayColumns.map((column) =>
      getMetricValue(
        column.valueField,
        getCellData(baseDataMap, rowKey, column.sourceColumnKey, metricNames),
        constants
      )
    )
  );

  const rowTotalValues = sortedRowKeys.map((rowKey) => {
    const totalData = rowTotalsByKey.get(rowKey) || createMetricSeries(metricNames);
    return valueFields.map((valueField) => getMetricValue(valueField, totalData, constants));
  });

  const totalColumnHeaders = valueFieldNames.length > 1 ? valueFieldNames : ['行总计'];
  const totalColumnValueFieldNames = valueFieldNames;
  const totalRows: PivotTotalRow[] = [
    {
      label: '列总计',
      values: displayColumns.map((column) =>
        getMetricValue(
          column.valueField,
          columnTotalsByKey.get(column.sourceColumnKey) || createMetricSeries(metricNames),
          constants
        )
      ),
      valueFieldNames: displayColumns.map((column) => column.valueField.field.name),
      totalValues: valueFields.map((valueField) =>
        getMetricValue(valueField, grandTotalData, constants)
      ),
      totalValueFieldNames: valueFieldNames,
    },
  ];

  const rowTree = buildPivotRowTree({
    sortedRowKeys,
    sortedColKeys,
    rowKeyParts,
    baseDataMap,
    rowTotalsByKey,
    metricNames,
    rowFields,
    valueFields,
    displayColumns,
    data,
    rowTotalValues,
    constants,
  });

  return {
    rowHeaders: sortedRowKeys.map((key) => rowKeyParts.get(key) || [TOTAL_LABEL]),
    rowDimensions: options.rowFields.map((f) => f.field.name),
    rowTree,
    columnHeaders,
    columnLevels,
    data,
    rowTotals: rowTotalValues.map((values) => values[0] || 0),
    columnTotals: totalRows[0]?.values || [],
    grandTotal: totalRows[0]?.totalValues[0] || 0,
    colFieldNames: colFields.map((field) => field.field.name),
    valueFieldNames,
    valueAxis,
    rowValueFieldNames: sortedRowKeys.map(() => valueFieldNames[0] || ''),
    columnValueFieldNames: displayColumns.map((column) => column.valueField.field.name),
    rowTotalValues,
    totalColumnHeaders,
    totalColumnValueFieldNames,
    totalRows,
  };
}

interface BuildRowTreeOptions {
  sortedRowKeys: string[];
  sortedColKeys: string[];
  rowKeyParts: Map<string, string[]>;
  baseDataMap: Map<string, Map<string, MetricSeriesMap>>;
  rowTotalsByKey: Map<string, MetricSeriesMap>;
  metricNames: string[];
  rowFields: PivotField[];
  valueFields: PivotField[];
  displayColumns: DisplayColumn[];
  data: number[][];
  rowTotalValues: number[][];
  constants: Record<string, number>;
}

function buildPivotRowTree(options: BuildRowTreeOptions): PivotTreeNode[] {
  const { sortedRowKeys, rowKeyParts, rowFields, data, rowTotalValues } = options;
  const rowDepth = rowFields.length;
  const rowIndexByKey = new Map(sortedRowKeys.map((key, index) => [key, index]));

  const buildLeafNode = (rowKey: string, depth: number): PivotTreeNode => {
    const rowIndex = rowIndexByKey.get(rowKey) ?? 0;
    const path = rowKeyParts.get(rowKey) || [TOTAL_LABEL];
    const label = path[depth] || path[path.length - 1] || TOTAL_LABEL;

    return {
      id: `leaf:${rowKey}`,
      label,
      path,
      depth,
      data: data[rowIndex] || getDisplayValuesForRows([rowKey], options),
      rowTotalValues: rowTotalValues[rowIndex] || getRowTotalValuesForRows([rowKey], options),
      rowIndex,
      children: [],
    };
  };

  if (rowDepth <= 1) {
    return sortedRowKeys.map((rowKey) => buildLeafNode(rowKey, 0));
  }

  const buildLevel = (depth: number, parentPath: string[], rowKeys: string[]): PivotTreeNode[] => {
    const groups = new Map<string, string[]>();

    rowKeys.forEach((rowKey) => {
      const parts = rowKeyParts.get(rowKey) || [TOTAL_LABEL];
      const value = parts[depth] || TOTAL_LABEL;
      const group = groups.get(value) || [];
      group.push(rowKey);
      groups.set(value, group);
    });

    return Array.from(groups.entries()).map(([value, groupRowKeys]) => {
      const path = [...parentPath, value || TOTAL_LABEL];

      if (depth === rowDepth - 1) {
        return buildLeafNode(groupRowKeys[0], depth);
      }

      return {
        id: `group:${path.join(KEY_SEPARATOR)}`,
        label: value || TOTAL_LABEL,
        path,
        depth,
        data: getDisplayValuesForRows(groupRowKeys, options),
        rowTotalValues: getRowTotalValuesForRows(groupRowKeys, options),
        children: buildLevel(depth + 1, path, groupRowKeys),
      };
    });
  };

  return buildLevel(0, [], sortedRowKeys);
}

function getDisplayValuesForRows(rowKeys: string[], options: BuildRowTreeOptions): number[] {
  const { displayColumns, baseDataMap, metricNames, constants } = options;

  return displayColumns.map((column) => {
    const totalData = createMetricSeries(metricNames);

    rowKeys.forEach((rowKey) => {
      mergeInto(
        totalData,
        getCellData(baseDataMap, rowKey, column.sourceColumnKey, metricNames),
        metricNames
      );
    });

    return getMetricValue(column.valueField, totalData, constants);
  });
}

function getRowTotalValuesForRows(rowKeys: string[], options: BuildRowTreeOptions): number[] {
  const { rowTotalsByKey, metricNames, valueFields, constants } = options;
  const totalData = createMetricSeries(metricNames);

  rowKeys.forEach((rowKey) => {
    mergeInto(
      totalData,
      rowTotalsByKey.get(rowKey) || createMetricSeries(metricNames),
      metricNames
    );
  });

  return valueFields.map((valueField) => getMetricValue(valueField, totalData, constants));
}

function buildRowsValueResult(options: BuildResultOptions): PivotResult {
  const {
    sortedRowKeys,
    sortedColKeys,
    rowKeyParts,
    baseDataMap,
    rowTotalsByKey,
    columnTotalsByKey,
    grandTotalData,
    metricNames,
    rowFields,
    colFields,
    valueFields,
    valueAxis,
    constants,
  } = options;

  const displayRows = buildDisplayRows(sortedRowKeys, rowKeyParts, rowFields.length, valueFields);
  const columnHeaders = sortedColKeys.map((key) => key);
  const columnLevels = generateColumnLevels(columnHeaders, colFields.length);
  const valueFieldNames = valueFields.map((field) => field.field.name);

  const data = displayRows.map((row) =>
    sortedColKeys.map((colKey) =>
      getMetricValue(
        row.valueField,
        getCellData(baseDataMap, row.sourceRowKey, colKey, metricNames),
        constants
      )
    )
  );

  const rowTotalValues = displayRows.map((row) => {
    const totalData = rowTotalsByKey.get(row.sourceRowKey) || createMetricSeries(metricNames);
    return [getMetricValue(row.valueField, totalData, constants)];
  });

  const totalRows = valueFields.map((valueField) => {
    const valueFieldName = valueField.field.name;

    return {
      label: valueFields.length > 1 ? `列总计 - ${valueFieldName}` : '列总计',
      values: sortedColKeys.map((colKey) =>
        getMetricValue(
          valueField,
          columnTotalsByKey.get(colKey) || createMetricSeries(metricNames),
          constants
        )
      ),
      valueFieldNames: sortedColKeys.map(() => valueFieldName),
      totalValues: [getMetricValue(valueField, grandTotalData, constants)],
      totalValueFieldNames: [valueFieldName],
    };
  });

  // 核心改动：构建二维行头，末尾追加指标名
  const rowHeaders = displayRows.map((row) => {
    const dimParts = rowKeyParts.get(row.sourceRowKey) || [TOTAL_LABEL];
    return [...dimParts, row.valueField.field.name]; // 追加指标名
  });

  // 行维度名称：原有维度 + '指标名称'
  const rowDimensions = [...rowFields.map((f) => f.field.name), '指标名称'];

  return {
    rowHeaders,
    rowDimensions,
    columnHeaders,
    columnLevels,
    data,
    rowTotals: rowTotalValues.map((values) => values[0] || 0),
    columnTotals: totalRows[0]?.values || [],
    grandTotal: totalRows[0]?.totalValues[0] || 0,
    colFieldNames: colFields.map((field) => field.field.name),
    valueFieldNames,
    valueAxis,
    rowValueFieldNames: displayRows.map((row) => row.valueField.field.name),
    columnValueFieldNames: sortedColKeys.map(() => ''),
    rowTotalValues,
    totalColumnHeaders: ['行总计'],
    totalColumnValueFieldNames: [''],
    totalRows,
  };
}

function buildDisplayColumns(
  colKeys: string[],
  colKeyParts: Map<string, string[]>,
  colDepth: number,
  valueFields: PivotField[]
): DisplayColumn[] {
  const hasValueLevel = valueFields.length > 1 || colDepth === 0;

  return colKeys.flatMap((colKey) => {
    const dimParts = colDepth > 0 ? colKeyParts.get(colKey) || [TOTAL_LABEL] : [];

    return valueFields.map((valueField) => {
      const parts = hasValueLevel ? [...dimParts, valueField.field.name] : dimParts;
      const displayParts = parts.length > 0 ? parts : [TOTAL_LABEL];
      const key = displayParts.join(KEY_SEPARATOR);

      return {
        key,
        sourceColumnKey: colKey,
        parts: displayParts,
        valueField,
      };
    });
  });
}

function buildDisplayRows(
  rowKeys: string[],
  rowKeyParts: Map<string, string[]>,
  rowDepth: number,
  valueFields: PivotField[]
): DisplayRow[] {
  const hasValueLevel = valueFields.length > 1 || rowDepth === 0;

  return rowKeys.flatMap((rowKey) => {
    const dimParts = rowDepth > 0 ? rowKeyParts.get(rowKey) || [TOTAL_LABEL] : [];

    return valueFields.map((valueField) => {
      const parts = hasValueLevel ? [...dimParts, valueField.field.name] : dimParts;
      const displayParts = parts.length > 0 ? parts : [valueField.field.name];
      const label = formatParts(displayParts);

      return {
        key: `${rowKey}${KEY_SEPARATOR}${valueField.field.name}`,
        sourceRowKey: rowKey,
        label,
        valueField,
      };
    });
  });
}

function getMetricNames(valueFields: PivotField[]): string[] {
  const metricNames = new Set<string>(BASE_METRICS);

  valueFields.forEach((valueField) => {
    const fieldName = valueField.field.name;
    if (!isCalculatedMetric(fieldName)) {
      metricNames.add(fieldName);
    }
  });

  return Array.from(metricNames);
}

function getKeyInfo(row: DataRow, fields: PivotField[]): KeyInfo {
  if (fields.length === 0) {
    return { key: TOTAL_LABEL, parts: [TOTAL_LABEL] };
  }

  const parts = fields.map((field) => String(row[field.field.name] ?? ''));
  return { key: parts.join(KEY_SEPARATOR), parts };
}

function ensureCellData(
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  rowKey: string,
  colKey: string,
  metricNames: string[]
): MetricSeriesMap {
  if (!dataMap.has(rowKey)) {
    dataMap.set(rowKey, new Map());
  }

  const rowMap = dataMap.get(rowKey)!;
  if (!rowMap.has(colKey)) {
    rowMap.set(colKey, createMetricSeries(metricNames));
  }

  return rowMap.get(colKey)!;
}

function getCellData(
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  rowKey: string,
  colKey: string,
  metricNames: string[]
): MetricSeriesMap {
  return dataMap.get(rowKey)?.get(colKey) || createMetricSeries(metricNames);
}

function createMetricSeries(metricNames: string[]): MetricSeriesMap {
  return metricNames.reduce<MetricSeriesMap>((series, metricName) => {
    series[metricName] = [];
    return series;
  }, {});
}

function buildRowTotals(
  rowKeys: string[],
  colKeys: string[],
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  metricNames: string[]
): Map<string, MetricSeriesMap> {
  const totals = new Map<string, MetricSeriesMap>();

  rowKeys.forEach((rowKey) => {
    const rowTotal = createMetricSeries(metricNames);
    colKeys.forEach((colKey) => {
      mergeInto(rowTotal, getCellData(dataMap, rowKey, colKey, metricNames), metricNames);
    });
    totals.set(rowKey, rowTotal);
  });

  return totals;
}

function buildColumnTotals(
  rowKeys: string[],
  colKeys: string[],
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  metricNames: string[]
): Map<string, MetricSeriesMap> {
  const totals = new Map<string, MetricSeriesMap>();

  colKeys.forEach((colKey) => {
    const columnTotal = createMetricSeries(metricNames);
    rowKeys.forEach((rowKey) => {
      mergeInto(columnTotal, getCellData(dataMap, rowKey, colKey, metricNames), metricNames);
    });
    totals.set(colKey, columnTotal);
  });

  return totals;
}

function mergeMany(seriesList: MetricSeriesMap[], metricNames: string[]): MetricSeriesMap {
  const merged = createMetricSeries(metricNames);
  seriesList.forEach((series) => mergeInto(merged, series, metricNames));
  return merged;
}

function mergeInto(target: MetricSeriesMap, source: MetricSeriesMap, metricNames: string[]) {
  metricNames.forEach((metricName) => {
    target[metricName].push(...(source[metricName] || []));
  });
}

function getMetricValue(
  valueField: PivotField,
  metricData: MetricSeriesMap,
  constants: Record<string, number> = {}
): number {
  const fieldName = valueField.field.name;

  if (isCalculatedMetric(fieldName)) {
    return calculateMetricFromAggregates(fieldName, sumBaseMetrics(metricData), constants);
  }

  return aggregateValues(metricData[fieldName] || [], valueField.aggregation || 'sum');
}

function sumBaseMetrics(metricData: MetricSeriesMap): Record<string, number> {
  const aggregated: Record<string, number> = {};

  BASE_METRICS.forEach((metric) => {
    aggregated[metric] = (metricData[metric] || []).reduce((sum, value) => sum + value, 0);
  });

  return aggregated;
}

function generateColumnLevels(columnHeaders: string[], depth: number): ColumnLevel[][] {
  if (depth === 0) return [];

  const levels: ColumnLevel[][] = [];

  for (let levelIdx = 0; levelIdx < depth; levelIdx++) {
    const level: ColumnLevel[] = [];
    let i = 0;

    while (i < columnHeaders.length) {
      const parts = columnHeaders[i].split(KEY_SEPARATOR);
      const currentVal = parts[levelIdx] || TOTAL_LABEL;
      let colspan = 1;

      while (i + colspan < columnHeaders.length) {
        const nextParts = columnHeaders[i + colspan].split(KEY_SEPARATOR);
        const sameAncestors = parts
          .slice(0, levelIdx)
          .every((part, ancestorIdx) => part === nextParts[ancestorIdx]);
        const nextVal = nextParts[levelIdx] || TOTAL_LABEL;

        if (!sameAncestors || nextVal !== currentVal) break;
        colspan++;
      }

      level.push({ value: currentVal, colspan });
      i += colspan;
    }

    levels.push(level);
  }

  return levels;
}

function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const aParts = a.split(KEY_SEPARATOR);
    const bParts = b.split(KEY_SEPARATOR);
    const maxLength = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLength; i++) {
      const result = collator.compare(aParts[i] || '', bParts[i] || '');
      if (result !== 0) return result;
    }

    return 0;
  });
}

function formatParts(parts: string[]): string {
  return parts.filter(Boolean).join(' / ') || TOTAL_LABEL;
}

function aggregateValues(values: number[], type: AggregationType): number {
  if (values.length === 0) return 0;

  switch (type) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'count':
      return values.length;
    case 'min':
      return values.reduce((min, v) => Math.min(min, v), Infinity);
    case 'max':
      return values.reduce((max, v) => Math.max(max, v), -Infinity);
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

export function getUniqueValues(data: DataRow[], fieldName: string): string[] {
  const values = new Set<string>();
  data.forEach((row) => {
    const val = String(row[fieldName]);
    if (val && val !== 'undefined' && val !== 'null') {
      values.add(val);
    }
  });
  return Array.from(values).sort((a, b) => collator.compare(a, b));
}
