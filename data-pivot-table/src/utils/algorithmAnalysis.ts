import type { DataRow, Field } from '../types';
import { BASE_METRICS, calculatePresetMetric, isCalculatedMetric } from './calculatedField';

const DATE_HINTS = ['日期', '安装日期', 'date', 'day'];
const DEFAULT_EMPTY_LABEL = '未填写';
const SEMI_ADDITIVE_METRICS = new Set(['注册用户', '活跃用户', '曝光人数']);
const LOWER_IS_BETTER_HINTS = ['成本', '耗时', '失败', '流失', '跳出', '错误', '异常'];

export interface Point {
  label: string;
  value: number;
}

export interface TrendSeries {
  metric: string;
  label: string;
  group?: string;
  points: Point[];
  smoothed: Point[];
  growthRate: number;
  latest: number;
}

export interface TrendAnalysis {
  dateDimension: string;
  series: TrendSeries[];
  yMax: number;
  labels: string[];
  importantLabels: string[];
  smoothingFactor: number;
  scopeLabel: string;
  summary: {
    headline: string;
    attribution: string;
    recommendation: string;
  };
}

export interface HeatmapCell {
  row: string;
  column: string;
  value: number;
  intensity: number;
}

export interface VarianceAnalysis {
  rowDimension: string;
  columnDimension: string;
  metric: string;
  rows: string[];
  columns: string[];
  cells: HeatmapCell[];
  columnCv: Record<string, number>;
  maxValue: number;
  summary: {
    headline: string;
    attribution: string;
    recommendation: string;
  };
}

export interface ScoreMetric {
  metric: string;
  weight: number;
}

export interface ComparisonItem {
  group: string;
  score: number;
  metricScores: Record<string, number>;
  rawValues: Record<string, number>;
}

export interface ComparisonAnalysis {
  groupDimension: string;
  metrics: ScoreMetric[];
  items: ComparisonItem[];
  leaders: {
    overall?: ComparisonItem;
    efficiency?: ComparisonItem;
  };
  summary: {
    headline: string;
    attribution: string;
    recommendation: string;
  };
}

export interface PeriodPoint {
  label: string;
  value: number;
  changeRate: number;
  current: boolean;
}

export interface PeriodAnalysis {
  dateDimension: string;
  metric: string;
  points: PeriodPoint[];
  median: number;
  latest?: PeriodPoint;
  previous?: PeriodPoint;
  summary: {
    headline: string;
    attribution: string;
    recommendation: string;
  };
}

interface AggregateOptions {
  totalRevenue?: number;
}

interface TrendScope {
  label: string;
  rows: DataRow[];
  group?: string;
}

export interface TrendFilterOptions {
  appDimension?: string;
  countryDimension?: string;
  selectedApps?: string[];
  includeOverall?: boolean;
  country?: string;
  selectedDates?: string[];
  filterDimension?: string;
  filterValues?: string[];
}

export function getPreferredDateDimension(dimensions: Field[]): string {
  return (
    dimensions.find((field) => field.name === '日期')?.name ??
    dimensions.find((field) => DATE_HINTS.some((hint) => field.name.toLowerCase().includes(hint)))
      ?.name ??
    dimensions[0]?.name ??
    ''
  );
}

export function getPreferredGroupDimension(dimensions: Field[]): string {
  return (
    dimensions.find((field) => !DATE_HINTS.some((hint) => field.name.toLowerCase().includes(hint)))
      ?.name ??
    dimensions[0]?.name ??
    ''
  );
}

export function getPreferredMetric(measures: Field[]): string {
  return (
    measures.find((field) => field.name === '注册用户')?.name ??
    measures.find((field) => field.name === '广告收益')?.name ??
    measures[0]?.name ??
    ''
  );
}

export function buildTrendAnalysis(
  data: DataRow[],
  dimensions: Field[],
  measures: Field[],
  selectedMetrics: string[],
  dateDimension = getPreferredDateDimension(dimensions),
  filters: TrendFilterOptions = {}
): TrendAnalysis {
  const metrics = normalizeMetrics(selectedMetrics, measures, 3);
  const filteredData = filterTrendRows(data, filters, dateDimension);
  const grouped = groupRows(filteredData, dateDimension);
  const labels = sortLabels(Array.from(grouped.keys()), true);
  const smoothingFactor = getAutoSmoothingFactor(labels.length);
  const totalRevenue = sumRawMetric(filteredData, '广告收益');
  const selectedApps = filters.selectedApps ?? [];
  const selectedDimensionValues =
    filters.filterDimension && filters.filterValues?.length ? filters.filterValues : [];
  const compareByDimension = Boolean(filters.filterDimension && selectedDimensionValues.length > 0);
  const compareByApp =
    !compareByDimension && Boolean(filters.appDimension && selectedApps.length > 0);
  const appFilteredData =
    compareByDimension && filters.appDimension && selectedApps.length > 0
      ? filteredData.filter((row) =>
          selectedApps.includes(getLabel(row, filters.appDimension ?? ''))
        )
      : filteredData;
  const scopes: TrendScope[] = [
    ...(filters.includeOverall !== false
      ? [{ label: '总体', rows: appFilteredData, group: undefined }]
      : []),
    ...(compareByDimension
      ? selectedDimensionValues.map((value) => ({
          label: value,
          rows: appFilteredData.filter(
            (row) => getLabel(row, filters.filterDimension ?? '') === value
          ),
          group: value,
        }))
      : []),
    ...(compareByApp
      ? selectedApps.map((app) => ({
          label: app,
          rows: filteredData.filter((row) => getLabel(row, filters.appDimension ?? '') === app),
          group: app,
        }))
      : []),
  ].filter((scope) => scope.rows.length > 0);
  const effectiveScopes =
    scopes.length > 0 ? scopes : [{ label: '总体', rows: appFilteredData, group: undefined }];
  const showBreakdown = compareByDimension || compareByApp || effectiveScopes.length > 1;

  const series = effectiveScopes.flatMap((scope) => {
    const scopeGrouped = groupRows(scope.rows, dateDimension);
    return metrics.map((metric) => {
      const points = labels.map((label) => ({
        label,
        value: aggregateMetric(scopeGrouped.get(label) ?? [], metric, { totalRevenue }),
      }));
      const smoothed = smoothPoints(points, smoothingFactor);
      const first = firstNonZero(points)?.value ?? 0;
      const latest = points[points.length - 1]?.value ?? 0;
      const growthRate = first === 0 ? 0 : (latest - first) / Math.abs(first);

      return {
        metric,
        label: showBreakdown ? `${scope.label} · ${metric}` : metric,
        group: scope.group,
        points,
        smoothed,
        growthRate,
        latest,
      };
    });
  });
  const yMax = Math.max(
    1,
    ...series.flatMap((item) => item.smoothed.map((point) => point.value)),
    ...series.flatMap((item) => item.points.map((point) => point.value))
  );
  const trendSummary = buildTrendSummary(series, labels);
  const scopeLabel = buildTrendScopeLabel(filters);
  const importantLabels = getImportantDateLabels(labels, series[0]?.points ?? []);

  return {
    dateDimension,
    series,
    yMax,
    labels,
    importantLabels,
    smoothingFactor,
    scopeLabel,
    summary: trendSummary,
  };
}

function filterTrendRows(
  data: DataRow[],
  filters: TrendFilterOptions,
  dateDimension: string
): DataRow[] {
  return data.filter((row) => {
    if (filters.country && filters.countryDimension) {
      if (getLabel(row, filters.countryDimension) !== filters.country) return false;
    }
    if (filters.selectedDates?.length) {
      const dateValue = String(row[dateDimension] ?? '').trim();
      if (dateValue && !filters.selectedDates.includes(dateValue)) return false;
    }
    if (filters.filterDimension && filters.filterValues?.length) {
      if (!filters.filterValues.includes(getLabel(row, filters.filterDimension))) return false;
    }
    return true;
  });
}

function getImportantDateLabels(labels: string[], points: Point[]): string[] {
  if (labels.length <= 6) return labels;

  const important = new Set<string>([labels[0], labels[labels.length - 1]]);
  const nonZeroPoints = points.filter((point) => Number.isFinite(point.value));
  const maxPoint = nonZeroPoints.slice().sort((a, b) => b.value - a.value)[0];
  const minPoint = nonZeroPoints.slice().sort((a, b) => a.value - b.value)[0];
  if (maxPoint) important.add(maxPoint.label);
  if (minPoint) important.add(minPoint.label);

  const changes = points
    .slice(1)
    .map((point, index) => ({
      label: point.label,
      change: Math.abs(point.value - (points[index]?.value ?? 0)),
    }))
    .sort((a, b) => b.change - a.change);
  changes.slice(0, 2).forEach((item) => {
    important.add(item.label);
  });

  return labels.filter((label) => important.has(label)).slice(0, 6);
}

function buildTrendSummary(series: TrendSeries[], labels: string[]): TrendAnalysis['summary'] {
  if (series.length === 0) {
    return {
      headline: '暂无可分析指标',
      attribution: '当前数据不足以拆解贡献来源。',
      recommendation: '建议先补充日期、维度和指标数据后再查看趋势诊断。',
    };
  }

  const rankedByGrowth = series.slice().sort((a, b) => b.growthRate - a.growthRate);
  const strongest = rankedByGrowth[0];
  const weakest = rankedByGrowth[rankedByGrowth.length - 1];
  const largestLatest = series.slice().sort((a, b) => b.latest - a.latest)[0];
  const mostVolatile = series
    .map((item) => ({
      series: item,
      volatility: coefficientOfVariation(item.points.map((point) => point.value)),
    }))
    .sort((a, b) => b.volatility - a.volatility)[0];
  const growthSpread =
    strongest && weakest ? Math.abs(strongest.growthRate - weakest.growthRate) : 0;

  return {
    headline: strongest
      ? `${strongest.label} 增长最强，较首期 ${formatPercent(
          strongest.growthRate
        )}，最新值 ${formatNumber(strongest.latest)}。`
      : '暂无可分析指标',
    attribution:
      largestLatest && mostVolatile
        ? `当前最高贡献线是 ${largestLatest.label}，最新值 ${formatNumber(
            largestLatest.latest
          )}；波动最大的是 ${mostVolatile.series.label}，CV=${mostVolatile.volatility.toFixed(2)}。`
        : '当前数据不足以拆解贡献来源。',
    recommendation:
      labels.length < 4
        ? '日期样本偏少，建议扩大日期范围后再判断趋势稳定性。'
        : growthSpread >= 0.25
          ? `增长分化明显，优先复盘 ${strongest?.label ?? '领先项'} 与 ${
              weakest?.label ?? '落后项'
            } 的版本、渠道和国家结构差异。`
          : '当前趋势分化不大，建议继续跟踪高波动日期，并结合维度筛选定位异常来源。',
  };
}

function buildTrendScopeLabel(filters: TrendFilterOptions): string {
  const parts: string[] = [];
  if (filters.country) parts.push(filters.country);
  if (filters.filterDimension && filters.filterValues?.length) {
    const values = filters.filterValues.slice(0, 2).join('、');
    const suffix = filters.filterValues.length > 2 ? `等 ${filters.filterValues.length} 项` : '';
    parts.push(`${filters.filterDimension}: ${values}${suffix}`);
  }
  const apps = filters.selectedApps ?? [];
  if (apps.length > 0) {
    parts.push(apps.length === 1 ? apps[0] : `${apps.length} 个应用`);
  } else {
    parts.push('总体');
  }
  return parts.join(' / ');
}

function getAutoSmoothingFactor(pointCount: number): number {
  if (pointCount <= 7) return 1;
  if (pointCount <= 21) return 0.72;
  if (pointCount <= 60) return 0.5;
  return 0.36;
}

export function buildVarianceAnalysis(
  data: DataRow[],
  dimensions: Field[],
  measures: Field[],
  rowDimension = getPreferredGroupDimension(dimensions),
  columnDimension = pickSecondGroupDimension(dimensions, rowDimension),
  metric = getPreferredMetric(measures)
): VarianceAnalysis {
  const totalRevenue = sumRawMetric(data, '广告收益');
  const rowTotals = aggregateByDimension(data, rowDimension, metric, { totalRevenue });
  const columnTotals = aggregateByDimension(data, columnDimension, metric, { totalRevenue });
  const rows = topLabels(rowTotals, 5);
  const columns = topLabels(columnTotals, 5);
  const cells: HeatmapCell[] = [];
  let maxValue = 0;

  for (const row of rows) {
    for (const column of columns) {
      const value = aggregateMetric(
        data.filter(
          (item) =>
            getLabel(item, rowDimension) === row && getLabel(item, columnDimension) === column
        ),
        metric,
        { totalRevenue }
      );
      maxValue = Math.max(maxValue, value);
      cells.push({ row, column, value, intensity: 0 });
    }
  }

  const normalizedCells = cells.map((cell) => ({
    ...cell,
    intensity: maxValue === 0 ? 0 : cell.value / maxValue,
  }));
  const columnCv = Object.fromEntries(
    columns.map((column) => {
      const values = normalizedCells
        .filter((cell) => cell.column === column)
        .map((cell) => cell.value);
      return [column, coefficientOfVariation(values)];
    })
  );
  const topCell = normalizedCells.slice().sort((a, b) => b.value - a.value)[0];
  const topColumn = Object.entries(columnCv).sort((a, b) => b[1] - a[1])[0];

  return {
    rowDimension,
    columnDimension,
    metric,
    rows,
    columns,
    cells: normalizedCells,
    columnCv,
    maxValue,
    summary: {
      headline: topColumn
        ? `${topColumn[0]} 的离散度最高，CV=${topColumn[1].toFixed(2)}`
        : '暂无差异分布',
      attribution: topCell
        ? `${topCell.row} / ${topCell.column} 是当前最高值组合，${metric} 为 ${formatNumber(topCell.value)}。`
        : '当前数据不足以定位主要组合。',
      recommendation: topColumn
        ? `优先复查 ${topColumn[0]} 下的头部组合，判断是否需要拆分运营策略。`
        : '建议选择包含多个取值的维度进行差异分析。',
    },
  };
}

export function buildComparisonAnalysis(
  data: DataRow[],
  dimensions: Field[],
  measures: Field[],
  groupDimension = getPreferredGroupDimension(dimensions),
  metricWeights = buildDefaultWeights(measures)
): ComparisonAnalysis {
  const metrics = metricWeights.length > 0 ? metricWeights : buildDefaultWeights(measures);
  const totalRevenue = sumRawMetric(data, '广告收益');
  const groups = topLabels(
    aggregateByDimension(data, groupDimension, metrics[0]?.metric ?? '', {
      totalRevenue,
    }),
    8
  );
  const rawByGroup = groups.map((group) => {
    const rows = data.filter((row) => getLabel(row, groupDimension) === group);
    return {
      group,
      rawValues: Object.fromEntries(
        metrics.map(({ metric }) => [metric, aggregateMetric(rows, metric, { totalRevenue })])
      ),
    };
  });
  const ranges = Object.fromEntries(
    metrics.map(({ metric }) => {
      const values = rawByGroup.map((item) => item.rawValues[metric] ?? 0);
      return [metric, { min: Math.min(...values), max: Math.max(...values) }];
    })
  );
  const weightSum = metrics.reduce((sum, item) => sum + item.weight, 0) || 1;
  const items = rawByGroup
    .map((item) => {
      const metricScores = Object.fromEntries(
        metrics.map(({ metric }) => {
          const range = ranges[metric];
          const score = normalizeScore(item.rawValues[metric] ?? 0, range.min, range.max, metric);
          return [metric, score];
        })
      );
      const score =
        metrics.reduce((sum, metric) => {
          return sum + (metricScores[metric.metric] ?? 0) * (metric.weight / weightSum);
        }, 0) * 100;

      return {
        group: item.group,
        score,
        metricScores,
        rawValues: item.rawValues,
      };
    })
    .sort((a, b) => b.score - a.score);
  const overall = items[0];
  const efficiencyMetric = metrics.find((item) =>
    ['eCPM', 'CTR', 'ARPU', '渗透率'].includes(item.metric)
  );
  const efficiency = efficiencyMetric
    ? items.slice().sort((a, b) => {
        return (
          (b.metricScores[efficiencyMetric.metric] ?? 0) -
          (a.metricScores[efficiencyMetric.metric] ?? 0)
        );
      })[0]
    : items[0];
  const weakestMetric = overall
    ? Object.entries(overall.metricScores).sort((a, b) => a[1] - b[1])[0]?.[0]
    : undefined;

  return {
    groupDimension,
    metrics,
    items,
    leaders: { overall, efficiency },
    summary: {
      headline: overall
        ? `${overall.group} 综合得分 ${Math.round(overall.score)}，当前排名第一。`
        : '暂无综合评分结果',
      attribution:
        overall && weakestMetric
          ? `${overall.group} 的主要短板是 ${weakestMetric}，得分 ${Math.round(
              (overall.metricScores[weakestMetric] ?? 0) * 100
            )}。`
          : '当前数据不足以拆解维度得分。',
      recommendation:
        overall && efficiency
          ? `建议让低分组参考 ${efficiency.group} 在效率指标上的表现。`
          : '建议至少选择一个分组维度和两个指标进行评估。',
    },
  };
}

export function buildPeriodAnalysis(
  data: DataRow[],
  dimensions: Field[],
  measures: Field[],
  dateDimension = getPreferredDateDimension(dimensions),
  metric = getPreferredMetric(measures),
  depth = 8
): PeriodAnalysis {
  const totalRevenue = sumRawMetric(data, '广告收益');
  const grouped = groupRows(data, dateDimension);
  const labels = sortLabels(Array.from(grouped.keys()), true).slice(-depth);
  const values = labels.map((label) =>
    aggregateMetric(grouped.get(label) ?? [], metric, { totalRevenue })
  );
  const medianValue = median(values);
  const points = labels.map((label, index) => {
    const previous = index > 0 ? values[index - 1] : 0;
    const value = values[index] ?? 0;
    return {
      label,
      value,
      changeRate: previous ? (value - previous) / Math.abs(previous) : 0,
      current: index === labels.length - 1,
    };
  });
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  const medianChange =
    latest && medianValue ? (latest.value - medianValue) / Math.abs(medianValue) : 0;

  return {
    dateDimension,
    metric,
    points,
    median: medianValue,
    latest,
    previous,
    summary: {
      headline: latest
        ? `当前周期较历史中位数${medianChange >= 0 ? '高' : '低'} ${formatPercent(medianChange)}。`
        : '暂无环比结果',
      attribution:
        latest && previous
          ? `较上一周期变化 ${formatPercent(latest.changeRate)}，当前值 ${formatNumber(latest.value)}。`
          : '当前数据不足以计算上一周期变化。',
      recommendation:
        Math.abs(medianChange) >= 0.15
          ? '建议将该周期标记为重点复盘对象，结合渠道和应用维度继续下钻。'
          : '当前波动处于相对稳定区间，可继续观察后续周期。',
    },
  };
}

export function buildDefaultWeights(measures: Field[]): ScoreMetric[] {
  const selected = measures.slice(0, 4);
  const baseWeights = [40, 30, 20, 10];
  const total = baseWeights.slice(0, selected.length).reduce((sum, value) => sum + value, 0) || 1;

  return selected.map((field, index) => ({
    metric: field.name,
    weight: Math.round((baseWeights[index] / total) * 100),
  }));
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${trimNumber(value / 100000000)}亿`;
  if (abs >= 10000) return `${trimNumber(value / 10000)}万`;
  if (abs >= 1000) return `${trimNumber(value / 1000)}k`;
  if (abs > 0 && abs < 1) return trimNumber(value);
  return trimNumber(value);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function normalizeMetrics(selectedMetrics: string[], measures: Field[], limit: number): string[] {
  const measureNames = new Set(measures.map((field) => field.name));
  const selected = selectedMetrics.filter((metric) => measureNames.has(metric)).slice(0, limit);
  if (selected.length > 0) return selected;
  return measures.slice(0, limit).map((field) => field.name);
}

function groupRows(data: DataRow[], dimension: string): Map<string, DataRow[]> {
  const groups = new Map<string, DataRow[]>();
  for (const row of data) {
    const label = getLabel(row, dimension);
    const rows = groups.get(label) ?? [];
    rows.push(row);
    groups.set(label, rows);
  }
  return groups;
}

function aggregateByDimension(
  data: DataRow[],
  dimension: string,
  metric: string,
  options: AggregateOptions
): Map<string, number> {
  const groups = groupRows(data, dimension);
  return new Map(
    Array.from(groups.entries()).map(([label, rows]) => [
      label,
      aggregateMetric(rows, metric, options),
    ])
  );
}

function aggregateMetric(data: DataRow[], metric: string, options: AggregateOptions = {}): number {
  if (!metric || data.length === 0) return 0;

  if (isCalculatedMetric(metric)) {
    const values = Object.fromEntries(
      BASE_METRICS.map((baseMetric) => [baseMetric, aggregateMetric(data, baseMetric)])
    );
    return calculatePresetMetric(metric, values, { 总广告收益: options.totalRevenue ?? 0 }) ?? 0;
  }

  if (SEMI_ADDITIVE_METRICS.has(metric)) {
    return sumSemiAdditiveMetric(data, metric);
  }

  return sumRawMetric(data, metric);
}

function sumRawMetric(data: DataRow[], metric: string): number {
  return data.reduce((sum, row) => {
    const value = Number(row[metric]);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function sumSemiAdditiveMetric(data: DataRow[], metric: string): number {
  const maxByKey = new Map<string, number>();
  for (const row of data) {
    const value = Number(row[metric]);
    if (!Number.isFinite(value)) continue;
    const key = ['日期', '应用', 'app_code', '国家', '实际国家', '版本', '买量渠道', '渠道']
      .map((field) => String(row[field] ?? '').trim())
      .join('\u001f');
    maxByKey.set(key, Math.max(maxByKey.get(key) ?? value, value));
  }
  return Array.from(maxByKey.values()).reduce((sum, value) => sum + value, 0);
}

function getLabel(row: DataRow, dimension: string): string {
  return String(row[dimension] ?? '').trim() || DEFAULT_EMPTY_LABEL;
}

function sortLabels(labels: string[], dateLike = false): string[] {
  const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
  return labels.sort((a, b) => {
    if (dateLike) {
      const timeA = Date.parse(a);
      const timeB = Date.parse(b);
      if (Number.isFinite(timeA) && Number.isFinite(timeB)) return timeA - timeB;
    }
    return collator.compare(a, b);
  });
}

function topLabels(values: Map<string, number>, limit: number): string[] {
  return Array.from(values.entries())
    .filter(([label]) => label !== DEFAULT_EMPTY_LABEL)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label]) => label);
}

function pickSecondGroupDimension(dimensions: Field[], primary: string): string {
  return (
    dimensions.find(
      (field) =>
        field.name !== primary &&
        !DATE_HINTS.some((hint) => field.name.toLowerCase().includes(hint))
    )?.name ??
    dimensions.find((field) => field.name !== primary)?.name ??
    primary
  );
}

function smoothPoints(points: Point[], factor: number): Point[] {
  if (points.length === 0) return [];
  const alpha = Math.min(1, Math.max(0, factor));
  const smoothed: Point[] = [{ ...points[0] }];
  for (let i = 1; i < points.length; i++) {
    const prev = smoothed[i - 1].value;
    smoothed.push({
      label: points[i].label,
      value: alpha * points[i].value + (1 - alpha) * prev,
    });
  }
  return smoothed;
}

function firstNonZero(points: Point[]): Point | undefined {
  return points.find((point) => point.value !== 0) ?? points[0];
}

function coefficientOfVariation(values: number[]): number {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) return 0;
  const avg = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  if (avg === 0) return 0;
  const variance = filtered.reduce((sum, value) => sum + (value - avg) ** 2, 0) / filtered.length;
  return Math.sqrt(variance) / Math.abs(avg);
}

function normalizeScore(value: number, min: number, max: number, metric: string): number {
  if (max === min) return 1;
  const score = (value - min) / (max - min);
  const lowerIsBetter = LOWER_IS_BETTER_HINTS.some((hint) => metric.includes(hint));
  return lowerIsBetter ? 1 - score : score;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : sorted[mid];
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}
