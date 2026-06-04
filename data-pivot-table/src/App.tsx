import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Calendar, Smartphone, Settings, Megaphone, Globe, Film, Link2, BarChart3 } from 'lucide-react';
import PivotTable from './components/PivotTable/PivotTable';
import SpatialFieldZone from './components/SpatialFieldZone';
import type { SpatialZoneId } from './utils/fieldHelpers';
import { canDropToZone } from './utils/fieldHelpers';
import AdMobFilterBar from './components/AdMobFilterBar/AdMobFilterBar';
import type { FilterChipConfig } from './components/AdMobFilterBar/AdMobFilterBar';
import DataSourceManager from './components/DataSourceManager/DataSourceManager';
import ConfigManager from './components/ConfigManager/ConfigManager';
import MappingManager from './components/MappingManager/MappingManager';
import type { DataRow, Field, FilterConfig, PivotField, ScenarioMapping } from './types';
import type { StoredDataset, StoredMapping, StoredConfig, StorageQuota, ScenarioConfig } from './types/storage';
import { aggregateData } from './utils/aggregator';
import { addCalculatedFields, precomputeGlobalRevenue, PRESET_CALCULATED_FIELDS } from './utils/calculatedField';
import { detectFieldTypes } from './utils/fieldDetector';
import { applyScenarioMapping } from './utils/scenarioMapper';
import { applyCountryMapping } from './utils/countryMapper';
import { storageService } from './services/storage';
import { STORAGE_LIMITS, generateDatasetName, generateId } from './utils/storageUtils';
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
const MAX_PRIORITY_FIELDS = 5;

const createPivotField = (field: Field): PivotField => ({
  field,
  aggregation: field.type === 'measure' ? 'sum' : undefined,
});

function App() {
  const [activeDragField, setActiveDragField] = useState<{
    name: string;
    zoneId: SpatialZoneId;
    isCalculated: boolean;
    isMapped: boolean;
  } | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [data, setData] = useState<DataRow[]>([]);
  const [rowFields, setRowFields] = useState<PivotField[]>([]);
  const [colFields, setColFields] = useState<PivotField[]>([]);
  const [valueFields, setValueFields] = useState<PivotField[]>([]);
  const [filterConfigs, setFilterConfigs] = useState<FilterConfig[]>([]);

  const [isStorageReady, setIsStorageReady] = useState(false);
  const [currentDatasetId, setCurrentDatasetId] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<StoredDataset[]>([]);
  const [mappings, setMappings] = useState<StoredMapping[]>([]);
  const [activeMappingId, setActiveMappingId] = useState<string | undefined>();
  const [savedConfigs, setSavedConfigs] = useState<StoredConfig[]>([]);
  const [storageQuota, setStorageQuota] = useState<StorageQuota>({
    used: 0,
    limit: STORAGE_LIMITS.MAX_STORAGE_BYTES,
    datasetCount: 0,
    datasetLimit: STORAGE_LIMITS.MAX_DATASETS,
    mappingCount: 0,
    mappingLimit: STORAGE_LIMITS.MAX_MAPPINGS,
  });

  const loadDatasetsRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const loadDatasetRef = useRef<(dataset: StoredDataset) => Promise<void>>(async () => {});
  const loadMappingsRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const dimensions = useMemo(() => fields.filter(field => field.type === 'dimension'), [fields]);
  const measures = useMemo(() => fields.filter(field => field.type === 'measure'), [fields]);
  const rowFieldNames = useMemo(() => new Set(rowFields.map(field => field.field.name)), [rowFields]);
  const colFieldNames = useMemo(() => new Set(colFields.map(field => field.field.name)), [colFields]);
  const activeDimensionNames = useMemo(() => {
    const set = new Set<string>();
    rowFields.forEach(f => set.add(f.field.name));
    colFields.forEach(f => set.add(f.field.name));
    return set;
  }, [rowFields, colFields]);

  const pivotResult = useMemo(() => {
    if (data.length === 0 || valueFields.length === 0 || (rowFields.length === 0 && colFields.length === 0)) {
      return null;
    }
    return aggregateData(data, rowFields, colFields, valueFields, filterConfigs, 'columns');
  }, [data, rowFields, colFields, valueFields, filterConfigs]);

  const emptyMessage = data.length === 0
    ? '请先在顶部选择数据源'
    : '请配置透视表字段以查看结果';

  // 加载数据集列表
  const loadDatasets = useCallback(async () => {
    try {
      const list = await storageService.getAllDatasets();
      setDatasets(list);
      const quota = await storageService.getStorageQuota();
      setStorageQuota(quota);
    } catch (error) {
      console.error('加载数据集失败:', error);
    }
  }, []);

  // 加载映射列表
  const loadMappings = useCallback(async () => {
    try {
      const list = await storageService.getAllMappings();
      setMappings(list);
    } catch (error) {
      console.error('加载映射失败:', error);
    }
  }, []);

  // 更新 ref
  useEffect(() => {
    loadDatasetsRef.current = loadDatasets;
  }, [loadDatasets]);

  useEffect(() => {
    loadMappingsRef.current = loadMappings;
  }, [loadMappings]);

  // 初始化存储
  useEffect(() => {
    storageService.init().then(async () => {
      setIsStorageReady(true);
      await loadDatasetsRef.current();
      await loadMappingsRef.current();
      
      // 默认行为：打开最新数据源
      const prefs = await storageService.getUserPreferences();
      if (prefs.lastDatasetId) {
        const dataset = await storageService.getDataset(prefs.lastDatasetId);
        if (dataset) {
          await loadDatasetRef.current(dataset);
        }
      }
    });
  }, []);

  // 加载当前数据集的配置
  useEffect(() => {
    if (currentDatasetId) {
      storageService.getConfigsByDataset(currentDatasetId).then(configs => {
        setSavedConfigs(configs);
      }).catch(error => {
        console.error('加载配置失败:', error);
      });
    }
  }, [currentDatasetId]);

  // 应用默认配置
  const applyDefaultConfig = useCallback(() => {
    if (fields.length === 0) return;

    const defaultRow = DEFAULT_ROW_FIELDS
      .map(name => fields.find(f => f.name === name))
      .filter((f): f is Field => f !== null)
      .map(createPivotField);

    const defaultCol = DEFAULT_COL_FIELDS
      .map(name => fields.find(f => f.name === name))
      .filter((f): f is Field => f !== null)
      .map(createPivotField);

    const defaultValue = DEFAULT_VALUE_FIELDS
      .map(name => fields.find(f => f.name === name))
      .filter((f): f is Field => f !== null)
      .map(createPivotField);

    setRowFields(defaultRow);
    setColFields(defaultCol);
    setValueFields(defaultValue);
  }, [fields]);

  // 加载数据集
  const loadDataset = useCallback(async (dataset: StoredDataset) => {
    setFields(dataset.fields);
    setData(dataset.data);
    setCurrentDatasetId(dataset.id);
    setActiveMappingId(dataset.activeMappingId);

    // 应用映射
    if (dataset.activeMappingId) {
      const mapping = await storageService.getMapping(dataset.activeMappingId);
      if (mapping) {
        const scenarioMapping: ScenarioMapping = {
          lookupMap: new Map(Object.entries(mapping.lookupMap)),
          appCodes: mapping.appCodes,
          scenarioCount: mapping.scenarioCount,
          mappedRowCount: mapping.mappedRowCount,
        };
        const updatedData = applyScenarioMapping(dataset.data, scenarioMapping);
        setData(updatedData);
      }
    }

    // 应用默认配置
    setTimeout(() => {
      applyDefaultConfig();
    }, 100);

    // 保存用户偏好
    await storageService.saveUserPreferences({ lastDatasetId: dataset.id });
  }, [applyDefaultConfig]);

  // 更新 loadDataset ref
  useEffect(() => {
    loadDatasetRef.current = loadDataset;
  }, [loadDataset]);

  // 处理数据加载
  const handleDataLoaded = useCallback(async (headers: string[], rawData: DataRow[], fileName: string) => {
    const detectedFields = detectFieldTypes(headers, rawData);
    const dataWithCountryNames = applyCountryMapping(rawData);
    const dataWithRevenue = precomputeGlobalRevenue(dataWithCountryNames);
    const dataWithCalculated = addCalculatedFields(dataWithRevenue, PRESET_CALCULATED_FIELDS);
    const newCalculatedFields: Field[] = PRESET_CALCULATED_FIELDS.map(calculatedField => ({
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
            dimensions: detectedFields.filter(f => f.type === 'dimension').length,
            measures: detectedFields.filter(f => f.type === 'measure').length + PRESET_CALCULATED_FIELDS.length,
          },
          fields: allFields,
          data: dataWithCalculated,
        });
        setCurrentDatasetId(datasetId);
        await loadDatasets();
        
        // 应用默认配置
        setTimeout(() => {
          applyDefaultConfig();
        }, 100);

        // 保存用户偏好
        await storageService.saveUserPreferences({ lastDatasetId: datasetId });
      } catch (error) {
        console.error('保存数据集失败:', error);
        alert(error instanceof Error ? error.message : '保存失败');
      }
    }
  }, [isStorageReady, loadDatasets, applyDefaultConfig]);

  // 数据集选择
  const handleDatasetSelect = useCallback(async (id: string) => {
    const dataset = await storageService.getDataset(id);
    if (dataset) {
      await loadDataset(dataset);
    }
  }, [loadDataset]);

  // 数据集重命名
  const handleDatasetRename = useCallback(async (id: string, newName: string) => {
    await storageService.renameDataset(id, newName);
    await loadDatasets();
  }, [loadDatasets]);

  // 数据集删除
  const handleDatasetDelete = useCallback(async (id: string) => {
    await storageService.deleteDataset(id);
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
    await loadDatasets();
  }, [currentDatasetId, loadDatasets]);

  // 映射选择
  const handleMappingSelect = useCallback(async (mappingId: string | null) => {
    if (!currentDatasetId) return;

    await storageService.setActiveMapping(currentDatasetId, mappingId);
    setActiveMappingId(mappingId ?? undefined);

    // 始终从存储获取原始数据，避免闭包捕获旧的已映射数据导致双重映射
    const dataset = await storageService.getDataset(currentDatasetId);
    if (!dataset) {
      await loadDatasets();
      return;
    }

    if (mappingId) {
      const mapping = await storageService.getMapping(mappingId);
      if (mapping) {
        const scenarioMapping: ScenarioMapping = {
          lookupMap: new Map(Object.entries(mapping.lookupMap)),
          appCodes: mapping.appCodes,
          scenarioCount: mapping.scenarioCount,
          mappedRowCount: mapping.mappedRowCount,
        };
        const updatedData = applyScenarioMapping(dataset.data, scenarioMapping);
        setData(updatedData);
      }
    } else {
      // 移除映射，恢复原始数据
      setData(dataset.data);
    }

    await loadDatasets();
  }, [currentDatasetId, loadDatasets]);

  // 映射上传
  const handleMappingUpload = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('导入失败：CSV 文件至少需要包含表头和一行数据');
        return;
      }

      // 解析表头：第一行第一个为空或"目标场景"，后面的是应用标识
      const headers = lines[0].split(',').map(h => h.trim());
      const appCodes = headers.slice(1); // 从第2列开始是应用标识
      
      if (appCodes.length === 0) {
        alert('导入失败：CSV 文件格式错误，至少需要一个应用标识');
        return;
      }

      // 解析数据行：2D格式转换为ScenarioConfig
      const scenarioConfigs: ScenarioConfig[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim());
        const targetScenario = cells[0]; // 第一列是目标场景
        
        if (!targetScenario) continue;
        
        // 从第2列开始，每个应用对应的原始场景
        for (let j = 0; j < appCodes.length; j++) {
          const originalScenario = cells[j + 1] || '';
          if (originalScenario) {
            scenarioConfigs.push({
              id: generateId(),
              appCode: appCodes[j],
              originalScenario,
              targetScenario,
            });
          }
        }
      }

      // 生成 lookupMap (使用 appCode + \t + originalScenario 作为 key，与 scenarioMapper.ts 保持一致)
      const KEY_SEP = '\t';
      const lookupMap: Record<string, string> = {};
      scenarioConfigs.forEach(config => {
        if (config.appCode && config.targetScenario && config.originalScenario) {
          const key = config.appCode + KEY_SEP + config.originalScenario;
          lookupMap[key] = config.targetScenario;
        }
      });

      // 保存映射
      await storageService.saveMapping({
        name: file.name.replace('.csv', ''),
        fileName: file.name,
        scenarioCount: scenarioConfigs.length,
        mappedRowCount: 0,
        lookupMap,
        appCodes,
        scenarioConfigs,
      });

      await loadMappings();
    } catch (error) {
      alert(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [loadMappings]);

  // 映射重命名
  const handleMappingRename = useCallback(async (id: string, newName: string) => {
    await storageService.renameMapping(id, newName);
    await loadMappings();
  }, [loadMappings]);

  // 映射删除
  const handleMappingDelete = useCallback(async (id: string) => {
    await storageService.deleteMapping(id);
    if (activeMappingId === id) {
      setActiveMappingId(undefined);
      if (currentDatasetId) {
        const dataset = await storageService.getDataset(currentDatasetId);
        if (dataset) {
          setData(dataset.data);
        }
      }
    }
    await loadMappings();
  }, [activeMappingId, currentDatasetId, loadMappings]);

  // 映射更新
  const handleMappingUpdate = useCallback(async (id: string, updates: Partial<StoredMapping>) => {
    await storageService.updateMapping(id, updates);
    await loadMappings();

    // 如果是当前激活的映射，重新应用（使用原始数据避免双重映射）
    if (activeMappingId === id && updates.lookupMap && currentDatasetId) {
      const dataset = await storageService.getDataset(currentDatasetId);
      if (dataset) {
        const scenarioMapping: ScenarioMapping = {
          lookupMap: new Map(Object.entries(updates.lookupMap)),
          appCodes: updates.appCodes || [],
          scenarioCount: updates.scenarioCount || 0,
          mappedRowCount: updates.mappedRowCount || 0,
        };
        const updatedData = applyScenarioMapping(dataset.data, scenarioMapping);
        setData(updatedData);
      }
    }
  }, [activeMappingId, currentDatasetId, loadMappings]);

  // 映射导出 - 2D格式
  const handleMappingExport = useCallback((mapping: StoredMapping) => {
    // 获取所有应用标识
    const appCodes = [...new Set(mapping.scenarioConfigs.map(c => c.appCode))];
    
    // 按目标场景分组
    const groupedByTarget = new Map<string, Record<string, string>>();
    mapping.scenarioConfigs.forEach(config => {
      if (!groupedByTarget.has(config.targetScenario)) {
        groupedByTarget.set(config.targetScenario, {});
      }
      groupedByTarget.get(config.targetScenario)![config.appCode] = config.originalScenario;
    });

    // 生成CSV - 2D格式
    const header = ['目标场景', ...appCodes].join(',');
    const rows = Array.from(groupedByTarget.entries()).map(([target, appMap]) => {
      const cells = [target, ...appCodes.map(code => appMap[code] || '')];
      return cells.join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${mapping.name}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
  }, []);

  // 配置保存
  const handleConfigSave = useCallback(async (name: string) => {
    if (!currentDatasetId) return;

    try {
      await storageService.saveConfig({
        datasetId: currentDatasetId,
        name,
        rowFields,
        colFields,
        valueFields,
        filterConfigs,
      });
      const configs = await storageService.getConfigsByDataset(currentDatasetId);
      setSavedConfigs(configs);
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存失败');
    }
  }, [currentDatasetId, rowFields, colFields, valueFields, filterConfigs]);

  // 配置加载
  const handleConfigLoad = useCallback(async (id: string) => {
    const config = await storageService.getConfig(id);
    if (config) {
      setRowFields(config.rowFields.slice(0, MAX_PRIORITY_FIELDS));
      setColFields(config.colFields.slice(0, MAX_PRIORITY_FIELDS));
      setValueFields(config.valueFields);
      setFilterConfigs(config.filterConfigs);
    }
  }, []);

  // 配置删除
  const handleConfigDelete = useCallback(async (id: string) => {
    await storageService.deleteConfig(id);
    if (currentDatasetId) {
      const configs = await storageService.getConfigsByDataset(currentDatasetId);
      setSavedConfigs(configs);
    }
  }, [currentDatasetId]);

  // 配置重命名
  const handleConfigRename = useCallback(async (id: string, newName: string) => {
    await storageService.renameConfig(id, newName);
    if (currentDatasetId) {
      const configs = await storageService.getConfigsByDataset(currentDatasetId);
      setSavedConfigs(configs);
    }
  }, [currentDatasetId]);

  const toggleValueField = useCallback((field: Field) => {
    setValueFields(prev => {
      const exists = prev.some(pivotField => pivotField.field.name === field.name);
      if (exists) {
        return prev.filter(pivotField => pivotField.field.name !== field.name);
      }
      return [createPivotField(field), ...prev];
    });
  }, []);

  const toggleRowField = useCallback((field: Field) => {
    if (colFieldNames.has(field.name)) return;
    setRowFields(prev => {
      const exists = prev.some(pivotField => pivotField.field.name === field.name);
      if (exists) {
        return prev.filter(pivotField => pivotField.field.name !== field.name);
      }
      if (prev.length >= MAX_PRIORITY_FIELDS) return prev;
      return [createPivotField(field), ...prev];
    });
  }, [colFieldNames]);

  const toggleColField = useCallback((field: Field) => {
    if (rowFieldNames.has(field.name)) return;
    setColFields(prev => {
      const exists = prev.some(pivotField => pivotField.field.name === field.name);
      if (exists) {
        return prev.filter(pivotField => pivotField.field.name !== field.name);
      }
      if (prev.length >= MAX_PRIORITY_FIELDS) return prev;
      return [createPivotField(field), ...prev];
    });
  }, [rowFieldNames]);

  const handleFilterChange = useCallback((fieldName: string, selectedValues: string[]) => {
    setFilterConfigs(prev => {
      const exists = prev.some(filter => filter.fieldName === fieldName);
      if (!exists) {
        return [...prev, { fieldName, selectedValues }];
      }
      return prev.map(filter =>
        filter.fieldName === fieldName
          ? { ...filter, selectedValues }
          : filter
      );
    });
  }, []);

  const applyTemplate = useCallback((rows: PivotField[], cols: PivotField[], values: PivotField[]) => {
    setRowFields(rows.slice(0, MAX_PRIORITY_FIELDS));
    setColFields(cols.slice(0, MAX_PRIORITY_FIELDS));
    setValueFields(values);
  }, []);

  const reorderFields = useCallback((zoneId: SpatialZoneId, activeName: string, overName: string) => {
    const update = (items: PivotField[]) => {
      const oldIndex = items.findIndex(item => item.field.name === activeName);
      const newIndex = items.findIndex(item => item.field.name === overName);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        return items;
      }
      return arrayMove(items, oldIndex, newIndex);
    };

    if (zoneId === 'rows') {
      setRowFields(update);
    }
    if (zoneId === 'columns') {
      setColFields(update);
    }
    if (zoneId === 'values') {
      setValueFields(update);
    }
  }, []);

  const moveFieldToIndex = useCallback((zoneId: SpatialZoneId, fieldName: string, targetIndex: number) => {
    const update = (items: PivotField[]) => {
      const oldIndex = items.findIndex(item => item.field.name === fieldName);
      if (oldIndex === -1) return items;

      const next = [...items];
      const [item] = next.splice(oldIndex, 1);
      const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
      next.splice(insertIndex, 0, item);
      return next;
    };

    if (zoneId === 'rows') {
      setRowFields(update);
    }
    if (zoneId === 'columns') {
      setColFields(update);
    }
    if (zoneId === 'values') {
      setValueFields(update);
    }
  }, []);

  const activateFieldAtIndex = useCallback((zoneId: SpatialZoneId, fieldName: string, targetIndex: number) => {
    if (zoneId === 'values') {
      const field = measures.find(f => f.name === fieldName);
      if (!field) return;
      setValueFields(prev => {
        if (prev.some(item => item.field.name === fieldName)) return prev;
        const next = [...prev];
        const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
        next.splice(insertIndex, 0, createPivotField(field));
        return next;
      });
      return;
    }

    const field = dimensions.find(f => f.name === fieldName);
    if (!field) return;

    if (zoneId === 'rows') {
      if (colFieldNames.has(fieldName)) return;
      setRowFields(prev => {
        if (prev.some(item => item.field.name === fieldName) || prev.length >= MAX_PRIORITY_FIELDS) return prev;
        const next = [...prev];
        const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
        next.splice(insertIndex, 0, createPivotField(field));
        return next;
      });
    } else if (zoneId === 'columns') {
      if (rowFieldNames.has(fieldName)) return;
      setColFields(prev => {
        if (prev.some(item => item.field.name === fieldName) || prev.length >= MAX_PRIORITY_FIELDS) return prev;
        const next = [...prev];
        const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
        next.splice(insertIndex, 0, createPivotField(field));
        return next;
      });
    }
  }, [measures, dimensions, colFieldNames, rowFieldNames]);

  const transferField = useCallback((fieldName: string, fromZone: SpatialZoneId, toZone: SpatialZoneId, targetIndex = 0) => {
    const findField = (name: string): Field | undefined => {
      return fields.find(f => f.name === name);
    };

    const field = findField(fieldName);
    if (!field) return;
    if (toZone === 'rows' && fromZone !== 'columns' && colFieldNames.has(fieldName)) return;
    if (toZone === 'columns' && fromZone !== 'rows' && rowFieldNames.has(fieldName)) return;
    if (toZone === 'rows' && rowFields.length >= MAX_PRIORITY_FIELDS) return;
    if (toZone === 'columns' && colFields.length >= MAX_PRIORITY_FIELDS) return;

    if (fromZone === 'rows') {
      setRowFields(prev => prev.filter(f => f.field.name !== fieldName));
    } else if (fromZone === 'columns') {
      setColFields(prev => prev.filter(f => f.field.name !== fieldName));
    }

    if (toZone === 'rows') {
      setRowFields(prev => {
        const next = prev.filter(f => f.field.name !== fieldName);
        const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
        next.splice(insertIndex, 0, createPivotField(field));
        return next;
      });
    } else if (toZone === 'columns') {
      setColFields(prev => {
        const next = prev.filter(f => f.field.name !== fieldName);
        const insertIndex = Math.min(Math.max(targetIndex, 0), next.length);
        next.splice(insertIndex, 0, createPivotField(field));
        return next;
      });
    }
  }, [fields, rowFields.length, colFields.length, rowFieldNames, colFieldNames]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeData = event.active.data.current;
    const fieldName = activeData?.fieldName as string | undefined;
    const zoneId = activeData?.zoneId as SpatialZoneId | undefined;
    if (!fieldName || !zoneId) return;

    const field = fields.find(item => item.name === fieldName);
    setActiveDragField({
      name: fieldName,
      zoneId,
      isCalculated: Boolean(field?.isCalculated),
      isMapped: Boolean(field?.isMapped),
    });
  }, [fields]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragField(null);
    const { active, over } = event;
    const activeData = active.data.current;

    if (!over || !activeData) return;

    const overId = over.id as string;
    const activeFieldType = activeData.fieldType as 'dimension' | 'metric';
    const activeZoneId = activeData.zoneId as SpatialZoneId;
    const activeFieldName = activeData.fieldName as string;
    const overData = over.data.current;

    const extractZoneId = (id: string): SpatialZoneId | null => {
      if (id.startsWith('values')) return 'values';
      if (id.startsWith('rows')) return 'rows';
      if (id.startsWith('columns')) return 'columns';
      if (id.includes('::')) {
        return id.split('::')[0] as SpatialZoneId;
      }
      return null;
    };

    const isCrossZone = (srcZone: SpatialZoneId, targetId: string): boolean => {
      const targetZone = extractZoneId(targetId);
      return targetZone !== null && srcZone !== targetZone;
    };

    const toggleFieldForZone = (zoneId: SpatialZoneId, fieldName: string) => {
      if (zoneId === 'values') {
        const field = measures.find(f => f.name === fieldName);
        if (field) toggleValueField(field);
        return;
      }

      const field = dimensions.find(f => f.name === fieldName);
      if (!field) return;

      if (zoneId === 'rows') {
        toggleRowField(field);
      } else if (zoneId === 'columns') {
        toggleColField(field);
      }
    };

    if (overData?.type === 'priority-slot') {
      const targetZoneId = overData.zoneId as SpatialZoneId;
      const targetIndex = overData.slotIndex as number;
      const isActive = activeData.isActive as boolean;

      if (activeZoneId !== targetZoneId) {
        if (canDropToZone(activeFieldType, targetZoneId)) {
          transferField(activeFieldName, activeZoneId, targetZoneId, targetIndex);
        }
        return;
      }

      if (isActive) {
        moveFieldToIndex(activeZoneId, activeFieldName, targetIndex);
      } else {
        activateFieldAtIndex(activeZoneId, activeFieldName, targetIndex);
      }
      return;
    }

    if (isCrossZone(activeZoneId, overId)) {
      const targetZoneId = extractZoneId(overId);
      if (targetZoneId && canDropToZone(activeFieldType, targetZoneId)) {
        transferField(activeFieldName, activeZoneId, targetZoneId);
      }
      return;
    }

    if (overData?.type === 'active-zone') {
      const isActive = activeData.isActive as boolean;
      if (!isActive) {
        toggleFieldForZone(activeZoneId, activeFieldName);
      }
      return;
    }

    if (overData?.type === 'inactive-zone') {
      const isActive = activeData.isActive as boolean;
      if (isActive) {
        toggleFieldForZone(activeZoneId, activeFieldName);
      }
      return;
    }

    if (overData?.type === 'spatial-capsule') {
      const overZoneId = overData.zoneId as SpatialZoneId;
      if (activeZoneId !== overZoneId) return;

      const isActive = activeData.isActive as boolean;
      const isOverActive = overData.isActive as boolean;

      if (isActive && isOverActive) {
        reorderFields(activeZoneId, activeFieldName, overData.fieldName);
      } else if (isActive !== isOverActive) {
        toggleFieldForZone(activeZoneId, activeFieldName);
      }
    }
  }, [
    reorderFields,
    moveFieldToIndex,
    activateFieldAtIndex,
    transferField,
    measures,
    dimensions,
    toggleValueField,
    toggleRowField,
    toggleColField,
  ]);

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragField(null)}
    >
      <div className="app">
        <header className="app-header">
          <h1><BarChart3 size={18} style={{ marginRight: 6, display: 'inline', verticalAlign: 'middle' }} /> 数据透视表分析工具</h1>
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
              onDatasetDelete={handleDatasetDelete}
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
            {activeDragField.isMapped && <span className="drag-overlay-badge"><Link2 size={12} /></span>}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default App;
