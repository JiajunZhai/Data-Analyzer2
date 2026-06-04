import { useCallback, useState } from 'react';
import { storageService } from '../services/storage';
import type { FilterConfig, PivotField } from '../types';
import type { StoredConfig } from '../types/storage';

const MAX_PRIORITY_FIELDS = 5;

export function useConfigs() {
  const [savedConfigs, setSavedConfigs] = useState<StoredConfig[]>([]);

  // 加载配置列表
  const loadConfigs = useCallback(async (datasetId: string) => {
    try {
      const configs = await storageService.getConfigsByDataset(datasetId);
      setSavedConfigs(configs);
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  }, []);

  // 配置保存
  const handleConfigSave = useCallback(
    async (
      name: string,
      currentDatasetId: string | null,
      rowFields: PivotField[],
      colFields: PivotField[],
      valueFields: PivotField[],
      filterConfigs: FilterConfig[]
    ) => {
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
    },
    []
  );

  // 配置加载
  const handleConfigLoad = useCallback(
    async (
      id: string,
      setRowFields: (fields: PivotField[]) => void,
      setColFields: (fields: PivotField[]) => void,
      setValueFields: (fields: PivotField[]) => void,
      setFilterConfigs: (configs: FilterConfig[]) => void
    ) => {
      const config = await storageService.getConfig(id);
      if (config) {
        setRowFields(config.rowFields.slice(0, MAX_PRIORITY_FIELDS));
        setColFields(config.colFields.slice(0, MAX_PRIORITY_FIELDS));
        setValueFields(config.valueFields);
        setFilterConfigs(config.filterConfigs);
      }
    },
    []
  );

  // 配置删除
  const handleConfigDelete = useCallback(async (id: string, currentDatasetId: string | null) => {
    await storageService.deleteConfig(id);
    if (currentDatasetId) {
      const configs = await storageService.getConfigsByDataset(currentDatasetId);
      setSavedConfigs(configs);
    }
  }, []);

  // 配置重命名
  const handleConfigRename = useCallback(
    async (id: string, newName: string, currentDatasetId: string | null) => {
      await storageService.renameConfig(id, newName);
      if (currentDatasetId) {
        const configs = await storageService.getConfigsByDataset(currentDatasetId);
        setSavedConfigs(configs);
      }
    },
    []
  );

  return {
    savedConfigs,
    setSavedConfigs,
    loadConfigs,
    handleConfigSave,
    handleConfigLoad,
    handleConfigDelete,
    handleConfigRename,
  };
}
