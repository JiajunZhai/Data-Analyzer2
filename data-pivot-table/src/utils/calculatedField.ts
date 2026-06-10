import type { CalculatedField, DataRow } from '../types';

const SAFE_EXPR_PATTERN = /^[\d\s+\-*/().]+$/;

export function safeEval(expr: string): number {
  if (!SAFE_EXPR_PATTERN.test(expr)) return 0;
  try {
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

export const BASE_METRICS = ['注册用户', '曝光人数', '曝光次数', '广告收益', '点击次数'];

export const CALCULATED_METRICS: Record<string, { formula: string; fields: string[] }> = {
  eCPM: { formula: '(广告收益 / 曝光次数) * 1000', fields: ['广告收益', '曝光次数'] },
  CTR: { formula: '点击次数 / 曝光次数', fields: ['点击次数', '曝光次数'] },
  ARPU: { formula: '广告收益 / 注册用户', fields: ['广告收益', '注册用户'] },
  渗透率: { formula: '曝光人数 / 注册用户', fields: ['曝光人数', '注册用户'] },
  IPU: { formula: '曝光次数 / 注册用户', fields: ['曝光次数', '注册用户'] },
  '收益占比%': { formula: '(广告收益 / 总广告收益) * 100', fields: ['广告收益', '总广告收益'] },
};

export const PRESET_CALCULATED_FIELDS: CalculatedField[] = Object.entries(CALCULATED_METRICS).map(
  ([name, config]) => ({
    name,
    formula: config.formula,
    fields: config.fields,
  })
);

export function isCalculatedMetric(fieldName: string): boolean {
  return fieldName in CALCULATED_METRICS;
}

export function calculateMetricFromAggregates(
  metricName: string,
  aggregatedData: Record<string, number>,
  constants?: Record<string, number>
): number {
  const metric = CALCULATED_METRICS[metricName];
  if (!metric) return 0;

  let formula = metric.formula;
  [...metric.fields]
    .sort((a, b) => b.length - a.length)
    .forEach((fieldName) => {
      const value = aggregatedData[fieldName] ?? constants?.[fieldName] ?? 0;
      formula = formula.replace(new RegExp(escapeRegExp(fieldName), 'g'), String(value));
    });

  return safeEval(formula);
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
      if (isNaN(value)) return;
      evalFormula = evalFormula.replace(new RegExp(escapeRegExp(fieldName), 'g'), String(value));
    });

  return safeEval(evalFormula);
}

export function precomputeGlobalRevenue(data: DataRow[]): DataRow[] {
  const totalRevenue = data.reduce((sum, row) => sum + (Number(row['广告收益']) || 0), 0);
  return data.map((row) => ({ ...row, 总广告收益: totalRevenue }));
}

export function addCalculatedFields(
  data: DataRow[],
  calculatedFields: CalculatedField[]
): DataRow[] {
  return data.map((row) => {
    const newRow = { ...row };
    calculatedFields.forEach((cf) => {
      newRow[cf.name] = calculateField(row, cf);
    });
    return newRow;
  });
}
