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
const ATTRIBUTE_DIMENSIONS = [
  '安装日期',
  '日期',
  '国家',
  '实际国家',
  '应用',
  'app_code',
  '版本',
  '买量渠道',
  '渠道',
  '生命周期',
];
const BEHAVIOR_DIMENSIONS = [
  '标准广告场景',
  'standard_scene',
  '广告场景',
  '聚合广告场景',
  '广告类型',
  '变现渠道',
  '广告变现渠道',
];
const ALL_SCENARIO_VALUE = 'ALL';
const REGISTERED_USERS_METRIC = '注册用户';
const ACTIVE_USERS_METRIC = '活跃用户';
const IMPRESSION_USERS_METRIC = '曝光人数';
const SEMI_ADDITIVE_SUM_METRICS = new Set([
  REGISTERED_USERS_METRIC,
  ACTIVE_USERS_METRIC,
  IMPRESSION_USERS_METRIC,
]);
// 属性类半可加指标：计算时需剪枝行为维度过滤，显示大盘分母值
const ATTRIBUTE_SEMI_ADDITIVE_METRICS = new Set([REGISTERED_USERS_METRIC, ACTIVE_USERS_METRIC]);
const emptyMetricSeriesCache = new Map<string, MetricSeriesMap>();
const SEMI_ADDITIVE_KEY_FIELD_GROUPS = [
  ['日期'],
  ['应用', 'app_code'],
  ['国家', '实际国家'],
  ['版本'],
  ['买量渠道', '渠道'],
];
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const BEHAVIOR_DIMENSION_SET = new Set(BEHAVIOR_DIMENSIONS);
const ATTRIBUTE_DIMENSION_SET = new Set(ATTRIBUTE_DIMENSIONS);

function getDimensionTypeForFieldName(fieldName: string): 'Attribute' | 'Behavior' {
  if (BEHAVIOR_DIMENSION_SET.has(fieldName)) return 'Behavior';
  if (ATTRIBUTE_DIMENSION_SET.has(fieldName)) return 'Attribute';
  return 'Attribute';
}

function isBehaviorDimension(fieldName: string): boolean {
  return getDimensionTypeForFieldName(fieldName) === 'Behavior';
}

function isBehaviorPivotField(field: PivotField): boolean {
  const dimensionType = field.field.dimensionType ?? field.field.dimensionCategory;
  if (dimensionType) return dimensionType === 'Behavior';
  return isBehaviorDimension(field.field.name);
}

function pruneBehaviorDimensions(fields: PivotField[]): PivotField[] {
  return fields.filter((field) => !isBehaviorPivotField(field));
}

function isAllValue(value: string): boolean {
  return value.trim().toUpperCase() === ALL_SCENARIO_VALUE;
}

interface MetricPoint {
  value: number;
  semiAdditiveKey: string;
  isAllBehaviorRow: boolean;
}

type MetricSeriesMap = Record<string, MetricPoint[]>;

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

interface ColumnHeaderTreeNode {
  value: string;
  children: ColumnHeaderTreeNode[];
  colspan: number;
  startIndex: number;
  leafIndex?: number;
}

export function aggregateData(
  data: DataRow[],
  rowFields: PivotField[],
  colFields: PivotField[],
  valueFields: PivotField[],
  filterConfigs: FilterConfig[] = [],
  valueAxis: ValueAxis = 'columns'
): PivotResult {
  const metricNames = getMetricNames(valueFields);

  // 预构建过滤 Set（单次构建，多次使用）
  const filterSets =
    filterConfigs.length > 0
      ? filterConfigs.map((filter) => ({
          fieldName: filter.fieldName,
          valueSet: new Set(filter.selectedValues),
        }))
      : [];

  // 仅属性过滤集：排除行为维度过滤（用于属性类度量）
  const attrFilterSets =
    filterConfigs.length > 0
      ? filterConfigs
          .filter((filter) => !isBehaviorDimension(filter.fieldName))
          .map((filter) => ({
            fieldName: filter.fieldName,
            valueSet: new Set(filter.selectedValues),
          }))
      : [];

  const attrRowFields = pruneBehaviorDimensions(rowFields);
  const attrColFields = pruneBehaviorDimensions(colFields);
  const hasBehaviorDimension = [...rowFields, ...colFields].some((field) =>
    isBehaviorPivotField(field)
  );
  const hasBehaviorFilter = filterConfigs.some((filter) => isBehaviorDimension(filter.fieldName));
  const hasActiveBehaviorConditions = hasBehaviorDimension || hasBehaviorFilter;

  // 检查数据中是否存在 ALL 行（始终需要检测，不论行为维度是否作为行/列）
  let hasAllRows = false;
  for (let i = 0; i < data.length; i++) {
    if (isAllBehaviorRow(data[i])) {
      hasAllRows = true;
      break;
    }
  }
  const preferAllBehaviorRows = hasAllRows && !hasActiveBehaviorConditions;

  const rowKeyParts = new Map<string, string[]>();
  const colKeyParts = new Map<string, string[]>();
  const attrRowKeyByRowKey = new Map<string, string>();
  const attrColKeyByColKey = new Map<string, string>();
  const rowKeys = new Set<string>();
  const colKeys = new Set<string>();
  const baseDataMap = new Map<string, Map<string, MetricSeriesMap>>();
  const attrBaseDataMap = new Map<string, Map<string, MetricSeriesMap>>();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowIsAll = isAllBehaviorRow(row);

    // 属性过滤用于属性类度量。行为过滤会在属性 key 中被剪枝。
    if (attrFilterSets.length > 0) {
      let pass = true;
      for (let j = 0; j < attrFilterSets.length; j++) {
        if (!attrFilterSets[j].valueSet.has(getDimensionValue(row, attrFilterSets[j].fieldName))) {
          pass = false;
          break;
        }
      }
      if (!pass) continue;
    }

    const attrRowInfo = getKeyInfo(row, attrRowFields);
    const attrColInfo = getKeyInfo(row, attrColFields);
    const semiAdditiveKey = getSemiAdditiveKey(row);

    const attrCellData = ensureCellData(
      attrBaseDataMap,
      attrRowInfo.key,
      attrColInfo.key,
      metricNames
    );
    appendMetricPoints(attrCellData, row, metricNames, semiAdditiveKey, rowIsAll);

    let passesAllFilters = true;
    if (filterSets.length > 0) {
      for (let j = 0; j < filterSets.length; j++) {
        if (!filterSets[j].valueSet.has(getDimensionValue(row, filterSets[j].fieldName))) {
          passesAllFilters = false;
          break;
        }
      }
    }
    if (!passesAllFilters) continue;

    const rowInfo = getKeyInfo(row, rowFields);
    const colInfo = getKeyInfo(row, colFields);

    rowKeys.add(rowInfo.key);
    colKeys.add(colInfo.key);
    rowKeyParts.set(rowInfo.key, rowInfo.parts);
    colKeyParts.set(colInfo.key, colInfo.parts);
    attrRowKeyByRowKey.set(rowInfo.key, attrRowInfo.key);
    attrColKeyByColKey.set(colInfo.key, attrColInfo.key);

    const cellData = ensureCellData(baseDataMap, rowInfo.key, colInfo.key, metricNames);
    appendMetricPoints(cellData, row, metricNames, semiAdditiveKey, rowIsAll);
  }

  const isDateRow = rowFields.length > 0 && rowFields[0].field.name === '日期';
  const sortedRowKeys = filterDisplayKeys(
    sortKeys(Array.from(rowKeys), isDateRow),
    rowFields,
    rowKeyParts
  );
  const sortedColKeys = filterDisplayKeys(sortKeys(Array.from(colKeys)), colFields, colKeyParts);

  const rowTotalsByKey = buildRowTotals(sortedRowKeys, sortedColKeys, baseDataMap, metricNames);
  const attrRowTotalsByKey = buildRowTotals(
    sortedRowKeys,
    sortedColKeys,
    attrBaseDataMap,
    metricNames,
    attrRowKeyByRowKey,
    attrColKeyByColKey
  );
  const columnTotalsByKey = buildColumnTotals(
    sortedRowKeys,
    sortedColKeys,
    baseDataMap,
    metricNames
  );
  const attrColumnTotalsByKey = buildColumnTotals(
    sortedRowKeys,
    sortedColKeys,
    attrBaseDataMap,
    metricNames,
    attrRowKeyByRowKey,
    attrColKeyByColKey
  );
  const behaviorGrandTotalData = mergeMany(Array.from(columnTotalsByKey.values()), metricNames);
  const attrGrandTotalData = mergeMany(Array.from(attrColumnTotalsByKey.values()), metricNames);
  const grandTotalData = mergeAggMetricMaps(
    behaviorGrandTotalData,
    attrGrandTotalData,
    metricNames,
    preferAllBehaviorRows
  );
  const constants: Record<string, number> = {
    总广告收益: sumMetricPoints(
      selectMetricPoints(behaviorGrandTotalData.广告收益 || [], preferAllBehaviorRows)
    ),
  };

  if (valueAxis === 'rows') {
    return buildRowsValueResult({
      sortedRowKeys,
      sortedColKeys,
      rowKeyParts,
      colKeyParts,
      attrRowKeyByRowKey,
      attrColKeyByColKey,
      baseDataMap,
      attrBaseDataMap,
      rowTotalsByKey,
      attrRowTotalsByKey,
      columnTotalsByKey,
      attrColumnTotalsByKey,
      grandTotalData,
      metricNames,
      rowFields,
      colFields,
      valueFields,
      valueAxis,
      constants,
      preferAllBehaviorRows,
    });
  }

  return buildColumnsValueResult({
    sortedRowKeys,
    sortedColKeys,
    rowKeyParts,
    colKeyParts,
    attrRowKeyByRowKey,
    attrColKeyByColKey,
    baseDataMap,
    attrBaseDataMap,
    rowTotalsByKey,
    attrRowTotalsByKey,
    columnTotalsByKey,
    attrColumnTotalsByKey,
    grandTotalData,
    metricNames,
    rowFields,
    colFields,
    valueFields,
    valueAxis,
    constants,
    preferAllBehaviorRows,
  });
}

function isAllBehaviorRow(row: DataRow): boolean {
  return BEHAVIOR_DIMENSIONS.some(
    (field) =>
      String(row[field] ?? '')
        .trim()
        .toUpperCase() === ALL_SCENARIO_VALUE
  );
}

// 检测是否使用场景维度
interface BuildResultOptions {
  sortedRowKeys: string[];
  sortedColKeys: string[];
  rowKeyParts: Map<string, string[]>;
  colKeyParts: Map<string, string[]>;
  attrRowKeyByRowKey: Map<string, string>;
  attrColKeyByColKey: Map<string, string>;
  baseDataMap: Map<string, Map<string, MetricSeriesMap>>;
  attrBaseDataMap: Map<string, Map<string, MetricSeriesMap>>;
  rowTotalsByKey: Map<string, MetricSeriesMap>;
  attrRowTotalsByKey: Map<string, MetricSeriesMap>;
  columnTotalsByKey: Map<string, MetricSeriesMap>;
  attrColumnTotalsByKey: Map<string, MetricSeriesMap>;
  grandTotalData: MetricSeriesMap;
  metricNames: string[];
  rowFields: PivotField[];
  colFields: PivotField[];
  valueFields: PivotField[];
  valueAxis: ValueAxis;
  constants: Record<string, number>;
  preferAllBehaviorRows: boolean;
}

function buildColumnsValueResult(options: BuildResultOptions): PivotResult {
  const {
    sortedRowKeys,
    sortedColKeys,
    rowKeyParts,
    colKeyParts,
    attrRowKeyByRowKey,
    attrColKeyByColKey,
    baseDataMap,
    attrBaseDataMap,
    rowTotalsByKey,
    attrRowTotalsByKey,
    columnTotalsByKey,
    attrColumnTotalsByKey,
    grandTotalData,
    metricNames,
    colFields,
    rowFields,
    valueFields,
    valueAxis,
    constants,
    preferAllBehaviorRows,
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
    displayColumns.map((column) => {
      const behaviorCellData = getCellData(
        baseDataMap,
        rowKey,
        column.sourceColumnKey,
        metricNames
      );
      const attrCellData = getMappedCellData(
        attrBaseDataMap,
        rowKey,
        column.sourceColumnKey,
        metricNames,
        attrRowKeyByRowKey,
        attrColKeyByColKey
      );
      const merged = mergeAggMetricMaps(
        behaviorCellData,
        attrCellData,
        metricNames,
        preferAllBehaviorRows
      );
      return getMetricValue(column.valueField, merged, constants);
    })
  );

  const rowTotalValues = sortedRowKeys.map((rowKey) => {
    const behaviorTotal = rowTotalsByKey.get(rowKey) || createMetricSeries(metricNames);
    const attrTotal = attrRowTotalsByKey.get(rowKey) || createMetricSeries(metricNames);
    const merged = mergeAggMetricMaps(behaviorTotal, attrTotal, metricNames, preferAllBehaviorRows);
    return valueFields.map((valueField) => getMetricValue(valueField, merged, constants));
  });

  const totalColumnHeaders = valueFieldNames.length > 1 ? valueFieldNames : ['行总计'];
  const totalColumnValueFieldNames = valueFieldNames;
  const totalRows: PivotTotalRow[] = [
    {
      label: '列总计',
      values: displayColumns.map((column) => {
        const behaviorColTotal =
          columnTotalsByKey.get(column.sourceColumnKey) || createMetricSeries(metricNames);
        const attrColTotal =
          attrColumnTotalsByKey.get(column.sourceColumnKey) || createMetricSeries(metricNames);
        const merged = mergeAggMetricMaps(
          behaviorColTotal,
          attrColTotal,
          metricNames,
          preferAllBehaviorRows
        );
        return getMetricValue(column.valueField, merged, constants);
      }),
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
    attrRowKeyByRowKey,
    attrColKeyByColKey,
    baseDataMap,
    attrBaseDataMap,
    rowTotalsByKey,
    attrRowTotalsByKey,
    metricNames,
    rowFields,
    valueFields,
    displayColumns,
    data,
    rowTotalValues,
    constants,
    preferAllBehaviorRows,
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
    valueFormats: Object.fromEntries(
      valueFields.flatMap((vf) => (vf.format ? [[vf.field.name, vf.format]] : []))
    ),
  };
}

interface BuildRowTreeOptions {
  sortedRowKeys: string[];
  sortedColKeys: string[];
  rowKeyParts: Map<string, string[]>;
  attrRowKeyByRowKey: Map<string, string>;
  attrColKeyByColKey: Map<string, string>;
  baseDataMap: Map<string, Map<string, MetricSeriesMap>>;
  attrBaseDataMap: Map<string, Map<string, MetricSeriesMap>>;
  rowTotalsByKey: Map<string, MetricSeriesMap>;
  attrRowTotalsByKey: Map<string, MetricSeriesMap>;
  metricNames: string[];
  rowFields: PivotField[];
  valueFields: PivotField[];
  displayColumns: DisplayColumn[];
  data: number[][];
  rowTotalValues: number[][];
  constants: Record<string, number>;
  preferAllBehaviorRows: boolean;
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
  const {
    displayColumns,
    baseDataMap,
    attrBaseDataMap,
    metricNames,
    constants,
    attrRowKeyByRowKey,
    attrColKeyByColKey,
    preferAllBehaviorRows,
  } = options;

  return displayColumns.map((column) => {
    const behaviorTotal = createMetricSeries(metricNames);
    const attrTotal = createMetricSeries(metricNames);
    const seenAttrCells = new Set<string>();

    rowKeys.forEach((rowKey) => {
      mergeInto(
        behaviorTotal,
        getCellData(baseDataMap, rowKey, column.sourceColumnKey, metricNames),
        metricNames
      );
      mergeMappedCellInto(
        attrTotal,
        attrBaseDataMap,
        rowKey,
        column.sourceColumnKey,
        metricNames,
        attrRowKeyByRowKey,
        attrColKeyByColKey,
        seenAttrCells
      );
    });

    const merged = mergeAggMetricMaps(behaviorTotal, attrTotal, metricNames, preferAllBehaviorRows);
    return getMetricValue(column.valueField, merged, constants);
  });
}

function getRowTotalValuesForRows(rowKeys: string[], options: BuildRowTreeOptions): number[] {
  const {
    rowTotalsByKey,
    attrRowTotalsByKey,
    metricNames,
    valueFields,
    constants,
    preferAllBehaviorRows,
  } = options;
  const behaviorTotal = createMetricSeries(metricNames);
  const attrTotal = createMetricSeries(metricNames);

  rowKeys.forEach((rowKey) => {
    mergeInto(
      behaviorTotal,
      rowTotalsByKey.get(rowKey) || createMetricSeries(metricNames),
      metricNames
    );
    mergeInto(
      attrTotal,
      attrRowTotalsByKey.get(rowKey) || createMetricSeries(metricNames),
      metricNames
    );
  });

  const merged = mergeAggMetricMaps(behaviorTotal, attrTotal, metricNames, preferAllBehaviorRows);
  return valueFields.map((valueField) => getMetricValue(valueField, merged, constants));
}

function buildRowsValueResult(options: BuildResultOptions): PivotResult {
  const {
    sortedRowKeys,
    sortedColKeys,
    rowKeyParts,
    baseDataMap,
    attrBaseDataMap,
    attrRowKeyByRowKey,
    attrColKeyByColKey,
    rowTotalsByKey,
    attrRowTotalsByKey,
    columnTotalsByKey,
    attrColumnTotalsByKey,
    grandTotalData,
    metricNames,
    rowFields,
    colFields,
    valueFields,
    valueAxis,
    constants,
    preferAllBehaviorRows,
  } = options;

  const displayRows = buildDisplayRows(sortedRowKeys, rowKeyParts, rowFields.length, valueFields);
  const columnHeaders = sortedColKeys.map((key) => key);
  const columnLevels = generateColumnLevels(columnHeaders, colFields.length);
  const valueFieldNames = valueFields.map((field) => field.field.name);

  const data = displayRows.map((row) =>
    sortedColKeys.map((colKey) => {
      const behaviorCellData = getCellData(baseDataMap, row.sourceRowKey, colKey, metricNames);
      const attrCellData = getMappedCellData(
        attrBaseDataMap,
        row.sourceRowKey,
        colKey,
        metricNames,
        attrRowKeyByRowKey,
        attrColKeyByColKey
      );
      const merged = mergeAggMetricMaps(
        behaviorCellData,
        attrCellData,
        metricNames,
        preferAllBehaviorRows
      );
      return getMetricValue(row.valueField, merged, constants);
    })
  );

  const rowTotalValues = displayRows.map((row) => {
    const behaviorTotal = rowTotalsByKey.get(row.sourceRowKey) || createMetricSeries(metricNames);
    const attrTotal = attrRowTotalsByKey.get(row.sourceRowKey) || createMetricSeries(metricNames);
    const merged = mergeAggMetricMaps(behaviorTotal, attrTotal, metricNames, preferAllBehaviorRows);
    return [getMetricValue(row.valueField, merged, constants)];
  });

  const totalRows = valueFields.map((valueField) => {
    const valueFieldName = valueField.field.name;

    return {
      label: valueFields.length > 1 ? `列总计 - ${valueFieldName}` : '列总计',
      values: sortedColKeys.map((colKey) => {
        const behaviorColTotal = columnTotalsByKey.get(colKey) || createMetricSeries(metricNames);
        const attrColTotal = attrColumnTotalsByKey.get(colKey) || createMetricSeries(metricNames);
        const merged = mergeAggMetricMaps(
          behaviorColTotal,
          attrColTotal,
          metricNames,
          preferAllBehaviorRows
        );
        return getMetricValue(valueField, merged, constants);
      }),
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
    valueFormats: Object.fromEntries(
      valueFields.flatMap((vf) => (vf.format ? [[vf.field.name, vf.format]] : []))
    ),
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

  const parts = fields.map((field) => getDimensionValue(row, field.field.name));
  return { key: parts.join(KEY_SEPARATOR), parts };
}

function getDimensionValue(row: DataRow, fieldName: string): string {
  return String(row[fieldName] ?? '').trim();
}

function filterDisplayKeys(
  keys: string[],
  fields: PivotField[],
  keyParts: Map<string, string[]>
): string[] {
  if (!fields.some((field) => isBehaviorPivotField(field))) {
    return keys;
  }

  return keys.filter((key) => {
    const parts = keyParts.get(key) || [];
    return !fields.some(
      (field, index) => isBehaviorPivotField(field) && isAllValue(parts[index] || '')
    );
  });
}

function getSemiAdditiveKey(row: DataRow): string {
  return SEMI_ADDITIVE_KEY_FIELD_GROUPS.map((fieldNames) => {
    for (const fieldName of fieldNames) {
      const value = String(row[fieldName] ?? '').trim();
      if (value) return value;
    }
    return '';
  }).join(KEY_SEPARATOR);
}

function ensureCellData(
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  rowKey: string,
  colKey: string,
  metricNames: string[]
): MetricSeriesMap {
  let rowMap = dataMap.get(rowKey);
  if (!rowMap) {
    rowMap = new Map();
    dataMap.set(rowKey, rowMap);
  }

  let cellData = rowMap.get(colKey);
  if (!cellData) {
    cellData = createMetricSeries(metricNames);
    rowMap.set(colKey, cellData);
  }

  return cellData;
}

function getCellData(
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  rowKey: string,
  colKey: string,
  metricNames: string[]
): MetricSeriesMap {
  return dataMap.get(rowKey)?.get(colKey) || getEmptyMetricSeries(metricNames);
}

function getMappedCellData(
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  rowKey: string,
  colKey: string,
  metricNames: string[],
  rowKeyMap?: Map<string, string>,
  colKeyMap?: Map<string, string>
): MetricSeriesMap {
  const mappedRowKey = rowKeyMap?.get(rowKey) ?? rowKey;
  const mappedColKey = colKeyMap?.get(colKey) ?? colKey;
  return getCellData(dataMap, mappedRowKey, mappedColKey, metricNames);
}

function mergeMappedCellInto(
  target: MetricSeriesMap,
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  rowKey: string,
  colKey: string,
  metricNames: string[],
  rowKeyMap?: Map<string, string>,
  colKeyMap?: Map<string, string>,
  seenCells?: Set<string>
): void {
  const mappedRowKey = rowKeyMap?.get(rowKey) ?? rowKey;
  const mappedColKey = colKeyMap?.get(colKey) ?? colKey;
  const mappedCellKey = `${mappedRowKey}${KEY_SEPARATOR}${mappedColKey}`;
  if (seenCells?.has(mappedCellKey)) return;
  seenCells?.add(mappedCellKey);
  mergeInto(target, getCellData(dataMap, mappedRowKey, mappedColKey, metricNames), metricNames);
}

function appendMetricPoints(
  cellData: MetricSeriesMap,
  row: DataRow,
  metricNames: string[],
  semiAdditiveKey: string,
  isAllBehaviorRowValue: boolean
): void {
  for (let m = 0; m < metricNames.length; m++) {
    const metric = metricNames[m];
    const raw = row[metric];
    if (raw != null && raw !== '') {
      const value = Number(raw);
      if (!Number.isNaN(value)) {
        cellData[metric].push({ value, semiAdditiveKey, isAllBehaviorRow: isAllBehaviorRowValue });
      }
    }
  }
}

function createMetricSeries(metricNames: string[]): MetricSeriesMap {
  return metricNames.reduce<MetricSeriesMap>((series, metricName) => {
    series[metricName] = [];
    return series;
  }, {});
}

function getEmptyMetricSeries(metricNames: string[]): MetricSeriesMap {
  const cacheKey = metricNames.join(KEY_SEPARATOR);
  let series = emptyMetricSeriesCache.get(cacheKey);
  if (!series) {
    series = createMetricSeries(metricNames);
    emptyMetricSeriesCache.set(cacheKey, series);
  }
  return series;
}

function buildRowTotals(
  rowKeys: string[],
  colKeys: string[],
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  metricNames: string[],
  rowKeyMap?: Map<string, string>,
  colKeyMap?: Map<string, string>
): Map<string, MetricSeriesMap> {
  const totals = new Map<string, MetricSeriesMap>();

  rowKeys.forEach((rowKey) => {
    const rowTotal = createMetricSeries(metricNames);
    const seenCells = new Set<string>();
    for (const colKey of colKeys) {
      mergeMappedCellInto(
        rowTotal,
        dataMap,
        rowKey,
        colKey,
        metricNames,
        rowKeyMap,
        colKeyMap,
        seenCells
      );
    }
    totals.set(rowKey, rowTotal);
  });

  return totals;
}

function buildColumnTotals(
  rowKeys: string[],
  colKeys: string[],
  dataMap: Map<string, Map<string, MetricSeriesMap>>,
  metricNames: string[],
  rowKeyMap?: Map<string, string>,
  colKeyMap?: Map<string, string>
): Map<string, MetricSeriesMap> {
  const totals = new Map<string, MetricSeriesMap>();

  colKeys.forEach((colKey) => {
    totals.set(colKey, createMetricSeries(metricNames));
  });

  colKeys.forEach((colKey) => {
    const columnTotal = totals.get(colKey);
    if (!columnTotal) return;

    const seenCells = new Set<string>();
    for (const rowKey of rowKeys) {
      mergeMappedCellInto(
        columnTotal,
        dataMap,
        rowKey,
        colKey,
        metricNames,
        rowKeyMap,
        colKeyMap,
        seenCells
      );
    }
  });

  return totals;
}

function mergeMany(seriesList: MetricSeriesMap[], metricNames: string[]): MetricSeriesMap {
  const merged = createMetricSeries(metricNames);
  seriesList.forEach((series) => {
    mergeInto(merged, series, metricNames);
  });
  return merged;
}

function mergeAggMetricMaps(
  behavior: MetricSeriesMap,
  attr: MetricSeriesMap,
  metricNames: string[],
  preferAllBehaviorRows: boolean
): MetricSeriesMap {
  const merged = createMetricSeries(metricNames);
  for (const metric of metricNames) {
    // 仅属性类半可加指标使用 attr 数据源（剪枝后的大盘值）
    // 行为类半可加指标（曝光人数）和普通指标使用 behavior 数据源
    if (ATTRIBUTE_SEMI_ADDITIVE_METRICS.has(metric)) {
      merged[metric] = [...selectAllBehaviorPoints(attr[metric] || [])];
    } else {
      merged[metric] = [...selectMetricPoints(behavior[metric] || [], preferAllBehaviorRows)];
    }
  }
  return merged;
}

function selectMetricPoints(points: MetricPoint[], preferAllBehaviorRows: boolean): MetricPoint[] {
  return preferAllBehaviorRows ? selectAllBehaviorPoints(points) : points;
}

function selectAllBehaviorPoints(points: MetricPoint[]): MetricPoint[] {
  const allPoints = points.filter((point) => point.isAllBehaviorRow);
  return allPoints.length > 0 ? allPoints : points;
}

function mergeInto(target: MetricSeriesMap, source: MetricSeriesMap, metricNames: string[]) {
  for (const metricName of metricNames) {
    const sourcePoints = source[metricName] || [];
    for (const point of sourcePoints) {
      target[metricName].push(point);
    }
  }
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

  const points = metricData[fieldName] || [];
  // 半可加指标始终使用 sumSemiAdditiveMetric，忽略配置的聚合类型
  // 避免误用 COUNT 导致明细行计数而非值累加
  if (SEMI_ADDITIVE_SUM_METRICS.has(fieldName)) {
    return sumSemiAdditiveMetric(points);
  }

  const aggregation = valueField.aggregation || 'sum';
  return aggregateValues(points, aggregation);
}

function sumBaseMetrics(metricData: MetricSeriesMap): Record<string, number> {
  const aggregated: Record<string, number> = {};

  BASE_METRICS.forEach((metric) => {
    const points = metricData[metric] || [];
    aggregated[metric] = SEMI_ADDITIVE_SUM_METRICS.has(metric)
      ? sumSemiAdditiveMetric(points)
      : sumMetricPoints(points);
  });

  return aggregated;
}

function sumMetricPoints(points: MetricPoint[]): number {
  let sum = 0;
  for (const point of points) {
    sum += point.value;
  }
  return sum;
}

function sumSemiAdditiveMetric(points: MetricPoint[]): number {
  const maxByKey = new Map<string, number>();

  points.forEach((point) => {
    const current = maxByKey.get(point.semiAdditiveKey);
    maxByKey.set(
      point.semiAdditiveKey,
      current === undefined ? point.value : Math.max(current, point.value)
    );
  });

  let sum = 0;
  for (const value of maxByKey.values()) {
    sum += value;
  }
  return sum;
}

function generateColumnLevels(columnHeaders: string[], depth: number): ColumnLevel[][] {
  if (depth === 0) return [];

  const root: ColumnHeaderTreeNode = {
    value: '__root__',
    children: [],
    colspan: 0,
    startIndex: 0,
  };

  columnHeaders.forEach((header, leafIndex) => {
    const parts = header.split(KEY_SEPARATOR);
    let parent = root;

    for (let levelIdx = 0; levelIdx < depth; levelIdx++) {
      const value = parts[levelIdx] || TOTAL_LABEL;
      const isLeaf = levelIdx === depth - 1;
      const lastChild = parent.children[parent.children.length - 1];
      const node =
        !isLeaf && lastChild?.value === value
          ? lastChild
          : {
              value,
              children: [],
              colspan: 0,
              startIndex: leafIndex,
              leafIndex: isLeaf ? leafIndex : undefined,
            };

      if (node !== lastChild) {
        parent.children.push(node);
      }

      parent = node;
    }
  });

  calculateHeaderColSpan(root);

  const levels = Array.from({ length: depth }, () => [] as ColumnLevel[]);
  collectColumnLevels(root.children, levels, 0);
  return levels;
}

function calculateHeaderColSpan(node: ColumnHeaderTreeNode): number {
  if (node.children.length === 0) {
    node.colspan = 1;
    node.startIndex = node.leafIndex ?? node.startIndex;
    return node.colspan;
  }

  node.colspan = node.children.reduce((total, child) => total + calculateHeaderColSpan(child), 0);
  node.startIndex = node.children[0]?.startIndex ?? node.startIndex;
  return node.colspan;
}

function collectColumnLevels(
  nodes: ColumnHeaderTreeNode[],
  levels: ColumnLevel[][],
  levelIdx: number
): void {
  if (levelIdx >= levels.length) return;

  nodes.forEach((node) => {
    levels[levelIdx].push({
      value: node.value,
      colspan: node.colspan,
      startIndex: node.startIndex,
    });
    collectColumnLevels(node.children, levels, levelIdx + 1);
  });
}

function sortKeys(keys: string[], desc = false): string[] {
  // 预分割键，避免在排序比较中重复 split
  const entries = keys.map((key) => ({ key, parts: key.split(KEY_SEPARATOR) }));
  entries.sort((a, b) => {
    const maxLength = Math.max(a.parts.length, b.parts.length);
    for (let i = 0; i < maxLength; i++) {
      const result = collator.compare(a.parts[i] || '', b.parts[i] || '');
      if (result !== 0) return desc ? -result : result;
    }
    return 0;
  });
  return entries.map((e) => e.key);
}

function formatParts(parts: string[]): string {
  return parts.filter(Boolean).join(' / ') || TOTAL_LABEL;
}

function aggregateValues(points: MetricPoint[], type: AggregationType): number {
  if (points.length === 0) return 0;

  switch (type) {
    case 'sum': {
      return sumMetricPoints(points);
    }
    case 'avg': {
      return sumMetricPoints(points) / points.length;
    }
    case 'count':
      return points.length;
    case 'min': {
      let min = Infinity;
      for (const point of points) {
        if (point.value < min) min = point.value;
      }
      return min;
    }
    case 'max': {
      let max = -Infinity;
      for (const point of points) {
        if (point.value > max) max = point.value;
      }
      return max;
    }
    default:
      return sumMetricPoints(points);
  }
}

export function getUniqueValues(data: DataRow[], fieldName: string): string[] {
  const values = new Set<string>();
  data.forEach((row) => {
    const val = getDimensionValue(row, fieldName);
    if (val && val !== 'undefined' && val !== 'null') {
      values.add(val);
    }
  });
  return Array.from(values).sort((a, b) => collator.compare(a, b));
}
