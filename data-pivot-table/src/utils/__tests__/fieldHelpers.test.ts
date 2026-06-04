import { describe, expect, it } from 'vitest';
import { canDropToZone, getSpatialSortableId } from '../fieldHelpers';

describe('fieldHelpers', () => {
  describe('canDropToZone', () => {
    it('应该允许指标字段拖到值区域', () => {
      expect(canDropToZone('metric', 'values')).toBe(true);
    });

    it('应该不允许维度字段拖到值区域', () => {
      expect(canDropToZone('dimension', 'values')).toBe(false);
    });

    it('应该允许维度字段拖到行区域', () => {
      expect(canDropToZone('dimension', 'rows')).toBe(true);
    });

    it('应该允许维度字段拖到列区域', () => {
      expect(canDropToZone('dimension', 'columns')).toBe(true);
    });

    it('应该不允许指标字段拖到行区域', () => {
      expect(canDropToZone('metric', 'rows')).toBe(false);
    });

    it('应该不允许指标字段拖到列区域', () => {
      expect(canDropToZone('metric', 'columns')).toBe(false);
    });
  });

  describe('getSpatialSortableId', () => {
    it('应该生成正确的可排序 ID', () => {
      const id = getSpatialSortableId('rows', '日期');

      expect(id).toBe('rows::日期');
    });

    it('应该为不同的区域生成不同的 ID', () => {
      const rowsId = getSpatialSortableId('rows', '日期');
      const colsId = getSpatialSortableId('columns', '日期');

      expect(rowsId).not.toBe(colsId);
    });

    it('应该为不同的字段生成不同的 ID', () => {
      const dateId = getSpatialSortableId('rows', '日期');
      const appId = getSpatialSortableId('rows', '应用');

      expect(dateId).not.toBe(appId);
    });
  });
});
