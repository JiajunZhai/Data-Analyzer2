import {
  BarChart3,
  Calendar,
  Download,
  Eye,
  GitCompareArrows,
  History,
  Lightbulb,
  PieChart,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DataRow, Field } from '../../types';
import {
  buildComparisonAnalysis,
  buildDefaultWeights,
  buildPeriodAnalysis,
  buildTrendAnalysis,
  buildVarianceAnalysis,
  type ComparisonAnalysis,
  formatNumber,
  formatPercent,
  getPreferredDateDimension,
  getPreferredGroupDimension,
  getPreferredMetric,
  type PeriodAnalysis,
  type ScoreMetric,
  type TrendAnalysis,
  type VarianceAnalysis,
} from '../../utils/algorithmAnalysis';
import {
  type AlgorithmAnalysisSavedView,
  type AlgorithmAnalysisTab,
  buildAlgorithmAnalysisExport,
  createAlgorithmAnalysisExportFilename,
  deleteAlgorithmAnalysisView,
  downloadJsonFile,
  getDatasetSavedViews,
  getDatasetViewKey,
  readAlgorithmAnalysisViews,
  saveAlgorithmAnalysisView,
  writeAlgorithmAnalysisViews,
} from '../../utils/algorithmAnalysisViews';
import DateRangeFilterChip from '../AdMobFilterBar/DateRangeFilterChip';
import s from './AlgorithmAnalysis.module.css';

type Tab = AlgorithmAnalysisTab;
type ActiveAnalysis = TrendAnalysis | VarianceAnalysis | ComparisonAnalysis | PeriodAnalysis;

interface SmartInsight {
  modeLabel: string;
  status: string;
  priority: 'high' | 'watch' | 'stable';
  priorityLabel: string;
  confidence: number;
  confidenceLabel: string;
  focus: string;
  reason: string;
  nextAction: string;
  nextTab: Tab;
  nextTabLabel: string;
  chips: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: DataRow[];
  dimensions: Field[];
  measures: Field[];
  currentDatasetId?: string | null;
  currentDatasetName?: string;
}

const COLORS = ['#2952c9', '#00658d', '#ba1a1a', '#5b21b6', '#476ce3', '#006d43'];
const CHART_WIDTH = 1000;
const CHART_HEIGHT = 300;
const ALL_DIMENSION_VALUE = '__all_dimension__';
const TAB_LABELS: Record<Tab, string> = {
  trend: '数据走势',
  variance: '差异分析',
  comparison: '综合对比',
  pop: '环比分析',
};

const AlgorithmAnalysisModal: React.FC<Props> = ({
  isOpen,
  onClose,
  data,
  dimensions,
  measures,
  currentDatasetId,
  currentDatasetName,
}) => {
  const [tab, setTab] = useState<Tab>('trend');
  const [trendMetrics, setTrendMetrics] = useState<string[]>([]);
  const [trendDateValues, setTrendDateValues] = useState<string[]>([]);
  const [trendSelectedApps, setTrendSelectedApps] = useState<string[]>([]);
  const [trendIncludeOverall, setTrendIncludeOverall] = useState(true);
  const [trendFilterDimension, setTrendFilterDimension] = useState('');
  const [trendFilterValues, setTrendFilterValues] = useState<string[]>([]);
  const [varianceRowDimension, setVarianceRowDimension] = useState('');
  const [varianceColumnDimension, setVarianceColumnDimension] = useState('');
  const [varianceMetric, setVarianceMetric] = useState('');
  const [comparisonDimension, setComparisonDimension] = useState('');
  const [comparisonWeights, setComparisonWeights] = useState<ScoreMetric[]>([]);
  const [periodDateDimension, setPeriodDateDimension] = useState('');
  const [periodMetric, setPeriodMetric] = useState('');
  const [periodDepth, setPeriodDepth] = useState(8);
  const [saveFeedback, setSaveFeedback] = useState('');
  const [viewName, setViewName] = useState('');
  const [savedViews, setSavedViews] = useState<AlgorithmAnalysisSavedView[]>(() =>
    readAlgorithmAnalysisViews()
  );
  const [selectedViewId, setSelectedViewId] = useState('');
  const feedbackTimerRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const dims = useMemo(() => dimensions.map((field) => field.name), [dimensions]);
  const mets = useMemo(() => measures.map((field) => field.name), [measures]);
  const dateDims = useMemo(
    () => dims.filter((name) => name.includes('日期') || name.toLowerCase().includes('date')),
    [dims]
  );
  const groupDims = useMemo(
    () => dims.filter((name) => !dateDims.includes(name)),
    [dims, dateDims]
  );
  const defaultDateDimension = getPreferredDateDimension(dimensions);
  const trendAppDimension = pickDimension(dims, ['应用', 'app_code', 'app']);
  const trendAppOptions = useMemo(
    () => (trendAppDimension ? getUniqueOptions(data, trendAppDimension).slice(0, 80) : []),
    [data, trendAppDimension]
  );
  const trendDateOptions = useMemo(
    () => (defaultDateDimension ? getUniqueOptions(data, defaultDateDimension) : []),
    [data, defaultDateDimension]
  );
  const trendFilterDimensions = useMemo(
    () => dims.filter((dimension) => dimension !== defaultDateDimension),
    [defaultDateDimension, dims]
  );
  const effectiveTrendFilterDimension =
    trendFilterDimension && trendFilterDimensions.includes(trendFilterDimension)
      ? trendFilterDimension
      : '';
  const trendDimensionOptions = useMemo(
    () =>
      effectiveTrendFilterDimension
        ? getUniqueOptions(data, effectiveTrendFilterDimension).slice(0, 120)
        : [],
    [data, effectiveTrendFilterDimension]
  );
  const effectiveTrendSelectedApps = trendSelectedApps.filter((app) =>
    trendAppOptions.includes(app)
  );
  const effectiveTrendFilterValues = useMemo(
    () =>
      effectiveTrendFilterDimension && trendFilterValues.length > 0
        ? trendFilterValues.filter((value) => trendDimensionOptions.includes(value))
        : [],
    [effectiveTrendFilterDimension, trendDimensionOptions, trendFilterValues]
  );
  const defaultGroupDimension = getPreferredGroupDimension(dimensions);
  const defaultMetric = getPreferredMetric(measures);
  const trendMetricLimit =
    effectiveTrendSelectedApps.length > 0 || effectiveTrendFilterValues.length > 0 ? 1 : 3;
  const effectiveTrendMetrics = useMemo(() => {
    const filtered = trendMetrics
      .filter((metric) => mets.includes(metric))
      .slice(0, trendMetricLimit);
    const defaultTrendMetric =
      mets.find((metric) => metric.toUpperCase() === 'ARPU') ?? defaultMetric ?? mets[0];
    return filtered.length > 0
      ? filtered
      : defaultTrendMetric
        ? [defaultTrendMetric].slice(0, trendMetricLimit)
        : [];
  }, [defaultMetric, mets, trendMetricLimit, trendMetrics]);
  const effectiveTrendDateValues = useMemo(
    () =>
      trendDateValues.length > 0
        ? trendDateValues.filter((date) => trendDateOptions.includes(date))
        : trendDateOptions,
    [trendDateOptions, trendDateValues]
  );
  const effectiveVarianceRowDimension =
    varianceRowDimension && dims.includes(varianceRowDimension)
      ? varianceRowDimension
      : defaultGroupDimension;
  const effectiveVarianceColumnDimension =
    varianceColumnDimension &&
    dims.includes(varianceColumnDimension) &&
    varianceColumnDimension !== effectiveVarianceRowDimension
      ? varianceColumnDimension
      : (groupDims.find((name) => name !== effectiveVarianceRowDimension) ??
        dims.find((name) => name !== effectiveVarianceRowDimension) ??
        effectiveVarianceRowDimension);
  const effectiveVarianceMetric =
    varianceMetric && mets.includes(varianceMetric) ? varianceMetric : defaultMetric;
  const effectiveComparisonDimension =
    comparisonDimension && dims.includes(comparisonDimension)
      ? comparisonDimension
      : defaultGroupDimension;
  const effectiveComparisonWeights = useMemo(() => {
    const filtered = comparisonWeights.filter((item) => mets.includes(item.metric)).slice(0, 6);
    return filtered.length > 0 ? filtered : buildDefaultWeights(measures);
  }, [comparisonWeights, measures, mets]);
  const effectivePeriodDateDimension =
    periodDateDimension && dims.includes(periodDateDimension)
      ? periodDateDimension
      : defaultDateDimension;
  const effectivePeriodMetric =
    periodMetric && mets.includes(periodMetric) ? periodMetric : defaultMetric;
  const canAnalyze = data.length > 0 && dimensions.length > 0 && measures.length > 0;
  const datasetKey = useMemo(
    () => getDatasetViewKey(currentDatasetId, currentDatasetName),
    [currentDatasetId, currentDatasetName]
  );
  const datasetSavedViews = useMemo(
    () => getDatasetSavedViews(savedViews, datasetKey),
    [datasetKey, savedViews]
  );
  const selectedView = useMemo(
    () => datasetSavedViews.find((view) => view.id === selectedViewId),
    [datasetSavedViews, selectedViewId]
  );
  const defaultViewName = `${TAB_LABELS[tab]}视图`;

  const trend = useMemo<TrendAnalysis | null>(() => {
    if (!isOpen || !canAnalyze || tab !== 'trend') return null;
    return buildTrendAnalysis(
      data,
      dimensions,
      measures,
      effectiveTrendMetrics,
      defaultDateDimension,
      {
        appDimension: trendAppDimension,
        selectedApps: effectiveTrendSelectedApps,
        includeOverall: trendIncludeOverall,
        selectedDates: effectiveTrendDateValues,
        filterDimension: effectiveTrendFilterDimension,
        filterValues: effectiveTrendFilterValues,
      }
    );
  }, [
    isOpen,
    canAnalyze,
    tab,
    data,
    dimensions,
    measures,
    effectiveTrendMetrics,
    defaultDateDimension,
    trendAppDimension,
    effectiveTrendSelectedApps,
    trendIncludeOverall,
    effectiveTrendDateValues,
    effectiveTrendFilterDimension,
    effectiveTrendFilterValues,
  ]);
  const variance = useMemo<VarianceAnalysis | null>(() => {
    if (!isOpen || !canAnalyze || tab !== 'variance') return null;
    return buildVarianceAnalysis(
      data,
      dimensions,
      measures,
      effectiveVarianceRowDimension,
      effectiveVarianceColumnDimension,
      effectiveVarianceMetric
    );
  }, [
    isOpen,
    canAnalyze,
    tab,
    data,
    dimensions,
    measures,
    effectiveVarianceRowDimension,
    effectiveVarianceColumnDimension,
    effectiveVarianceMetric,
  ]);
  const comparison = useMemo<ComparisonAnalysis | null>(() => {
    if (!isOpen || !canAnalyze || tab !== 'comparison') return null;
    return buildComparisonAnalysis(
      data,
      dimensions,
      measures,
      effectiveComparisonDimension,
      effectiveComparisonWeights
    );
  }, [
    isOpen,
    canAnalyze,
    tab,
    data,
    dimensions,
    measures,
    effectiveComparisonDimension,
    effectiveComparisonWeights,
  ]);
  const period = useMemo<PeriodAnalysis | null>(() => {
    if (!isOpen || !canAnalyze || tab !== 'pop') return null;
    return buildPeriodAnalysis(
      data,
      dimensions,
      measures,
      effectivePeriodDateDimension,
      effectivePeriodMetric,
      periodDepth
    );
  }, [
    isOpen,
    canAnalyze,
    tab,
    data,
    dimensions,
    measures,
    effectivePeriodDateDimension,
    effectivePeriodMetric,
    periodDepth,
  ]);
  const activeAnalysis: ActiveAnalysis | null =
    tab === 'trend'
      ? trend
      : tab === 'variance'
        ? variance
        : tab === 'comparison'
          ? comparison
          : period;
  const smartInsight = useMemo(
    () =>
      canAnalyze && activeAnalysis
        ? buildSmartInsight(tab, activeAnalysis, {
            rowCount: data.length,
            dimensionCount: dims.length,
            metricCount: mets.length,
          })
        : null,
    [activeAnalysis, canAnalyze, data.length, dims.length, mets.length, tab]
  );

  const showFeedback = (message: string) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    setSaveFeedback(message);
    feedbackTimerRef.current = window.setTimeout(() => {
      setSaveFeedback('');
      feedbackTimerRef.current = null;
    }, 1600);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
    }
  }, [isOpen]);

  const handleSaveView = () => {
    if (!canAnalyze) return;
    const now = Date.now();
    const savedView: AlgorithmAnalysisSavedView = {
      id: `aa_view_${now}`,
      name: viewName.trim() || defaultViewName,
      datasetKey,
      datasetName: currentDatasetName,
      createdAt: now,
      tab,
      trend: {
        metrics: effectiveTrendMetrics,
        dateDimension: defaultDateDimension,
        selectedDates: effectiveTrendDateValues,
        selectedApps: effectiveTrendSelectedApps,
        includeOverall: trendIncludeOverall,
        filterDimension: effectiveTrendFilterDimension,
        filterValues: effectiveTrendFilterValues,
      },
      variance: {
        rowDimension: effectiveVarianceRowDimension,
        columnDimension: effectiveVarianceColumnDimension,
        metric: effectiveVarianceMetric,
      },
      comparison: {
        dimension: effectiveComparisonDimension,
        weights: effectiveComparisonWeights,
      },
      period: {
        dateDimension: effectivePeriodDateDimension,
        metric: effectivePeriodMetric,
        depth: periodDepth,
      },
    };

    const nextViews = saveAlgorithmAnalysisView(savedViews, savedView);
    setSavedViews(nextViews);
    const persisted = writeAlgorithmAnalysisViews(nextViews);
    setViewName('');
    setSelectedViewId(savedView.id);
    showFeedback(persisted ? '视图已保存' : '视图已暂存，本地存储不可用');
  };

  const handleRestoreView = (view: AlgorithmAnalysisSavedView) => {
    setTab(view.tab);
    setTrendMetrics(view.trend.metrics);
    setTrendDateValues(view.trend.selectedDates);
    setTrendSelectedApps(view.trend.selectedApps);
    setTrendIncludeOverall(view.trend.includeOverall);
    setTrendFilterDimension(view.trend.filterDimension);
    setTrendFilterValues(view.trend.filterValues);
    setVarianceRowDimension(view.variance.rowDimension);
    setVarianceColumnDimension(view.variance.columnDimension);
    setVarianceMetric(view.variance.metric);
    setComparisonDimension(view.comparison.dimension);
    setComparisonWeights(view.comparison.weights);
    setPeriodDateDimension(view.period.dateDimension);
    setPeriodMetric(view.period.metric);
    setPeriodDepth(view.period.depth);
    setSelectedViewId(view.id);
    showFeedback('视图已恢复');
  };

  const handleDeleteView = (id: string) => {
    const nextViews = deleteAlgorithmAnalysisView(savedViews, id);
    setSavedViews(nextViews);
    const persisted = writeAlgorithmAnalysisViews(nextViews);
    if (selectedViewId === id) setSelectedViewId('');
    showFeedback(persisted ? '视图已删除' : '视图已移除，本地存储不可用');
  };

  const handleExport = () => {
    const activeAnalysis =
      tab === 'trend'
        ? trend
        : tab === 'variance'
          ? variance
          : tab === 'comparison'
            ? comparison
            : period;
    if (!activeAnalysis) {
      showFeedback('暂无可导出内容');
      return;
    }

    const exportedAt = new Date();
    const payload = buildAlgorithmAnalysisExport({
      tab,
      datasetName: currentDatasetName,
      exportedAt,
      analysis: activeAnalysis,
    });
    downloadJsonFile(
      payload,
      createAlgorithmAnalysisExportFilename(tab, currentDatasetName, exportedAt)
    );
    showFeedback('导出已生成');
  };

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'trend', label: '数据走势', icon: <TrendingUp /> },
    { id: 'variance', label: '差异分析', icon: <GitCompareArrows /> },
    { id: 'comparison', label: '综合对比', icon: <BarChart3 /> },
    { id: 'pop', label: '环比分析', icon: <History /> },
  ];

  return (
    <div
      ref={dialogRef}
      className={s.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="algorithm-analysis-title"
      tabIndex={-1}
    >
      <div className={s.container}>
        <div className={s.top}>
          <header className={s.header}>
            <div className={s.headerLeft}>
              <div className={s.logo}>
                <Sparkles />
              </div>
              <div>
                <span className={s.title} id="algorithm-analysis-title">
                  智能算法分析中心
                </span>
                <div className={s.metaLine}>
                  {currentDatasetName || '当前数据集'} · {data.length.toLocaleString()} 行
                </div>
              </div>
            </div>
            <div className={s.headerRight}>
              {saveFeedback && <span className={s.saveFeedback}>{saveFeedback}</span>}
              <button
                type="button"
                className={`${s.btn} ${s.btnGhost}`}
                onClick={handleExport}
                disabled={!canAnalyze}
              >
                <Download />
                导出
              </button>
              <button
                type="button"
                className={`${s.btn} ${s.btnPrimary}`}
                onClick={handleSaveView}
                disabled={!canAnalyze}
              >
                <Save />
                保存视图
              </button>
              <button type="button" className={s.btnClose} onClick={onClose} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
          </header>
          <div className={s.tabs}>
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${s.tab} ${tab === item.id ? s.tabActive : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className={s.body}>
          <aside className={s.panel}>
            <div className={s.panelScroll}>
              {!canAnalyze && <EmptyPanel />}
              {canAnalyze && smartInsight && (
                <>
                  <SmartAssistant insight={smartInsight} onNavigate={setTab} />
                  <hr className={s.divider} />
                </>
              )}
              {canAnalyze && tab === 'trend' && (
                <TrendPanel
                  mets={mets}
                  selectedMetrics={effectiveTrendMetrics}
                  dateDimension={defaultDateDimension}
                  dateOptions={trendDateOptions}
                  selectedDates={effectiveTrendDateValues}
                  metricLimit={trendMetricLimit}
                  appOptions={trendAppOptions}
                  selectedApps={effectiveTrendSelectedApps}
                  includeOverall={trendIncludeOverall}
                  dimensionOptions={trendFilterDimensions}
                  filterDimension={effectiveTrendFilterDimension}
                  filterValueOptions={trendDimensionOptions}
                  filterValues={effectiveTrendFilterValues}
                  onDateChange={setTrendDateValues}
                  onAppToggle={(app) =>
                    setTrendSelectedApps((current) => toggleSelection(current, app, 12))
                  }
                  onOverallToggle={setTrendIncludeOverall}
                  onFilterDimensionChange={(dimension) => {
                    setTrendFilterDimension(dimension === ALL_DIMENSION_VALUE ? '' : dimension);
                    setTrendFilterValues([]);
                  }}
                  onFilterValueToggle={(value) =>
                    setTrendFilterValues((current) => toggleSelection(current, value, 20))
                  }
                  onMetricToggle={(metric) =>
                    setTrendMetrics(
                      toggleSelection(effectiveTrendMetrics, metric, trendMetricLimit)
                    )
                  }
                />
              )}
              {canAnalyze && tab === 'variance' && (
                <VariancePanel
                  dims={groupDims.length > 0 ? groupDims : dims}
                  mets={mets}
                  rowDimension={effectiveVarianceRowDimension}
                  columnDimension={effectiveVarianceColumnDimension}
                  metric={effectiveVarianceMetric}
                  onRowDimensionChange={setVarianceRowDimension}
                  onColumnDimensionChange={setVarianceColumnDimension}
                  onMetricChange={setVarianceMetric}
                />
              )}
              {canAnalyze && tab === 'comparison' && (
                <ComparePanel
                  dims={groupDims.length > 0 ? groupDims : dims}
                  mets={mets}
                  dimension={effectiveComparisonDimension}
                  weights={effectiveComparisonWeights}
                  onDimensionChange={setComparisonDimension}
                  onWeightChange={(metric, weight) =>
                    setComparisonWeights((current) =>
                      (current.length > 0 ? current : effectiveComparisonWeights).map((item) =>
                        item.metric === metric ? { ...item, weight } : item
                      )
                    )
                  }
                  onMetricToggle={(metric) =>
                    setComparisonWeights((current) =>
                      toggleWeightedMetric(
                        current.length > 0 ? current : effectiveComparisonWeights,
                        metric
                      )
                    )
                  }
                />
              )}
              {canAnalyze && tab === 'pop' && (
                <PoPPanel
                  dateDims={dateDims.length > 0 ? dateDims : dims}
                  mets={mets}
                  dateDimension={effectivePeriodDateDimension}
                  metric={effectivePeriodMetric}
                  depth={periodDepth}
                  onDateDimensionChange={setPeriodDateDimension}
                  onMetricChange={setPeriodMetric}
                  onDepthChange={setPeriodDepth}
                />
              )}
              <hr className={s.divider} />
              <ViewManager
                canSave={canAnalyze}
                defaultName={defaultViewName}
                viewName={viewName}
                views={datasetSavedViews}
                selectedView={selectedView}
                tabLabels={TAB_LABELS}
                onNameChange={setViewName}
                onSave={handleSaveView}
                onView={setSelectedViewId}
                onRestore={handleRestoreView}
                onDelete={handleDeleteView}
              />
            </div>
          </aside>
          <main className={s.canvas}>
            {!canAnalyze && <EmptyCanvas />}
            {canAnalyze && tab === 'trend' && trend && (
              <TrendCanvas analysis={trend} onExport={handleExport} />
            )}
            {canAnalyze && tab === 'variance' && variance && (
              <VarianceCanvas analysis={variance} onExport={handleExport} />
            )}
            {canAnalyze && tab === 'comparison' && comparison && (
              <CompareCanvas analysis={comparison} />
            )}
            {canAnalyze && tab === 'pop' && period && <PoPCanvas analysis={period} />}
          </main>
        </div>
      </div>
    </div>
  );
};

const GroupTitle: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className={s.groupTitle}>
    {icon}
    {label}
  </div>
);

const ViewManager: React.FC<{
  canSave: boolean;
  defaultName: string;
  viewName: string;
  views: AlgorithmAnalysisSavedView[];
  selectedView?: AlgorithmAnalysisSavedView;
  tabLabels: Record<Tab, string>;
  onNameChange: (value: string) => void;
  onSave: () => void;
  onView: (id: string) => void;
  onRestore: (view: AlgorithmAnalysisSavedView) => void;
  onDelete: (id: string) => void;
}> = ({
  canSave,
  defaultName,
  viewName,
  views,
  selectedView,
  tabLabels,
  onNameChange,
  onSave,
  onView,
  onRestore,
  onDelete,
}) => (
  <div className={s.viewManager}>
    <GroupTitle icon={<Save />} label="视图保存" />
    <div className={s.saveViewBox}>
      <input
        className={s.viewNameInput}
        value={viewName}
        placeholder={defaultName}
        onChange={(event) => onNameChange(event.currentTarget.value)}
      />
      <button
        type="button"
        className={`${s.btn} ${s.btnPrimary}`}
        onClick={onSave}
        disabled={!canSave}
      >
        <Save />
        保存
      </button>
    </div>
    <GroupTitle icon={<History />} label={`最近视图 (${views.length})`} />
    {views.length === 0 ? (
      <div className={s.emptyViews}>当前数据集还没有保存视图</div>
    ) : (
      <div className={s.viewList}>
        {views.map((view) => {
          const active = selectedView?.id === view.id;
          return (
            <div key={view.id} className={`${s.viewItem} ${active ? s.viewItemActive : ''}`}>
              <button type="button" className={s.viewMain} onClick={() => onView(view.id)}>
                <span className={s.viewName}>{view.name}</span>
                <span className={s.viewMeta}>
                  {tabLabels[view.tab]} · {formatSavedTime(view.createdAt)}
                </span>
              </button>
              <div className={s.viewActions}>
                <button
                  type="button"
                  className={s.iconBtn}
                  onClick={() => onRestore(view)}
                  title="恢复视图"
                  aria-label={`恢复视图 ${view.name}`}
                >
                  <RotateCcw />
                </button>
                <button
                  type="button"
                  className={s.iconBtn}
                  onClick={() => onView(view.id)}
                  title="查看详情"
                  aria-label={`查看视图 ${view.name}`}
                >
                  <Eye />
                </button>
                <button
                  type="button"
                  className={`${s.iconBtn} ${s.iconDanger}`}
                  onClick={() => onDelete(view.id)}
                  title="删除视图"
                  aria-label={`删除视图 ${view.name}`}
                >
                  <Trash2 />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
    {selectedView && (
      <div className={s.viewDetail}>
        <span>{selectedView.name}</span>
        <p>
          {tabLabels[selectedView.tab]} · {formatSavedTime(selectedView.createdAt)}
        </p>
      </div>
    )}
  </div>
);

const SmartAssistant: React.FC<{
  insight: SmartInsight;
  onNavigate: (tab: Tab) => void;
}> = ({ insight, onNavigate }) => {
  const priorityClass =
    insight.priority === 'high'
      ? s.smartHigh
      : insight.priority === 'watch'
        ? s.smartWatch
        : s.smartStable;

  return (
    <section className={`${s.smartCard} ${priorityClass}`} aria-label="智能诊断建议">
      <div className={s.smartHead}>
        <span className={s.smartIcon}>
          <Sparkles />
        </span>
        <div className={s.smartTitleBlock}>
          <span className={s.smartKicker}>{insight.modeLabel}</span>
          <h3>{insight.status}</h3>
        </div>
        <span className={s.smartPriority}>{insight.priorityLabel}</span>
      </div>
      <p className={s.smartReason}>{insight.reason}</p>
      <div className={s.smartMetricGrid}>
        <div className={s.smartMetric}>
          <span className={s.smartMetricLabel}>置信度</span>
          <strong>{insight.confidence}%</strong>
          <span>{insight.confidenceLabel}</span>
        </div>
        <div className={s.smartMetric}>
          <span className={s.smartMetricLabel}>关注点</span>
          <strong title={insight.focus}>{insight.focus}</strong>
          <span>优先下钻</span>
        </div>
      </div>
      <div className={s.smartMeter} aria-hidden="true">
        <span style={{ width: `${insight.confidence}%` }} />
      </div>
      <div className={s.smartAction}>
        <div>
          <span className={s.smartActionLabel}>建议动作</span>
          <p>{insight.nextAction}</p>
        </div>
        <button type="button" className={s.smartNext} onClick={() => onNavigate(insight.nextTab)}>
          {insight.nextTabLabel}
        </button>
      </div>
      <div className={s.smartChips}>
        {insight.chips.map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
    </section>
  );
};

const Select: React.FC<{
  label: string;
  opts: string[];
  value: string;
  hint?: string;
  onChange: (value: string) => void;
}> = ({ label, opts, value, hint, onChange }) => (
  <div className={s.group}>
    <span className={s.label}>{label}</span>
    <select
      className={s.select}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {opts.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    {hint && <span className={s.hint}>{hint}</span>}
  </div>
);

const MetricCheckList: React.FC<{
  label: string;
  items: string[];
  selected: string[];
  max?: number;
  onToggle: (metric: string) => void;
}> = ({ label, items, selected, max, onToggle }) => (
  <div className={s.group}>
    <span className={s.label}>{label}</span>
    <div className={s.checkList}>
      {items.map((metric, index) => {
        const checked = selected.includes(metric);
        const disabled = !checked && Boolean(max && selected.length >= max);
        return (
          <label key={metric} className={`${s.checkItem} ${disabled ? s.disabledItem : ''}`}>
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => onToggle(metric)}
            />
            <span className={s.checkName}>{metric}</span>
            <span className={s.colorDot} style={{ background: COLORS[index % COLORS.length] }} />
          </label>
        );
      })}
    </div>
  </div>
);

const AnalysisMultiSelect: React.FC<{
  label: string;
  options: string[];
  selected: string[];
  max?: number;
  onToggle: (value: string) => void;
}> = ({ label, options, selected, max, onToggle }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.toLowerCase().includes(normalized));
  }, [options, query]);
  const active = selected.length > 0;
  const displayText =
    selected.length === 0
      ? `全部${label}`
      : selected.length <= 2
        ? `${label}: ${selected.join(', ')}`
        : `${label}: 已选 ${selected.length}`;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div className={s.analysisFilterWrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`${s.analysisFilterChip} ${active ? s.analysisFilterActive : ''} ${
          open ? s.analysisFilterOpen : ''
        }`}
        onClick={() => {
          setQuery('');
          setOpen((value) => !value);
        }}
      >
        <span>{displayText}</span>
        <span className={s.analysisFilterArrow}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={s.analysisDropdown}>
          <div className={s.analysisDropdownSearch}>
            <input
              type="text"
              value={query}
              placeholder={`搜索${label}...`}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <div className={s.analysisDropdownOptions}>
            {filteredOptions.map((option) => {
              const checked = selectedSet.has(option);
              const disabled = !checked && Boolean(max && selected.length >= max);
              return (
                <label
                  key={option}
                  className={`${s.analysisDropdownOption} ${disabled ? s.disabledItem : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggle(option)}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
            {filteredOptions.length === 0 && <div className={s.inlineEmpty}>无匹配项</div>}
          </div>
          <div className={s.analysisDropdownFooter}>
            已选 {selected.length}
            {max ? ` / ${max}` : ''}
          </div>
        </div>
      )}
    </div>
  );
};

const Slider: React.FC<{
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  left?: string;
  right?: string;
  onChange: (value: number) => void;
}> = ({ label, min, max, step, value, left, right, onChange }) => (
  <div className={s.sliderGroup}>
    <div className={s.sliderHeader}>
      <span className={s.label}>{label}</span>
      <span className={s.sliderValue}>{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      className={s.slider}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
    />
    {(left || right) && (
      <div className={s.sliderLabels}>
        <span>{left}</span>
        <span>{right}</span>
      </div>
    )}
  </div>
);

const TrendPanel: React.FC<{
  mets: string[];
  selectedMetrics: string[];
  dateDimension: string;
  dateOptions: string[];
  selectedDates: string[];
  metricLimit: number;
  appOptions: string[];
  selectedApps: string[];
  includeOverall: boolean;
  dimensionOptions: string[];
  filterDimension: string;
  filterValueOptions: string[];
  filterValues: string[];
  onDateChange: (dates: string[]) => void;
  onMetricToggle: (metric: string) => void;
  onAppToggle: (app: string) => void;
  onOverallToggle: (checked: boolean) => void;
  onFilterDimensionChange: (dimension: string) => void;
  onFilterValueToggle: (value: string) => void;
}> = ({
  mets,
  selectedMetrics,
  dateDimension,
  dateOptions,
  selectedDates,
  metricLimit,
  appOptions,
  selectedApps,
  includeOverall,
  dimensionOptions,
  filterDimension,
  filterValueOptions,
  filterValues,
  onDateChange,
  onMetricToggle,
  onAppToggle,
  onOverallToggle,
  onFilterDimensionChange,
  onFilterValueToggle,
}) => (
  <>
    <GroupTitle icon={<Settings2 />} label="日期口径" />
    <div className={s.fixedDimension}>
      <span className={s.fixedDimensionLabel}>横轴</span>
      <strong>{dateDimension || '日期'}</strong>
      <span>从最早日期到最近日期</span>
    </div>
    <div className={s.filterChipRow}>
      <DateRangeFilterChip
        icon={<Calendar size={14} />}
        label="日期"
        allValues={dateOptions}
        selectedValues={selectedDates}
        onSelectionChange={onDateChange}
      />
    </div>
    <GroupTitle icon={<Settings2 />} label="范围筛选" />
    <label className={s.inlineCheck}>
      <input
        type="checkbox"
        checked={includeOverall}
        disabled={includeOverall && selectedApps.length === 0}
        onChange={(event) => onOverallToggle(event.currentTarget.checked)}
      />
      <span className={s.checkName}>总体走势</span>
    </label>
    {appOptions.length > 0 && (
      <AnalysisMultiSelect
        label="应用"
        options={appOptions}
        selected={selectedApps}
        max={12}
        onToggle={onAppToggle}
      />
    )}
    {dimensionOptions.length > 0 && (
      <Select
        label="分析维度"
        opts={['不按维度筛选', ...dimensionOptions]}
        value={filterDimension || '不按维度筛选'}
        onChange={(value) =>
          onFilterDimensionChange(value === '不按维度筛选' ? ALL_DIMENSION_VALUE : value)
        }
        hint="先选择维度，再选择具体维度值"
      />
    )}
    {filterDimension && (
      <AnalysisMultiSelect
        label={filterDimension}
        options={filterValueOptions}
        selected={filterValues}
        max={20}
        onToggle={onFilterValueToggle}
      />
    )}
    <GroupTitle icon={<Zap />} label="指标选择" />
    <AnalysisMultiSelect
      label={metricLimit === 1 ? '分析指标（多应用时最多1项）' : '分析指标（最多3项）'}
      options={mets}
      selected={selectedMetrics}
      max={metricLimit}
      onToggle={onMetricToggle}
    />
    <div className={s.ruleBox}>平滑由日期长度自动计算；不生成预测线，仅展示真实历史走势。</div>
  </>
);

const VariancePanel: React.FC<{
  dims: string[];
  mets: string[];
  rowDimension: string;
  columnDimension: string;
  metric: string;
  onRowDimensionChange: (dimension: string) => void;
  onColumnDimensionChange: (dimension: string) => void;
  onMetricChange: (metric: string) => void;
}> = ({
  dims,
  mets,
  rowDimension,
  columnDimension,
  metric,
  onRowDimensionChange,
  onColumnDimensionChange,
  onMetricChange,
}) => (
  <>
    <GroupTitle icon={<Settings2 />} label="矩阵配置" />
    <Select label="行维度" opts={dims} value={rowDimension} onChange={onRowDimensionChange} />
    <Select label="列维度" opts={dims} value={columnDimension} onChange={onColumnDimensionChange} />
    <Select label="分析指标" opts={mets} value={metric} onChange={onMetricChange} />
    <GroupTitle icon={<Zap />} label="计算口径" />
    <div className={s.ruleBox}>展示 Top 5 行维度 x Top 5 列维度，并计算列方向变异系数 CV。</div>
  </>
);

const ComparePanel: React.FC<{
  dims: string[];
  mets: string[];
  dimension: string;
  weights: ScoreMetric[];
  onDimensionChange: (dimension: string) => void;
  onMetricToggle: (metric: string) => void;
  onWeightChange: (metric: string, weight: number) => void;
}> = ({ dims, mets, dimension, weights, onDimensionChange, onMetricToggle, onWeightChange }) => (
  <>
    <GroupTitle icon={<Settings2 />} label="对比配置" />
    <Select label="分组维度" opts={dims} value={dimension} onChange={onDimensionChange} />
    <MetricCheckList
      label="评估指标（最多6项）"
      items={mets}
      selected={weights.map((item) => item.metric)}
      max={6}
      onToggle={onMetricToggle}
    />
    <GroupTitle icon={<Zap />} label="权重配置" />
    <div className={s.weightsBox}>
      {weights.map((item) => (
        <div key={item.metric} className={s.weightRow}>
          <div className={s.weightLabel}>
            <span>{item.metric}</span>
            <span className={s.weightPct}>{item.weight}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={item.weight}
            className={s.slider}
            onChange={(event) => onWeightChange(item.metric, Number(event.currentTarget.value))}
          />
        </div>
      ))}
    </div>
  </>
);

const PoPPanel: React.FC<{
  dateDims: string[];
  mets: string[];
  dateDimension: string;
  metric: string;
  depth: number;
  onDateDimensionChange: (dimension: string) => void;
  onMetricChange: (metric: string) => void;
  onDepthChange: (depth: number) => void;
}> = ({
  dateDims,
  mets,
  dateDimension,
  metric,
  depth,
  onDateDimensionChange,
  onMetricChange,
  onDepthChange,
}) => (
  <>
    <GroupTitle icon={<Settings2 />} label="环比配置" />
    <Select
      label="时间维度"
      opts={dateDims}
      value={dateDimension}
      onChange={onDateDimensionChange}
    />
    <Select label="分析指标" opts={mets} value={metric} onChange={onMetricChange} />
    <Slider
      label="追溯深度"
      min={3}
      max={16}
      step={1}
      value={depth}
      left="3期"
      right="16期"
      onChange={onDepthChange}
    />
    <GroupTitle icon={<Zap />} label="判定规则" />
    <div className={s.ruleBox}>
      当前周期与上一周期、历史中位数同时对比，超过 15% 标记为重点复盘。
    </div>
  </>
);

const ExportButton: React.FC<{ onExport: () => void }> = ({ onExport }) => (
  <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onExport}>
    <Download />
    导出
  </button>
);

const TrendCanvas: React.FC<{ analysis: TrendAnalysis; onExport: () => void }> = ({
  analysis,
  onExport,
}) => (
  <>
    <div className={s.canvasHeader}>
      <div>
        <h2 className={s.canvasTitle}>数据走势洞察</h2>
        <p className={s.canvasSub}>
          {analysis.scopeLabel} · 横轴固定为 {analysis.dateDimension} · 底部标记重要节点日期
        </p>
      </div>
      <div className={s.canvasActions}>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onExport}>
          <Download />
          导出
        </button>
      </div>
    </div>
    <div className={s.canvasContent}>
      <div className={s.chartCard}>
        <div className={`${s.chartTop} ${s.trendChartTop}`}>
          <div className={s.trendLegend}>
            {analysis.series.map((series, index) => {
              const color = COLORS[index % COLORS.length];
              const growthClass =
                series.growthRate >= 0 ? s.trendGrowthPositive : s.trendGrowthNegative;
              return (
                <div key={series.label} className={s.trendLegendItem}>
                  <span className={s.trendLegendLine} style={{ background: color }} />
                  <div className={s.trendLegendText}>
                    <span className={s.trendLegendName}>{series.label}</span>
                    <span className={s.trendLegendMeta}>
                      最新 {formatNumber(series.latest)}
                      <span className={`${s.trendLegendGrowth} ${growthClass}`}>
                        {formatPercent(series.growthRate)}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <span className={s.mutedText}>自动平滑 α={analysis.smoothingFactor.toFixed(2)}</span>
        </div>
        <div className={s.chartArea} style={{ height: 300, padding: '16px 40px 36px' }}>
          <AxisLabels max={analysis.yMax} />
          {[0, 25, 50, 75].map((top) => (
            <div key={top} className={s.gridLine} style={{ top: `${top}%` }} />
          ))}
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className={s.chartSvg}
            preserveAspectRatio="none"
          >
            <title>数据走势折线图</title>
            {analysis.series.map((series, index) => {
              const color = COLORS[index % COLORS.length];
              return (
                <g key={series.label}>
                  <path
                    className={s.chartLine}
                    d={linePath(series.smoothed, analysis.yMax)}
                    stroke={color}
                    strokeWidth="2.5"
                  />
                </g>
              );
            })}
          </svg>
          <div className={s.xAxis}>
            {analysis.importantLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>
      <SummaryCards summary={analysis.summary} />
    </div>
  </>
);

const VarianceCanvas: React.FC<{ analysis: VarianceAnalysis; onExport: () => void }> = ({
  analysis,
  onExport,
}) => (
  <>
    <div className={s.canvasHeader}>
      <div>
        <h2 className={s.canvasTitle}>差异分布矩阵</h2>
        <p className={s.canvasSub}>
          {analysis.rowDimension} x {analysis.columnDimension}，指标 {analysis.metric}
        </p>
      </div>
      <div className={s.heatLegend}>
        <span>低值</span>
        <div className={s.heatLegendBar} />
        <ExportButton onExport={onExport} />
        <span>高值</span>
      </div>
    </div>
    <div className={s.canvasContent}>
      <div className={s.chartCard}>
        <div className={s.chartArea} style={{ minHeight: 360, padding: 20 }}>
          {analysis.rows.length === 0 || analysis.columns.length === 0 ? (
            <InlineEmpty text="当前维度组合没有可展示的数据。" />
          ) : (
            <div
              className={s.heatmap}
              style={{
                gridTemplateColumns: `120px repeat(${analysis.columns.length}, minmax(86px, 1fr))`,
              }}
            >
              <div className={s.heatmapHead} style={{ display: 'contents' }}>
                <div className={s.heatmapCorner}>
                  {analysis.rowDimension} / {analysis.columnDimension}
                </div>
                {analysis.columns.map((column) => (
                  <div key={column} className={s.heatmapHeadCell}>
                    {column}
                    <span
                      className={`${s.cv} ${
                        (analysis.columnCv[column] ?? 0) > 0.5 ? s.cvHigh : ''
                      }`}
                    >
                      CV: {(analysis.columnCv[column] ?? 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              {analysis.rows.map((row) => (
                <div key={row} className={s.heatmapRow} style={{ display: 'contents' }}>
                  <div className={s.heatmapLabel}>{row}</div>
                  {analysis.columns.map((column) => {
                    const cell = analysis.cells.find(
                      (item) => item.row === row && item.column === column
                    );
                    return (
                      <div
                        key={`${row}-${column}`}
                        className={`${s.heatmapCell} ${heatClass(cell?.intensity ?? 0)}`}
                        title={`${row} / ${column}: ${formatNumber(cell?.value ?? 0)}`}
                      >
                        {formatNumber(cell?.value ?? 0)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <SummaryCards summary={analysis.summary} />
    </div>
  </>
);

const CompareCanvas: React.FC<{ analysis: ComparisonAnalysis }> = ({ analysis }) => {
  const topItems = analysis.items.slice(0, 5);
  const radarItems = analysis.items.slice(0, 3);

  return (
    <>
      <div className={s.canvasHeader}>
        <div>
          <h2 className={s.canvasTitle}>多维能力评估</h2>
          <p className={s.canvasSub}>
            按 {analysis.groupDimension} 分组，基于{' '}
            {analysis.metrics.map((item) => item.metric).join('、')} 评分
          </p>
        </div>
      </div>
      <div className={s.canvasContent}>
        <div className={s.compareGrid}>
          <div className={s.chartCard}>
            <div className={s.chartTop}>
              <span className={s.chartTitle}>综合排名</span>
            </div>
            <div className={s.rankingList}>
              {topItems.map((item, index) => (
                <div key={item.group} className={s.rankingRow}>
                  <span className={s.rankNum}>{index + 1}</span>
                  <span className={s.rankName}>{item.group}</span>
                  <div className={s.scoreTrack}>
                    <div className={s.scoreFill} style={{ width: `${Math.round(item.score)}%` }} />
                  </div>
                  <span className={s.scoreValue}>{Math.round(item.score)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={s.chartCard}>
            <div className={s.chartTop}>
              <span className={s.chartTitle}>Top 3 指标雷达</span>
            </div>
            <div className={s.radarWrap}>
              <svg viewBox="0 0 220 220" width="100%" height="100%">
                <title>综合评分雷达图</title>
                <RadarGrid axes={analysis.metrics.map((item) => item.metric)} />
                {radarItems.map((item, index) => (
                  <polygon
                    key={item.group}
                    points={radarPoints(
                      analysis.metrics.map((metric) => item.metricScores[metric.metric] ?? 0)
                    )}
                    fill={hexToRgba(COLORS[index], 0.16)}
                    stroke={COLORS[index]}
                    strokeWidth="2"
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>
        <div className={s.stats}>
          <StatCard label="综合第一" value={analysis.leaders.overall?.group ?? '-'} />
          <StatCard label="效率之王" value={analysis.leaders.efficiency?.group ?? '-'} />
        </div>
        <SummaryCards summary={analysis.summary} />
      </div>
    </>
  );
};

const PoPCanvas: React.FC<{ analysis: PeriodAnalysis }> = ({ analysis }) => {
  const max = Math.max(1, ...analysis.points.map((point) => point.value), analysis.median);
  const medianTop = 100 - (analysis.median / max) * 100;

  return (
    <>
      <div className={s.canvasHeader}>
        <div>
          <h2 className={s.canvasTitle}>阶梯环比分析</h2>
          <p className={s.canvasSub}>
            {analysis.dateDimension} · {analysis.metric}，当前周期与历史中位数对比
          </p>
        </div>
      </div>
      <div className={s.canvasContent}>
        <div className={s.chartCard} style={{ flex: 1 }}>
          <div className={s.chartTop}>
            <div className={s.legend}>
              <span className={s.legendItem}>
                <span className={s.legendLine} style={{ background: 'var(--aa-surface-2)' }} />
                历史周期
              </span>
              <span className={s.legendItem}>
                <span className={s.legendLine} style={{ background: 'var(--aa-primary)' }} />
                当前周期
              </span>
              <span className={s.legendItem}>
                <span className={s.legendDash} style={{ borderColor: 'var(--aa-secondary)' }} />
                中位数
              </span>
            </div>
          </div>
          <div className={s.chartArea} style={{ height: 320 }}>
            <AxisLabels max={max} />
            {[0, 25, 50, 75].map((top) => (
              <div key={top} className={s.gridLine} style={{ top: `${top}%` }} />
            ))}
            <div className={s.median} style={{ top: `${medianTop}%` }}>
              <span className={s.medianTag}>中位数: {formatNumber(analysis.median)}</span>
            </div>
            <div className={s.bars}>
              {analysis.points.map((point) => (
                <div
                  key={point.label}
                  className={`${s.bar} ${point.current ? s.barCurrent : ''}`}
                  style={{ height: `${Math.max(4, (point.value / max) * 100)}%` }}
                >
                  <div className={s.barTip}>
                    {formatNumber(point.value)} ({formatPercent(point.changeRate)})
                  </div>
                </div>
              ))}
            </div>
            <div className={s.xAxis} style={{ bottom: -20, left: 40, right: 24 }}>
              {analysis.points.map((point) => (
                <span key={point.label} className={point.current ? s.xAxisCurrent : ''}>
                  {point.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <SummaryCards summary={analysis.summary} />
      </div>
    </>
  );
};

const SummaryCards: React.FC<{
  summary: { headline: string; attribution: string; recommendation: string };
}> = ({ summary }) => (
  <div className={s.insights}>
    <div className={`${s.insight} ${s.insightPrimary}`}>
      <div className={s.insightHead}>
        <span className={s.insightIcon}>
          <Lightbulb />
        </span>
        <div>
          <span className={s.insightKicker}>核心发现</span>
          <h3>趋势信号</h3>
        </div>
      </div>
      <div className={s.insightBody}>{summary.headline}</div>
    </div>
    <div className={`${s.insight} ${s.insightSecondary}`}>
      <div className={s.insightHead}>
        <span className={s.insightIcon}>
          <PieChart />
        </span>
        <div>
          <span className={s.insightKicker}>归因拆解</span>
          <h3>贡献与波动</h3>
        </div>
      </div>
      <div className={s.insightBody}>{summary.attribution}</div>
    </div>
    <div className={`${s.insight} ${s.insightTertiary}`}>
      <div className={s.insightHead}>
        <span className={s.insightIcon}>
          <Zap />
        </span>
        <div>
          <span className={s.insightKicker}>诊断建议</span>
          <h3>下一步动作</h3>
        </div>
      </div>
      <div className={s.insightBody}>{summary.recommendation}</div>
    </div>
  </div>
);

const AxisLabels: React.FC<{ max: number }> = ({ max }) => (
  <div className={s.yAxis}>
    {[1, 0.8, 0.6, 0.4, 0.2, 0].map((ratio) => (
      <span key={ratio}>{formatNumber(max * ratio)}</span>
    ))}
  </div>
);

const RadarGrid: React.FC<{ axes: string[] }> = ({ axes }) => {
  const axisCount = Math.max(3, axes.length);
  const rings = [1, 0.66, 0.33];

  return (
    <>
      {rings.map((ratio) => (
        <polygon
          key={ratio}
          points={radarPoints(Array.from({ length: axisCount }, () => ratio))}
          fill="none"
          stroke="#e0e3e5"
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: axisCount }, (_, index) => {
        const point = radarPoint(index, axisCount, 1);
        const labelPoint = radarPoint(index, axisCount, 1.12);
        return (
          <g key={axes[index] ?? index}>
            <line x1="110" y1="110" x2={point.x} y2={point.y} stroke="#e0e3e5" />
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#444654"
              fontSize="8"
              fontWeight="600"
            >
              {axes[index] ?? ''}
            </text>
          </g>
        );
      })}
    </>
  );
};

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={s.stat}>
    <div
      className={s.statIcon}
      style={{ background: 'var(--aa-primary-bg)', color: 'var(--aa-primary)' }}
    >
      <BarChart3 size={16} />
    </div>
    <div>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
    </div>
  </div>
);

const EmptyPanel: React.FC = () => (
  <div className={s.emptyPanel}>
    <GroupTitle icon={<Settings2 />} label="等待数据" />
    <p>请先加载包含维度和指标的数据集，分析中心会自动生成可配置算法视图。</p>
  </div>
);

const EmptyCanvas: React.FC = () => (
  <div className={s.emptyCanvas}>
    <Sparkles size={28} />
    <h2>暂无可分析数据</h2>
    <p>当前数据集需要至少一个维度字段和一个指标字段。</p>
  </div>
);

const InlineEmpty: React.FC<{ text: string }> = ({ text }) => (
  <div className={s.inlineEmpty}>{text}</div>
);

function formatSavedTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '-';
  return new Intl.DateTimeFormat('zh-Hans-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function buildSmartInsight(
  tab: Tab,
  analysis: ActiveAnalysis,
  context: { rowCount: number; dimensionCount: number; metricCount: number }
): SmartInsight {
  if (tab === 'trend') {
    const trend = analysis as TrendAnalysis;
    const rankedByGrowth = trend.series.slice().sort((a, b) => b.growthRate - a.growthRate);
    const strongest = rankedByGrowth[0];
    const weakest = rankedByGrowth[rankedByGrowth.length - 1];
    const volatility = Math.max(
      0,
      ...trend.series.map((series) => coefficient(series.points.map((point) => point.value)))
    );
    const maxGrowth = Math.max(0, ...trend.series.map((series) => Math.abs(series.growthRate)));
    const priority =
      trend.labels.length < 4
        ? 'watch'
        : maxGrowth >= 0.25 || volatility >= 0.35
          ? 'high'
          : maxGrowth >= 0.1
            ? 'watch'
            : 'stable';
    const confidence = clampPercent(
      Math.round(
        48 +
          Math.min(trend.labels.length, 30) * 1.2 +
          Math.min(trend.series.length, 6) * 4 +
          Math.min(context.rowCount / 5000, 12) -
          (trend.labels.length < 4 ? 18 : 0)
      )
    );

    return {
      modeLabel: '趋势识别引擎',
      status: priority === 'high' ? '发现显著走势分化' : '走势处于可解释区间',
      priority,
      priorityLabel: getPriorityLabel(priority),
      confidence,
      confidenceLabel: getConfidenceLabel(confidence),
      focus: strongest?.label ?? trend.scopeLabel,
      reason: strongest
        ? `${strongest.label} 较首期 ${formatPercent(strongest.growthRate)}，最新 ${formatNumber(
            strongest.latest
          )}${weakest && weakest !== strongest ? `；弱项为 ${weakest.label}` : ''}。`
        : trend.summary.headline,
      nextAction:
        priority === 'high'
          ? '切到差异分析，按应用、国家或渠道定位变化来源。'
          : '进入综合对比，确认当前稳定趋势下的头部结构。',
      nextTab: priority === 'high' ? 'variance' : 'comparison',
      nextTabLabel: priority === 'high' ? '定位差异' : '综合评分',
      chips: [
        `${trend.labels.length} 个周期`,
        `${trend.series.length} 条曲线`,
        `平滑 α=${trend.smoothingFactor.toFixed(2)}`,
      ],
    };
  }

  if (tab === 'variance') {
    const variance = analysis as VarianceAnalysis;
    const topCv = Object.entries(variance.columnCv).sort((a, b) => b[1] - a[1])[0];
    const topCell = variance.cells.slice().sort((a, b) => b.value - a.value)[0];
    const matrixCount = variance.rows.length * variance.columns.length;
    const maxCv = topCv?.[1] ?? 0;
    const priority = maxCv >= 0.5 ? 'high' : maxCv >= 0.25 ? 'watch' : 'stable';
    const confidence = clampPercent(
      Math.round(50 + Math.min(matrixCount, 25) * 1.6 + Math.min(context.rowCount / 8000, 10))
    );

    return {
      modeLabel: '差异定位引擎',
      status: priority === 'high' ? '发现高离散维度' : '维度差异相对收敛',
      priority,
      priorityLabel: getPriorityLabel(priority),
      confidence,
      confidenceLabel: getConfidenceLabel(confidence),
      focus: topCv?.[0] ?? variance.metric,
      reason: topCv
        ? `${topCv[0]} 离散度 CV=${topCv[1].toFixed(2)}；最高组合 ${
            topCell ? `${topCell.row} / ${topCell.column}` : '暂未定位'
          }。`
        : variance.summary.headline,
      nextAction:
        priority === 'high'
          ? '进入综合对比，判断高差异组合是否也具备综合优势。'
          : '回到趋势分析，验证当前差异是否持续出现。',
      nextTab: priority === 'high' ? 'comparison' : 'trend',
      nextTabLabel: priority === 'high' ? '评估优劣' : '回看走势',
      chips: [
        `${variance.rows.length} 行维度`,
        `${variance.columns.length} 列维度`,
        `Top ${Math.max(variance.rows.length, variance.columns.length)}`,
      ],
    };
  }

  if (tab === 'comparison') {
    const comparison = analysis as ComparisonAnalysis;
    const leader = comparison.items[0];
    const tail = comparison.items[comparison.items.length - 1];
    const spread = leader && tail ? leader.score - tail.score : 0;
    const weakestMetric = leader
      ? Object.entries(leader.metricScores).sort((a, b) => a[1] - b[1])[0]?.[0]
      : undefined;
    const priority = spread >= 25 ? 'high' : spread >= 10 ? 'watch' : 'stable';
    const confidence = clampPercent(
      Math.round(
        54 +
          Math.min(comparison.items.length, 8) * 3 +
          Math.min(comparison.metrics.length, 6) * 4 +
          Math.min(context.rowCount / 10000, 10)
      )
    );

    return {
      modeLabel: '多指标评分引擎',
      status: priority === 'high' ? '头尾分层明显' : '综合评分分布均衡',
      priority,
      priorityLabel: getPriorityLabel(priority),
      confidence,
      confidenceLabel: getConfidenceLabel(confidence),
      focus: leader?.group ?? comparison.groupDimension,
      reason: leader
        ? `${leader.group} 综合得分 ${Math.round(leader.score)}；头尾差 ${Math.round(
            spread
          )} 分${weakestMetric ? `，短板指标为 ${weakestMetric}` : ''}。`
        : comparison.summary.headline,
      nextAction:
        priority === 'high'
          ? '切到环比分析，确认领先或落后组是否来自近期突变。'
          : '回到趋势分析，观察综合优势是否长期稳定。',
      nextTab: priority === 'high' ? 'pop' : 'trend',
      nextTabLabel: priority === 'high' ? '看近期突变' : '验证趋势',
      chips: [
        `${comparison.items.length} 个分组`,
        `${comparison.metrics.length} 个指标`,
        `${comparison.groupDimension}`,
      ],
    };
  }

  const period = analysis as PeriodAnalysis;
  const latestChange = Math.abs(period.latest?.changeRate ?? 0);
  const medianGap =
    period.latest && period.median
      ? Math.abs((period.latest.value - period.median) / period.median)
      : 0;
  const priority =
    Math.max(latestChange, medianGap) >= 0.15 ? 'high' : latestChange >= 0.08 ? 'watch' : 'stable';
  const confidence = clampPercent(
    Math.round(52 + Math.min(period.points.length, 16) * 3 + Math.min(context.rowCount / 10000, 10))
  );

  return {
    modeLabel: '环比预警引擎',
    status: priority === 'high' ? '当前周期需要复盘' : '当前周期波动可控',
    priority,
    priorityLabel: getPriorityLabel(priority),
    confidence,
    confidenceLabel: getConfidenceLabel(confidence),
    focus: period.latest?.label ?? period.metric,
    reason: period.latest
      ? `${period.latest.label} 较上一周期 ${formatPercent(period.latest.changeRate)}，相对中位数 ${formatPercent(
          period.median ? (period.latest.value - period.median) / period.median : 0
        )}。`
      : period.summary.headline,
    nextAction:
      priority === 'high'
        ? '切到差异分析，检查当前周期异常来自哪个维度组合。'
        : '回到趋势分析，继续观察后续周期是否形成连续信号。',
    nextTab: priority === 'high' ? 'variance' : 'trend',
    nextTabLabel: priority === 'high' ? '拆解异常' : '跟踪走势',
    chips: [
      `${period.points.length} 个周期`,
      period.metric,
      `中位数 ${formatNumber(period.median)}`,
    ],
  };
}

function clampPercent(value: number): number {
  return Math.max(35, Math.min(96, value));
}

function coefficient(values: number[]): number {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (filtered.length === 0) return 0;
  const avg = filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
  if (avg === 0) return 0;
  const variance = filtered.reduce((sum, value) => sum + (value - avg) ** 2, 0) / filtered.length;
  return Math.sqrt(variance) / Math.abs(avg);
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 82) return '高可信';
  if (confidence >= 66) return '中可信';
  return '需补样本';
}

function getPriorityLabel(priority: SmartInsight['priority']): string {
  if (priority === 'high') return '优先复盘';
  if (priority === 'watch') return '持续观察';
  return '稳定运行';
}

function toggleSelection(current: string[], value: string, max: number): string[] {
  if (current.includes(value)) return current.filter((item) => item !== value);
  if (current.length >= max) return current;
  return [...current, value];
}

function toggleWeightedMetric(current: ScoreMetric[], metric: string): ScoreMetric[] {
  if (current.some((item) => item.metric === metric)) {
    return current.filter((item) => item.metric !== metric);
  }
  if (current.length >= 6) return current;
  return [...current, { metric, weight: 10 }];
}

function pickDimension(dimensions: string[], candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const exact = dimensions.find((dimension) => dimension === candidate);
    if (exact) return exact;
  }
  return dimensions.find((dimension) => {
    const normalized = dimension.toLowerCase();
    return candidates.some((candidate) => normalized.includes(candidate.toLowerCase()));
  });
}

function getUniqueOptions(data: DataRow[], fieldName: string): string[] {
  const values = new Set<string>();
  for (const row of data) {
    const value = String(row[fieldName] ?? '').trim();
    if (value && value !== 'undefined' && value !== 'null') values.add(value);
  }
  return Array.from(values).sort((a, b) =>
    new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' }).compare(a, b)
  );
}

function linePath(points: { value: number }[], yMax: number): string {
  if (points.length === 0) return '';
  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * CHART_WIDTH;
      const y = CHART_HEIGHT - (point.value / yMax) * CHART_HEIGHT;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function heatClass(intensity: number): string {
  if (intensity >= 0.8) return s.cellHigh;
  if (intensity >= 0.6) return s.cellMedHigh;
  if (intensity >= 0.4) return s.cellMed;
  if (intensity >= 0.15) return s.cellLow;
  return s.cellVeryLow;
}

function radarPoints(values: number[]): string {
  const count = Math.max(3, values.length);
  return Array.from({ length: count }, (_, index) => {
    const point = radarPoint(index, count, values[index] ?? 0);
    return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }).join(' ');
}

function radarPoint(index: number, count: number, ratio: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const radius = 88 * Math.max(0, Math.min(1.15, ratio));
  return {
    x: 110 + radius * Math.cos(angle),
    y: 110 + radius * Math.sin(angle),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export default AlgorithmAnalysisModal;
