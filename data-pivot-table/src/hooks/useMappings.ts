import { useCallback, useEffect, useRef, useState } from 'react';
import { storageService } from '../services/storage';
import type { DataRow, ScenarioMapping } from '../types';
import type { ScenarioConfig, StoredMapping } from '../types/storage';
import { parseMappingCSV } from '../utils/fileParser';
import {
  applyScenarioMapping,
  buildLookupMapFromConfigs,
  calculateScenarioMatchStats,
  scenarioMappingToRecord,
} from '../utils/scenarioMapper';
import { generateId } from '../utils/storageUtils';

function buildStoredScenarioMapping(mapping: StoredMapping): ScenarioMapping {
  return buildLookupMapFromConfigs(mapping.scenarioConfigs, mapping.appCodes);
}

async function calculateMappedRowsForDataset(
  mapping: ScenarioMapping,
  datasetId?: string | null
): Promise<number> {
  if (!datasetId) return 0;

  const dataset = await storageService.getDataset(datasetId);
  if (!dataset) return 0;

  return calculateScenarioMatchStats(dataset.data, mapping).mappedRowCount;
}

export function useMappings(isStorageReady: boolean) {
  const [mappings, setMappings] = useState<StoredMapping[]>([]);
  const [activeMappingId, setActiveMappingId] = useState<string | undefined>();

  const loadMappingsRef = useRef<() => Promise<void>>(() => Promise.resolve());

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
    loadMappingsRef.current = loadMappings;
  }, [loadMappings]);

  // 初始化时加载映射
  useEffect(() => {
    if (isStorageReady) {
      loadMappingsRef.current();
    }
  }, [isStorageReady]);

  // 映射选择
  const handleMappingSelect = useCallback(
    async (
      mappingId: string | null,
      currentDatasetId: string | null,
      setData: (data: DataRow[]) => void,
      loadDatasets: () => Promise<void>
    ) => {
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
          const scenarioMapping = buildStoredScenarioMapping(mapping);
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
        }
      } else {
        // 移除映射，恢复原始数据
        setData(dataset.data);
      }

      await loadMappings();
      await loadDatasets();
    },
    [loadMappings]
  );

  // 映射上传
  const handleMappingUpload = useCallback(
    async (file: File, currentDatasetId?: string | null) => {
      try {
        const { headers, rows } = await parseMappingCSV(file);
        const appCodes = headers
          .slice(1)
          .map((header) => header.trim())
          .filter(Boolean);

        if (appCodes.length === 0) {
          alert('导入失败：CSV 文件格式错误，至少需要一个应用标识');
          return;
        }

        // 解析数据行：2D格式转换为ScenarioConfig
        const scenarioConfigs: ScenarioConfig[] = [];

        for (let i = 0; i < rows.length; i++) {
          const cells = rows[i];
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

        const scenarioMapping = buildLookupMapFromConfigs(scenarioConfigs, appCodes);
        const mappedRowCount = await calculateMappedRowsForDataset(
          scenarioMapping,
          currentDatasetId
        );

        // 保存映射
        await storageService.saveMapping({
          name: file.name.replace('.csv', ''),
          fileName: file.name,
          scenarioCount: scenarioMapping.scenarioCount,
          mappedRowCount,
          lookupMap: scenarioMappingToRecord(scenarioMapping),
          appCodes: scenarioMapping.appCodes,
          scenarioConfigs,
        });

        await loadMappings();
      } catch (error) {
        alert(error instanceof Error ? error.message : '导入失败');
      }
    },
    [loadMappings]
  );

  // 映射导出
  const handleMappingExport = useCallback(async (mapping: StoredMapping) => {
    // 获取所有应用标识
    const appCodes = [...new Set(mapping.scenarioConfigs.map((c) => c.appCode))];

    // 按目标场景分组
    const groupedByTarget = new Map<string, Record<string, string>>();
    mapping.scenarioConfigs.forEach((config) => {
      if (!groupedByTarget.has(config.targetScenario)) {
        groupedByTarget.set(config.targetScenario, {});
      }
      groupedByTarget.get(config.targetScenario)![config.appCode] = config.originalScenario;
    });

    // 生成CSV - 2D格式
    const header = ['目标场景', ...appCodes].join(',');
    const rows = Array.from(groupedByTarget.entries()).map(([target, appMap]) => {
      const cells = [target, ...appCodes.map((code) => appMap[code] || '')];
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

  // 映射删除
  const handleMappingDelete = useCallback(
    async (id: string) => {
      await storageService.deleteMapping(id);
      await loadMappings();
    },
    [loadMappings]
  );

  // 映射更新
  const handleMappingUpdate = useCallback(
    async (
      id: string,
      updates: Partial<StoredMapping>,
      currentDatasetId?: string | null,
      activeMappingIdForDataset?: string,
      setData?: (data: DataRow[]) => void,
      loadDatasets?: () => Promise<void>
    ) => {
      const existingMapping = await storageService.getMapping(id);
      if (!existingMapping) return;

      const nextMapping: StoredMapping = { ...existingMapping, ...updates };
      const scenarioMapping = buildStoredScenarioMapping(nextMapping);
      const mappedRowCount = currentDatasetId
        ? await calculateMappedRowsForDataset(scenarioMapping, currentDatasetId)
        : existingMapping.mappedRowCount;

      await storageService.updateMapping(id, {
        ...updates,
        appCodes: scenarioMapping.appCodes,
        scenarioCount: scenarioMapping.scenarioCount,
        mappedRowCount,
        lookupMap: scenarioMappingToRecord(scenarioMapping),
      });

      if (id === activeMappingIdForDataset && currentDatasetId && setData) {
        const dataset = await storageService.getDataset(currentDatasetId);
        if (dataset) {
          setData(applyScenarioMapping(dataset.data, scenarioMapping));
        }
      }

      if (loadDatasets) {
        await loadDatasets();
      }

      await loadMappings();
    },
    [loadMappings]
  );

  return {
    mappings,
    activeMappingId,
    setActiveMappingId,
    loadMappings,
    handleMappingSelect,
    handleMappingUpload,
    handleMappingExport,
    handleMappingDelete,
    handleMappingUpdate,
  };
}
