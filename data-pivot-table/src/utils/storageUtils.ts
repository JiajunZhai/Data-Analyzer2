export const STORAGE_LIMITS = {
  MAX_DATASETS: 10,
  MAX_MAPPINGS: 10,
  MAX_CONFIGS_PER_DATASET: 10,
  MAX_STORAGE_BYTES: 2 * 1024 * 1024 * 1024,
};

export const estimateDataSize = (data: unknown[]): number => {
  if (data.length === 0) return 0;
  const sampleSize = Math.min(100, data.length);
  const sample = data.slice(0, sampleSize);
  const sampleBytes = new Blob([JSON.stringify(sample)]).size;
  return Math.round((sampleBytes / sampleSize) * data.length);
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export const generateId = (): string => {
  return crypto.randomUUID();
};

export const generateDatasetName = (fileName: string): string => {
  const date = new Date().toISOString().split('T')[0];
  return `${date} ${fileName}`;
};
