import { describe, expect, it } from 'vitest';
import type { TrendAnalysis } from '../algorithmAnalysis';
import {
  type AlgorithmAnalysisSavedView,
  buildAlgorithmAnalysisExport,
  deleteAlgorithmAnalysisView,
  getDatasetSavedViews,
  getDatasetViewKey,
  readAlgorithmAnalysisViews,
  saveAlgorithmAnalysisView,
  writeAlgorithmAnalysisViews,
} from '../algorithmAnalysisViews';

const baseView: AlgorithmAnalysisSavedView = {
  id: 'view-1',
  name: 'Main view',
  datasetKey: 'dataset-id:a',
  datasetName: 'Dataset A',
  createdAt: 100,
  tab: 'trend',
  trend: {
    metrics: ['Revenue'],
    dateDimension: 'Date',
    selectedDates: ['2026-06-01'],
    selectedApps: ['app-a'],
    includeOverall: true,
    filterDimension: 'Country',
    filterValues: ['US'],
  },
  variance: {
    rowDimension: 'App',
    columnDimension: 'Country',
    metric: 'Revenue',
  },
  comparison: {
    dimension: 'Country',
    weights: [{ metric: 'Revenue', weight: 100 }],
  },
  period: {
    dateDimension: 'Date',
    metric: 'Revenue',
    depth: 8,
  },
};

describe('algorithmAnalysisViews', () => {
  it('builds stable dataset keys from id before name', () => {
    expect(getDatasetViewKey('abc', 'Dataset')).toBe('dataset-id:abc');
    expect(getDatasetViewKey(null, 'Dataset')).toBe('dataset-name:Dataset');
    expect(getDatasetViewKey(null, '')).toBe('dataset:unsaved');
  });

  it('returns only recent views for the active dataset', () => {
    const views = [
      { ...baseView, id: 'old', createdAt: 1 },
      { ...baseView, id: 'new', createdAt: 3 },
      { ...baseView, id: 'other', datasetKey: 'dataset-id:b', createdAt: 4 },
      { ...baseView, id: 'middle', createdAt: 2 },
    ];

    expect(getDatasetSavedViews(views, 'dataset-id:a', 2).map((view) => view.id)).toEqual([
      'new',
      'middle',
    ]);
  });

  it('saves a view without leaking another dataset and trims per-dataset history', () => {
    const existing = Array.from({ length: 3 }, (_, index) => ({
      ...baseView,
      id: `existing-${index}`,
      createdAt: index,
    }));
    const otherDataset = { ...baseView, id: 'other', datasetKey: 'dataset-id:b', createdAt: 99 };
    const next = saveAlgorithmAnalysisView(
      [...existing, otherDataset],
      { ...baseView, id: 'latest', createdAt: 100 },
      2
    );

    expect(getDatasetSavedViews(next, 'dataset-id:a').map((view) => view.id)).toEqual([
      'latest',
      'existing-2',
    ]);
    expect(getDatasetSavedViews(next, 'dataset-id:b').map((view) => view.id)).toEqual(['other']);
  });

  it('deletes a saved view by id', () => {
    const next = deleteAlgorithmAnalysisView(
      [baseView, { ...baseView, id: 'keep', createdAt: 101 }],
      'view-1'
    );

    expect(next.map((view) => view.id)).toEqual(['keep']);
  });

  it('tolerates unavailable or failing storage', () => {
    expect(readAlgorithmAnalysisViews(null)).toEqual([]);
    expect(writeAlgorithmAnalysisViews([baseView], null)).toBe(false);
    expect(
      writeAlgorithmAnalysisViews([baseView], {
        setItem: () => {
          throw new Error('quota exceeded');
        },
      })
    ).toBe(false);
  });

  it('writes saved views to storage when available', () => {
    const storage = new Map<string, string>();
    const writableStorage = {
      setItem: (key: string, value: string) => storage.set(key, value),
    };

    expect(writeAlgorithmAnalysisViews([baseView], writableStorage)).toBe(true);
    expect(storage.get('algorithm-analysis-saved-views')).toContain('view-1');
  });

  it('exports summary and chart data for trend analysis', () => {
    const trend: TrendAnalysis = {
      dateDimension: 'Date',
      labels: ['2026-06-01', '2026-06-02'],
      importantLabels: ['2026-06-02'],
      scopeLabel: 'Overall',
      smoothingFactor: 1,
      yMax: 20,
      summary: {
        headline: 'Revenue is up',
        attribution: 'App A contributed most',
        recommendation: 'Keep monitoring',
      },
      series: [
        {
          metric: 'Revenue',
          label: 'Revenue',
          points: [
            { label: '2026-06-01', value: 10 },
            { label: '2026-06-02', value: 20 },
          ],
          smoothed: [
            { label: '2026-06-01', value: 10 },
            { label: '2026-06-02', value: 20 },
          ],
          growthRate: 1,
          latest: 20,
        },
      ],
    };

    const exported = buildAlgorithmAnalysisExport({
      tab: 'trend',
      datasetName: 'Dataset A',
      exportedAt: new Date('2026-06-30T00:00:00.000Z'),
      analysis: trend,
    });

    expect(exported.summary.headline).toBe('Revenue is up');
    expect(exported.chartData).toMatchObject({
      dateDimension: 'Date',
      labels: ['2026-06-01', '2026-06-02'],
      series: [{ metric: 'Revenue', latest: 20 }],
    });
  });
});
