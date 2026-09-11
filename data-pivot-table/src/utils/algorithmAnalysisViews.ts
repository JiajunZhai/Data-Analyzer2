import type {
  ComparisonAnalysis,
  PeriodAnalysis,
  ScoreMetric,
  TrendAnalysis,
  VarianceAnalysis,
} from './algorithmAnalysis';

export type AlgorithmAnalysisTab = 'trend' | 'variance' | 'comparison' | 'pop';

export interface AlgorithmAnalysisSavedView {
  id: string;
  name: string;
  datasetKey: string;
  datasetName?: string;
  createdAt: number;
  tab: AlgorithmAnalysisTab;
  trend: {
    metrics: string[];
    dateDimension: string;
    selectedDates: string[];
    selectedApps: string[];
    includeOverall: boolean;
    filterDimension: string;
    filterValues: string[];
  };
  variance: {
    rowDimension: string;
    columnDimension: string;
    metric: string;
  };
  comparison: {
    dimension: string;
    weights: ScoreMetric[];
  };
  period: {
    dateDimension: string;
    metric: string;
    depth: number;
  };
}

export type AlgorithmAnalysisExportAnalysis =
  | TrendAnalysis
  | VarianceAnalysis
  | ComparisonAnalysis
  | PeriodAnalysis;

export const ALGORITHM_ANALYSIS_SAVED_VIEWS_KEY = 'algorithm-analysis-saved-views';
export const RECENT_VIEWS_PER_DATASET = 10;
export const MAX_SAVED_VIEWS = 60;

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

export function getDatasetViewKey(datasetId?: string | null, datasetName?: string): string {
  if (datasetId) return `dataset-id:${datasetId}`;
  const normalizedName = datasetName?.trim();
  return normalizedName ? `dataset-name:${normalizedName}` : 'dataset:unsaved';
}

export function readAlgorithmAnalysisViews(
  storage: ReadableStorage | null | undefined = getBrowserStorage()
): AlgorithmAnalysisSavedView[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(ALGORITHM_ANALYSIS_SAVED_VIEWS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isSavedView) : [];
  } catch {
    return [];
  }
}

export function writeAlgorithmAnalysisViews(
  views: AlgorithmAnalysisSavedView[],
  storage: WritableStorage | null | undefined = getBrowserStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ALGORITHM_ANALYSIS_SAVED_VIEWS_KEY, JSON.stringify(views));
    return true;
  } catch {
    return false;
  }
}

export function getDatasetSavedViews(
  views: AlgorithmAnalysisSavedView[],
  datasetKey: string,
  limit = RECENT_VIEWS_PER_DATASET
): AlgorithmAnalysisSavedView[] {
  return views
    .filter((view) => view.datasetKey === datasetKey)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function saveAlgorithmAnalysisView(
  views: AlgorithmAnalysisSavedView[],
  view: AlgorithmAnalysisSavedView,
  perDatasetLimit = RECENT_VIEWS_PER_DATASET,
  totalLimit = MAX_SAVED_VIEWS
): AlgorithmAnalysisSavedView[] {
  const existing = views.filter((item) => item.id !== view.id);
  const datasetViews = [view, ...existing.filter((item) => item.datasetKey === view.datasetKey)]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, perDatasetLimit);
  const otherViews = existing.filter((item) => item.datasetKey !== view.datasetKey);

  return [...datasetViews, ...otherViews]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, totalLimit);
}

export function deleteAlgorithmAnalysisView(
  views: AlgorithmAnalysisSavedView[],
  id: string
): AlgorithmAnalysisSavedView[] {
  return views.filter((view) => view.id !== id);
}

export function buildAlgorithmAnalysisExport(input: {
  tab: AlgorithmAnalysisTab;
  datasetName?: string;
  exportedAt?: Date;
  analysis: AlgorithmAnalysisExportAnalysis;
}) {
  const exportedAt = input.exportedAt ?? new Date();

  return {
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    datasetName: input.datasetName ?? '',
    module: 'algorithm-analysis',
    tab: input.tab,
    summary: input.analysis.summary,
    chartData: buildChartData(input.tab, input.analysis),
  };
}

export function createAlgorithmAnalysisExportFilename(
  tab: AlgorithmAnalysisTab,
  datasetName?: string,
  exportedAt: Date = new Date()
): string {
  const date = exportedAt.toISOString().slice(0, 10);
  const dataset = sanitizeFilePart(datasetName?.trim() || 'dataset');
  return `${dataset}-algorithm-${tab}-${date}.json`;
}

export function downloadJsonFile(payload: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getBrowserStorage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}

function buildChartData(tab: AlgorithmAnalysisTab, analysis: AlgorithmAnalysisExportAnalysis) {
  switch (tab) {
    case 'trend': {
      const trend = analysis as TrendAnalysis;
      return {
        dateDimension: trend.dateDimension,
        labels: trend.labels,
        scopeLabel: trend.scopeLabel,
        yMax: trend.yMax,
        smoothingFactor: trend.smoothingFactor,
        series: trend.series.map((series) => ({
          metric: series.metric,
          label: series.label,
          group: series.group ?? '',
          growthRate: series.growthRate,
          latest: series.latest,
          points: series.points,
          smoothed: series.smoothed,
        })),
      };
    }
    case 'variance': {
      const variance = analysis as VarianceAnalysis;
      return {
        rowDimension: variance.rowDimension,
        columnDimension: variance.columnDimension,
        metric: variance.metric,
        rows: variance.rows,
        columns: variance.columns,
        cells: variance.cells,
        columnCv: variance.columnCv,
        maxValue: variance.maxValue,
      };
    }
    case 'comparison': {
      const comparison = analysis as ComparisonAnalysis;
      return {
        groupDimension: comparison.groupDimension,
        metrics: comparison.metrics,
        leaders: {
          overall: serializeComparisonItem(comparison.leaders.overall),
          efficiency: serializeComparisonItem(comparison.leaders.efficiency),
        },
        items: comparison.items.map(serializeComparisonItem),
      };
    }
    case 'pop': {
      const period = analysis as PeriodAnalysis;
      return {
        dateDimension: period.dateDimension,
        metric: period.metric,
        points: period.points,
        median: period.median,
        latest: period.latest,
        previous: period.previous,
      };
    }
  }
}

function serializeComparisonItem(item: ComparisonAnalysis['items'][number] | undefined) {
  if (!item) return undefined;
  return {
    group: item.group,
    score: item.score,
    metricScores: item.metricScores,
    rawValues: item.rawValues,
  };
}

function isSavedView(value: unknown): value is AlgorithmAnalysisSavedView {
  if (!value || typeof value !== 'object') return false;
  const view = value as Partial<AlgorithmAnalysisSavedView>;
  return (
    typeof view.id === 'string' &&
    typeof view.name === 'string' &&
    typeof view.datasetKey === 'string' &&
    typeof view.createdAt === 'number' &&
    ['trend', 'variance', 'comparison', 'pop'].includes(String(view.tab))
  );
}

function sanitizeFilePart(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}
