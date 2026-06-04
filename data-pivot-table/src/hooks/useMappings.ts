import { useCallback, useEffect, useRef, useState } from 'react';
import { storageService } from '../services/storage';
import type { DataRow, ScenarioMapping } from '../types';
import type { ScenarioConfig, StoredMapping } from '../types/storage';
import { applyScenarioMapping } from '../utils/scenarioMapper';
import { generateId } from '../utils/storageUtils';

export function useMappings() {
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
    loadMappingsRef.current();
  }, []);

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
    },
    []
  );

  // 映射上传
  const handleMappingUpload = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const lines = text.split('\n').filter((line) => line.trim());

        if (lines.length < 2) {
          alert('导入失败：CSV 文件至少需要包含表头和一行数据');
          return;
        }

        // 解析表头：第一行第一个为空或"目标场景"，后面的是应用标识
        const headers = lines[0].split(',').map((h) => h.trim());
        const appCodes = headers.slice(1); // 从第2列开始是应用标识

        if (appCodes.length === 0) {
          alert('导入失败：CSV 文件格式错误，至少需要一个应用标识');
          return;
        }

        // 解析数据行：2D格式转换为ScenarioConfig
        const scenarioConfigs: ScenarioConfig[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(',').map((c) => c.trim());
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
        scenarioConfigs.forEach((config) => {
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
    async (id: string, updates: Partial<StoredMapping>) => {
      await storageService.updateMapping(id, updates);
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
