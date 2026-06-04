import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import {
  BarChart3,
  Calendar,
  Film,
  Globe,
  Link2,
  Megaphone,
  Settings,
  Smartphone,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FilterChipConfig } from './components/AdMobFilterBar/AdMobFilterBar';
import AdMobFilterBar from './components/AdMobFilterBar/AdMobFilterBar';
import ConfigManager from './components/ConfigManager/ConfigManager';
import DataSourceManager from './components/DataSourceManager/DataSourceManager';
import MappingManager from './components/MappingManager/MappingManager';
import PivotTable from './components/PivotTable/PivotTable';
import SpatialFieldZone from './components/SpatialFieldZone';
import { useConfigs } from './hooks/useConfigs';
import { useDatasetManager } from './hooks/useDatasetManager';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useMappings } from './hooks/useMappings';
import { usePivotState } from './hooks/usePivotState';
import { storageService } from './services/storage';
import type { DataRow, Field } from './types';
import type { StoredDataset, StoredMapping } from './types/storage';
import {
  addCalculatedFields,
  PRESET_CALCULATED_FIELDS,
  precomputeGlobalRevenue,
} from './utils/calculatedField';
import { applyCountryMapping } from './utils/countryMapper';
import { detectFieldTypes } from './utils/fieldDetector';
import {
  applyScenarioMapping,
  buildLookupMapFromConfigs,
  calculateScenarioMatchStats,
  scenarioMappingToRecord,
} from './utils/scenarioMapper';
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
  { icon: <Film size={14} />, label: '广告场景', fieldName: '广告场景' },
  { icon: <Link2 size={14} />, label: '实际场景', fieldName: '实际场景' },
];

const DEFAULT_ROW_FIELDS = ['日期'];
const DEFAULT_COL_FIELDS = ['应用'];
const DEFAULT_VALUE_FIELDS = ['注册用户'];

const createPivotField = (field: Field) => ({
  field,
  aggregation: field.type === 'measure' ? ('sum' as const) : undefined,
});

const areLookupRecordsEqual = (a: Record<string, string>, b: Record<string, string>) => {
  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);
  if (aEntries.length !== bEntries.length) return false;

  return aEntries.every(([key, value]) => b[key] === value);
};

function App() {
  // 使用自定义 hooks
  const pivotState = usePivotState();
  const datasetManager = useDatasetManager();
  const mappingsManager = useMappings(datasetManager.isStorageReady);
  const configsManager = useConfigs();

  const {
    fields,
    setFields,
    data,
    setData,
    rowFields,
    setRowFields,
    colFields,
    setColFields,
    valueFields,
    setValueFields,
    filterConfigs,
    setFilterConfigs,
    dimensions,
    measures,
    rowFieldNames,
    colFieldNames,
    activeDimensionNames,
    pivotResult,
    emptyMessage,
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
    mappings,
    activeMappingId,
    setActiveMappingId,
    loadMappings,
    handleMappingSelect: handleMappingSelectBase,
    handleMappingUpload: handleMappingUploadBase,
    handleMappingExport,
    handleMappingDelete,
    handleMappingUpdate: handleMappingUpdateBase,
  } = mappingsManager;

  const {
    savedConfigs,
    handleConfigSave: handleConfigSaveBase,
    handleConfigLoad: handleConfigLoadBase,
    handleConfigDelete: handleConfigDeleteBase,
    handleConfigRename: handleConfigRenameBase,
  } = configsManager;

  const [shouldApplyDefault, setShouldApplyDefault] = useState(false);
  const loadDatasetRef = useRef<(dataset: StoredDataset) => Promise<void>>(async () => {});

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

  // 当前数据源变化后，刷新所有映射模板在该数据源上的真实命中数
  useEffect(() => {
    if (!currentDatasetId || mappings.length === 0) return;

    let cancelled = false;

    const refreshMappingMatchCounts = async () => {
      const dataset = await storageService.getDataset(currentDatasetId);
      if (!dataset || cancelled) return;

      let hasUpdates = false;
      for (const mapping of mappings) {
        const scenarioMapping = buildLookupMapFromConfigs(
          mapping.scenarioConfigs,
          mapping.appCodes
        );
        const mappedRowCount = calculateScenarioMatchStats(
          dataset.data,
          scenarioMapping
        ).mappedRowCount;
        const lookupMap = scenarioMappingToRecord(scenarioMapping);

        if (
          mapping.scenarioCount !== scenarioMapping.scenarioCount ||
          mapping.mappedRowCount !== mappedRowCount ||
          !areLookupRecordsEqual(mapping.lookupMap, lookupMap)
        ) {
          await storageService.updateMapping(mapping.id, {
            lookupMap,
            scenarioCount: scenarioMapping.scenarioCount,
            mappedRowCount,
          });
          hasUpdates = true;
        }
      }

      if (hasUpdates && !cancelled) {
        await loadMappings();
      }
    };

    refreshMappingMatchCounts().catch((error) => {
      console.error('刷新映射命中数失败:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [currentDatasetId, mappings, loadMappings]);

  // 加载数据集
  const loadDataset = useCallback(
    async (dataset: StoredDataset) => {
      setFields(dataset.fields);
      setData(dataset.data);
      setCurrentDatasetId(dataset.id);
      setActiveMappingId(dataset.activeMappingId);

      // 应用映射
      if (dataset.activeMappingId) {
        const mapping = await storageService.getMapping(dataset.activeMappingId);
        if (mapping) {
          const scenarioMapping = buildLookupMapFromConfigs(
            mapping.scenarioConfigs,
            mapping.appCodes
          );
          const mappedRowCount = calculateScenarioMatchStats(
            dataset.data,
            scenarioMapping
          ).mappedRowCount;
          await storageService.updateMapping(mapping.id, {
            lookupMap: scenarioMappingToRecord(scenarioMapping),
            scenarioCount: scenarioMapping.scenarioCount,
            mappedRowCount,
          });
          const updatedData = applyScenarioMapping(dataset.data, scenarioMapping);
          setData(updatedData);
          await loadMappings();
          await loadDatasets();
        }
      }

      // 标记需要应用默认配置
      setShouldApplyDefault(true);

      // 保存用户偏好
      await storageService.saveUserPreferences({ lastDatasetId: dataset.id });
    },
    [setFields, setData, setCurrentDatasetId, setActiveMappingId, loadMappings, loadDatasets]
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
      const dataWithCountryNames = applyCountryMapping(rawData);
      const dataWithRevenue = precomputeGlobalRevenue(dataWithCountryNames);
      const dataWithCalculated = addCalculatedFields(dataWithRevenue, PRESET_CALCULATED_FIELDS);
      const newCalculatedFields: Field[] = PRESET_CALCULATED_FIELDS.map((calculatedField) => ({
        name: calculatedField.name,
        type: 'measure',
        dataType: 'number',
        isCalculated: true,
      }));

      const allFields = [...detectedFields, ...newCalculatedFields];
      setFields(allFields);
      setData(dataWithCalculated);
      setRowFields([]);
      setColFields([]);
      setValueFields([]);
      setFilterConfigs([]);

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
      setFields,
      setData,
      setRowFields,
      setColFields,
      setValueFields,
      setFilterConfigs,
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

  // 映射选择
  const handleMappingSelect = useCallback(
    async (mappingId: string | null) => {
      await handleMappingSelectBase(mappingId, currentDatasetId, setData, loadDatasets);
    },
    [handleMappingSelectBase, currentDatasetId, setData, loadDatasets]
  );

  // 映射上传
  const handleMappingUpload = useCallback(
    async (file: File) => {
      await handleMappingUploadBase(file, currentDatasetId);
    },
    [handleMappingUploadBase, currentDatasetId]
  );

  // 映射更新
  const handleMappingUpdate = useCallback(
    async (id: string, updates: Partial<StoredMapping>) => {
      await handleMappingUpdateBase(
        id,
        updates,
        currentDatasetId,
        activeMappingId,
        setData,
        loadDatasets
      );
    },
    [handleMappingUpdateBase, currentDatasetId, activeMappingId, setData, loadDatasets]
  );

  const handleMappingRename = useCallback(
    async (id: string, newName: string) => {
      await handleMappingUpdate(id, { name: newName });
    },
    [handleMappingUpdate]
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
      await handleConfigLoadBase(id, setRowFields, setColFields, setValueFields, setFilterConfigs);
    },
    [handleConfigLoadBase, setRowFields, setColFields, setValueFields, setFilterConfigs]
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
        setFields([]);
        setData([]);
        setRowFields([]);
        setColFields([]);
        setValueFields([]);
        setFilterConfigs([]);
        setActiveMappingId(undefined);
      }
    },
    [
      currentDatasetId,
      handleDatasetDelete,
      setCurrentDatasetId,
      setFields,
      setData,
      setRowFields,
      setColFields,
      setValueFields,
      setFilterConfigs,
      setActiveMappingId,
    ]
  );

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {}}
    >
      <div className="app">
        <header className="app-header">
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
            <DataSourceManager
              currentDatasetId={currentDatasetId}
              datasets={datasets}
              mappings={mappings}
              activeMappingId={activeMappingId}
              storageQuota={storageQuota}
              onDatasetSelect={handleDatasetSelect}
              onDatasetRename={handleDatasetRename}
              onDatasetDelete={handleDatasetDeleteWithCleanup}
              onDataUpload={handleDataLoaded}
              onMappingSelect={handleMappingSelect}
            />
            <MappingManager
              mappings={mappings}
              storageQuota={storageQuota}
              onMappingUpload={handleMappingUpload}
              onMappingRename={handleMappingRename}
              onMappingDelete={handleMappingDelete}
              onMappingUpdate={handleMappingUpdate}
              onMappingExport={handleMappingExport}
            />
          </div>
        </header>

        <main className="app-main spatial-main">
          <div className="spatial-workspace">
            <div className="spatial-left-rail">
              <div className="spatial-origin">
                <SpatialFieldZone
                  id="values"
                  title="值配置区"
                  hint={data.length === 0 ? '请先选择数据源' : '暂无指标字段'}
                  fields={measures}
                  activeFields={valueFields}
                  orientation="vertical"
                  onToggle={toggleValueField}
                />
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
                  onToggle={toggleRowField}
                />
              </div>
            </div>

            <div className="spatial-right-rail">
              <div className="spatial-columns">
                <SpatialFieldZone
                  id="columns"
                  title="列配置区"
                  hint={data.length === 0 ? '请先选择数据源' : '暂无维度字段'}
                  fields={dimensions}
                  activeFields={colFields}
                  orientation="horizontal"
                  disabledFieldNames={rowFieldNames}
                  disabledReason="该维度已在行区域启用"
                  onToggle={toggleColField}
                />
              </div>

              <div className="spatial-table">
                <PivotTable
                  result={pivotResult}
                  valueFieldName={valueFields[0]?.field.name}
                  emptyMessage={emptyMessage}
                />
              </div>
            </div>
          </div>
        </main>
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
