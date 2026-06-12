import { useCallback, useMemo, useState } from 'react';
import { createPivotField } from '../utils/fieldHelpers';
import type { DataRow, Field, PivotField } from '../types';
import type { ComparisonMode, DiagnosticResult, PivotSuggestion } from '../types/anomaly';
import {
  computeDashboardOverview,
  getAvailableModes,
  getFieldMappingStatus,
  getUniqueApps,
  runDiagnosticAnalysis,
} from '../utils/anomalyDetector';

interface UseAnomalyStateProps {
  data: DataRow[];
  fields: Field[];
  onApplyFilters: (fieldName: string, selectedValues: string[]) => void;
  onApplyRowFields: (fields: PivotField[]) => void;
  onApplyValueFields: (fields: PivotField[]) => void;
  onApplyColFields: (fields: PivotField[]) => void;
}

export type AnalysisStage = 'overview' | 'summary' | 'decompose' | 'drilldown';

export function useAnomalyState({
  data,
  fields,
  onApplyFilters,
  onApplyRowFields,
  onApplyValueFields,
}: UseAnomalyStateProps) {
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('day');
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [activeStage, setActiveStage] = useState<AnalysisStage>('overview');
  const [sparklineDays, setSparklineDays] = useState(7);

  const availableFields = useMemo(() => fields.map((f) => f.name), [fields]);

  const fieldMappingStatus = useMemo(
    () => getFieldMappingStatus(availableFields),
    [availableFields]
  );

  const availableApps = useMemo(() => getUniqueApps(data, availableFields), [data, availableFields]);

  const availableModes = useMemo(
    () => getAvailableModes(data, availableFields, selectedApp || undefined),
    [data, availableFields, selectedApp]
  );

  const dashboardOverview = useMemo(
    () => computeDashboardOverview(data, availableFields, sparklineDays),
    [data, availableFields, sparklineDays]
  );

  // Derive effective diagnostic state — when data is empty, suppress results
  const effectiveDiagnosticResult = data.length === 0 ? null : diagnosticResult;
  const effectiveErrorMessage = data.length === 0 ? null : errorMessage;
  const effectiveSelectedApp = data.length === 0 ? null : selectedApp;
  const effectiveHasAnalyzed = data.length === 0 ? false : hasAnalyzed;

  // 当前选中的模式不可用时，自动回退到第一个可用模式
  const effectiveComparisonMode = useMemo(() => {
    if (availableModes.length > 0 && !availableModes.some((m) => m.mode === comparisonMode)) {
      return availableModes[0].mode;
    }
    return comparisonMode;
  }, [availableModes, comparisonMode]);

  const runAnalysis = useCallback(() => {
    if (data.length === 0) return;

    const { missing, hasAnyMetric } = fieldMappingStatus;
    if (missing.length > 0) {
      setErrorMessage(`缺少必需字段: ${missing.join(', ')}`);
      return;
    }
    if (!hasAnyMetric) {
      setErrorMessage('缺少指标字段');
      return;
    }

    setErrorMessage(null);
    setIsAnalyzing(true);
    setHasAnalyzed(true);

    setTimeout(() => {
      try {
        const diagResult = runDiagnosticAnalysis(data, availableFields, selectedApp || undefined, effectiveComparisonMode);
        setDiagnosticResult(diagResult);
      } catch (error) {
        console.error('Diagnostic analysis failed:', error);
        setErrorMessage('分析失败，请检查数据格式');
      } finally {
        setIsAnalyzing(false);
      }
    }, 0);
  }, [data, availableFields, fieldMappingStatus, selectedApp, effectiveComparisonMode]);

  const locateDimension = useCallback(
    (dimensionName: string, memberValue: string) => {
      const field = fields.find((f) => f.name === dimensionName);
      if (field) {
        onApplyFilters(dimensionName, [memberValue]);
      }
    },
    [fields, onApplyFilters]
  );

  const handleAppSelect = useCallback((appName: string) => {
    setSelectedApp(appName);
    setActiveStage('summary');
    setErrorMessage(null);
    setTimeout(() => {
      const { missing, hasAnyMetric } = getFieldMappingStatus(fields.map((f) => f.name));
      if (missing.length > 0 || !hasAnyMetric) return;
      setIsAnalyzing(true);
      setHasAnalyzed(true);
      setTimeout(() => {
        try {
          const diagResult = runDiagnosticAnalysis(data, fields.map((f) => f.name), appName, effectiveComparisonMode);
          setDiagnosticResult(diagResult);
        } catch (err) {
          console.error('Auto-analysis failed:', err);
          setErrorMessage('分析失败');
        } finally {
          setIsAnalyzing(false);
        }
      }, 0);
    }, 0);
  }, [data, fields, effectiveComparisonMode]);

  const applySuggestion = useCallback((suggestion: PivotSuggestion) => {
    const rowFields: PivotField[] = suggestion.rowDimensions
      .map((name) => { const field = fields.find((f) => f.name === name); return field ? createPivotField(field) : null; })
      .filter((f): f is PivotField => f !== null);
    const valueFields: PivotField[] = suggestion.valueMetrics
      .map((name) => { const field = fields.find((f) => f.name === name); return field ? createPivotField(field) : null; })
      .filter((f): f is PivotField => f !== null);
    if (rowFields.length > 0) onApplyRowFields(rowFields);
    if (valueFields.length > 0) onApplyValueFields(valueFields);
    for (const [fieldName, values] of Object.entries(suggestion.filters)) { onApplyFilters(fieldName, values); }
  }, [fields, onApplyRowFields, onApplyValueFields, onApplyFilters]);

  const handleComparisonModeChange = useCallback((mode: ComparisonMode) => {
    setComparisonMode(mode);
    if (selectedApp && hasAnalyzed) {
      setIsAnalyzing(true);
      setTimeout(() => {
        try {
          const diagResult = runDiagnosticAnalysis(data, availableFields, selectedApp, mode);
          setDiagnosticResult(diagResult);
        } catch {
          setErrorMessage('分析失败');
        } finally {
          setIsAnalyzing(false);
        }
      }, 0);
    }
  }, [selectedApp, hasAnalyzed, data, availableFields]);

  return {
    diagnosticResult: effectiveDiagnosticResult,
    isAnalyzing,
    errorMessage: effectiveErrorMessage,
    fieldMappingStatus,
    runAnalysis,
    locateDimension,
    handleAppSelect,
    applySuggestion,
    selectedApp: effectiveSelectedApp,
    setSelectedApp,
    availableApps,
    comparisonMode: effectiveComparisonMode,
    setComparisonMode: handleComparisonModeChange,
    availableModes,
    hasAnalyzed: effectiveHasAnalyzed,
    activeStage,
    setActiveStage,
    dashboardOverview,
    sparklineDays,
    setSparklineDays,
  };
}
