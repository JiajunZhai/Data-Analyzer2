import { describe, expect, it } from 'vitest';
import type { CalculatedField, DataRow } from '../../types';
import {
  addCalculatedFields,
  calculateField,
  calculateMetricFromAggregates,
  PRESET_CALCULATED_FIELDS,
  precomputeGlobalRevenue,
} from '../calculatedField';

describe('calculatedField', () => {
  describe('calculateMetricFromAggregates', () => {
    it('应该正确计算 eCPM', () => {
      const aggregatedData = {
        广告收益: 100,
        曝光次数: 10000,
      };

      const result = calculateMetricFromAggregates('eCPM', aggregatedData);

      // eCPM = (广告收益 / 曝光次数) * 1000 = (100 / 10000) * 1000 = 10
      expect(result).toBe(10);
    });

    it('应该正确计算 CTR', () => {
      const aggregatedData = {
        点击次数: 50,
        曝光次数: 1000,
      };

      const result = calculateMetricFromAggregates('CTR', aggregatedData);

      // CTR = 点击次数 / 曝光次数 = 50 / 1000 = 0.05
      expect(result).toBeCloseTo(0.05, 5);
    });

    it('应该正确计算 ARPU', () => {
      const aggregatedData = {
        广告收益: 500,
        注册用户: 100,
      };

      const result = calculateMetricFromAggregates('ARPU', aggregatedData);

      // ARPU = 广告收益 / 注册用户 = 500 / 100 = 5
      expect(result).toBe(5);
    });

    it('应该正确计算渗透率', () => {
      const aggregatedData = {
        曝光人数: 80,
        注册用户: 100,
      };

      const result = calculateMetricFromAggregates('渗透率', aggregatedData);

      // 渗透率 = 曝光人数 / 注册用户 = 80 / 100 = 0.8
      expect(result).toBeCloseTo(0.8, 5);
    });

    it('应该正确计算 IPU', () => {
      const aggregatedData = {
        曝光次数: 500,
        注册用户: 100,
      };

      const result = calculateMetricFromAggregates('IPU', aggregatedData);

      // IPU = 曝光次数 / 注册用户 = 500 / 100 = 5
      expect(result).toBe(5);
    });

    it('应该处理除以零的情况', () => {
      const aggregatedData = {
        广告收益: 100,
        曝光次数: 0,
      };

      const result = calculateMetricFromAggregates('eCPM', aggregatedData);

      // safeEval 在结果为 Infinity 或 NaN 时返回 0
      expect(result).toBe(0);
    });
  });

  describe('calculateField', () => {
    it('应该正确计算行级字段', () => {
      const row: DataRow = {
        广告收益: 100,
        曝光次数: 10000,
      };

      const calculatedField: CalculatedField = {
        name: 'eCPM',
        formula: '(广告收益 / 曝光次数) * 1000',
        fields: ['广告收益', '曝光次数'],
      };

      const result = calculateField(row, calculatedField);

      expect(result).toBe(10);
    });

    it('应该处理缺少字段的情况', () => {
      const row: DataRow = {
        广告收益: 100,
      };

      const calculatedField: CalculatedField = {
        name: 'eCPM',
        formula: '(广告收益 / 曝光次数) * 1000',
        fields: ['广告收益', '曝光次数'],
      };

      const result = calculateField(row, calculatedField);

      // 曝光次数为 undefined，Number(undefined) = NaN，所以不会被替换
      // 公式仍然是 '(广告收益 / 曝光次数) * 1000'，safeEval 会返回 0
      expect(result).toBe(0);
    });
  });

  describe('precomputeGlobalRevenue', () => {
    it('应该正确计算总广告收益', () => {
      const data: DataRow[] = [{ 广告收益: 100 }, { 广告收益: 200 }, { 广告收益: 300 }];

      const result = precomputeGlobalRevenue(data);

      expect(result[0]['总广告收益']).toBe(600);
      expect(result[1]['总广告收益']).toBe(600);
      expect(result[2]['总广告收益']).toBe(600);
    });

    it('应该处理空数据', () => {
      const data: DataRow[] = [];

      const result = precomputeGlobalRevenue(data);

      expect(result).toEqual([]);
    });

    it('应该处理缺少广告收益字段', () => {
      const data: DataRow[] = [{ 其他字段: 100 }, { 广告收益: 200 }];

      const result = precomputeGlobalRevenue(data);

      expect(result[0]['总广告收益']).toBe(200);
      expect(result[1]['总广告收益']).toBe(200);
    });
  });

  describe('addCalculatedFields', () => {
    it('应该添加所有预设计算字段', () => {
      const data: DataRow[] = [
        {
          广告收益: 100,
          曝光次数: 10000,
          点击次数: 50,
          注册用户: 100,
          曝光人数: 80,
        },
      ];

      const result = addCalculatedFields(data, PRESET_CALCULATED_FIELDS);

      expect(result[0]['eCPM']).toBe(10);
      expect(result[0]['CTR']).toBeCloseTo(0.005, 5);
      expect(result[0]['ARPU']).toBe(1);
      expect(result[0]['渗透率']).toBeCloseTo(0.8, 5);
      expect(result[0]['IPU']).toBe(100);
    });
  });
});
