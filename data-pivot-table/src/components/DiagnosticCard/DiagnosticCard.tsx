import { BarChart3, ChevronLeft, Sparkles } from 'lucide-react';
import type React from 'react';
import { useAnomalyState } from '../../hooks/useAnomalyState';
import type { DataRow, Field, PivotField } from '../../types';
import { AppSelector } from './components/AppSelector';
import AppSummaryCard from './components/AppSummaryCard';
import ArpuWaterfallBar from './components/ArpuWaterfallBar';
import { BalanceBar } from './components/BalanceBar';
import { ComparisonModeSelector } from './components/ComparisonModeSelector';
import DrilldownTree from './components/DrilldownTree';
import { KpiBadge } from './components/KpiBadge';
import OneClickPivot from './components/OneClickPivot';
import { PanelHeader } from './components/PanelHeader';
import { SkeletonCard } from './components/SkeletonCard';
import TrendHeatGrid from './components/TrendHeatGrid';
import styles from './DiagnosticCard.module.css';

interface DiagnosticCardProps {
  data: DataRow[];
  fields: Field[];
  onClose?: () => void;
  onApplyFilters: (fieldName: string, selectedValues: string[]) => void;
  onApplyRowFields: (fields: PivotField[]) => void;
  onApplyValueFields: (fields: PivotField[]) => void;
  onApplyColFields: (fields: PivotField[]) => void;
}

export const DiagnosticCard: React.FC<DiagnosticCardProps> = ({
  data, fields, onClose, onApplyFilters, onApplyRowFields, onApplyValueFields, onApplyColFields,
}) => {
  const {
    diagnosticResult, isAnalyzing, errorMessage, locateDimension,
    handleAppSelect, applySuggestion, selectedApp, setSelectedApp, availableApps,
    comparisonMode, setComparisonMode, availableModes,
    dashboardOverview, sparklineDays, setSparklineDays,
  } = useAnomalyState({ data, fields, onApplyFilters, onApplyRowFields, onApplyValueFields, onApplyColFields });

  const hasData = data.length > 0;
  const showDetail = !!selectedApp;
  const handleBack = () => { setSelectedApp(null); };

  return (
    <div className={styles.diagnosticCard}>
      <PanelHeader onClose={onClose} />

      {showDetail && (
        <div className={styles.detailHeader}>
          <div className={styles.breadcrumb}>
            <button type="button" className={styles.backBtn} onClick={handleBack}>
              <ChevronLeft size={14} /><span>返回大盘</span>
            </button>
            <span className={styles.breadcrumbSep}>/</span>
            <span className={styles.breadcrumbApp}>{selectedApp}</span>
          </div>
          <div className={styles.controlBar}>
            <AppSelector apps={availableApps} selectedApp={selectedApp} onSelect={(app) => { setSelectedApp(app); handleAppSelect(app); }} onAnalyze={() => {}} isAnalyzing={false} />
            <ComparisonModeSelector modes={availableModes} selectedMode={comparisonMode} onSelect={setComparisonMode} />
          </div>
        </div>
      )}

      <div className={styles.content}>
        {!hasData && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}><BarChart3 size={36} className={styles.emptyIcon} /></div>
            <div className={styles.emptyTitle}>暂无数据</div>
            <div className={styles.emptyDesc}>请先上传数据以启用智能诊断</div>
          </div>
        )}

        {hasData && !showDetail && (
          <>
            {dashboardOverview && dashboardOverview.rows.length > 0 ? (
              <TrendHeatGrid
                rows={dashboardOverview.rows}
                onAppSelect={handleAppSelect}
                dateRange={dashboardOverview.dateRange}
                sparklineDays={sparklineDays}
                onSparklineDaysChange={setSparklineDays}
              />
            ) : (
              <div className={styles.idleState}>
                <div className={styles.idleIllustration}><div className={styles.idleCircle}><Sparkles size={28} className={styles.idleIcon} /></div></div>
                <div className={styles.idleContent}>
                  <div className={styles.idleTitle}>智能数据诊断</div>
                  <div className={styles.idleDesc}>自动识别 ARPU 变化根因，逐级拆解量价因子，定位维度异动</div>
                </div>
              </div>
            )}
          </>
        )}

        {hasData && showDetail && isAnalyzing && (
          <div className={styles.loadingState}>
            <div className={styles.loadingHeader}><div className={styles.loadingSpinner} /><span className={styles.loadingText}>正在分析 {selectedApp}...</span></div>
            <SkeletonCard /><SkeletonCard />
          </div>
        )}

        {hasData && showDetail && !isAnalyzing && errorMessage && (
          <div className={styles.diagnosticMessage}>{errorMessage}</div>
        )}

        {hasData && showDetail && !isAnalyzing && diagnosticResult && (
          <div className={styles.dashboard}>
            <section className={styles.summarySection}>
              <div className={styles.sectionTitle}>诊断摘要</div>
              <AppSummaryCard result={diagnosticResult} />
            </section>

            <div className={styles.twoColGrid}>
              <section className={styles.leftColumn}>
                <div className={styles.sectionTitle}>量价拆解归因</div>
                <ArpuWaterfallBar decomposition={diagnosticResult.level1} />
              </section>
              <section className={styles.rightColumn}>
                <div className={styles.sectionTitle}>异常维度下钻</div>
                <DrilldownTree
                  contributions={[diagnosticResult.level3.countryContrib, diagnosticResult.level3.versionContrib, diagnosticResult.level3.channelContrib, diagnosticResult.level3.scenarioContrib]}
                  onLocate={locateDimension}
                />
              </section>
            </div>

            <OneClickPivot result={diagnosticResult} onApply={applySuggestion} />
          </div>
        )}

        {hasData && showDetail && !isAnalyzing && !diagnosticResult && !errorMessage && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}><BarChart3 size={36} className={styles.emptyIcon} /></div>
            <div className={styles.emptyTitle}>数据不足</div>
            <div className={styles.emptyDesc}>当前对比模式需要更多数据，请尝试切换对比模式</div>
          </div>
        )}
      </div>
    </div>
  );
};
