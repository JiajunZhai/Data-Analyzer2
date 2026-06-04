import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useMemo, useState } from 'react';
import type { DataRow, Field, FilterConfig, PivotField } from '../types';
import { aggregateData } from '../utils/aggregator';

const MAX_PRIORITY_FIELDS = 5;

const createPivotField = (field: Field): PivotField => ({
  field,
  aggregation: field.type === 'measure' ? 'sum' : undefined,
});

export function usePivotState() {
  const [fields, setFields] = useState<Field[]>([]);
  const [data, setData] = useState<DataRow[]>([]);
  const [rowFields, setRowFields] = useState<PivotField[]>([]);
  const [colFields, setColFields] = useState<PivotField[]>([]);
  const [valueFields, setValueFields] = useState<PivotField[]>([]);
  const [filterConfigs, setFilterConfigs] = useState<FilterConfig[]>([]);

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

  const pivotResult = useMemo(() => {
    if (
      data.length === 0 ||
      valueFields.length === 0 ||
      (rowFields.length === 0 && colFields.length === 0)
    ) {
      return null;
    }
    return aggregateData(data, rowFields, colFields, valueFields, filterConfigs, 'columns');
  }, [data, rowFields, colFields, valueFields, filterConfigs]);

  const emptyMessage = data.length === 0 ? '请先在顶部选择数据源' : '请配置透视表字段以查看结果';

  const toggleValueField = useCallback((field: Field) => {
    setValueFields((prev) => {
      const exists = prev.some((pivotField) => pivotField.field.name === field.name);
      if (exists) {
        return prev.filter((pivotField) => pivotField.field.name !== field.name);
      }
      return [createPivotField(field), ...prev];
    });
  }, []);

  const toggleRowField = useCallback(
    (field: Field) => {
      if (colFieldNames.has(field.name)) return;
      setRowFields((prev) => {
        const exists = prev.some((pivotField) => pivotField.field.name === field.name);
        if (exists) {
          return prev.filter((pivotField) => pivotField.field.name !== field.name);
        }
        if (prev.length >= MAX_PRIORITY_FIELDS) return prev;
        return [createPivotField(field), ...prev];
      });
    },
    [colFieldNames]
  );

  const toggleColField = useCallback(
    (field: Field) => {
      if (rowFieldNames.has(field.name)) return;
      setColFields((prev) => {
        const exists = prev.some((pivotField) => pivotField.field.name === field.name);
        if (exists) {
          return prev.filter((pivotField) => pivotField.field.name !== field.name);
        }
        if (prev.length >= MAX_PRIORITY_FIELDS) return prev;
        return [createPivotField(field), ...prev];
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

  const applyTemplate = useCallback(
    (rows: PivotField[], cols: PivotField[], values: PivotField[]) => {
      setRowFields(rows.slice(0, MAX_PRIORITY_FIELDS));
      setColFields(cols.slice(0, MAX_PRIORITY_FIELDS));
      setValueFields(values);
    },
    []
  );

  const reorderFields = useCallback((zoneId: string, activeName: string, overName: string) => {
    const update = (items: PivotField[]) => {
      const oldIndex = items.findIndex((item) => item.field.name === activeName);
      const newIndex = items.findIndex((item) => item.field.name === overName);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return items;
      }
      return arrayMove(items, oldIndex, newIndex);
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
    fields,
    setFields,
    data,
    setData,
    rowFields,
    setRowFields,
    colFields,
    setColFields,
    valueFields,
    setValueFields,
    filterConfigs,
    setFilterConfigs,
    dimensions,
    measures,
    rowFieldNames,
    colFieldNames,
    activeDimensionNames,
    pivotResult,
    emptyMessage,
    toggleValueField,
    toggleRowField,
    toggleColField,
    handleFilterChange,
    applyTemplate,
    reorderFields,
    moveFieldToIndex,
    activateFieldAtIndex,
    transferField,
  };
}
