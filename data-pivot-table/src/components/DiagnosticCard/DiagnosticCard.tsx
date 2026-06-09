import { BarChart3, ChevronRight, Sparkles } from 'lucide-react';
import type React from 'react';
import { useAnomalyState } from '../../hooks/useAnomalyState';
import type { DataRow, Field, PivotField } from '../../types';
import { AppSelector } from './components/AppSelector';
import { ComparisonModeSelector } from './components/ComparisonModeSelector';
import { DiagnosticDashboard } from './components/DiagnosticDashboard';
import { PanelHeader } from './components/PanelHeader';
import styles from './DiagnosticCard.module.css';

interface DiagnosticCardProps {
  data: DataRow[];
  fields: Field[];
  isStorageReady: boolean;
  onClose?: () => void;
  onApplyFilters: (fieldName: string, selectedValues: string[]) => void;
  onApplyRowFields: (fields: PivotField[]) => void;
  onApplyValueFields: (fields: PivotField[]) => void;
  onApplyColFields: (fields: PivotField[]) => void;
}

const SkeletonCard: React.FC = () => (
  <div className={styles.skeletonCard}>
    <div className={styles.skeletonHeader}>
      <div className={styles.skeletonTitle} />
      <div className={styles.skeletonPeriod} />
    </div>
    <div className={styles.skeletonBar} />
    <div className={styles.skeletonBar} />
    <div className={styles.skeletonBar} />
  </div>
);

export const DiagnosticCard: React.FC<DiagnosticCardProps> = ({
  data,
  fields,
  isStorageReady: _isStorageReady,
  onClose,
  onApplyFilters,
  onApplyRowFields,
  onApplyValueFields: _onApplyValueFields,
  onApplyColFields: _onApplyColFields,
}) => {
  const {
    diagnosticResult,
    isAnalyzing,
    errorMessage,
    runAnalysis,
    locateDimension,
    selectedApp,
    setSelectedApp,
    availableApps,
    comparisonMode,
    setComparisonMode,
    availableModes,
    hasAnalyzed,
  } = useAnomalyState({
    data,
    fields,
    onApplyFilters,
    onApplyRowFields,
    onApplyValueFields: _onApplyValueFields,
    onApplyColFields: _onApplyColFields,
  });

  const hasData = data.length > 0;

  return (
    <div className={styles.diagnosticCard}>
      <PanelHeader onClose={onClose} />

      {hasData && (
        <div className={styles.controlBar}>
          <AppSelector
            apps={availableApps}
            selectedApp={selectedApp}
            onSelect={setSelectedApp}
            onAnalyze={runAnalysis}
            isAnalyzing={isAnalyzing}
          />
          <ComparisonModeSelector
            modes={availableModes}
            selectedMode={comparisonMode}
            onSelect={setComparisonMode}
          />
        </div>
      )}

      <div className={styles.content}>
        {/* 无数据 */}
        {!hasData && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <BarChart3 size={36} className={styles.emptyIcon} />
            </div>
            <div className={styles.emptyTitle}>暂无数据</div>
            <div className={styles.emptyDesc}>请先上传数据以启用智能诊断</div>
          </div>
        )}

        {/* 有数据但未分析 */}
        {hasData && !hasAnalyzed && !isAnalyzing && (
          <div className={styles.idleState}>
            <div className={styles.idleIllustration}>
              <div className={styles.idleCircle}>
                <Sparkles size={28} className={styles.idleIcon} />
              </div>
            </div>
            <div className={styles.idleContent}>
              <div className={styles.idleTitle}>智能数据诊断</div>
              <div className={styles.idleDesc}>
                自动识别 ARPU 变化根因，逐级拆解量价因子，定位维度异动
              </div>
              <div className={styles.idleSteps}>
                <div className={styles.idleStep}>
                  <span className={styles.stepNum}>1</span>
                  <span className={styles.stepText}>选择应用</span>
                </div>
                <ChevronRight size={12} className={styles.stepArrow} />
                <div className={styles.idleStep}>
                  <span className={styles.stepNum}>2</span>
                  <span className={styles.stepText}>选择对比模式</span>
                </div>
                <ChevronRight size={12} className={styles.stepArrow} />
                <div className={styles.idleStep}>
                  <span className={styles.stepNum}>3</span>
                  <span className={styles.stepText}>点击分析</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 分析中 */}
        {hasData && isAnalyzing && (
          <div className={styles.loadingState}>
            <div className={styles.loadingHeader}>
              <div className={styles.loadingSpinner} />
              <span className={styles.loadingText}>正在分析数据...</span>
            </div>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* 分析出错 */}
        {hasData && !isAnalyzing && errorMessage && (
          <div className={styles.diagnosticMessage}>{errorMessage}</div>
        )}

        {/* 分析完成但无结果 */}
        {hasData && !isAnalyzing && hasAnalyzed && !errorMessage && !diagnosticResult && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <BarChart3 size={36} className={styles.emptyIcon} />
            </div>
            <div className={styles.emptyTitle}>数据不足</div>
            <div className={styles.emptyDesc}>当前对比模式需要更多数据，请尝试切换对比模式</div>
          </div>
        )}

        {/* 分析结果 */}
        {hasData && !isAnalyzing && diagnosticResult && (
          <DiagnosticDashboard
            result={diagnosticResult}
            onLocate={locateDimension}
          />
        )}
      </div>
    </div>
  );
};
