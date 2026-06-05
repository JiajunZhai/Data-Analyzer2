import countryMapping from '../data/countryMapping.json';
import type { DataRow } from '../types';
import { CALCULATED_METRICS } from './calculatedField';

const countryMap: Record<string, string> = countryMapping;

// 预编译正则表达式，避免每次调用都创建
const SAFE_EXPR_PATTERN = /^[\d\s+\-*/().]+$/;

// 缓存计算字段的正则表达式
const calculatedFieldRegexes = new Map<string, RegExp[]>();
Object.entries(CALCULATED_METRICS).forEach(([name, config]) => {
  const regexes = [...config.fields]
    .sort((a, b) => b.length - a.length)
    .map((field) => new RegExp(escapeRegExp(field), 'g'));
  calculatedFieldRegexes.set(name, regexes);
});

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeEval(expr: string): number {
  if (!SAFE_EXPR_PATTERN.test(expr)) return 0;
  try {
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * 优化：合并数据预处理链为单次遍历
 * 原来：applyCountryMapping → precomputeGlobalRevenue → addCalculatedFields（3次遍历 + 3次浅拷贝）
 * 现在：单次遍历完成所有转换
 */
export function preprocessData(data: DataRow[]): DataRow[] {
  if (data.length === 0) return data;

  // 第一步：计算全局总收益（需要先遍历一次）
  const totalRevenue = data.reduce((sum, row) => sum + (Number(row['广告收益']) || 0), 0);

  // 第二步：单次遍历完成所有转换
  return data.map((row) => {
    const newRow: DataRow = {};

    // 复制原始字段
    for (const key in row) {
      newRow[key] = row[key];
    }

    // 国家映射
    const code = String(row['国家'] ?? '');
    if (code) {
      newRow['国家'] = countryMap[code.toLowerCase()] ?? code;
    }

    // 预计算全局收益
    newRow['总广告收益'] = totalRevenue;

    // 计算字段（eCPM, CTR, ARPU, 渗透率, IPU, 收益占比%）
    for (const [metricName, config] of Object.entries(CALCULATED_METRICS)) {
      const regexes = calculatedFieldRegexes.get(metricName)!;
      let formula = config.formula;

      // 替换字段名为实际值
      config.fields.forEach((fieldName, index) => {
        let value: number;
        if (fieldName === '总广告收益') {
          value = totalRevenue;
        } else {
          value = Number(row[fieldName]);
          if (isNaN(value)) value = 0;
        }
        formula = formula.replace(regexes[index], String(value));
      });

      newRow[metricName] = safeEval(formula);
    }

    return newRow;
  });
}

/**
 * 获取国家名称
 */
export function getCountryName(code: string): string {
  return countryMap[code.toLowerCase()] ?? code;
}
