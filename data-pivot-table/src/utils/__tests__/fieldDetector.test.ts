import { describe, expect, it } from 'vitest';
import type { DataRow } from '../../types';
import { detectFieldTypes, getDimensions, getMeasures } from '../fieldDetector';

describe('fieldDetector', () => {
  describe('detectFieldTypes', () => {
    it('应该正确检测维度字段', () => {
      const headers = ['日期', '应用', '国家'];
      const data = [
        { 日期: '2024-01-01', 应用: 'App1', 国家: 'CN' },
        { 日期: '2024-01-02', 应用: 'App2', 国家: 'US' },
      ];

      const fields = detectFieldTypes(headers, data);
      const dimensions = fields.filter((f) => f.type === 'dimension');

      expect(dimensions).toHaveLength(3);
      expect(dimensions.map((f) => f.name)).toEqual(['日期', '应用', '国家']);
    });

    it('应该正确检测指标字段', () => {
      const headers = ['注册用户', '广告收益', '曝光次数'];
      const data = [
        { 注册用户: 100, 广告收益: 50.5, 曝光次数: 1000 },
        { 注册用户: 200, 广告收益: 100.0, 曝光次数: 2000 },
      ];

      const fields = detectFieldTypes(headers, data);
      const measures = fields.filter((f) => f.type === 'measure');

      expect(measures).toHaveLength(3);
      expect(measures.map((f) => f.name)).toEqual(['注册用户', '广告收益', '曝光次数']);
    });

    it('应该正确检测混合字段类型', () => {
      const headers = ['日期', '应用', '注册用户', '广告收益'];
      const data = [{ 日期: '2024-01-01', 应用: 'App1', 注册用户: 100, 广告收益: 50.5 }];

      const fields = detectFieldTypes(headers, data);

      expect(fields).toHaveLength(4);
      expect(fields.find((f) => f.name === '日期')?.type).toBe('dimension');
      expect(fields.find((f) => f.name === '应用')?.type).toBe('dimension');
      expect(fields.find((f) => f.name === '注册用户')?.type).toBe('measure');
      expect(fields.find((f) => f.name === '广告收益')?.type).toBe('measure');
    });

    it('应该处理空数据', () => {
      const headers = ['日期', '注册用户'];
      const data: DataRow[] = [];

      const fields = detectFieldTypes(headers, data);

      expect(fields).toHaveLength(2);
      expect(fields.find((f) => f.name === '日期')?.type).toBe('dimension');
      // 注册用户在 MEASURE_FIELDS 列表中，所以即使数据为空也会被识别为 measure
      expect(fields.find((f) => f.name === '注册用户')?.type).toBe('measure');
    });

    it('应该检测日期类型', () => {
      const headers = ['日期'];
      const data = [{ 日期: '2024-01-01' }, { 日期: '2024-01-02' }];

      const fields = detectFieldTypes(headers, data);

      expect(fields[0].dataType).toBe('date');
    });

    it('应该检测数字类型', () => {
      const headers = ['数量'];
      const data = [{ 数量: 100 }, { 数量: 200 }];

      const fields = detectFieldTypes(headers, data);

      expect(fields[0].dataType).toBe('number');
    });
  });

  describe('getDimensions', () => {
    it('应该只返回维度字段', () => {
      const fields = [
        { name: '日期', type: 'dimension' as const, dataType: 'date' as const },
        { name: '应用', type: 'dimension' as const, dataType: 'string' as const },
        { name: '注册用户', type: 'measure' as const, dataType: 'number' as const },
      ];

      const dimensions = getDimensions(fields);

      expect(dimensions).toHaveLength(2);
      expect(dimensions.map((f) => f.name)).toEqual(['日期', '应用']);
    });
  });

  describe('getMeasures', () => {
    it('应该只返回指标字段', () => {
      const fields = [
        { name: '日期', type: 'dimension' as const, dataType: 'date' as const },
        { name: '注册用户', type: 'measure' as const, dataType: 'number' as const },
        { name: '广告收益', type: 'measure' as const, dataType: 'number' as const },
      ];

      const measures = getMeasures(fields);

      expect(measures).toHaveLength(2);
      expect(measures.map((f) => f.name)).toEqual(['注册用户', '广告收益']);
    });
  });
});
