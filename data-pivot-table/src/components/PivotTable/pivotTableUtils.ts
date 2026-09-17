import type { ColumnLevel, ValueFormatConfig } from '../../types';
import { BASE_METRICS } from '../../utils/calculatedField';

export const KEY_SEPARATOR = '\u001f';
export const DATA_COLUMN_WIDTH_VAR = 'var(--pivot-data-col-width)';
export const DIMENSION_COLUMN_WIDTH_VAR = 'var(--pivot-dimension-col-width)';
export const TREE_DIMENSION_COLUMN_WIDTH_VAR = 'var(--pivot-tree-dimension-col-width)';
export const TOTAL_COLUMN_WIDTH_VAR = 'var(--pivot-total-col-width)';

export interface PivotColumnSpec {
  key: string;
  className: string;
  width: string;
}

function makeColumnSpec(key: string, className: string, width: string): PivotColumnSpec {
  return { key, className, width };
}

export function getRowHeaderColumnCount(
  rowDimensions: readonly string[],
  rowHeaders: readonly string[][]
): number {
  const headerCellCount = rowHeaders.reduce((max, row) => Math.max(max, row.length), 0);
  return Math.max(rowDimensions.length, headerCellCount, 1);
}

export function createFlatColumnSpecs(
  rowHeaderColumnCount: number,
  dataColumnCount: number,
  totalColumnCount: number
): PivotColumnSpec[] {
  const dimensionCount = Math.max(rowHeaderColumnCount, 1);
  return [
    ...Array.from({ length: dimensionCount }, (_, index) =>
      makeColumnSpec(`row-dimension-${index}`, 'pivot-col-row-header', DIMENSION_COLUMN_WIDTH_VAR)
    ),
    ...Array.from({ length: dataColumnCount }, (_, index) =>
      makeColumnSpec(`data-${index}`, 'pivot-col-data', DATA_COLUMN_WIDTH_VAR)
    ),
    ...Array.from({ length: totalColumnCount }, (_, index) =>
      makeColumnSpec(`total-${index}`, 'pivot-col-total', TOTAL_COLUMN_WIDTH_VAR)
    ),
  ];
}

export function createTreeColumnSpecs(
  dataColumnCount: number,
  totalColumnCount: number
): PivotColumnSpec[] {
  return [
    makeColumnSpec('tree-dimension', 'pivot-col-tree-header', TREE_DIMENSION_COLUMN_WIDTH_VAR),
    ...Array.from({ length: dataColumnCount }, (_, index) =>
      makeColumnSpec(`data-${index}`, 'pivot-col-data', DATA_COLUMN_WIDTH_VAR)
    ),
    ...Array.from({ length: totalColumnCount }, (_, index) =>
      makeColumnSpec(`total-${index}`, 'pivot-col-total', TOTAL_COLUMN_WIDTH_VAR)
    ),
  ];
}

export function makeStableKeys(values: readonly string[], prefix: string): string[] {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const base = value || prefix;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? `${prefix}:${base}` : `${prefix}:${base}:${count + 1}`;
  });
}

export function getFullTextAttributes(value: string) {
  return value ? { 'aria-label': value, 'data-full-text': value } : {};
}

/**
 * 格式化透视表数值
 */
export function formatPivotValue(
  num: number,
  metricName?: string,
  formatConfig?: ValueFormatConfig
): { text: string; isEmpty: boolean } {
  const val = Number(num);
  if (num == null || !Number.isFinite(val)) return { text: '—', isEmpty: true };

  // 有自定义格式配置时，按配置格式化
  if (formatConfig) {
    const decimals = formatConfig.decimals ?? 2;
    const useThousands = formatConfig.thousandsSeparator !== false;

    if (formatConfig.displayAs === 'percentage') {
      return { text: `${(val * 100).toFixed(decimals)}%`, isEmpty: false };
    }

    if (useThousands) {
      const fixed = val.toFixed(decimals);
      const [intPart, decPart] = fixed.split('.');
      const formatted = Number(intPart).toLocaleString('en-US');
      return {
        text: decPart !== undefined ? `${formatted}.${decPart}` : formatted,
        isEmpty: false,
      };
    }

    return { text: val.toFixed(decimals), isEmpty: false };
  }

  // 默认格式化规则
  let text: string;
  if (metricName === '渗透率' || metricName === 'CTR') {
    text = `${(val * 100).toFixed(2)}%`;
  } else if (metricName === '收益占比%') {
    text = `${val.toFixed(2)}%`;
  } else if (metricName === 'ARPU') {
    text = val.toFixed(4);
  } else if (metricName === 'eCPM' || metricName === 'IPU') {
    text = val.toFixed(2);
  } else if (metricName === '广告收益') {
    text = val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } else if (BASE_METRICS.includes(metricName || '')) {
    text = Math.round(val).toLocaleString('en-US');
  } else {
    text = val.toFixed(2);
  }

  return { text, isEmpty: false };
}

/**
 * 格式化列头
 */
export function formatColumnHeader(header: string): string {
  return header.split(KEY_SEPARATOR).filter(Boolean).join(' / ') || '总计';
}

/**
 * 判断是否为分组边界
 */
export function isGroupBoundary(columnLevels: ColumnLevel[][], leafIndex: number): boolean {
  if (leafIndex < 0) return false;

  for (const level of columnLevels) {
    let inferredStart = 0;

    for (const col of level) {
      const startIndex = col.startIndex ?? inferredStart;
      const endIndex = startIndex + col.colspan - 1;
      if (endIndex === leafIndex) return true;
      inferredStart += col.colspan;
    }
  }

  return false;
}

/**
 * 获取分组边界样式类
 */
export function getGroupBoundaryClass(columnLevels: ColumnLevel[][], leafIndex: number): string {
  if (columnLevels.length === 0) return '';
  return isGroupBoundary(columnLevels, leafIndex) ? 'group-boundary-col' : '';
}

/**
 * 获取排序图标
 */
export function getSortIcon(
  type: 'column' | 'dimension' | 'total',
  value: string,
  sortConfig?: { type: string; value: string; direction: 'asc' | 'desc' } | null
): string {
  if (!sortConfig || sortConfig.type !== type || sortConfig.value !== value) return '↕';
  return sortConfig.direction === 'asc' ? '↑' : '↓';
}

/**
 * 判断排序是否激活
 */
export function isSortActive(
  type: 'column' | 'dimension' | 'total',
  value: string,
  sortConfig?: { type: string; value: string; direction: 'asc' | 'desc' } | null
): boolean {
  return !!sortConfig && sortConfig.type === type && sortConfig.value === value;
}

/**
 * 行高常量
 */
export const ROW_HEIGHT = 40;
