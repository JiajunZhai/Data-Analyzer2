import { describe, expect, it } from 'vitest';
import {
  estimateDataSize,
  formatBytes,
  generateDatasetName,
  generateId,
  STORAGE_LIMITS,
} from '../storageUtils';

describe('storageUtils', () => {
  describe('STORAGE_LIMITS', () => {
    it('应该定义正确的限制值', () => {
      expect(STORAGE_LIMITS.MAX_DATASETS).toBe(10);
      expect(STORAGE_LIMITS.MAX_MAPPINGS).toBe(10);
      expect(STORAGE_LIMITS.MAX_CONFIGS_PER_DATASET).toBe(10);
      expect(STORAGE_LIMITS.MAX_STORAGE_BYTES).toBe(2 * 1024 * 1024 * 1024);
    });
  });

  describe('estimateDataSize', () => {
    it('应该正确估算数据大小', () => {
      const data = [
        { name: 'test', value: 123 },
        { name: 'test2', value: 456 },
      ];

      const size = estimateDataSize(data);

      expect(size).toBeGreaterThan(0);
    });

    it('应该处理空数组', () => {
      const data: unknown[] = [];

      const size = estimateDataSize(data);

      // 新实现对空数组返回 0
      expect(size).toBe(0);
    });

    it('应该返回更大的大小给更多的数据', () => {
      const smallData = [{ a: 1 }];
      const largeData = Array.from({ length: 100 }, (_, i) => ({ a: i, b: 'test'.repeat(10) }));

      const smallSize = estimateDataSize(smallData);
      const largeSize = estimateDataSize(largeData);

      expect(largeSize).toBeGreaterThan(smallSize);
    });
  });

  describe('formatBytes', () => {
    it('应该格式化字节', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(100)).toBe('100 B');
    });

    it('应该格式化千字节', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('应该格式化兆字节', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    });

    it('应该格式化千兆字节', () => {
      expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
      expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.0 GB');
    });
  });

  describe('generateId', () => {
    it('应该生成字符串 ID', () => {
      const id = generateId();

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('应该生成唯一的 ID', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }

      expect(ids.size).toBe(100);
    });
  });

  describe('generateDatasetName', () => {
    it('应该生成包含日期和文件名的名称', () => {
      const fileName = 'test.csv';

      const name = generateDatasetName(fileName);

      expect(name).toContain(fileName);
      expect(name).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('应该使用当前日期', () => {
      const fileName = 'data.xlsx';
      const today = new Date().toISOString().split('T')[0];

      const name = generateDatasetName(fileName);

      expect(name).toContain(today);
    });
  });
});
