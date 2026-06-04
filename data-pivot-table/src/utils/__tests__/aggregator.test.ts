import { describe, expect, it } from 'vitest';
import type { DataRow, Field, PivotField } from '../../types';
import { aggregateData, getUniqueValues } from '../aggregator';

const createField = (name: string, type: Field['type']): Field => ({
  name,
  type,
  dataType: type === 'measure' ? 'number' : 'string',
});

const createPivotField = (name: string, type: Field['type']): PivotField => ({
  field: createField(name, type),
  aggregation: type === 'measure' ? 'sum' : undefined,
});

describe('aggregator', () => {
  it('广告场景维度应该显示并按映射后的中文场景聚合', () => {
    const data: DataRow[] = [
      { 应用: 'RM06B', 广告场景: 'ALL', 实际场景: 'ALL', 注册用户: 100 },
      { 应用: 'RM06B', 广告场景: 'cl_open', 实际场景: '1冷启动', 注册用户: 10 },
      { 应用: 'RM06B', 广告场景: 'ho_open', 实际场景: '2热启动', 注册用户: 20 },
      { 应用: 'RM06B', 广告场景: 'cl_open', 实际场景: '1冷启动', 注册用户: 5 },
    ];

    const result = aggregateData(
      data,
      [createPivotField('广告场景', 'dimension')],
      [],
      [createPivotField('注册用户', 'measure')]
    );

    expect(result.rowHeaders).toEqual([['1冷启动'], ['2热启动']]);
    expect(result.data).toEqual([[15], [20]]);
  });

  it('广告场景筛选候选值应该优先使用映射后的中文场景', () => {
    const data: DataRow[] = [
      { 广告场景: 'cl_open', 实际场景: '1冷启动' },
      { 广告场景: 'ho_open', 实际场景: '2热启动' },
    ];

    expect(getUniqueValues(data, '广告场景')).toEqual(['1冷启动', '2热启动']);
  });
});
