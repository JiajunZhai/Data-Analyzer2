import { type IDBPDatabase, openDB } from 'idb';
import type {
  StorageQuota,
  StoredConfig,
  StoredDataset,
  StoredSQLTemplate,
  UserPreferences,
} from '../types/storage';
import { estimateDataSize, generateId, STORAGE_LIMITS } from '../utils/storageUtils';

const DB_NAME = 'data-pivot-table';
const DB_VERSION = 6;

interface PivotTableDB {
  datasets: {
    key: string;
    value: StoredDataset;
    indexes: { name: string; createdAt: number };
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
  sqlTemplates: {
    key: string;
    value: StoredSQLTemplate;
    indexes: { category: string; name: string };
  };
}

class StorageService {
  private db: IDBPDatabase<PivotTableDB> | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    this.db = await openDB<PivotTableDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('datasets')) {
          const datasetStore = db.createObjectStore('datasets', { keyPath: 'id' });
          datasetStore.createIndex('name', 'name');
          datasetStore.createIndex('createdAt', 'createdAt');
        }

        if (!db.objectStoreNames.contains('configs')) {
          const configStore = db.createObjectStore('configs', { keyPath: 'id' });
          configStore.createIndex('datasetId', 'datasetId');
          configStore.createIndex('name', 'name');
        }

        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('sqlTemplates')) {
          const sqlStore = db.createObjectStore('sqlTemplates', { keyPath: 'id' });
          sqlStore.createIndex('category', 'category');
          sqlStore.createIndex('name', 'name');
        }

        // 清理已移除的 anomalies 表
        if (db.objectStoreNames.contains('anomalies')) {
          db.deleteObjectStore('anomalies');
        }

        // 删除旧的 mappings 表
        if (db.objectStoreNames.contains('mappings')) {
          db.deleteObjectStore('mappings');
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

    const used = datasets.reduce((sum, ds) => {
      return sum + estimateDataSize(ds.data);
    }, 0);

    return {
      used,
      limit: STORAGE_LIMITS.MAX_STORAGE_BYTES,
      datasetCount: datasets.length,
      datasetLimit: STORAGE_LIMITS.MAX_DATASETS,
    };
  }

  // ============ SQL 模板操作 ============

  async getAllSQLTemplates(): Promise<StoredSQLTemplate[]> {
    const db = this.getDb();
    return await db.getAll('sqlTemplates');
  }

  async getSQLTemplatesByCategory(category: string): Promise<StoredSQLTemplate[]> {
    const db = this.getDb();
    return await db.getAllFromIndex('sqlTemplates', 'category', category);
  }

  async saveSQLTemplate(
    template: Omit<StoredSQLTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const db = this.getDb();
    const id = generateId();
    const now = Date.now();

    await db.put('sqlTemplates', {
      ...template,
      id,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  }

  async updateSQLTemplate(id: string, updates: Partial<StoredSQLTemplate>): Promise<void> {
    const db = this.getDb();
    const template = await db.get('sqlTemplates', id);
    if (!template) {
      throw new Error('SQL template not found');
    }

    await db.put('sqlTemplates', {
      ...template,
      ...updates,
      updatedAt: Date.now(),
    });
  }

  async deleteSQLTemplate(id: string): Promise<void> {
    const db = this.getDb();
    await db.delete('sqlTemplates', id);
  }

  async exportSQLTemplates(): Promise<string> {
    const templates = await this.getAllSQLTemplates();
    return JSON.stringify(templates, null, 2);
  }

  async importSQLTemplates(json: string): Promise<number> {
    const db = this.getDb();
    const templates: StoredSQLTemplate[] = JSON.parse(json);
    let count = 0;

    for (const template of templates) {
      if (template.name && template.sql && template.category) {
        await db.put('sqlTemplates', {
          ...template,
          id: template.id || generateId(),
          createdAt: template.createdAt || Date.now(),
          updatedAt: Date.now(),
        });
        count++;
      }
    }

    return count;
  }
}

export const storageService = new StorageService();
