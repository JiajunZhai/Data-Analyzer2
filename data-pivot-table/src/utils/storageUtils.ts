export const STORAGE_LIMITS = {
  MAX_DATASETS: 10,
  MAX_MAPPINGS: 10,
  MAX_CONFIGS_PER_DATASET: 10,
  MAX_STORAGE_BYTES: 500 * 1024 * 1024,
};

export const estimateDataSize = (data: unknown[]): number => {
  return new Blob([JSON.stringify(data)]).size;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const generateDatasetName = (fileName: string): string => {
  const date = new Date().toISOString().split('T')[0];
  return `${date} ${fileName}`;
};
