import {
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Settings2,
  Sparkles,
  Table2,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import type { DataRow, Field, FilterConfig, PivotField, PivotResult } from '../../types';
import {
  buildComparisonAnalysis,
  buildDefaultWeights,
  buildPeriodAnalysis,
  buildTrendAnalysis,
  buildVarianceAnalysis,
  getPreferredDateDimension,
  getPreferredGroupDimension,
  getPreferredMetric,
} from '../../utils/algorithmAnalysis';
import {
  buildPivotConfigPayload,
  createExportFilename,
  downloadCsv,
  downloadJson,
  downloadPivotXlsx,
  type ExportFormat,
  type ExportObjectType,
  filterRowsByConfigs,
  getDataHeaders,
  XLSX_ROW_LIMIT,
} from '../../utils/exportUtils';
import s from './ExportCenter.module.css';

interface ExportCenterProps {
  isOpen: boolean;
  onClose: () => void;
  data: DataRow[];
  fields: Field[];
  dimensions: Field[];
  measures: Field[];
  pivotResult: PivotResult | null;
  rowFields: PivotField[];
  colFields: PivotField[];
  valueFields: PivotField[];
  filterConfigs: FilterConfig[];
  showRowTotal: boolean;
  showColumnTotal: boolean;
  datasetName?: string;
}

const OBJECT_LABELS: Record<ExportObjectType, string> = {
  pivot: '当前透视表',
  'filtered-data': '筛选后明细',
  config: '当前配置',
  analysis: '智能分析报告',
};

const FORMAT_LABELS: Record<ExportFormat, string> = {
  xlsx: 'Excel 工作簿',
  csv: 'CSV 数据',
  json: 'JSON 结构',
};

const ExportCenter: React.FC<ExportCenterProps> = ({
  isOpen,
  onClose,
  data,
  fields,
  dimensions,
  measures,
  pivotResult,
  rowFields,
  colFields,
  valueFields,
  filterConfigs,
  showRowTotal,
  showColumnTotal,
  datasetName,
}) => {
  const [objectType, setObjectType] = useState<ExportObjectType>('pivot');
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [includeRowTotal, setIncludeRowTotal] = useState(showRowTotal);
  const [includeColumnTotal, setIncludeColumnTotal] = useState(showColumnTotal);
  const [includeConfigSheet, setIncludeConfigSheet] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [statusText, setStatusText] = useState('');

  const filteredRows = useMemo(
    () => filterRowsByConfigs(data, filterConfigs),
    [data, filterConfigs]
  );
  const objectOptions = useMemo(
    () => [
      {
        id: 'pivot' as const,
        label: OBJECT_LABELS.pivot,
        description: '导出当前透视结果、行列总计和字段配置',
        icon: <Table2 />,
        disabled: !pivotResult,
        meta: pivotResult
          ? `${pivotResult.rowHeaders.length.toLocaleString()} 行 x ${pivotResult.columnHeaders.length.toLocaleString()} 列`
          : '暂无透视表',
      },
      {
        id: 'filtered-data' as const,
        label: OBJECT_LABELS['filtered-data'],
        description: '导出当前筛选条件下的明细行数据',
        icon: <Database />,
        disabled: data.length === 0,
        meta: `${filteredRows.length.toLocaleString()} / ${data.length.toLocaleString()} 行`,
      },
      {
        id: 'config' as const,
        label: OBJECT_LABELS.config,
        description: '导出行、列、值字段和筛选条件，用于复现分析',
        icon: <Settings2 />,
        disabled: data.length === 0,
        meta: `${rowFields.length + colFields.length + valueFields.length} 个字段`,
      },
      {
        id: 'analysis' as const,
        label: OBJECT_LABELS.analysis,
        description: '导出趋势、差异、对比和周期洞察的完整 JSON 报告',
        icon: <Sparkles />,
        disabled: data.length === 0,
        meta: `${dimensions.length} 维度 · ${measures.length} 指标`,
      },
    ],
    [
      colFields.length,
      data.length,
      dimensions.length,
      filteredRows.length,
      measures.length,
      pivotResult,
      rowFields.length,
      valueFields.length,
    ]
  );
  const activeObjectType = objectOptions.some((item) => item.id === objectType && !item.disabled)
    ? objectType
    : (objectOptions.find((item) => !item.disabled)?.id ?? objectType);
  const supportedFormats = useMemo(() => getSupportedFormats(activeObjectType), [activeObjectType]);
  const activeFormat = supportedFormats.includes(format) ? format : supportedFormats[0];
  const selectedObject =
    objectOptions.find((item) => item.id === activeObjectType) ?? objectOptions[0];

  if (!isOpen) return null;

  const handleExport = async () => {
    if (selectedObject.disabled) return;
    setIsExporting(true);
    setStatusText('正在准备导出...');

    try {
      const filename = createExportFilename(datasetName, activeObjectType, activeFormat);
      if (activeObjectType === 'pivot' && pivotResult) {
        await downloadPivotXlsx(
          {
            result: pivotResult,
            datasetName,
            rowFields,
            colFields,
            valueFields,
            filterConfigs,
            options: { includeRowTotal, includeColumnTotal, includeConfigSheet },
          },
          filename
        );
      } else if (activeObjectType === 'filtered-data') {
        const headers = getDataHeaders(fields, filteredRows);
        downloadCsv(filename, headers, filteredRows);
      } else if (activeObjectType === 'config') {
        downloadJson(
          filename,
          buildPivotConfigPayload({
            datasetName,
            rowFields,
            colFields,
            valueFields,
            filterConfigs,
            showRowTotal,
            showColumnTotal,
          })
        );
      } else if (activeObjectType === 'analysis') {
        downloadJson(
          filename,
          buildAnalysisReportPayload({
            datasetName,
            data,
            dimensions,
            measures,
          })
        );
      }

      setStatusText('导出已生成');
    } catch (error) {
      console.error('导出失败:', error);
      setStatusText(error instanceof Error ? error.message : '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className={s.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-center-title"
      tabIndex={-1}
    >
      <section className={s.panel}>
        <header className={s.header}>
          <div className={s.titleBlock}>
            <span className={s.logo}>
              <Download />
            </span>
            <div>
              <h2 id="export-center-title">导出中心</h2>
              <p>{datasetName || '当前数据源'} · 选择对象、格式和包含内容</p>
            </div>
          </div>
          <button type="button" className={s.closeBtn} onClick={onClose} aria-label="关闭导出中心">
            <X />
          </button>
        </header>

        <div className={s.content}>
          <div className={s.column}>
            <div className={s.sectionTitle}>导出对象</div>
            <div className={s.objectList}>
              {objectOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${s.objectCard} ${activeObjectType === item.id ? s.objectActive : ''}`}
                  disabled={item.disabled}
                  onClick={() => setObjectType(item.id)}
                >
                  <span className={s.objectIcon}>{item.icon}</span>
                  <span className={s.objectText}>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </span>
                  <span className={s.objectMeta}>{item.meta}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={s.column}>
            <div className={s.sectionTitle}>格式与选项</div>
            <div className={s.formatGrid}>
              {supportedFormats.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${s.formatCard} ${activeFormat === item ? s.formatActive : ''}`}
                  onClick={() => setFormat(item)}
                >
                  {item === 'xlsx' ? (
                    <FileSpreadsheet />
                  ) : item === 'csv' ? (
                    <FileText />
                  ) : (
                    <FileJson />
                  )}
                  <span>{FORMAT_LABELS[item]}</span>
                </button>
              ))}
            </div>

            {activeObjectType === 'pivot' && (
              <div className={s.optionBox}>
                <label className={s.checkOption}>
                  <input
                    type="checkbox"
                    checked={includeRowTotal}
                    onChange={(event) => setIncludeRowTotal(event.currentTarget.checked)}
                  />
                  <span>包含行总计列</span>
                </label>
                <label className={s.checkOption}>
                  <input
                    type="checkbox"
                    checked={includeColumnTotal}
                    onChange={(event) => setIncludeColumnTotal(event.currentTarget.checked)}
                  />
                  <span>包含列总计行</span>
                </label>
                <label className={s.checkOption}>
                  <input
                    type="checkbox"
                    checked={includeConfigSheet}
                    onChange={(event) => setIncludeConfigSheet(event.currentTarget.checked)}
                  />
                  <span>附加字段配置 Sheet</span>
                </label>
              </div>
            )}

            {activeObjectType === 'filtered-data' && (
              <div className={s.notice}>
                {filteredRows.length > XLSX_ROW_LIMIT
                  ? '明细行数超过 Excel 单 Sheet 限制，已使用 CSV 格式。'
                  : 'CSV 使用 UTF-8 BOM，适合 Excel 和 BI 工具读取。'}
              </div>
            )}
          </div>

          <aside className={s.summary}>
            <div className={s.sectionTitle}>导出摘要</div>
            <div className={s.summaryCard}>
              <div className={s.summaryIcon}>
                <CheckCircle2 />
              </div>
              <div className={s.summaryRows}>
                <SummaryRow label="对象" value={OBJECT_LABELS[activeObjectType]} />
                <SummaryRow label="格式" value={FORMAT_LABELS[activeFormat]} />
                <SummaryRow
                  label="文件名"
                  value={createExportFilename(datasetName, activeObjectType, activeFormat)}
                />
                <SummaryRow
                  label="范围"
                  value={getScopeText(activeObjectType, filteredRows.length, data.length)}
                />
              </div>
            </div>
            <button
              type="button"
              className={s.exportBtn}
              disabled={selectedObject.disabled || isExporting}
              onClick={handleExport}
            >
              <Download />
              {isExporting ? '导出中...' : '开始导出'}
            </button>
            {statusText && <div className={s.status}>{statusText}</div>}
          </aside>
        </div>
      </section>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={s.summaryRow}>
    <span>{label}</span>
    <strong title={value}>{value}</strong>
  </div>
);

function getSupportedFormats(objectType: ExportObjectType): ExportFormat[] {
  if (objectType === 'pivot') return ['xlsx'];
  if (objectType === 'filtered-data') return ['csv'];
  return ['json'];
}

function getScopeText(
  objectType: ExportObjectType,
  filteredCount: number,
  totalCount: number
): string {
  if (objectType === 'filtered-data') {
    return `${filteredCount.toLocaleString()} / ${totalCount.toLocaleString()} 行`;
  }
  if (objectType === 'pivot') return '当前透视表结果';
  if (objectType === 'config') return '当前字段和筛选配置';
  return '智能分析报告结构';
}

interface AnalysisReportInput {
  datasetName?: string;
  data: DataRow[];
  dimensions: Field[];
  measures: Field[];
}

function buildAnalysisReportPayload(input: AnalysisReportInput) {
  const dateDimension = getPreferredDateDimension(input.dimensions);
  const groupDimension = getPreferredGroupDimension(input.dimensions);
  const metric = getPreferredMetric(input.measures);
  const weights = buildDefaultWeights(input.measures);
  const selectedTrendMetrics = input.measures.slice(0, 3).map((field) => field.name);

  return {
    schemaVersion: 1,
    type: 'algorithm-analysis-report',
    datasetName: input.datasetName ?? '',
    exportedAt: new Date().toISOString(),
    datasetProfile: {
      rowCount: input.data.length,
      dimensionCount: input.dimensions.length,
      metricCount: input.measures.length,
      dateDimension,
      groupDimension,
      metric,
    },
    analyses: {
      trend: buildTrendAnalysis(
        input.data,
        input.dimensions,
        input.measures,
        selectedTrendMetrics,
        dateDimension
      ),
      variance: buildVarianceAnalysis(input.data, input.dimensions, input.measures),
      comparison: buildComparisonAnalysis(
        input.data,
        input.dimensions,
        input.measures,
        groupDimension,
        weights
      ),
      period: buildPeriodAnalysis(
        input.data,
        input.dimensions,
        input.measures,
        dateDimension,
        metric
      ),
    },
  };
}

export default React.memo(ExportCenter);
