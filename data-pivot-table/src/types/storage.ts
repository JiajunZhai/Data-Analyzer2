import type { DataRow, Field, FilterConfig, PivotField } from './index';

export interface StoredDatasetMeta {
  id: string;
  name: string;
  fileName: string;
  createdAt: number;
  updatedAt: number;
  rowCount: number;
  estimatedSize: number;
  fieldCount: {
    dimensions: number;
    measures: number;
  };
  fields: Field[];
}

export interface StoredDataset extends StoredDatasetMeta {
  data: DataRow[];
}

export interface StoredConfig {
  id: string;
  datasetId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  rowFields: PivotField[];
  colFields: PivotField[];
  valueFields: PivotField[];
  filterConfigs: FilterConfig[];
}

export interface UserPreferences {
  lastDatasetId?: string;
  defaultRowFields?: string[];
  defaultColFields?: string[];
  defaultValueFields?: string[];
}

export interface StorageQuota {
  used: number;
  limit: number;
  datasetCount: number;
  datasetLimit: number;
}

export interface StoredSQLTemplate {
  id: string;
  name: string;
  category: string;
  sql: string;
  createdAt: number;
  updatedAt: number;
}
