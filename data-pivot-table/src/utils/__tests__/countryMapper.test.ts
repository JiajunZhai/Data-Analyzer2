import { describe, expect, it } from 'vitest';
import type { DataRow } from '../../types';
import { applyCountryMapping, getCountryName } from '../countryMapper';

describe('countryMapper', () => {
  describe('applyCountryMapping', () => {
    it('应该将国家代码转换为国家名称', () => {
      const data: DataRow[] = [{ 国家: 'CN' }, { 国家: 'US' }, { 国家: 'JP' }];

      const result = applyCountryMapping(data);

      expect(result[0]['国家']).toBe('中国');
      expect(result[1]['国家']).toBe('美国');
      expect(result[2]['国家']).toBe('日本');
    });

    it('应该保留未知的国家代码', () => {
      const data: DataRow[] = [{ 国家: 'XX' }];

      const result = applyCountryMapping(data);

      expect(result[0]['国家']).toBe('XX');
    });

    it('应该处理空数据', () => {
      const data: DataRow[] = [];

      const result = applyCountryMapping(data);

      expect(result).toEqual([]);
    });

    it('应该处理缺少国家字段的数据', () => {
      const data: DataRow[] = [{ 其他字段: 'value' }];

      const result = applyCountryMapping(data);

      expect(result[0]['国家']).toBeUndefined();
    });

    it('应该使用自定义字段名', () => {
      const data: DataRow[] = [{ country: 'CN' }];

      const result = applyCountryMapping(data, 'country');

      expect(result[0]['country']).toBe('中国');
    });
  });

  describe('getCountryName', () => {
    it('应该返回正确的国家名称', () => {
      expect(getCountryName('CN')).toBe('中国');
      expect(getCountryName('US')).toBe('美国');
      expect(getCountryName('JP')).toBe('日本');
      expect(getCountryName('KR')).toBe('韩国');
      expect(getCountryName('GB')).toBe('英国');
    });

    it('应该返回未知代码本身', () => {
      expect(getCountryName('XX')).toBe('XX');
      expect(getCountryName('')).toBe('');
    });
  });
});
