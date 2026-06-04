import { type IDBPDatabase, openDB } from 'idb';
import type {
  StorageQuota,
  StoredConfig,
  StoredDataset,
  StoredMapping,
  UserPreferences,
} from '../types/storage';
import { estimateDataSize, generateId, STORAGE_LIMITS } from '../utils/storageUtils';

const DB_NAME = 'data-pivot-table';
const DB_VERSION = 2;

interface PivotTableDB {
  datasets: {
    key: string;
    value: StoredDataset;
    indexes: { name: string; createdAt: number };
  };
  mappings: {
    key: string;
    value: StoredMapping;
    indexes: { name: string; createdAt: number; datasetId: string };
  };
  configs: {
    key: string;
    value: StoredConfig;
    indexes: { datasetId: string; name: string };
  };
  preferences: {
    key: string;
    value: UserPreferences;
  };
}

class StorageService {
  private db: IDBPDatabase<PivotTableDB> | null = null;

  async init(): Promise<void> {
    this.db = await openDB<PivotTableDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('datasets')) {
          const datasetStore = db.createObjectStore('datasets', { keyPath: 'id' });
          datasetStore.createIndex('name', 'name');
          datasetStore.createIndex('createdAt', 'createdAt');
        }

        if (!db.objectStoreNames.contains('mappings')) {
          const mappingStore = db.createObjectStore('mappings', { keyPath: 'id' });
          mappingStore.createIndex('name', 'name');
          mappingStore.createIndex('createdAt', 'createdAt');
        }

        if (!db.objectStoreNames.contains('configs')) {
          const configStore = db.createObjectStore('configs', { keyPath: 'id' });
          configStore.createIndex('datasetId', 'datasetId');
          configStore.createIndex('name', 'name');
        }

        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'id' });
        }
      },
    });
  }

  private getDb(): IDBPDatabase<PivotTableDB> {
    if (!this.db) {
      throw new Error('Storage not initialized');
    }
    return this.db;
  }

  // ============ 数据集操作 ============

  async saveDataset(
    dataset: Omit<StoredDataset, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const db = this.getDb();
    const count = await db.count('datasets');
    if (count >= STORAGE_LIMITS.MAX_DATASETS) {
      throw new Error(`数据集数量已达上限 (${STORAGE_LIMITS.MAX_DATASETS})`);
    }

    const id = generateId();
    const now = Date.now();

    await db.put('datasets', {
      ...dataset,
      id,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  async updateDataset(id: string, updates: Partial<StoredDataset>): Promise<void> {
    const db = this.getDb();
    const dataset = await db.get('datasets', id);
    if (!dataset) {
      throw new Error('Dataset not found');
    }

    await db.put('datasets', {
      ...dataset,
      ...updates,
      updatedAt: Date.now(),
    });
  }

  async getAllDatasets(): Promise<StoredDataset[]> {
    const db = this.getDb();
    return await db.getAll('datasets');
  }

  async getDataset(id: string): Promise<StoredDataset | null> {
    const db = this.getDb();
    return (await db.get('datasets', id)) ?? null;
  }

  async deleteDataset(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete('datasets', id);
    await this.deleteConfigsByDataset(id);
  }

  async renameDataset(id: string, newName: string): Promise<void> {
    await this.updateDataset(id, { name: newName });
  }

  async getDatasetCount(): Promise<number> {
    const db = this.getDb();
    return await db.count('datasets');
  }

  // ============ 映射操作（全局） ============

  async saveMapping(
    mapping: Omit<StoredMapping, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const db = this.getDb();
    const count = await db.count('mappings');
    if (count >= STORAGE_LIMITS.MAX_MAPPINGS) {
      throw new Error(`映射数量已达上限 (${STORAGE_LIMITS.MAX_MAPPINGS})`);
    }

    const id = generateId();
    const now = Date.now();

    await db.put('mappings', {
      ...mapping,
      id,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  async getAllMappings(): Promise<StoredMapping[]> {
    const db = this.getDb();
    return await db.getAll('mappings');
  }

  async getMapping(id: string): Promise<StoredMapping | null> {
    const db = this.getDb();
    return (await db.get('mappings', id)) ?? null;
  }

  async updateMapping(id: string, updates: Partial<StoredMapping>): Promise<void> {
    const db = this.getDb();
    const mapping = await db.get('mappings', id);
    if (!mapping) {
      throw new Error('Mapping not found');
    }

    await db.put('mappings', {
      ...mapping,
      ...updates,
      updatedAt: Date.now(),
    });
  }

  async deleteMapping(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete('mappings', id);

    // 清除使用该映射的数据源的 activeMappingId
    const datasets = await db.getAll('datasets');
    for (const ds of datasets) {
      if (ds.activeMappingId === id) {
        await db.put('datasets', { ...ds, activeMappingId: undefined, updatedAt: Date.now() });
      }
    }
  }

  async renameMapping(id: string, newName: string): Promise<void> {
    await this.updateMapping(id, { name: newName });
  }

  async getMappingCount(): Promise<number> {
    const db = this.getDb();
    return await db.count('mappings');
  }

  // ============ 数据源与映射关联 ============

  async setActiveMapping(datasetId: string, mappingId: string | null): Promise<void> {
    const db = this.getDb();
    const dataset = await db.get('datasets', datasetId);
    if (dataset) {
      await db.put('datasets', {
        ...dataset,
        activeMappingId: mappingId ?? undefined,
        updatedAt: Date.now(),
      });
    }
  }

  async getActiveMapping(datasetId: string): Promise<StoredMapping | null> {
    const db = this.getDb();
    const dataset = await db.get('datasets', datasetId);
    if (!dataset?.activeMappingId) return null;
    return (await db.get('mappings', dataset.activeMappingId)) ?? null;
  }

  // ============ 配置操作 ============

  async saveConfig(config: Omit<StoredConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const db = this.getDb();
    const configs = await db.getAllFromIndex('configs', 'datasetId', config.datasetId);
    if (configs.length >= STORAGE_LIMITS.MAX_CONFIGS_PER_DATASET) {
      throw new Error(`配置数量已达上限 (${STORAGE_LIMITS.MAX_CONFIGS_PER_DATASET})`);
    }

    const id = generateId();
    const now = Date.now();

    await db.put('configs', {
      ...config,
      id,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  async getConfigsByDataset(datasetId: string): Promise<StoredConfig[]> {
    const db = this.getDb();
    return await db.getAllFromIndex('configs', 'datasetId', datasetId);
  }

  async getConfig(id: string): Promise<StoredConfig | null> {
    const db = this.getDb();
    return (await db.get('configs', id)) ?? null;
  }

  async deleteConfig(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete('configs', id);
  }

  async deleteConfigsByDataset(datasetId: string): Promise<void> {
    const db = this.getDb();
    const configs = await db.getAllFromIndex('configs', 'datasetId', datasetId);
    for (const config of configs) {
      await db.delete('configs', config.id);
    }
  }

  async renameConfig(id: string, newName: string): Promise<void> {
    const db = this.getDb();
    const config = await db.get('configs', id);
    if (config) {
      await db.put('configs', {
        ...config,
        name: newName,
        updatedAt: Date.now(),
      });
    }
  }

  // ============ 用户偏好 ============

  async saveUserPreferences(prefs: UserPreferences): Promise<void> {
    const db = this.getDb();
    await db.put('preferences', { ...prefs, id: 'default' });
  }

  async getUserPreferences(): Promise<UserPreferences> {
    const db = this.getDb();
    const prefs = await db.get('preferences', 'default');
    return prefs ?? {};
  }

  // ============ 存储配额 ============

  async getStorageQuota(): Promise<StorageQuota> {
    const datasets = await this.getAllDatasets();
    const mappings = await this.getAllMappings();

    const used = datasets.reduce((sum, ds) => {
      return sum + estimateDataSize(ds.data);
    }, 0);

    return {
      used,
      limit: STORAGE_LIMITS.MAX_STORAGE_BYTES,
      datasetCount: datasets.length,
      datasetLimit: STORAGE_LIMITS.MAX_DATASETS,
      mappingCount: mappings.length,
      mappingLimit: STORAGE_LIMITS.MAX_MAPPINGS,
    };
  }
}

export const storageService = new StorageService();
