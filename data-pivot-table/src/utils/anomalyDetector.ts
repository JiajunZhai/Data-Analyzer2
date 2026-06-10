import type { DataRow } from '../types';
import type {
  AnalysisDiagnostics,
  AnomalySeverity,
  AppAnalysisResult,
  ComparisonMode,
  DayAnomaly,
  MetricTrend,
} from '../types/anomaly';
import { FIELD_MAPPING, MONITOR_THRESHOLDS } from '../types/anomaly';

const ADAPTIVE_THRESHOLD_MULTIPLIER = 2;
const MIN_DATA_DAYS = 3;
const TREND_WINDOW = 3;
const CRITICAL_CHANGE_RATE = 0.3;
const WARNING_CHANGE_RATE = 0.15;

interface DateGroup {
  date: string;
  rows: DataRow[];
}

/**
 * 判断是否为 ALL 场景行
 */
function isAllScenarioRow(row: DataRow, scenarioField: string | null): boolean {
  if (!scenarioField) return false;
  return String(row[scenarioField] ?? '').trim().toUpperCase() === 'ALL';
}

/**
 * 过滤数据：优先使用 ALL 行（包含去重后的真实值），无 ALL 行时使用原始数据
 * 解决曝光人数等状态指标跨场景重复求和的问题
 */
function filterForAggregateMetrics(data: DataRow[], scenarioField: string | null): DataRow[] {
  if (!scenarioField || data.length === 0) return data;
  const allRows = data.filter((row) => isAllScenarioRow(row, scenarioField));
  return allRows.length > 0 ? allRows : data;
}

function resolveFieldName(canonicalName: string, availableFields: string[]): string | null {
  const candidates = FIELD_MAPPING[canonicalName];
  if (!candidates) return null;

  for (const candidate of candidates) {
    const found = availableFields.find((f) => f === candidate);
    if (found) return found;
  }
  for (const candidate of candidates) {
    const found = availableFields.find((f) => f.toLowerCase() === candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

function resolveAllFields(availableFields: string[]) {
  return {
    日期: resolveFieldName('日期', availableFields),
    应用: resolveFieldName('应用', availableFields),
    国家: resolveFieldName('国家', availableFields),
    渠道: resolveFieldName('渠道', availableFields),
    版本: resolveFieldName('版本', availableFields),
    标准广告场景: resolveFieldName('标准广告场景', availableFields),
    聚合广告场景: resolveFieldName('聚合广告场景', availableFields),
    注册用户: resolveFieldName('注册用户', availableFields),
    曝光人数: resolveFieldName('曝光人数', availableFields),
    曝光次数: resolveFieldName('曝光次数', availableFields),
    点击次数: resolveFieldName('点击次数', availableFields),
    广告收益: resolveFieldName('广告收益', availableFields),
  };
}

export function getFieldMappingStatus(availableFields: string[]) {
  const resolved = resolveAllFields(availableFields);
  const requiredFields = ['日期'] as const;
  const missing = requiredFields.filter((f) => !resolved[f as keyof typeof resolved]);
  const metricFields = ['注册用户', '曝光人数', '曝光次数', '点击次数', '广告收益'] as const;
  const hasAnyMetric = metricFields.some((f) => !!resolved[f as keyof typeof resolved]);
  return { resolved, missing, hasAnyMetric };
}

function groupByDateAndApp(data: DataRow[], dateField: string, appField: string | null) {
  const groups = new Map<string, DateGroup[]>();

  for (const row of data) {
    const rawDate = row[dateField];
    let dateStr: string;
    if (rawDate instanceof Date) {
      dateStr = rawDate.toISOString().split('T')[0];
    } else {
      dateStr = String(rawDate).split('T')[0].split(' ')[0];
    }

    const app = appField ? String(row[appField] || '未知') : '全部应用';
    const key = app;

    let dateGroups = groups.get(key);
    if (!dateGroups) {
      dateGroups = [];
      groups.set(key, dateGroups);
    }
    let dateGroup = dateGroups.find((g) => g.date === dateStr);
    if (!dateGroup) {
      dateGroup = { date: dateStr, rows: [] };
      dateGroups.push(dateGroup);
    }
    dateGroup.rows.push(row);
  }

  for (const [, dateGroups] of groups) {
    dateGroups.sort((a, b) => a.date.localeCompare(b.date));
  }

  return groups;
}

function sumMetric(rows: DataRow[], metricName: string): number {
  return rows.reduce((sum, row) => {
    const val = Number(row[metricName]);
    return sum + (Number.isNaN(val) ? 0 : val);
  }, 0);
}

function calculateDailyChanges(values: number[]): number[] {
  const changes: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) {
      changes.push((values[i] - values[i - 1]) / values[i - 1]);
    } else {
      changes.push(values[i] > 0 ? 1 : 0);
    }
  }
  return changes;
}

function calculateStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function analyzeMetric(
  dateGroups: DateGroup[],
  metricName: string,
  dimensions: string[]
): { trend: MetricTrend; anomalies: DayAnomaly[] } {
  const values = dateGroups.map((g) => sumMetric(g.rows, metricName));
  const dailyChanges = calculateDailyChanges(values);
  const startValue = values[0] || 0;
  const endValue = values[values.length - 1] || 0;
  const totalChangeRate = startValue !== 0 ? (endValue - startValue) / startValue : 0;

  const trend: MetricTrend = {
    metricName,
    startValue,
    endValue,
    totalChangeRate,
    dailyChanges,
    anomalyCount: 0,
  };

  const anomalies: DayAnomaly[] = [];

  if (dailyChanges.length >= 2) {
    const std = calculateStd(dailyChanges);
    const threshold = Math.max(std * ADAPTIVE_THRESHOLD_MULTIPLIER, WARNING_CHANGE_RATE);

    for (let i = 0; i < dailyChanges.length; i++) {
      const changeRate = dailyChanges[i];
      const absChange = Math.abs(changeRate);

      if (absChange >= threshold) {
        const severity: AnomalySeverity =
          absChange >= CRITICAL_CHANGE_RATE ? 'CRITICAL' : 'WARNING';
        const currentDate = dateGroups[i + 1].date;
        const currentValue = values[i + 1];
        const previousValue = values[i];

        const rootCause = findRootCause(
          dateGroups[i + 1].rows,
          i > 0 ? dateGroups[i].rows : [],
          metricName,
          dimensions
        );

        anomalies.push({
          date: currentDate,
          metricName,
          currentValue,
          previousValue,
          changeRate,
          severity,
          rootCause,
        });

        trend.anomalyCount++;
      }
    }
  }

  if (dailyChanges.length >= TREND_WINDOW) {
    const lastN = dailyChanges.slice(-TREND_WINDOW);
    const allNegative = lastN.every((c) => c < 0);
    const allPositive = lastN.every((c) => c > 0);

    if (allNegative || allPositive) {
      const cumulativeChange = lastN.reduce((sum, c) => sum + c, 0);
      if (Math.abs(cumulativeChange) >= WARNING_CHANGE_RATE) {
        const lastDate = dateGroups[dateGroups.length - 1].date;
        const lastValue = values[values.length - 1];
        const prevValue = values[values.length - 1 - TREND_WINDOW];

        const alreadyExists = anomalies.some(
          (a) => a.date === lastDate && a.metricName === metricName
        );
        if (!alreadyExists) {
          anomalies.push({
            date: lastDate,
            metricName,
            currentValue: lastValue,
            previousValue: prevValue,
            changeRate: cumulativeChange,
            severity: 'WARNING',
            rootCause: allNegative ? '连续下降趋势' : '连续上升趋势',
          });
          trend.anomalyCount++;
        }
      }
    }
  }

  return { trend, anomalies };
}

function findRootCause(
  currentRows: DataRow[],
  previousRows: DataRow[],
  metricName: string,
  dimensions: string[]
): string {
  if (dimensions.length === 0 || previousRows.length === 0) {
    return '数据变化';
  }

  let bestDim = '';
  let bestMember = '';
  let bestContribution = 0;
  const totalCurrent = sumMetric(currentRows, metricName);
  const totalPrevious = sumMetric(previousRows, metricName);
  const totalDiff = totalCurrent - totalPrevious;

  if (Math.abs(totalDiff) < 0.01) return '数据变化';

  for (const dim of dimensions) {
    const currentGroups = groupByMember(currentRows, dim);
    const previousGroups = groupByMember(previousRows, dim);
    const allMembers = new Set([...currentGroups.keys(), ...previousGroups.keys()]);

    for (const member of allMembers) {
      const currentMemberRows = currentGroups.get(member) || [];
      const previousMemberRows = previousGroups.get(member) || [];
      const currentVal = sumMetric(currentMemberRows, metricName);
      const previousVal = sumMetric(previousMemberRows, metricName);
      const memberDiff = currentVal - previousVal;
      const contribution = Math.abs(memberDiff / totalDiff);

      if (contribution > bestContribution) {
        bestContribution = contribution;
        bestDim = dim;
        bestMember = member;
      }
    }
  }

  if (bestDim && bestMember && bestContribution > 0.3) {
    const direction = totalDiff < 0 ? '下降' : '上升';
    return `${bestMember} ${direction}`;
  }

  return '多维度变化';
}

function groupByMember(rows: DataRow[], dimensionName: string): Map<string, DataRow[]> {
  const groups = new Map<string, DataRow[]>();
  for (const row of rows) {
    const value = String(row[dimensionName] || '未知');
    const existing = groups.get(value) || [];
    existing.push(row);
    groups.set(value, existing);
  }
  return groups;
}

function generateAppSummary(
  appName: string,
  trends: MetricTrend[],
  anomalies: DayAnomaly[]
): string {
  const significantTrends = trends.filter((t) => Math.abs(t.totalChangeRate) > 0.05);
  if (significantTrends.length === 0) {
    return `${appName} 各指标整体稳定`;
  }

  const parts: string[] = [];
  for (const trend of significantTrends.slice(0, 2)) {
    const direction = trend.totalChangeRate > 0 ? '增长' : '下降';
    const percent = Math.abs(trend.totalChangeRate * 100).toFixed(1);
    parts.push(`${trend.metricName} ${direction} ${percent}%`);
  }

  let summary = `${appName} ${parts.join('，')}`;
  if (anomalies.length > 0) {
    summary += `，发现 ${anomalies.length} 个异常日期`;
  }
  return summary;
}

export function runFullAnalysis(
  data: DataRow[],
  availableFields: string[]
): { results: AppAnalysisResult[]; diagnostics: AnalysisDiagnostics } {
  const fields = resolveAllFields(availableFields);

  if (!fields.日期) {
    return {
      results: [],
      diagnostics: {
        totalApps: 0,
        totalDays: 0,
        dateRange: '',
        missingFields: ['日期'],
      },
    };
  }

  const metricFields = [
    fields.注册用户,
    fields.曝光人数,
    fields.曝光次数,
    fields.点击次数,
    fields.广告收益,
  ].filter((f): f is string => typeof f === 'string');

  if (metricFields.length === 0) {
    return {
      results: [],
      diagnostics: {
        totalApps: 0,
        totalDays: 0,
        dateRange: '',
        missingFields: ['指标字段'],
      },
    };
  }

  const scenarioField = fields.标准广告场景 || fields.聚合广告场景 || null;
  const dimensions = [fields.应用, fields.国家, fields.渠道, fields.版本, fields.标准广告场景, fields.聚合广告场景].filter(
    (f): f is string => typeof f === 'string'
  );

  const appGroups = groupByDateAndApp(data, fields.日期, fields.应用 || null);

  // 对每个应用的每日数据进行 ALL 行过滤，避免状态指标跨场景重复求和
  for (const [, dateGroups] of appGroups) {
    for (const dg of dateGroups) {
      dg.rows = filterForAggregateMetrics(dg.rows, scenarioField);
    }
  }

  const results: AppAnalysisResult[] = [];
  let totalDays = 0;
  let startDate = '';
  let endDate = '';

  for (const [appName, dateGroups] of appGroups) {
    if (dateGroups.length < MIN_DATA_DAYS) continue;

    const allTrends: MetricTrend[] = [];
    const allAnomalies: DayAnomaly[] = [];

    for (const metricName of metricFields) {
      const threshold = MONITOR_THRESHOLDS.find((t) => t.metricName === metricName);
      if (threshold) {
        const lastValue = sumMetric(dateGroups[dateGroups.length - 1].rows, metricName);
        if (lastValue < threshold.minVolume) continue;
      }

      const { trend, anomalies } = analyzeMetric(dateGroups, metricName, dimensions);
      allTrends.push(trend);
      allAnomalies.push(...anomalies);
    }

    allAnomalies.sort((a, b) => {
      if (a.severity === 'CRITICAL' && b.severity !== 'CRITICAL') return -1;
      if (a.severity !== 'CRITICAL' && b.severity === 'CRITICAL') return 1;
      return Math.abs(b.changeRate) - Math.abs(a.changeRate);
    });

    const summary = generateAppSummary(appName, allTrends, allAnomalies);

    results.push({
      appName,
      startDate: dateGroups[0].date,
      endDate: dateGroups[dateGroups.length - 1].date,
      totalDays: dateGroups.length,
      trends: allTrends,
      anomalies: allAnomalies,
      summary,
    });

    totalDays = Math.max(totalDays, dateGroups.length);
    if (!startDate || dateGroups[0].date < startDate) startDate = dateGroups[0].date;
    if (!endDate || dateGroups[dateGroups.length - 1].date > endDate)
      endDate = dateGroups[dateGroups.length - 1].date;
  }

  results.sort((a, b) => b.anomalies.length - a.anomalies.length);

  return {
    results,
    diagnostics: {
      totalApps: results.length,
      totalDays,
      dateRange: startDate && endDate ? `${startDate} ~ ${endDate}` : '',
      missingFields: [],
    },
  };
}

export function getUniqueApps(data: DataRow[], availableFields: string[]): string[] {
  const appField = resolveFieldName('应用', availableFields);
  if (!appField) return [];

  const apps = new Set<string>();
  for (const row of data) {
    const app = String(row[appField] || '');
    if (app) apps.add(app);
  }
  return Array.from(apps).sort();
}

export function buildFilterPayload(
  appName: string,
  appField: string | null | undefined,
  metricName: string
) {
  const filters: Record<string, string[]> = {};
  if (appField && appName !== '全部应用') {
    filters[appField] = [appName];
  }
  return {
    filters,
    rows: appField ? [appField] : [],
    columns: [],
    values: [metricName],
  };
}

// ============ 诊断模块新增函数 ============

import type {
  ArpuDecomposition,
  DiagnosticResult,
  DimensionContribution,
  DimensionMemberContribution,
  IpuDecomposition,
  MetricSnapshot,
  RevenueSnapshot,
  RootCauseMember,
  RootCauseResult,
} from '../types/anomaly';

/** 计算单指标快照 */
function snapshot(current: number, previous: number): MetricSnapshot {
  return {
    current,
    previous,
    changeRate: previous !== 0 ? (current - previous) / previous : 0,
  };
}

/** 从行数据中安全求和 */
function safeSumMetric(rows: DataRow[], fieldName: string | null): number {
  if (!fieldName) return 0;
  return rows.reduce((sum, row) => {
    const val = Number(row[fieldName]);
    return sum + (Number.isNaN(val) ? 0 : val);
  }, 0);
}

/**
 * 计算诊断指标（ARPU 双因子）
 * ARPU = 注册IPU × eCPM / 1000
 */
function computeArpuMetrics(rows: DataRow[], fields: ReturnType<typeof resolveAllFields>) {
  const revenue = safeSumMetric(rows, fields.广告收益);
  const impressions = safeSumMetric(rows, fields.曝光次数);
  const impressionUsers = safeSumMetric(rows, fields.曝光人数);
  const registeredUsers = safeSumMetric(rows, fields.注册用户);

  const arpu = registeredUsers > 0 ? revenue / registeredUsers : 0;
  const ipuPerUser = registeredUsers > 0 ? impressions / registeredUsers : 0;
  const ecpm = impressions > 0 ? (revenue / impressions) * 1000 : 0;
  const penetration = registeredUsers > 0 ? impressionUsers / registeredUsers : 0;
  const impressionUserIpu = impressionUsers > 0 ? impressions / impressionUsers : 0;

  return { arpu, ipuPerUser, ecpm, penetration, impressionUserIpu, registeredUsers, revenue, impressions, impressionUsers };
}

/**
 * ARPU 双因子拆解
 * ARPU = 注册IPU × eCPM / 1000
 */
function decomposeArpu(
  currentRows: DataRow[],
  previousRows: DataRow[],
  fields: ReturnType<typeof resolveAllFields>
): ArpuDecomposition {
  const curr = computeArpuMetrics(currentRows, fields);
  const prev = computeArpuMetrics(previousRows, fields);

  const arpuSnap = snapshot(curr.arpu, prev.arpu);
  const ipuSnap = snapshot(curr.ipuPerUser, prev.ipuPerUser);
  const ecpmSnap = snapshot(curr.ecpm, prev.ecpm);

  // 归因：量贡献 vs 价贡献
  const absIpuChange = Math.abs(ipuSnap.changeRate);
  const absEcpmChange = Math.abs(ecpmSnap.changeRate);
  const total = absIpuChange + absEcpmChange;

  let quantityContribution = 0;
  let priceContribution = 0;
  let primaryFactor: 'quantity' | 'price' | 'balanced' = 'balanced';

  if (total > 0.001) {
    quantityContribution = absIpuChange / total;
    priceContribution = absEcpmChange / total;
    if (quantityContribution > 0.6) primaryFactor = 'quantity';
    else if (priceContribution > 0.6) primaryFactor = 'price';
  }

  return {
    arpu: arpuSnap,
    ipuPerUser: ipuSnap,
    ecpm: ecpmSnap,
    attribution: { quantityContribution, priceContribution, primaryFactor },
  };
}

/**
 * IPU 二级拆解
 * 注册IPU = 广告渗透率 × 曝光用户IPU
 */
function decomposeIpu(
  currentRows: DataRow[],
  previousRows: DataRow[],
  fields: ReturnType<typeof resolveAllFields>
): IpuDecomposition {
  const curr = computeArpuMetrics(currentRows, fields);
  const prev = computeArpuMetrics(previousRows, fields);

  const ipuSnap = snapshot(curr.ipuPerUser, prev.ipuPerUser);
  const penSnap = snapshot(curr.penetration, prev.penetration);
  const impIpuSnap = snapshot(curr.impressionUserIpu, prev.impressionUserIpu);

  let diagnosis: IpuDecomposition['diagnosis'] = 'stable';
  const penDown = penSnap.changeRate < -0.05;
  const freqDown = impIpuSnap.changeRate < -0.05;

  if (penDown && freqDown) diagnosis = 'both_down';
  else if (penDown) diagnosis = 'penetration_down';
  else if (freqDown) diagnosis = 'frequency_down';

  return {
    ipuPerUser: ipuSnap,
    penetration: penSnap,
    impressionUserIpu: impIpuSnap,
    diagnosis,
  };
}

/**
 * 维度贡献度分析
 * 对每个维度计算各成员对指标变化的贡献
 */
function findDimensionContributions(
  currentRows: DataRow[],
  previousRows: DataRow[],
  metricName: string,
  dimensionName: string
): DimensionContribution {
  const currentGroups = groupByMember(currentRows, dimensionName);
  const previousGroups = groupByMember(previousRows, dimensionName);
  const allMembers = new Set([...currentGroups.keys(), ...previousGroups.keys()]);

  const totalCurrent = sumMetric(currentRows, metricName);
  const totalPrevious = sumMetric(previousRows, metricName);
  const totalDiff = totalCurrent - totalPrevious;

  // 计算总注册用户（用于国家占比分析）
  const fields = resolveAllFields(Object.keys(currentRows[0] || {}));
  const totalCurrUsers = safeSumMetric(currentRows, fields.注册用户);
  const totalPrevUsers = safeSumMetric(previousRows, fields.注册用户);

  const members: DimensionMemberContribution[] = [];

  for (const member of allMembers) {
    const currentMemberRows = currentGroups.get(member) || [];
    const previousMemberRows = previousGroups.get(member) || [];
    const currentVal = sumMetric(currentMemberRows, metricName);
    const previousVal = sumMetric(previousMemberRows, metricName);
    const memberDiff = currentVal - previousVal;
    const contribution = Math.abs(totalDiff) > 0.01 ? memberDiff / totalDiff : 0;

    const userShare = totalCurrUsers > 0 ? safeSumMetric(currentMemberRows, fields.注册用户) / totalCurrUsers : 0;
    const previousUserShare = totalPrevUsers > 0 ? safeSumMetric(previousMemberRows, fields.注册用户) / totalPrevUsers : 0;

    members.push({
      value: member,
      currentMetric: currentVal,
      previousMetric: previousVal,
      contribution,
      userShare,
      previousUserShare,
    });
  }

  // 按贡献绝对值排序
  members.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return { dimensionName, members };
}

/**
 * 结构化 RootCauseResult（替代原 findRootCause 返回字符串）
 * @internal 保留供未来使用
 */
export function findStructuredRootCause(
  currentRows: DataRow[],
  previousRows: DataRow[],
  metricName: string,
  dimensions: string[]
): RootCauseResult {
  const topCauses: RootCauseMember[] = [];

  for (const dim of dimensions) {
    const contrib = findDimensionContributions(currentRows, previousRows, metricName, dim);
    // 取贡献最大的成员
    if (contrib.members.length > 0) {
      const top = contrib.members[0];
      if (Math.abs(top.contribution) > 0.15) {
        topCauses.push({
          dimensionName: dim,
          memberValue: top.value,
          explanatoryPower: top.contribution,
        });
      }
    }
  }

  // 按 explanatoryPower 绝对值排序，取 top 3
  topCauses.sort((a, b) => Math.abs(b.explanatoryPower) - Math.abs(a.explanatoryPower));
  return { topCauses: topCauses.slice(0, 3) };
}

/**
 * 生成诊断结论文本
 */
function generateDiagnosticConclusion(result: DiagnosticResult): string {
  const { level1, level2, level3, revenue } = result;
  const parts: string[] = [];

  // 收益变化
  const revChange = (revenue.revenue.changeRate * 100).toFixed(1);
  if (Math.abs(Number(revChange)) > 1) {
    const revDir = revenue.revenue.changeRate < 0 ? '下降' : '增长';
    parts.push(`广告收益 ${revDir} ${Math.abs(Number(revChange))}%。`);
  }

  // 第一级结论
  const arpuChange = (level1.arpu.changeRate * 100).toFixed(1);
  const direction = level1.arpu.changeRate < 0 ? '下跌' : '上涨';
  const factorName = level1.attribution.primaryFactor === 'quantity' ? '量因子（注册IPU）' : '价因子（eCPM）';
  parts.push(`ARPU ${direction} ${Math.abs(Number(arpuChange))}%，主要由${factorName}驱动。`);

  // 第二级结论
  if (level1.attribution.primaryFactor === 'quantity') {
    const { diagnosis, penetration, impressionUserIpu } = level2.ipuBreakdown;
    if (diagnosis === 'penetration_down') {
      const penChange = (penetration.changeRate * 100).toFixed(1);
      parts.push(`渗透率下跌 ${Math.abs(Number(penChange))}% 为主因，曝光用户频次基本稳定。`);
    } else if (diagnosis === 'frequency_down') {
      const freqChange = (impressionUserIpu.changeRate * 100).toFixed(1);
      parts.push(`曝光用户IPU下跌 ${Math.abs(Number(freqChange))}% 为主因。`);
    } else if (diagnosis === 'both_down') {
      parts.push('渗透率和曝光用户频次均下跌。');
    }
  } else {
    // 价因子分析
    const countryContrib = level3.countryContrib;
    if (countryContrib.members.length > 0) {
      const topCountry = countryContrib.members[0];
      if (Math.abs(topCountry.contribution) > 0.3 && topCountry.userShare !== undefined) {
        const shareChange = ((topCountry.userShare - (topCountry.previousUserShare || 0)) * 100).toFixed(0);
        parts.push(`eCPM 变化主要由【${countryContrib.dimensionName} ${topCountry.value}】驱动（贡献 ${Math.abs(topCountry.contribution * 100).toFixed(0)}%）。`);
        if (Math.abs(Number(shareChange)) > 5) {
          parts.push(`该维度用户占比变化 ${shareChange}%。`);
        }
      }
    }
  }

  // 第三级维度推荐
  const highContribDims = [level3.versionContrib, level3.channelContrib, level3.countryContrib, level3.scenarioContrib]
    .filter(d => d.members.length > 0 && Math.abs(d.members[0].contribution) > 0.3);

  if (highContribDims.length > 0) {
    const dim = highContribDims[0];
    const member = dim.members[0];
    parts.push(`建议重点排查【${dim.dimensionName} ${member.value}】。`);
  }

  return parts.join('');
}

/**
 * 合并多天的行数据
 */
function mergeRows(groups: { date: string; rows: DataRow[] }[]): DataRow[] {
  const merged: DataRow[] = [];
  for (const g of groups) {
    merged.push(...g.rows);
  }
  return merged;
}

/**
 * 获取指定应用的可用对比模式
 */
export function getAvailableModes(
  data: DataRow[],
  availableFields: string[],
  appName?: string
): { mode: ComparisonMode; label: string; description: string }[] {
  const fields = resolveAllFields(availableFields);
  if (!fields.日期) return [];

  const appGroups = groupByDateAndApp(data, fields.日期, fields.应用 || null);
  const targetApp = appName || Array.from(appGroups.keys())[0];
  const dateGroups = appGroups.get(targetApp);
  if (!dateGroups) return [];

  const totalDays = dateGroups.length;
  const modes: { mode: ComparisonMode; label: string; description: string }[] = [];

  if (totalDays >= 2) modes.push({ mode: 'day', label: '日环比', description: `${dateGroups[dateGroups.length - 1].date} vs ${dateGroups[dateGroups.length - 2].date}` });
  if (totalDays >= 3) modes.push({ mode: 'prev_day', label: '昨日对比前日', description: `${dateGroups[dateGroups.length - 2].date} vs ${dateGroups[dateGroups.length - 3].date}` });
  if (totalDays >= 6) modes.push({ mode: 'multi_day', label: '多日环比', description: `近3天 vs 前3天` });
  if (totalDays >= 14) modes.push({ mode: 'week', label: '周环比', description: `近7天 vs 前7天` });

  return modes;
}

/**
 * 运行三级诊断分析
 */
export function runDiagnosticAnalysis(
  data: DataRow[],
  availableFields: string[],
  appName?: string,
  mode: ComparisonMode = 'day'
): DiagnosticResult | null {
  const fields = resolveAllFields(availableFields);
  if (!fields.日期 || !fields.广告收益 || !fields.注册用户 || !fields.曝光次数) {
    return null;
  }

  const appGroups = groupByDateAndApp(data, fields.日期, fields.应用 || null);
  const targetApp = appName || Array.from(appGroups.keys())[0];
  const dateGroups = appGroups.get(targetApp);
  if (!dateGroups || dateGroups.length < 2) return null;

  const scenarioField2 = fields.标准广告场景 || fields.聚合广告场景 || null;
  const dimensions = [fields.应用, fields.国家, fields.渠道, fields.版本, fields.标准广告场景, fields.聚合广告场景].filter(
    (f): f is string => typeof f === 'string'
  );

  let currentRows: DataRow[];
  let previousRows: DataRow[];
  let currentDateLabel: string;
  let previousDateLabel: string;

  const len = dateGroups.length;

  switch (mode) {
    case 'prev_day': {
      if (len < 3) return null;
      currentRows = dateGroups[len - 2].rows;
      previousRows = dateGroups[len - 3].rows;
      currentDateLabel = dateGroups[len - 2].date;
      previousDateLabel = dateGroups[len - 3].date;
      break;
    }
    case 'multi_day': {
      if (len < 6) return null;
      currentRows = mergeRows(dateGroups.slice(len - 3, len));
      previousRows = mergeRows(dateGroups.slice(len - 6, len - 3));
      currentDateLabel = `${dateGroups[len - 3].date} ~ ${dateGroups[len - 1].date}`;
      previousDateLabel = `${dateGroups[len - 6].date} ~ ${dateGroups[len - 4].date}`;
      break;
    }
    case 'week': {
      if (len < 14) return null;
      currentRows = mergeRows(dateGroups.slice(len - 7, len));
      previousRows = mergeRows(dateGroups.slice(len - 14, len - 7));
      currentDateLabel = `${dateGroups[len - 7].date} ~ ${dateGroups[len - 1].date}`;
      previousDateLabel = `${dateGroups[len - 14].date} ~ ${dateGroups[len - 8].date}`;
      break;
    }
    default: {
      // day
      currentRows = dateGroups[len - 1].rows;
      previousRows = dateGroups[len - 2].rows;
      currentDateLabel = dateGroups[len - 1].date;
      previousDateLabel = dateGroups[len - 2].date;
      break;
    }
  }

  // 聚合指标使用 ALL 行过滤后的数据，避免曝光人数等状态指标跨场景重复求和
  const aggCurrent = filterForAggregateMetrics(currentRows, scenarioField2);
  const aggPrevious = filterForAggregateMetrics(previousRows, scenarioField2);

  // 第一级：ARPU 双因子拆解（使用聚合数据）
  const level1 = decomposeArpu(aggCurrent, aggPrevious, fields);

  // 第二级：IPU 拆解 + eCPM 维度分析（使用聚合数据）
  const ipuBreakdown = decomposeIpu(aggCurrent, aggPrevious, fields);
  const ecpmDimensions = dimensions.map(dim =>
    findDimensionContributions(currentRows, previousRows, fields.广告收益 || '广告收益', dim)
  );

  // 第三级：各维度贡献度（维度分析使用原始数据，贡献度计算基于聚合数据的总量）
  const level3 = {
    versionContrib: findDimensionContributions(currentRows, previousRows, fields.注册用户 || '注册用户', fields.版本 || '版本'),
    channelContrib: findDimensionContributions(currentRows, previousRows, fields.注册用户 || '注册用户', fields.渠道 || '渠道'),
    countryContrib: findDimensionContributions(currentRows, previousRows, fields.广告收益 || '广告收益', fields.国家 || '国家'),
    scenarioContrib: findDimensionContributions(currentRows, previousRows, fields.注册用户 || '注册用户', fields.标准广告场景 || fields.聚合广告场景 || '标准广告场景'),
  };

  // 收益波动快照（使用聚合数据）
  const revenueSnap: RevenueSnapshot = {
    revenue: snapshot(safeSumMetric(aggCurrent, fields.广告收益), safeSumMetric(aggPrevious, fields.广告收益)),
    registeredUsers: snapshot(safeSumMetric(aggCurrent, fields.注册用户), safeSumMetric(aggPrevious, fields.注册用户)),
    impressions: snapshot(safeSumMetric(aggCurrent, fields.曝光次数), safeSumMetric(aggPrevious, fields.曝光次数)),
    impressionUsers: snapshot(safeSumMetric(aggCurrent, fields.曝光人数), safeSumMetric(aggPrevious, fields.曝光人数)),
  };

  const result: DiagnosticResult = {
    appName: targetApp,
    currentDate: currentDateLabel,
    previousDate: previousDateLabel,
    comparisonMode: mode,
    level1,
    revenue: revenueSnap,
    level2: { ipuBreakdown, ecpmDimensions },
    level3,
    conclusion: '',
  };

  result.conclusion = generateDiagnosticConclusion(result);
  return result;
}
