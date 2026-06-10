import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Film,
  Globe,
  Link2,
  Megaphone,
  RotateCcw,
  Settings,
  Smartphone,
  Stethoscope,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FilterChipConfig } from './components/AdMobFilterBar/AdMobFilterBar';
import AdMobFilterBar from './components/AdMobFilterBar/AdMobFilterBar';
import ConfigManager from './components/ConfigManager/ConfigManager';
import DataSourceManager from './components/DataSourceManager/DataSourceManager';
import { DiagnosticCard } from './components/DiagnosticCard';
import FloatingControlBar from './components/FloatingControlBar';
import PivotTable from './components/PivotTable/PivotTable';
import SpatialFieldZone from './components/SpatialFieldZone';
import ZenModeButton from './components/ZenModeButton';
import { useConfigs } from './hooks/useConfigs';
import { useDatasetManager } from './hooks/useDatasetManager';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { usePivotState } from './hooks/usePivotState';
import { useZenMode } from './hooks/useZenMode';
import { storageService } from './services/storage';
import type { DataRow, Field } from './types';
import type { StoredDataset } from './types/storage';
import { hideConfigPanelTemporarily, showConfigPanelTemporarily } from './utils/animations';
import { PRESET_CALCULATED_FIELDS } from './utils/calculatedField';
import { preprocessData } from './utils/dataPreprocessor';
import { createPivotField } from './utils/fieldHelpers';
import { detectFieldTypes } from './utils/fieldDetector';
import { generateDatasetName } from './utils/storageUtils';
import './styles/variables.css';
import './styles/global.css';
import './App.css';

const ADMOB_FILTER_CONFIGS: FilterChipConfig[] = [
  { icon: <Calendar size={14} />, label: '日期', fieldName: '日期', type: 'date' },
  { icon: <Smartphone size={14} />, label: '应用', fieldName: '应用' },
  { icon: <Settings size={14} />, label: '版本', fieldName: '版本' },
  { icon: <Megaphone size={14} />, label: '渠道', fieldName: '渠道' },
  { icon: <Globe size={14} />, label: '国家', fieldName: '国家' },
  { icon: <Film size={14} />, label: '标准广告场景', fieldName: '标准广告场景' },
  { icon: <Film size={14} />, label: '聚合广告场景', fieldName: '聚合广告场景' },
];

const DEFAULT_ROW_FIELDS = ['日期'];
const DEFAULT_COL_FIELDS = ['应用'];
const DEFAULT_VALUE_FIELDS = ['注册用户'];

function App() {
  // 使用自定义 hooks
  const pivotState = usePivotState();
  const datasetManager = useDatasetManager();
  const configsManager = useConfigs();

  const {
    // 数据状态
    fields,
    data,
    // 透视配置状态
    rowFields,
    setRowFields,
    colFields,
    setColFields,
    valueFields,
    setValueFields,
    filterConfigs,
    // 派生状态
    dimensions,
    measures,
    rowFieldNames,
    colFieldNames,
    activeDimensionNames,
    pivotResult,
    emptyMessage,
    // UI 状态
    showRowTotal,
    setShowRowTotal,
    showColumnTotal,
    setShowColumnTotal,
    // 高级 API
    loadData,
    resetConfig,
    applyConfig,
    // 字段操作
    toggleValueField,
    toggleRowField,
    toggleColField,
    handleFilterChange,
    applyTemplate,
    reorderFields,
    moveFieldToIndex,
    activateFieldAtIndex,
    transferField,
  } = pivotState;

  const {
    isStorageReady,
    currentDatasetId,
    setCurrentDatasetId,
    datasets,
    storageQuota,
    loadDatasets,
    handleDatasetRename,
    handleDatasetDelete,
  } = datasetManager;

  const {
    savedConfigs,
    handleConfigSave: handleConfigSaveBase,
    handleConfigLoad: handleConfigLoadBase,
    handleConfigDelete: handleConfigDeleteBase,
    handleConfigRename: handleConfigRenameBase,
  } = configsManager;

  const [shouldApplyDefault, setShouldApplyDefault] = useState(false);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const loadDatasetRef = useRef<(dataset: StoredDataset) => Promise<void>>(async () => {});

  // 沉浸模式
  const {
    isZenMode,
    isIdle,
    isFullscreen,
    toggleZenMode,
    exitZenMode,
    toggleFullscreen,
    handleDragStart: handleZenDragStart,
    handleDragEnd: handleZenDragEnd,
  } = useZenMode({
    onDragStart: () => showConfigPanelTemporarily(),
    onDragEnd: () => hideConfigPanelTemporarily(),
  });

  // 拖拽逻辑
  const { activeDragField, handleDragStart, handleDragEnd } = useDragAndDrop({
    fields,
    measures,
    dimensions,
    toggleValueField,
    toggleRowField,
    toggleColField,
    reorderFields,
    moveFieldToIndex,
    activateFieldAtIndex,
    transferField,
  });

  const isDragging = activeDragField !== null;
  // 应用默认配置
  const applyDefaultConfig = useCallback(() => {
    if (fields.length === 0) return;

    const defaultRow = DEFAULT_ROW_FIELDS.map((name) => fields.find((f) => f.name === name))
      .filter((f): f is Field => f !== null)
      .map(createPivotField);

    const defaultCol = DEFAULT_COL_FIELDS.map((name) => fields.find((f) => f.name === name))
      .filter((f): f is Field => f !== null)
      .map(createPivotField);

    const defaultValue = DEFAULT_VALUE_FIELDS.map((name) => fields.find((f) => f.name === name))
      .filter((f): f is Field => f !== null)
      .map(createPivotField);

    setRowFields(defaultRow);
    setColFields(defaultCol);
    setValueFields(defaultValue);
    setShouldApplyDefault(false);
  }, [fields, setRowFields, setColFields, setValueFields]);

  // 自动应用默认配置（使用 requestAnimationFrame 避免级联渲染）
  useEffect(() => {
    if (shouldApplyDefault && fields.length > 0) {
      requestAnimationFrame(() => {
        applyDefaultConfig();
      });
    }
  }, [shouldApplyDefault, fields, applyDefaultConfig]);

  // 加载数据集
  const loadDataset = useCallback(
    async (dataset: StoredDataset) => {
      loadData(dataset.fields, dataset.data);
      setCurrentDatasetId(dataset.id);

      // 标记需要应用默认配置
      setShouldApplyDefault(true);

      // 保存用户偏好
      await storageService.saveUserPreferences({ lastDatasetId: dataset.id });
    },
    [loadData, setCurrentDatasetId]
  );

  // 更新 loadDataset ref
  useEffect(() => {
    loadDatasetRef.current = loadDataset;
  }, [loadDataset]);

  // 初始化存储
  useEffect(() => {
    storageService.init().then(async () => {
      await loadDatasets();

      // 默认行为：打开最新数据源
      const prefs = await storageService.getUserPreferences();
      if (prefs.lastDatasetId) {
        const dataset = await storageService.getDataset(prefs.lastDatasetId);
        if (dataset) {
          await loadDatasetRef.current(dataset);
        }
      }
    });
  }, [loadDatasets]);

  // 处理数据加载
  const handleDataLoaded = useCallback(
    async (headers: string[], rawData: DataRow[], fileName: string) => {
      const detectedFields = detectFieldTypes(headers, rawData);
      const dataWithCalculated = preprocessData(rawData);
      const newCalculatedFields: Field[] = PRESET_CALCULATED_FIELDS.map((calculatedField) => ({
        name: calculatedField.name,
        type: 'measure',
        dataType: 'number',
        isCalculated: true,
      }));

      const allFields = [...detectedFields, ...newCalculatedFields];
      loadData(allFields, dataWithCalculated);
      resetConfig();

      if (isStorageReady) {
        try {
          const defaultName = generateDatasetName(fileName);
          const datasetId = await storageService.saveDataset({
            name: defaultName,
            fileName,
            rowCount: rawData.length,
            fieldCount: {
              dimensions: detectedFields.filter((f) => f.type === 'dimension').length,
              measures:
                detectedFields.filter((f) => f.type === 'measure').length +
                PRESET_CALCULATED_FIELDS.length,
            },
            fields: allFields,
            data: dataWithCalculated,
          });
          setCurrentDatasetId(datasetId);
          await loadDatasets();

          // 标记需要应用默认配置
          setShouldApplyDefault(true);

          // 保存用户偏好
          await storageService.saveUserPreferences({ lastDatasetId: datasetId });
        } catch (error) {
          console.error('保存数据集失败:', error);
          alert(error instanceof Error ? error.message : '保存失败');
        }
      }
    },
    [
      isStorageReady,
      loadDatasets,
      loadData,
      resetConfig,
      setCurrentDatasetId,
    ]
  );

  // 数据集选择
  const handleDatasetSelect = useCallback(
    async (id: string) => {
      const dataset = await storageService.getDataset(id);
      if (dataset) {
        await loadDataset(dataset);
      }
    },
    [loadDataset]
  );

  // 配置保存
  const handleConfigSave = useCallback(
    async (name: string) => {
      await handleConfigSaveBase(
        name,
        currentDatasetId,
        rowFields,
        colFields,
        valueFields,
        filterConfigs
      );
    },
    [handleConfigSaveBase, currentDatasetId, rowFields, colFields, valueFields, filterConfigs]
  );

  // 配置加载
  const handleConfigLoad = useCallback(
    async (id: string) => {
      const result = await handleConfigLoadBase(id);
      if (result) {
        applyConfig(result);
      }
    },
    [handleConfigLoadBase, applyConfig]
  );

  // 配置删除
  const handleConfigDelete = useCallback(
    async (id: string) => {
      await handleConfigDeleteBase(id, currentDatasetId);
    },
    [handleConfigDeleteBase, currentDatasetId]
  );

  // 配置重命名
  const handleConfigRename = useCallback(
    async (id: string, newName: string) => {
      await handleConfigRenameBase(id, newName, currentDatasetId);
    },
    [handleConfigRenameBase, currentDatasetId]
  );

  // 数据集删除（带状态清理）
  const handleDatasetDeleteWithCleanup = useCallback(
    async (id: string) => {
      await handleDatasetDelete(id);
      if (currentDatasetId === id) {
        setCurrentDatasetId(null);
        loadData([], []);
        resetConfig();
      }
    },
    [currentDatasetId, handleDatasetDelete, setCurrentDatasetId, loadData, resetConfig]
  );

  const ZEN_TRANSITION = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={(e) => {
        handleDragStart(e);
        handleZenDragStart();
      }}
      onDragEnd={(e) => {
        handleDragEnd(e);
        handleZenDragEnd();
      }}
      onDragCancel={() => {}}
    >
      <div
        className={`app ${isZenMode ? 'zen-mode' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: isZenMode ? '0px 1fr' : '1fr',
          gridTemplateRows: isZenMode ? '0px 1fr' : 'auto 1fr',
          transition: ZEN_TRANSITION,
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <header
          className="app-header"
          style={{
            transform: isZenMode ? 'translateY(-100%)' : 'none',
            opacity: isZenMode ? 0 : 1,
            pointerEvents: isZenMode ? 'none' : 'auto',
            height: isZenMode ? '0px' : 'auto',
            overflow: isZenMode ? 'hidden' : 'visible',
            zIndex: 100,
            transition: ZEN_TRANSITION,
          }}
        >
          <h1>
            <BarChart3
              size={18}
              style={{ marginRight: 6, display: 'inline', verticalAlign: 'middle' }}
            />{' '}
            数据透视表分析工具
          </h1>
          {data.length > 0 && (
            <AdMobFilterBar
              configs={ADMOB_FILTER_CONFIGS}
              data={data}
              filterConfigs={filterConfigs}
              onFilterChange={handleFilterChange}
              activeDimensionNames={activeDimensionNames}
            />
          )}
          <div className="header-file-capsules">
            <DataSourceManager
              currentDatasetId={currentDatasetId}
              datasets={datasets}
              storageQuota={storageQuota}
              onDatasetSelect={handleDatasetSelect}
              onDatasetRename={handleDatasetRename}
              onDatasetDelete={handleDatasetDeleteWithCleanup}
              onDataUpload={handleDataLoaded}
            />
            {data.length > 0 && (
              <ConfigManager
                currentDatasetId={currentDatasetId}
                currentConfig={{ rowFields, colFields, valueFields, filterConfigs }}
                savedConfigs={savedConfigs}
                fields={fields}
                onConfigSave={handleConfigSave}
                onConfigLoad={handleConfigLoad}
                onConfigDelete={handleConfigDelete}
                onConfigRename={handleConfigRename}
                onTemplateApply={applyTemplate}
              />
            )}
            <div className="toolbar-divider" />
            <ZenModeButton
              disabled={data.length === 0}
              isActive={isZenMode}
              onClick={toggleZenMode}
            />
          </div>
        </header>

        <main className="app-main spatial-main">
          <div
            className="spatial-workspace"
            style={{
              gridTemplateColumns: isZenMode ? '0px 1fr' : '260px 1fr',
              transition: ZEN_TRANSITION,
            }}
          >
            <div
              className="spatial-left-rail"
              style={{
                transform: isZenMode ? 'translateX(-100%)' : 'translateX(0)',
                opacity: isZenMode ? 0 : 1,
                pointerEvents: isZenMode ? 'none' : 'auto',
                width: isZenMode ? '0px' : 'auto',
                overflow: 'hidden',
                transition: ZEN_TRANSITION,
              }}
            >
              <div className="spatial-origin">
                <SpatialFieldZone
                  id="values"
                  title="值配置区"
                  hint={data.length === 0 ? '请先选择数据源' : '暂无指标字段'}
                  fields={measures}
                  activeFields={valueFields}
                  orientation="vertical"
                  isDragging={isDragging}
                  onToggle={toggleValueField}
                />
                {valueFields.length > 0 && (() => {
                  const regField = measures.find((f) => f.name === '注册用户');
                  const isDefault = valueFields.length === 1 && valueFields[0].field.name === '注册用户';
                  if (isDefault) return null;
                  return (
                    <button
                      type="button"
                      className="value-reset-btn"
                      onClick={() => {
                        if (regField) {
                          setValueFields([createPivotField(regField)]);
                        }
                      }}
                      title="重置为仅注册用户"
                    >
                      <RotateCcw size={12} />
                      <span>重置</span>
                    </button>
                  );
                })()}
              </div>

              <div className="spatial-rows">
                <SpatialFieldZone
                  id="rows"
                  title="行配置区"
                  hint={data.length === 0 ? '请先选择数据源' : '暂无维度字段'}
                  fields={dimensions}
                  activeFields={rowFields}
                  orientation="vertical"
                  disabledFieldNames={colFieldNames}
                  disabledReason="该维度已在列区域启用"
                  showRowTotal={showRowTotal}
                  onToggleRowTotal={() => setShowRowTotal(!showRowTotal)}
                  isDragging={isDragging}
                  onToggle={toggleRowField}
                />
              </div>
            </div>

            <div className="spatial-right-rail">
              <div
                className="spatial-columns"
                style={{
                  transform: isZenMode ? 'translateY(-100%)' : 'translateY(0)',
                  opacity: isZenMode ? 0 : 1,
                  pointerEvents: isZenMode ? 'none' : 'auto',
                  height: isZenMode ? '0px' : 'auto',
                  overflow: 'hidden',
                  transition: ZEN_TRANSITION,
                }}
              >
                <SpatialFieldZone
                  id="columns"
                  title="列配置区"
                  hint={data.length === 0 ? '请先选择数据源' : '暂无维度字段'}
                  fields={dimensions}
                  activeFields={colFields}
                  orientation="horizontal"
                  disabledFieldNames={rowFieldNames}
                  disabledReason="该维度已在行区域启用"
                  showColumnTotal={showColumnTotal}
                  onToggleColumnTotal={() => setShowColumnTotal(!showColumnTotal)}
                  isDragging={isDragging}
                  onToggle={toggleColField}
                />
              </div>

              <div
                className="spatial-table"
                style={{
                  padding: isZenMode ? '24px' : '0px',
                  transition: ZEN_TRANSITION,
                }}
              >
                <PivotTable
                  result={pivotResult}
                  valueFieldName={valueFields[0]?.field.name}
                  emptyMessage={emptyMessage}
                  showRowTotal={showRowTotal}
                  showColumnTotal={showColumnTotal}
                />
              </div>
            </div>
          </div>
        </main>

        {/* 沉浸模式悬浮控制条 */}
        {isZenMode && (
          <FloatingControlBar
            isIdle={isIdle}
            isFullscreen={isFullscreen}
            showRowTotal={showRowTotal}
            showColumnTotal={showColumnTotal}
            onExit={exitZenMode}
            onToggleFullscreen={toggleFullscreen}
            onToggleRowTotal={() => setShowRowTotal(!showRowTotal)}
            onToggleColumnTotal={() => setShowColumnTotal(!showColumnTotal)}
          />
        )}

        {/* 诊断抽屉 */}
        {!isZenMode && data.length > 0 && (
          <div className={`diagnostic-drawer ${isDiagnosticOpen ? '' : 'collapsed'}`}>
            <button
              type="button"
              className="diagnostic-drawer-toggle"
              onClick={() => setIsDiagnosticOpen(!isDiagnosticOpen)}
              title={isDiagnosticOpen ? '收起诊断面板' : '展开诊断面板'}
            >
              {isDiagnosticOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
            <DiagnosticCard
              data={data}
              fields={fields}
              onClose={() => setIsDiagnosticOpen(false)}
              onApplyFilters={handleFilterChange}
              onApplyRowFields={setRowFields}
              onApplyValueFields={setValueFields}
              onApplyColFields={setColFields}
            />
          </div>
        )}

        {/* 诊断抽屉触发按钮 (抽屉关闭时) */}
        {!isZenMode && data.length > 0 && !isDiagnosticOpen && (
          <button
            type="button"
            className="diagnostic-trigger-btn"
            onClick={() => setIsDiagnosticOpen(true)}
            title="打开智能数据诊断"
          >
            <Stethoscope size={14} />
            <span>智能诊断</span>
          </button>
        )}
      </div>
      <DragOverlay>
        {activeDragField && (
          <div className={`drag-overlay-capsule drag-overlay-${activeDragField.zoneId}`}>
            <span className="drag-overlay-name">{activeDragField.name}</span>
            {activeDragField.isCalculated && <span className="drag-overlay-badge">ƒx</span>}
            {activeDragField.isMapped && (
              <span className="drag-overlay-badge">
                <Link2 size={12} />
              </span>
            )}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default App;
