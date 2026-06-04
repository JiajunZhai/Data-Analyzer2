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
  activeMappingId?: string;
}

export interface ScenarioConfig {
  id: string;
  appCode: string;
  originalScenario: string;
  targetScenario: string;
}

export interface StoredMapping {
  id: string;
  name: string;
  fileName: string;
  createdAt: number;
  updatedAt: number;
  scenarioCount: number;
  mappedRowCount: number;
  lookupMap: Record<string, string>;
  appCodes: string[];
  scenarioConfigs: ScenarioConfig[];
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
  lastMappingId?: string;
  defaultRowFields?: string[];
  defaultColFields?: string[];
  defaultValueFields?: string[];
}

export interface StorageQuota {
  used: number;
  limit: number;
  datasetCount: number;
  datasetLimit: number;
  mappingCount: number;
  mappingLimit: number;
}
