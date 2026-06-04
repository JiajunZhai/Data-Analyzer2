import { describe, expect, it } from 'vitest';
import type { DataRow, ScenarioMapping } from '../../types';
import {
  applyScenarioMapping,
  buildLookupMap,
  calculateScenarioMatchStats,
  createScenarioMappingKey,
  validateMappingAppCodes,
} from '../scenarioMapper';

describe('scenarioMapper', () => {
  describe('applyScenarioMapping', () => {
    it('应该应用场景映射', () => {
      const data: DataRow[] = [
        { 应用: 'App1', 广告场景: '场景A' },
        { 应用: 'App1', 广告场景: '场景B' },
        { 应用: 'App2', 广告场景: '场景A' },
      ];

      const lookupMap = new Map<string, string>();
      lookupMap.set('App1\t场景A', '目标场景1');
      lookupMap.set('App1\t场景B', '目标场景2');

      const mapping: ScenarioMapping = {
        lookupMap,
        appCodes: ['App1'],
        scenarioCount: 2,
        mappedRowCount: 2,
      };

      const result = applyScenarioMapping(data, mapping);

      expect(result[0]['实际场景']).toBe('目标场景1');
      expect(result[1]['实际场景']).toBe('目标场景2');
      expect(result[2]['实际场景']).toBe('场景A'); // 没有映射，保留原值
    });

    it('应该处理空数据', () => {
      const mapping: ScenarioMapping = {
        lookupMap: new Map(),
        appCodes: [],
        scenarioCount: 0,
        mappedRowCount: 0,
      };

      const result = applyScenarioMapping([], mapping);

      expect(result).toEqual([]);
    });

    it('应该处理空映射', () => {
      const data: DataRow[] = [{ 应用: 'App1', 广告场景: '场景A' }];

      const mapping: ScenarioMapping = {
        lookupMap: new Map(),
        appCodes: [],
        scenarioCount: 0,
        mappedRowCount: 0,
      };

      const result = applyScenarioMapping(data, mapping);

      expect(result[0]['实际场景']).toBe('场景A');
    });
  });

  describe('buildLookupMap', () => {
    it('应该创建查找映射', () => {
      const headers = ['目标场景', 'App1', 'App2'];
      const rows = [
        ['目标1', '场景A', '场景C'],
        ['目标2', '场景B', '场景D'],
      ];

      const mapping = buildLookupMap(headers, rows);

      expect(mapping.lookupMap.get(createScenarioMappingKey('App1', '场景A'))).toBe('目标1');
      expect(mapping.lookupMap.get(createScenarioMappingKey('App1', '场景B'))).toBe('目标2');
      expect(mapping.lookupMap.get(createScenarioMappingKey('App2', '场景C'))).toBe('目标1');
      expect(mapping.lookupMap.get(createScenarioMappingKey('App2', '场景D'))).toBe('目标2');
    });

    it('应该归一化应用标识和场景编码', () => {
      const mapping = buildLookupMap(['目标场景', ' rm06b '], [['冷启动', ' CL_OPEN ']]);
      const data: DataRow[] = [{ 应用: 'RM06B', 广告场景: 'cl_open' }];

      const result = applyScenarioMapping(data, mapping);

      expect(result[0]['实际场景']).toBe('冷启动');
    });

    it('应该处理空行', () => {
      const headers = ['目标场景', 'App1'];
      const rows: string[][] = [];

      const mapping = buildLookupMap(headers, rows);

      expect(mapping.lookupMap.size).toBe(0);
    });
  });

  describe('calculateScenarioMatchStats', () => {
    it('应该统计真实命中行数并排除 ALL 汇总行', () => {
      const mapping = buildLookupMap(['目标场景', 'RM06B'], [['冷启动', 'cl_open']]);
      const data: DataRow[] = [
        { 应用: 'RM06B', 广告场景: 'ALL' },
        { 应用: 'RM06B', 广告场景: 'cl_open' },
        { 应用: 'RM06B', 广告场景: 'unknown' },
      ];

      const stats = calculateScenarioMatchStats(data, mapping);

      expect(stats.sourceRowCount).toBe(2);
      expect(stats.mappedRowCount).toBe(1);
    });
  });

  describe('validateMappingAppCodes', () => {
    it('应该返回无效的应用标识', () => {
      const mappingAppCodes = ['App1', 'App2', 'App3'];
      const data: DataRow[] = [{ 应用: 'App1' }, { 应用: 'App2' }];

      const invalidCodes = validateMappingAppCodes(mappingAppCodes, data);

      expect(invalidCodes).toEqual(['App3']);
    });

    it('应该返回空数组当所有标识都有效', () => {
      const mappingAppCodes = ['App1', 'App2'];
      const data: DataRow[] = [{ 应用: 'App1' }, { 应用: 'App2' }, { 应用: 'App3' }];

      const invalidCodes = validateMappingAppCodes(mappingAppCodes, data);

      expect(invalidCodes).toEqual([]);
    });

    it('应该处理空数据', () => {
      const mappingAppCodes = ['App1'];
      const data: DataRow[] = [];

      const invalidCodes = validateMappingAppCodes(mappingAppCodes, data);

      expect(invalidCodes).toEqual(['App1']);
    });
  });
});
