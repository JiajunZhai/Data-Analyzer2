import { type IDBPDatabase, openDB } from 'idb';
import type {
  StorageQuota,
  StoredConfig,
  StoredDataset,
  StoredDatasetMeta,
  StoredSQLTemplate,
  UserPreferences,
} from '../types/storage';
import { estimateDataSize, formatBytes, generateId, STORAGE_LIMITS } from '../utils/storageUtils';

const DB_NAME = 'data-pivot-table';
const DB_VERSION = 7;

type StoredDatasetRecord = Omit<StoredDatasetMeta, 'estimatedSize'> & {
  estimatedSize?: number;
  data?: StoredDataset['data'];
};

type DatasetDataRecord = {
  datasetId: string;
  data: StoredDataset['data'];
};

type SaveDatasetInput = Omit<StoredDataset, 'id' | 'createdAt' | 'updatedAt' | 'estimatedSize'> & {
  estimatedSize?: number;
};

interface PivotTableDB {
  datasets: {
    key: string;
    value: StoredDatasetRecord;
    indexes: { name: string; createdAt: number };
  };
  datasetData: {
    key: string;
    value: DatasetDataRecord;
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

        if (!db.objectStoreNames.contains('datasetData')) {
          db.createObjectStore('datasetData', { keyPath: 'datasetId' });
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

    await this.migrateLegacyDatasetRows();
  }

  private getDb(): IDBPDatabase<PivotTableDB> {
    if (!this.db) {
      throw new Error('Storage not initialized');
    }
    return this.db;
  }

  // ============ 数据集操作 ============

  private toDatasetMeta(record: StoredDatasetRecord): StoredDatasetMeta {
    const { data, ...meta } = record;
    return {
      ...meta,
      estimatedSize: meta.estimatedSize ?? (Array.isArray(data) ? estimateDataSize(data) : 0),
    };
  }

  private async migrateLegacyDatasetRows(): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(['datasets', 'datasetData'], 'readwrite');
    const datasetStore = tx.objectStore('datasets');
    const dataStore = tx.objectStore('datasetData');

    let cursor = await datasetStore.openCursor();
    while (cursor) {
      const record = cursor.value;
      if (Array.isArray(record.data)) {
        const { data, ...meta } = record;
        const estimatedSize = meta.estimatedSize ?? estimateDataSize(data);
        await dataStore.put({ datasetId: record.id, data });
        await cursor.update({ ...meta, estimatedSize });
      }
      cursor = await cursor.continue();
    }

    await tx.done;
  }

  private async getUsedStorageBytes(excludeDatasetId?: string): Promise<number> {
    const datasets = await this.getAllDatasetMetas();
    return datasets.reduce((sum, dataset) => {
      if (dataset.id === excludeDatasetId) return sum;
      return sum + dataset.estimatedSize;
    }, 0);
  }

  private async ensureDatasetFits(estimatedSize: number, excludeDatasetId?: string): Promise<void> {
    const used = await this.getUsedStorageBytes(excludeDatasetId);
    const nextUsed = used + estimatedSize;
    if (nextUsed > STORAGE_LIMITS.MAX_STORAGE_BYTES) {
      throw new Error(
        `数据源存储空间不足：当前已用 ${formatBytes(used)}，本次约 ${formatBytes(
          estimatedSize
        )}，上限 ${formatBytes(STORAGE_LIMITS.MAX_STORAGE_BYTES)}`
      );
    }
  }

  async saveDataset(dataset: SaveDatasetInput): Promise<string> {
    const db = this.getDb();
    const count = await db.count('datasets');
    if (count >= STORAGE_LIMITS.MAX_DATASETS) {
      throw new Error(`数据集数量已达上限 (${STORAGE_LIMITS.MAX_DATASETS})`);
    }

    const id = generateId();
    const now = Date.now();
    const estimatedSize = dataset.estimatedSize ?? estimateDataSize(dataset.data);
    await this.ensureDatasetFits(estimatedSize);

    const { data, ...metaInput } = dataset;
    const meta: StoredDatasetMeta = {
      ...metaInput,
      id,
      createdAt: now,
      updatedAt: now,
      estimatedSize,
    };

    const tx = db.transaction(['datasets', 'datasetData'], 'readwrite');
    await Promise.all([
      tx.objectStore('datasets').put(meta),
      tx.objectStore('datasetData').put({ datasetId: id, data }),
    ]);
    await tx.done;

    return id;
  }

  async updateDataset(id: string, updates: Partial<StoredDataset>): Promise<void> {
    const db = this.getDb();
    const record = await db.get('datasets', id);
    if (!record) {
      throw new Error('Dataset not found');
    }

    const { data, ...metaUpdates } = updates;
    const nextMeta: StoredDatasetMeta = {
      ...this.toDatasetMeta(record),
      ...metaUpdates,
      updatedAt: Date.now(),
    };

    if (data !== undefined) {
      nextMeta.estimatedSize = updates.estimatedSize ?? estimateDataSize(data);
      nextMeta.rowCount = updates.rowCount ?? data.length;
      await this.ensureDatasetFits(nextMeta.estimatedSize, id);
    } else if (updates.estimatedSize !== undefined) {
      await this.ensureDatasetFits(updates.estimatedSize, id);
    }

    const tx = db.transaction(['datasets', 'datasetData'], 'readwrite');
    await tx.objectStore('datasets').put(nextMeta);
    if (data !== undefined) {
      await tx.objectStore('datasetData').put({ datasetId: id, data });
    }
    await tx.done;
  }

  async getAllDatasets(): Promise<StoredDataset[]> {
    const datasets = await Promise.all(
      (await this.getAllDatasetMetas()).map((dataset) => this.getDataset(dataset.id))
    );
    return datasets.filter((dataset): dataset is StoredDataset => dataset !== null);
  }

  async getAllDatasetMetas(): Promise<StoredDatasetMeta[]> {
    const db = this.getDb();
    const records = await db.getAll('datasets');
    return records.map((record) => this.toDatasetMeta(record));
  }

  async getDataset(id: string): Promise<StoredDataset | null> {
    const db = this.getDb();
    const record = await db.get('datasets', id);
    if (!record) return null;

    const meta = this.toDatasetMeta(record);
    if (Array.isArray(record.data)) {
      return { ...meta, data: record.data };
    }

    const dataRecord = await db.get('datasetData', id);
    return { ...meta, data: dataRecord?.data ?? [] };
  }

  async deleteDataset(id: string): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(['datasets', 'datasetData'], 'readwrite');
    await Promise.all([
      tx.objectStore('datasets').delete(id),
      tx.objectStore('datasetData').delete(id),
    ]);
    await tx.done;
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
    const datasets = await this.getAllDatasetMetas();

    const used = datasets.reduce((sum, ds) => {
      return sum + ds.estimatedSize;
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
