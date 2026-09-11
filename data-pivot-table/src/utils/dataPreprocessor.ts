import countryMapping from '../data/countryMapping.json';
import type { DataRow } from '../types';
import {
  calculatePresetMetric,
  getCalculatedMetrics,
  getDefaultUserMetric,
} from './calculatedField';
import { getCountryName } from './countryMapper';

const countryMap: Record<string, string> = countryMapping;
const BEHAVIOR_DIMENSIONS = [
  '标准广告场景',
  'standard_scene',
  '广告场景',
  '聚合广告场景',
  '广告类型',
  '变现渠道',
  '广告变现渠道',
];

function isAllBehaviorRow(row: DataRow): boolean {
  for (let i = 0; i < BEHAVIOR_DIMENSIONS.length; i++) {
    if (
      String(row[BEHAVIOR_DIMENSIONS[i]] ?? '')
        .trim()
        .toUpperCase() === 'ALL'
    ) {
      return true;
    }
  }
  return false;
}

function getMappedCountry(value: unknown): string {
  const code = String(value ?? '').trim();
  return code ? (countryMap[code.toLowerCase()] ?? code) : '';
}

/**
 * 优化：合并数据预处理链为单次遍历
 * 原来：applyCountryMapping → precomputeGlobalRevenue → addCalculatedFields（3次遍历 + 3次浅拷贝）
 * 现在：单次遍历完成所有转换
 */
export function preprocessData(data: DataRow[]): DataRow[] {
  if (data.length === 0) return data;

  // 第一步：计算全局总收益（需要先遍历一次）
  const totalRevenue = data.reduce((sum, row) => sum + (Number(row.广告收益) || 0), 0);

  // 第二步：自动检测用户指标分母
  const userMetric = getDefaultUserMetric(data);
  const calculatedMetrics = getCalculatedMetrics(userMetric);
  const calculatedMetricNames = Object.keys(calculatedMetrics);

  // 第三步：按 日期/应用/国家 建立 ALL 行注册用户映射
  // 解决 SQL 导出中部分国家有曝光人数但无注册用户的问题
  const registeredUserLookup = new Map<string, number>();
  for (const row of data) {
    if (!isAllBehaviorRow(row)) continue;
    const date = String(row.安装日期 ?? row.日期 ?? '').trim();
    const app = String(row.应用 ?? row.app_code ?? '').trim();
    const country = getMappedCountry(row.国家);
    const channel = String(row.买量渠道 ?? row.渠道 ?? '').trim();
    const version = String(row.版本 ?? '').trim();
    const key = `${date}\u001f${app}\u001f${country}\u001f${channel}\u001f${version}`;
    const val = Number(row.注册用户);
    if (!Number.isNaN(val) && val > 0) {
      registeredUserLookup.set(key, val);
    }
  }

  // 第四步：原地修改（避免创建 80 万个新对象）
  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    // 国家映射
    row.国家 = getMappedCountry(row.国家);

    // 注册用户回填：子场景注册用户为 0 时，用同日期/应用/国家的 ALL 行值填充
    const regUsers = Number(row.注册用户);
    const isDetailRow = !isAllBehaviorRow(row);
    if ((!regUsers || regUsers === 0) && isDetailRow) {
      const date = String(row.安装日期 ?? row.日期 ?? '').trim();
      const app = String(row.应用 ?? row.app_code ?? '').trim();
      const country = String(row.国家 ?? '').trim();
      const channel = String(row.买量渠道 ?? row.渠道 ?? '').trim();
      const version = String(row.版本 ?? '').trim();
      const key = `${date}\u001f${app}\u001f${country}\u001f${channel}\u001f${version}`;
      const fallback = registeredUserLookup.get(key);
      if (fallback && fallback > 0) {
        row.注册用户 = fallback;
      }
    }

    // 预计算全局收益
    row.总广告收益 = totalRevenue;

    // 计算字段（eCPM, CTR, ARPU, 渗透率, IPU, 收益占比%）
    for (const metricName of calculatedMetricNames) {
      row[metricName] = calculatePresetMetric(metricName, row, undefined, userMetric) ?? 0;
    }
  }

  return data;
}

// 重新导出 getCountryName 以保持向后兼容
export { getCountryName };
