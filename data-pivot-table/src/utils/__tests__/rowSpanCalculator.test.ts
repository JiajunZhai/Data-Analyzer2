import { describe, expect, it } from 'vitest';
import { calculateAllRowSpans, calculateRowSpans } from '../rowSpanCalculator';

describe('rowSpanCalculator', () => {
  describe('calculateRowSpans', () => {
    it('应该为单个维度计算正确的 rowSpan', () => {
      const rowHeaders = [
        ['A', '1'],
        ['A', '2'],
        ['B', '3'],
        ['B', '4'],
      ];
      const spans = calculateRowSpans(rowHeaders, 0);
      expect(spans).toEqual([2, 0, 2, 0]);
    });

    it('应该为所有不同的维度值返回 1', () => {
      const rowHeaders = [['A'], ['B'], ['C']];
      const spans = calculateRowSpans(rowHeaders, 0);
      expect(spans).toEqual([1, 1, 1]);
    });

    it('应该为所有相同的维度值返回正确的 rowSpan', () => {
      const rowHeaders = [['A'], ['A'], ['A']];
      const spans = calculateRowSpans(rowHeaders, 0);
      expect(spans).toEqual([3, 0, 0]);
    });

    it('应该处理单行', () => {
      const rowHeaders = [['A']];
      const spans = calculateRowSpans(rowHeaders, 0);
      expect(spans).toEqual([1]);
    });
  });

  describe('calculateAllRowSpans', () => {
    it('应该为多个维度计算正确的 rowSpan', () => {
      const rowHeaders = [
        ['A', 'X', '1'],
        ['A', 'X', '2'],
        ['A', 'Y', '3'],
        ['B', 'Z', '4'],
      ];
      const dimensionCount = 3;
      const spans = calculateAllRowSpans(rowHeaders, dimensionCount);

      expect(spans).toHaveLength(3);
      // 第一列：A 有 3 行，B 有 1 行
      expect(spans[0]).toEqual([3, 0, 0, 1]);
      // 第二列：X 有 2 行，Y 有 1 行，Z 有 1 行
      expect(spans[1]).toEqual([2, 0, 1, 1]);
      // 第三列：都是唯一的
      expect(spans[2]).toEqual([1, 1, 1, 1]);
    });

    it('应该处理 dimensionCount 为 0', () => {
      const rowHeaders = [['A', 'B']];
      const dimensionCount = 0;
      const spans = calculateAllRowSpans(rowHeaders, dimensionCount);
      expect(spans).toEqual([]);
    });
  });
});
