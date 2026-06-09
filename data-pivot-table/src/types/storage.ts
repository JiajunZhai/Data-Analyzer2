import type { DataRow, Field, FilterConfig, PivotField } from './index';

export interface StoredDataset {
  id: string;
  name: string;
  fileName: string;
  createdAt: number;
  updatedAt: number;
  rowCount: number;
  fieldCount: {
    dimensions: number;
    measures: number;
  };
  fields: Field[];
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
