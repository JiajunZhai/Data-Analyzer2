import type { ValueFormatConfig } from '../../types';
import { BASE_METRICS } from '../../utils/calculatedField';

export const KEY_SEPARATOR = '\u001f';

export function makeStableKeys(values: readonly string[], prefix: string): string[] {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const base = value || prefix;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? `${prefix}:${base}` : `${prefix}:${base}:${count + 1}`;
  });
}

/**
 * 格式化透视表数值
 */
export function formatPivotValue(
  num: number,
  metricName?: string,
  formatConfig?: ValueFormatConfig
): { text: string; isEmpty: boolean } {
  if (num === 0) return { text: '-', isEmpty: true };

  const val = Number(num);
  if (Number.isNaN(val)) return { text: '-', isEmpty: true };

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
export function isGroupBoundary(
  columnLevels: Array<Array<{ value: string; colspan: number }>>,
  levelIdx: number,
  colIdx: number
): boolean {
  if (!columnLevels[levelIdx]) return false;

  if (colIdx === columnLevels[levelIdx].length - 1) return true;

  if (levelIdx < columnLevels.length - 1) {
    const currentCol = columnLevels[levelIdx][colIdx];
    const nextCol = columnLevels[levelIdx][colIdx + 1];
    if (currentCol && nextCol && currentCol.value !== nextCol.value) {
      return true;
    }
  }

  return false;
}

/**
 * 获取分组边界样式类
 */
export function getGroupBoundaryClass(
  columnLevels: Array<Array<{ value: string; colspan: number }>>,
  colIdx: number
): string {
  if (columnLevels.length === 0) return '';

  for (let levelIdx = 0; levelIdx < columnLevels.length; levelIdx++) {
    if (isGroupBoundary(columnLevels, levelIdx, colIdx)) {
      return 'group-boundary-col';
    }
  }

  return '';
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
export const ROW_HEIGHT = 36;
