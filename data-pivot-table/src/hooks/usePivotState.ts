import { useCallback, useMemo, useState } from 'react';
import type {
  DataRow,
  Field,
  FilterConfig,
  PivotField,
  PivotResult,
  PivotTreeNode,
  SortConfig,
  ValueFormatConfig,
} from '../types';
import { aggregateData } from '../utils/aggregator';
import { createPivotField, MAX_PRIORITY_FIELDS } from '../utils/fieldHelpers';

// 配置数据类型
export interface PivotConfig {
  rowFields: PivotField[];
  colFields: PivotField[];
  valueFields: PivotField[];
  filterConfigs: FilterConfig[];
}

type RowComparator = (a: number, b: number) => number;
type TreeNodeComparator = (a: PivotTreeNode, b: PivotTreeNode) => number;

const textCollator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const compareText = (a: string, b: string) => textCollator.compare(a, b);

const toFiniteNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

function createRowComparator(result: PivotResult, sortConfig: SortConfig): RowComparator | null {
  const { type, value, direction } = sortConfig;
  const dir = direction === 'asc' ? 1 : -1;

  if (type === 'column') {
    const colIdx = Number.parseInt(value, 10);
    if (Number.isNaN(colIdx) || colIdx < 0 || colIdx >= (result.data[0]?.length ?? 0)) {
      return null;
    }
    return (a, b) =>
      dir * (toFiniteNumber(result.data[a]?.[colIdx]) - toFiniteNumber(result.data[b]?.[colIdx]));
  }

  if (type === 'total') {
    return (a, b) =>
      dir *
      (toFiniteNumber(result.rowTotalValues[a]?.[0]) -
        toFiniteNumber(result.rowTotalValues[b]?.[0]));
  }

  const dimIdx = result.rowDimensions.indexOf(value);
  if (dimIdx < 0) return null;

  return (a, b) =>
    dir *
    compareText(
      String(result.rowHeaders[a]?.[dimIdx] ?? ''),
      String(result.rowHeaders[b]?.[dimIdx] ?? '')
    );
}

function createTreeNodeComparator(
  result: PivotResult,
  sortConfig: SortConfig
): TreeNodeComparator | null {
  const { type, value, direction } = sortConfig;
  const dir = direction === 'asc' ? 1 : -1;

  if (type === 'column') {
    const colIdx = Number.parseInt(value, 10);
    if (Number.isNaN(colIdx) || colIdx < 0 || colIdx >= result.columnHeaders.length) {
      return null;
    }
    return (a, b) => {
      const diff = toFiniteNumber(a.data[colIdx]) - toFiniteNumber(b.data[colIdx]);
      return diff !== 0 ? dir * diff : compareText(a.label, b.label);
    };
  }

  if (type === 'total') {
    return (a, b) => {
      const diff = toFiniteNumber(a.rowTotalValues[0]) - toFiniteNumber(b.rowTotalValues[0]);
      return diff !== 0 ? dir * diff : compareText(a.label, b.label);
    };
  }

  const dimIdx = result.rowDimensions.indexOf(value);
  if (dimIdx < 0) return null;

  return (a, b) =>
    dir *
    compareText(String(a.path[dimIdx] ?? a.label ?? ''), String(b.path[dimIdx] ?? b.label ?? ''));
}

function sortTreeNodes(nodes: PivotTreeNode[], comparator: TreeNodeComparator): PivotTreeNode[] {
  return nodes
    .map((node) =>
      node.children.length > 0 ? { ...node, children: sortTreeNodes(node.children, comparator) } : node
    )
    .sort(comparator);
}

function applySortToPivotResult(result: PivotResult, sortConfig: SortConfig): PivotResult {
  const rowComparator = createRowComparator(result, sortConfig);
  const treeComparator = createTreeNodeComparator(result, sortConfig);

  if (!rowComparator && !treeComparator) return result;

  let sortedResult = result;
  const len = result.rowHeaders.length;
  const isTreeResult = result.valueAxis === 'columns' && Boolean(result.rowTree?.length);

  if (rowComparator && len > 1 && !isTreeResult) {
    const indices = Array.from({ length: len }, (_, i) => i);
    indices.sort((a, b) => rowComparator(a, b));

    sortedResult = {
      ...result,
      rowHeaders: indices.map((i) => result.rowHeaders[i]),
      data: indices.map((i) => result.data[i]),
      rowTotals: indices.map((i) => result.rowTotals[i]),
      rowValueFieldNames: indices.map((i) => result.rowValueFieldNames[i]),
      rowTotalValues: indices.map((i) => result.rowTotalValues[i]),
    };
  }

  if (treeComparator && result.rowTree?.length) {
    sortedResult = {
      ...sortedResult,
      rowTree: sortTreeNodes(result.rowTree, treeComparator),
    };
  }

  return sortedResult;
}

export function usePivotState() {
  const [fields, setFields] = useState<Field[]>([]);
  const [data, setData] = useState<DataRow[]>([]);
  const [rowFields, setRowFields] = useState<PivotField[]>([]);
  const [colFields, setColFields] = useState<PivotField[]>([]);
  const [valueFields, setValueFields] = useState<PivotField[]>([]);
  const [filterConfigs, setFilterConfigs] = useState<FilterConfig[]>([]);
  const [showRowTotal, setShowRowTotal] = useState(true);
  const [showColumnTotal, setShowColumnTotal] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const toggleSort = useCallback((type: 'column' | 'dimension' | 'total', value: string) => {
    setSortConfig((prev) => {
      if (!prev || prev.type !== type || prev.value !== value) {
        return { type, value, direction: 'desc' };
      }
      if (prev.direction === 'desc') {
        return { type, value, direction: 'asc' };
      }
      return null;
    });
  }, []);

  const dimensions = useMemo(() => fields.filter((field) => field.type === 'dimension'), [fields]);
  const measures = useMemo(() => fields.filter((field) => field.type === 'measure'), [fields]);

  const rowFieldNames = useMemo(
    () => new Set(rowFields.map((field) => field.field.name)),
    [rowFields]
  );
  const colFieldNames = useMemo(
    () => new Set(colFields.map((field) => field.field.name)),
    [colFields]
  );

  const activeDimensionNames = useMemo(() => {
    const set = new Set<string>();
    rowFields.forEach((f) => set.add(f.field.name));
    colFields.forEach((f) => set.add(f.field.name));
    return set;
  }, [rowFields, colFields]);

  const rawPivotResult = useMemo(() => {
    if (
      data.length === 0 ||
      valueFields.length === 0 ||
      (rowFields.length === 0 && colFields.length === 0)
    ) {
      return null;
    }
    return aggregateData(data, rowFields, colFields, valueFields, filterConfigs, 'columns');
  }, [data, rowFields, colFields, valueFields, filterConfigs]);

  // 应用排序
  const pivotResult = useMemo(() => {
    if (!rawPivotResult || !sortConfig) return rawPivotResult;
    return applySortToPivotResult(rawPivotResult, sortConfig);
  }, [rawPivotResult, sortConfig]);

  const emptyMessage = data.length === 0 ? '请先在顶部选择数据源' : '请配置透视表字段以查看结果';

  // 高级 API：加载数据
  const loadData = useCallback((newFields: Field[], newData: DataRow[]) => {
    setFields(newFields);
    setData(newData);
  }, []);

  // 高级 API：重置配置
  const resetConfig = useCallback(() => {
    setRowFields([]);
    setColFields([]);
    setValueFields([]);
    setFilterConfigs([]);
  }, []);

  // 高级 API：应用配置
  const applyConfig = useCallback((config: PivotConfig) => {
    setRowFields(config.rowFields.slice(0, MAX_PRIORITY_FIELDS));
    setColFields(config.colFields.slice(0, MAX_PRIORITY_FIELDS));
    setValueFields(config.valueFields);
    setFilterConfigs(config.filterConfigs);
  }, []);

  // 高级 API：获取当前配置
  const getCurrentConfig = useCallback(
    (): PivotConfig => ({
      rowFields,
      colFields,
      valueFields,
      filterConfigs,
    }),
    [rowFields, colFields, valueFields, filterConfigs]
  );

  const toggleValueField = useCallback((field: Field, targetIndex?: number) => {
    setValueFields((prev) => {
      const exists = prev.some((pivotField) => pivotField.field.name === field.name);
      if (exists) {
        return prev.filter((pivotField) => pivotField.field.name !== field.name);
      }
      if (targetIndex != null) {
        const next = [...prev];
        const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
        next.splice(insertIndex, 0, createPivotField(field));
        return next;
      }
      return [...prev, createPivotField(field)];
    });
  }, []);

  const toggleRowField = useCallback(
    (field: Field, targetIndex?: number) => {
      if (colFieldNames.has(field.name)) return;
      setRowFields((prev) => {
        const exists = prev.some((pivotField) => pivotField.field.name === field.name);
        if (exists) {
          return prev.filter((pivotField) => pivotField.field.name !== field.name);
        }
        if (prev.length >= MAX_PRIORITY_FIELDS) return prev;
        if (targetIndex != null) {
          const next = [...prev];
          const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
          next.splice(insertIndex, 0, createPivotField(field));
          return next;
        }
        return [...prev, createPivotField(field)];
      });
    },
    [colFieldNames]
  );

  const toggleColField = useCallback(
    (field: Field, targetIndex?: number) => {
      if (rowFieldNames.has(field.name)) return;
      setColFields((prev) => {
        const exists = prev.some((pivotField) => pivotField.field.name === field.name);
        if (exists) {
          return prev.filter((pivotField) => pivotField.field.name !== field.name);
        }
        if (prev.length >= MAX_PRIORITY_FIELDS) return prev;
        if (targetIndex != null) {
          const next = [...prev];
          const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
          next.splice(insertIndex, 0, createPivotField(field));
          return next;
        }
        return [...prev, createPivotField(field)];
      });
    },
    [rowFieldNames]
  );

  const handleFilterChange = useCallback((fieldName: string, selectedValues: string[]) => {
    setFilterConfigs((prev) => {
      const exists = prev.some((filter) => filter.fieldName === fieldName);
      if (!exists) {
        return [...prev, { fieldName, selectedValues }];
      }
      return prev.map((filter) =>
        filter.fieldName === fieldName ? { ...filter, selectedValues } : filter
      );
    });
  }, []);

  const resetAllFilters = useCallback(() => {
    setFilterConfigs([]);
  }, []);

  const applyTemplate = useCallback(
    (rows: PivotField[], cols: PivotField[], values: PivotField[]) => {
      setRowFields(rows.slice(0, MAX_PRIORITY_FIELDS));
      setColFields(cols.slice(0, MAX_PRIORITY_FIELDS));
      setValueFields(values);
    },
    []
  );

  const updateValueFieldFormat = useCallback(
    (fieldName: string, format: ValueFormatConfig) => {
      setValueFields((prev) =>
        prev.map((pf) => (pf.field.name === fieldName ? { ...pf, format } : pf))
      );
    },
    []
  );

  const reorderFields = useCallback(
    (zoneId: string, activeName: string, overName: string, targetIndex?: number) => {
      // When a precise target index is provided (from left/right positioning), use it directly
      if (targetIndex != null) {
        const update = (items: PivotField[]) => {
          const oldIndex = items.findIndex((item) => item.field.name === activeName);
          if (oldIndex === -1) return items;
          const next = [...items];
          const [item] = next.splice(oldIndex, 1);
          const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
          next.splice(insertIndex, 0, item);
          return next;
        };
        if (zoneId === 'rows') setRowFields(update);
        if (zoneId === 'columns') setColFields(update);
        if (zoneId === 'values') setValueFields(update);
        return;
      }

      // Fallback: swap positions (dimension level exchange)
      const update = (items: PivotField[]) => {
        const oldIndex = items.findIndex((item) => item.field.name === activeName);
        const newIndex = items.findIndex((item) => item.field.name === overName);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
          return items;
        }
        const next = [...items];
        [next[oldIndex], next[newIndex]] = [next[newIndex], next[oldIndex]];
        return next;
      };

      if (zoneId === 'rows') {
        setRowFields(update);
      }
      if (zoneId === 'columns') {
        setColFields(update);
      }
      if (zoneId === 'values') {
        setValueFields(update);
      }
    },
    []
  );

  const moveFieldToIndex = useCallback((zoneId: string, fieldName: string, targetIndex: number) => {
    const update = (items: PivotField[]) => {
      const oldIndex = items.findIndex((item) => item.field.name === fieldName);
      if (oldIndex === -1) return items;

      const next = [...items];
      const [item] = next.splice(oldIndex, 1);
      const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
      next.splice(insertIndex, 0, item);
      return next;
    };

    if (zoneId === 'rows') {
      setRowFields(update);
    }
    if (zoneId === 'columns') {
      setColFields(update);
    }
    if (zoneId === 'values') {
      setValueFields(update);
    }
  }, []);

  const activateFieldAtIndex = useCallback(
    (zoneId: string, fieldName: string, targetIndex: number) => {
      if (zoneId === 'values') {
        const field = measures.find((f) => f.name === fieldName);
        if (!field) return;
        setValueFields((prev) => {
          if (prev.some((item) => item.field.name === fieldName)) return prev;
          const next = [...prev];
          const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
          next.splice(insertIndex, 0, createPivotField(field));
          return next;
        });
        return;
      }

      const field = dimensions.find((f) => f.name === fieldName);
      if (!field) return;

      if (zoneId === 'rows') {
        if (colFieldNames.has(fieldName)) return;
        setRowFields((prev) => {
          if (
            prev.some((item) => item.field.name === fieldName) ||
            prev.length >= MAX_PRIORITY_FIELDS
          )
            return prev;
          const next = [...prev];
          const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
          next.splice(insertIndex, 0, createPivotField(field));
          return next;
        });
      } else if (zoneId === 'columns') {
        if (rowFieldNames.has(fieldName)) return;
        setColFields((prev) => {
          if (
            prev.some((item) => item.field.name === fieldName) ||
            prev.length >= MAX_PRIORITY_FIELDS
          )
            return prev;
          const next = [...prev];
          const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
          next.splice(insertIndex, 0, createPivotField(field));
          return next;
        });
      }
    },
    [measures, dimensions, colFieldNames, rowFieldNames]
  );

  const transferField = useCallback(
    (fieldName: string, fromZone: string, toZone: string, targetIndex = 0) => {
      const findField = (name: string): Field | undefined => {
        return fields.find((f) => f.name === name);
      };

      const field = findField(fieldName);
      if (!field) return;
      if (toZone === 'rows' && fromZone !== 'columns' && colFieldNames.has(fieldName)) return;
      if (toZone === 'columns' && fromZone !== 'rows' && rowFieldNames.has(fieldName)) return;
      if (toZone === 'rows' && rowFields.length >= MAX_PRIORITY_FIELDS) return;
      if (toZone === 'columns' && colFields.length >= MAX_PRIORITY_FIELDS) return;

      if (fromZone === 'rows') {
        setRowFields((prev) => prev.filter((f) => f.field.name !== fieldName));
      } else if (fromZone === 'columns') {
        setColFields((prev) => prev.filter((f) => f.field.name !== fieldName));
      }

      if (toZone === 'rows') {
        setRowFields((prev) => {
          const next = prev.filter((f) => f.field.name !== fieldName);
          const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
          next.splice(insertIndex, 0, createPivotField(field));
          return next;
        });
      } else if (toZone === 'columns') {
        setColFields((prev) => {
          const next = prev.filter((f) => f.field.name !== fieldName);
          const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
          next.splice(insertIndex, 0, createPivotField(field));
          return next;
        });
      }
    },
    [fields, rowFields.length, colFields.length, rowFieldNames, colFieldNames]
  );

  return {
    // 数据状态
    fields,
    setFields,
    data,
    setData,
    // 透视配置状态
    rowFields,
    setRowFields,
    colFields,
    setColFields,
    valueFields,
    setValueFields,
    filterConfigs,
    setFilterConfigs,
    // 派生状态
    dimensions,
    measures,
    rowFieldNames,
    colFieldNames,
    activeDimensionNames,
    pivotResult,
    emptyMessage,
    // UI 状态
    showRowTotal,
    setShowRowTotal,
    showColumnTotal,
    setShowColumnTotal,
    // 高级 API
    loadData,
    resetConfig,
    applyConfig,
    getCurrentConfig,
    // 字段操作
    toggleValueField,
    toggleRowField,
    toggleColField,
    handleFilterChange,
    resetAllFilters,
    applyTemplate,
    reorderFields,
    moveFieldToIndex,
    activateFieldAtIndex,
    transferField,
    updateValueFieldFormat,
    sortConfig,
    toggleSort,
  };
}
