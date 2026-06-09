import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataRow, Field, PivotField } from '../types';
import type { ComparisonMode, DiagnosticResult } from '../types/anomaly';
import {
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

export function useAnomalyState({
  data,
  fields,
  onApplyFilters,
}: UseAnomalyStateProps) {
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('day');
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

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

  // 当前选中的模式不可用时，自动回退到第一个可用模式
  useEffect(() => {
    if (availableModes.length > 0 && !availableModes.some((m) => m.mode === comparisonMode)) {
      setComparisonMode(availableModes[0].mode);
    }
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
        const diagResult = runDiagnosticAnalysis(data, availableFields, selectedApp || undefined, comparisonMode);
        setDiagnosticResult(diagResult);
      } catch (error) {
        console.error('Diagnostic analysis failed:', error);
        setErrorMessage('分析失败，请检查数据格式');
      } finally {
        setIsAnalyzing(false);
      }
    }, 0);
  }, [data, availableFields, fieldMappingStatus, selectedApp, comparisonMode]);

  useEffect(() => {
    if (data.length === 0) {
      setDiagnosticResult(null);
      setErrorMessage(null);
      setSelectedApp(null);
      setHasAnalyzed(false);
    }
  }, [data]);

  const locateDimension = useCallback(
    (dimensionName: string, memberValue: string) => {
      const field = fields.find((f) => f.name === dimensionName);
      if (field) {
        onApplyFilters(dimensionName, [memberValue]);
      }
    },
    [fields, onApplyFilters]
  );

  return {
    diagnosticResult,
    isAnalyzing,
    errorMessage,
    fieldMappingStatus,
    runAnalysis,
    locateDimension,
    selectedApp,
    setSelectedApp,
    availableApps,
    comparisonMode,
    setComparisonMode,
    availableModes,
    hasAnalyzed,
  };
}
