/**
 * 格式化变化率（如 +12.3%, -0.5%）
 * @param rate 变化率（小数形式，如 0.123 表示 12.3%）
 * @returns 格式化后的字符串
 */
export function formatRate(rate: number): string {
  const pct = Math.abs(rate * 100);
  if (pct < 0.1) return '0%';
  return `${rate > 0 ? '+' : '-'}${pct.toFixed(1)}%`;
}

/**
 * 格式化数值（带可选后缀）
 * @param val 数值
 * @param suffix 可选后缀（如 "%"、"$"）
 * @returns 格式化后的字符串
 */
export function formatValue(val: number, suffix = ''): string {
  if (val >= 10000) return `${(val / 1000).toFixed(1)}k${suffix}`;
  if (val >= 100) return `${Math.round(val)}${suffix}`;
  return `${val.toFixed(2)}${suffix}`;
}

/**
 * 格式化百分比（如 +12.3%, -0.5%）
 * @param rate 变化率（小数形式）
 * @returns 格式化后的字符串
 */
export function formatPercent(rate: number): string {
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${(rate * 100).toFixed(1)}%`;
}

/**
 * 格式化金额（带 $ 前缀）
 * @param val 金额数值
 * @returns 格式化后的字符串
 */
export function formatMoney(val: number): string {
  if (val >= 10000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${Math.round(val)}`;
  return `$${val.toFixed(2)}`;
}
