import countryMapping from '../data/countryMapping.json';
import type { DataRow } from '../types';
import { CALCULATED_METRICS, escapeRegExp, safeEval } from './calculatedField';
import { getCountryName } from './countryMapper';

const countryMap: Record<string, string> = countryMapping;

// 缓存计算字段的正则表达式
const calculatedFieldRegexes = new Map<string, RegExp[]>();
Object.entries(CALCULATED_METRICS).forEach(([name, config]) => {
  const regexes = [...config.fields]
    .sort((a, b) => b.length - a.length)
    .map((field) => new RegExp(escapeRegExp(field), 'g'));
  calculatedFieldRegexes.set(name, regexes);
});

/**
 * 优化：合并数据预处理链为单次遍历
 * 原来：applyCountryMapping → precomputeGlobalRevenue → addCalculatedFields（3次遍历 + 3次浅拷贝）
 * 现在：单次遍历完成所有转换
 */
export function preprocessData(data: DataRow[]): DataRow[] {
  if (data.length === 0) return data;

  // 第一步：计算全局总收益（需要先遍历一次）
  const totalRevenue = data.reduce((sum, row) => sum + (Number(row['广告收益']) || 0), 0);

  // 第二步：按 日期/应用/国家 建立 ALL 行注册用户映射
  // 解决 SQL 导出中部分国家有曝光人数但无注册用户的问题
  const registeredUserLookup = new Map<string, number>();
  for (const row of data) {
    const scene = String(row['标准广告场景'] ?? row['聚合广告场景'] ?? '').trim().toUpperCase();
    if (scene !== 'ALL') continue;
    const date = String(row['日期'] ?? '').trim();
    const app = String(row['应用'] ?? '').trim();
    const country = String(row['国家'] ?? '').trim();
    const key = `${date}\u001f${app}\u001f${country}`;
    const val = Number(row['注册用户']);
    if (!Number.isNaN(val) && val > 0) {
      registeredUserLookup.set(key, val);
    }
  }

  // 第三步：单次遍历完成所有转换
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

    // 注册用户回填：子场景注册用户为 0 时，用同日期/应用/国家的 ALL 行值填充
    const regUsers = Number(row['注册用户']);
    if ((!regUsers || regUsers === 0) && String(row['标准广告场景'] ?? row['聚合广告场景'] ?? '').trim().toUpperCase() !== 'ALL') {
      const date = String(row['日期'] ?? '').trim();
      const app = String(row['应用'] ?? '').trim();
      const country = String(row['国家'] ?? '').trim();
      const key = `${date}\u001f${app}\u001f${country}`;
      const fallback = registeredUserLookup.get(key);
      if (fallback && fallback > 0) {
        newRow['注册用户'] = fallback;
      }
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
          value = Number(newRow[fieldName] ?? row[fieldName]);
          if (isNaN(value)) value = 0;
        }
        formula = formula.replace(regexes[index], String(value));
      });

      newRow[metricName] = safeEval(formula);
    }

    return newRow;
  });
}

// 重新导出 getCountryName 以保持向后兼容
export { getCountryName };
