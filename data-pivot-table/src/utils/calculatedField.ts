import type { CalculatedField, DataRow } from '../types';

const SAFE_EXPR_PATTERN = /^[\d\s+\-*/().]+$/;

export function safeEval(expr: string): number {
  if (!SAFE_EXPR_PATTERN.test(expr)) return 0;
  try {
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && Number.isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

export const BASE_METRICS = [
  '注册用户',
  '活跃用户',
  '曝光人数',
  '曝光次数',
  '广告收益',
  '点击次数',
];

// 用户指标分母配置
export type UserMetricType = '注册用户' | '活跃用户';

// 默认分母固定为注册用户；只有显式传入 customDenominator 时才切换。
export function getDefaultUserMetric(data: DataRow[]): UserMetricType {
  void data;
  return '注册用户';
}

// 获取用户指标分母（支持自定义）
export function getUserMetricDenominator(
  data: DataRow[],
  customDenominator?: UserMetricType
): UserMetricType {
  if (customDenominator) {
    return customDenominator;
  }
  return getDefaultUserMetric(data);
}

export function getCalculatedMetrics(
  userMetric: UserMetricType
): Record<string, { formula: string; fields: string[] }> {
  return {
    eCPM: { formula: '(广告收益 / 曝光次数) * 1000', fields: ['广告收益', '曝光次数'] },
    CTR: { formula: '点击次数 / 曝光次数', fields: ['点击次数', '曝光次数'] },
    ARPU: { formula: `广告收益 / ${userMetric}`, fields: ['广告收益', userMetric] },
    渗透率: { formula: `曝光人数 / ${userMetric}`, fields: ['曝光人数', userMetric] },
    IPU: { formula: `曝光次数 / ${userMetric}`, fields: ['曝光次数', userMetric] },
    '收益占比%': { formula: '(广告收益 / 总广告收益) * 100', fields: ['广告收益', '总广告收益'] },
  };
}

// 默认使用注册用户
export const CALCULATED_METRICS = getCalculatedMetrics('注册用户');

export function getPresetCalculatedFields(userMetric: UserMetricType): CalculatedField[] {
  const metrics = getCalculatedMetrics(userMetric);
  return Object.entries(metrics).map(([name, config]) => ({
    name,
    formula: config.formula,
    fields: config.fields,
  }));
}

export const PRESET_CALCULATED_FIELDS: CalculatedField[] = getPresetCalculatedFields('注册用户');

export function isCalculatedMetric(fieldName: string): boolean {
  return fieldName in CALCULATED_METRICS;
}

// 缓存已编译的正则表达式，避免每次调用都 new RegExp
const regExpCache = new Map<string, RegExp>();

function getOrCreateRegExp(pattern: string): RegExp {
  let re = regExpCache.get(pattern);
  if (!re) {
    re = new RegExp(escapeRegExp(pattern), 'g');
    regExpCache.set(pattern, re);
  }
  return re;
}

export function calculateMetricFromAggregates(
  metricName: string,
  aggregatedData: Record<string, number>,
  constants?: Record<string, number>,
  userMetric?: UserMetricType
): number {
  const directValue = calculatePresetMetric(metricName, aggregatedData, constants, userMetric);
  if (directValue !== null) return directValue;

  const metrics = userMetric ? getCalculatedMetrics(userMetric) : CALCULATED_METRICS;
  const metric = metrics[metricName];
  if (!metric) return 0;

  let formula = metric.formula;
  [...metric.fields]
    .sort((a, b) => b.length - a.length)
    .forEach((fieldName) => {
      const value = aggregatedData[fieldName] ?? constants?.[fieldName] ?? 0;
      formula = formula.replace(getOrCreateRegExp(fieldName), String(value));
    });

  return safeEval(formula);
}

const toNumber = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const safeDivide = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

export function calculatePresetMetric(
  metricName: string,
  values: Record<string, unknown>,
  constants?: Record<string, number>,
  userMetric: UserMetricType = '注册用户'
): number | null {
  const revenue = toNumber(values.广告收益);
  const impressions = toNumber(values.曝光次数);
  const clicks = toNumber(values.点击次数);
  const impressionUsers = toNumber(values.曝光人数);
  const denominator = toNumber(values[userMetric]);

  switch (metricName) {
    case 'eCPM':
      return safeDivide(revenue, impressions) * 1000;
    case 'CTR':
      return safeDivide(clicks, impressions);
    case 'ARPU':
      return safeDivide(revenue, denominator);
    case '渗透率':
      return safeDivide(impressionUsers, denominator);
    case 'IPU':
      return safeDivide(impressions, denominator);
    case '收益占比%':
      return safeDivide(revenue, toNumber(values.总广告收益 ?? constants?.总广告收益)) * 100;
    default:
      return null;
  }
}

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function calculateField(row: DataRow, calculatedField: CalculatedField): number {
  const { formula, fields } = calculatedField;

  let evalFormula = formula;
  [...fields]
    .sort((a, b) => b.length - a.length)
    .forEach((fieldName) => {
      const value = Number(row[fieldName]);
      if (Number.isNaN(value)) return;
      evalFormula = evalFormula.replace(getOrCreateRegExp(fieldName), String(value));
    });

  return safeEval(evalFormula);
}

export function precomputeGlobalRevenue(data: DataRow[]): DataRow[] {
  const totalRevenue = data.reduce((sum, row) => sum + toNumber(row.广告收益), 0);
  return data.map((row) => ({ ...row, 总广告收益: totalRevenue }));
}

export function addCalculatedFields(
  data: DataRow[],
  calculatedFields: CalculatedField[]
): DataRow[] {
  return data.map((row) => {
    const newRow = { ...row };
    calculatedFields.forEach((cf) => {
      newRow[cf.name] = calculatePresetMetric(cf.name, newRow) ?? calculateField(row, cf);
    });
    return newRow;
  });
}
