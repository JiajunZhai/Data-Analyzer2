import { useCallback, useEffect, useRef, useState } from 'react';
import { storageService } from '../services/storage';
import type { StorageQuota, StoredDataset } from '../types/storage';
import { STORAGE_LIMITS } from '../utils/storageUtils';

export function useDatasetManager() {
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [currentDatasetId, setCurrentDatasetId] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<StoredDataset[]>([]);
  const [storageQuota, setStorageQuota] = useState<StorageQuota>({
    used: 0,
    limit: STORAGE_LIMITS.MAX_STORAGE_BYTES,
    datasetCount: 0,
    datasetLimit: STORAGE_LIMITS.MAX_DATASETS,
  });

  const loadDatasetsRef = useRef<() => Promise<void>>(() => Promise.resolve());

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

  // 更新 ref
  useEffect(() => {
    loadDatasetsRef.current = loadDatasets;
  }, [loadDatasets]);

  // 初始化存储
  useEffect(() => {
    storageService.init().then(async () => {
      setIsStorageReady(true);
      await loadDatasetsRef.current();
    });
  }, []);

  // 数据集重命名
  const handleDatasetRename = useCallback(
    async (id: string, newName: string) => {
      await storageService.renameDataset(id, newName);
      await loadDatasets();
    },
    [loadDatasets]
  );

  // 数据集删除
  const handleDatasetDelete = useCallback(
    async (id: string) => {
      await storageService.deleteDataset(id);
      await loadDatasets();
    },
    [loadDatasets]
  );

  return {
    isStorageReady,
    currentDatasetId,
    setCurrentDatasetId,
    datasets,
    setDatasets,
    storageQuota,
    loadDatasets,
    handleDatasetRename,
    handleDatasetDelete,
  };
}
