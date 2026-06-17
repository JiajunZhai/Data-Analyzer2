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
  it('标准广告场景维度应该按标准广告场景值聚合', () => {
    const data: DataRow[] = [
      { 应用: 'RM06B', 标准广告场景: 'ALL', 注册用户: 100 },
      { 日期: '2026-06-08', 应用: 'RM06B', 标准广告场景: '冷启动', 注册用户: 10 },
      { 应用: 'RM06B', 标准广告场景: '热启动', 注册用户: 20 },
      { 日期: '2026-06-09', 应用: 'RM06B', 标准广告场景: '冷启动', 注册用户: 5 },
    ];

    const result = aggregateData(
      data,
      [createPivotField('标准广告场景', 'dimension')],
      [],
      [createPivotField('注册用户', 'measure')]
    );

    expect(result.rowHeaders).toEqual([['冷启动'], ['热启动']]);
    expect(result.data).toEqual([[15], [20]]);
  });

  it('注册用户在标准广告场景小计中应该按基础粒度取最大值', () => {
    const data: DataRow[] = [
      {
        日期: '2026-06-08',
        应用: 'RM06B',
        国家: 'US',
        版本: '1.0',
        渠道: 'organic',
        标准广告场景: '专辑插屏',
        注册用户: 226,
        广告收益: 2.26,
        曝光人数: 30,
        曝光次数: 56,
      },
      {
        日期: '2026-06-08',
        应用: 'RM06B',
        国家: 'US',
        版本: '1.0',
        渠道: 'organic',
        标准广告场景: '退出插屏',
        注册用户: 226,
        广告收益: 1.13,
        曝光人数: 26,
        曝光次数: 29,
      },
    ];

    const result = aggregateData(
      data,
      [createPivotField('应用', 'dimension')],
      [createPivotField('标准广告场景', 'dimension')],
      [
        createPivotField('ARPU', 'measure'),
        createPivotField('渗透率', 'measure'),
        createPivotField('IPU', 'measure'),
        createPivotField('注册用户', 'measure'),
      ]
    );

    // 列按拼音排序：退出(tui) < 专辑(zhuan)
    expect(result.data[0]).toEqual([
      1.13 / 226,
      26 / 226,
      29 / 226,
      226,
      2.26 / 226,
      30 / 226,
      56 / 226,
      226,
    ]);
    expect(result.rowTotalValues[0][0]).toBeCloseTo(3.39 / 226, 5);
    // 渗透率: 曝光人数半可加 MAX(30,26)=30, 30/226
    expect(result.rowTotalValues[0][1]).toBeCloseTo(30 / 226, 5);
    expect(result.rowTotalValues[0][2]).toBeCloseTo(85 / 226, 5);
    expect(result.rowTotalValues[0][3]).toBe(226);
  });

  it('计算指标跨日期和应用汇总时应该使用去重后的注册用户分母', () => {
    const data: DataRow[] = [
      {
        日期: '2026-06-08',
        应用: 'AppA',
        国家: 'US',
        版本: '1.0',
        渠道: 'organic',
        标准广告场景: '场景A',
        注册用户: 278,
        广告收益: 100,
        曝光人数: 60,
        曝光次数: 1000,
      },
      {
        日期: '2026-06-08',
        应用: 'AppA',
        国家: 'US',
        版本: '1.0',
        渠道: 'organic',
        标准广告场景: '场景B',
        注册用户: 278,
        广告收益: 50,
        曝光人数: 40,
        曝光次数: 500,
      },
      {
        日期: '2026-06-08',
        应用: 'AppB',
        国家: 'US',
        版本: '1.0',
        渠道: 'organic',
        标准广告场景: '场景A',
        注册用户: 150,
        广告收益: 30,
        曝光人数: 20,
        曝光次数: 300,
      },
      {
        日期: '2026-06-09',
        应用: 'AppA',
        国家: 'US',
        版本: '1.0',
        渠道: 'organic',
        标准广告场景: '场景A',
        注册用户: 300,
        广告收益: 60,
        曝光人数: 30,
        曝光次数: 600,
      },
    ];

    const result = aggregateData(
      data,
      [],
      [],
      [
        createPivotField('ARPU', 'measure'),
        createPivotField('渗透率', 'measure'),
        createPivotField('IPU', 'measure'),
        createPivotField('注册用户', 'measure'),
      ]
    );

    expect(result.data[0][0]).toBeCloseTo(240 / 728, 5);
    // 曝光人数半可加：AppA 06-08 的 60 和 40 同 key，取 MAX=60，总计 60+20+30=110
    expect(result.data[0][1]).toBeCloseTo(110 / 728, 5);
    expect(result.data[0][2]).toBeCloseTo(2400 / 728, 5);
    expect(result.data[0][3]).toBe(728);
  });

  it('标准广告场景筛选候选值应该返回原始标准广告场景值', () => {
    const data: DataRow[] = [{ 标准广告场景: '冷启动' }, { 标准广告场景: '热启动' }];

    expect(getUniqueValues(data, '标准广告场景')).toEqual(['冷启动', '热启动']);
  });

  it('场景不作为维度时应仅保留 ALL 行，避免数据翻倍', () => {
    const data: DataRow[] = [
      {
        日期: '2026-06-02',
        应用: 'AppA',
        标准广告场景: 'ALL',
        点击次数: 257,
        曝光次数: 695,
        曝光人数: 193,
        注册用户: 221,
      },
      {
        日期: '2026-06-02',
        应用: 'AppA',
        标准广告场景: '1冷启动',
        点击次数: 100,
        曝光次数: 300,
        曝光人数: 80,
        注册用户: 221,
      },
      {
        日期: '2026-06-02',
        应用: 'AppA',
        标准广告场景: '2点控制台',
        点击次数: 147,
        曝光次数: 353,
        曝光人数: 113,
        注册用户: 221,
      },
    ];

    // 场景不作为维度，无筛选 → 仅保留 ALL 行
    const result = aggregateData(
      data,
      [],
      [],
      [
        createPivotField('点击次数', 'measure'),
        createPivotField('曝光次数', 'measure'),
        createPivotField('曝光人数', 'measure'),
        createPivotField('注册用户', 'measure'),
      ]
    );

    // 点击次数和曝光次数应为 ALL 行的值，不是子场景之和
    expect(result.data[0][0]).toBe(257); // 点击次数 = ALL 行值
    expect(result.data[0][1]).toBe(695); // 曝光次数 = ALL 行值
    expect(result.data[0][2]).toBe(193); // 曝光人数 = ALL 行去重值
    expect(result.data[0][3]).toBe(221); // 注册用户 = ALL 行值
  });

  it('场景作为维度时应过滤 ALL 行，子场景正确聚合', () => {
    const data: DataRow[] = [
      {
        日期: '2026-06-02',
        应用: 'AppA',
        标准广告场景: 'ALL',
        点击次数: 257,
        曝光次数: 695,
        曝光人数: 193,
        注册用户: 221,
      },
      {
        日期: '2026-06-02',
        应用: 'AppA',
        标准广告场景: '1冷启动',
        点击次数: 100,
        曝光次数: 300,
        曝光人数: 80,
        注册用户: 221,
      },
      {
        日期: '2026-06-02',
        应用: 'AppA',
        标准广告场景: '2点控制台',
        点击次数: 147,
        曝光次数: 353,
        曝光人数: 113,
        注册用户: 221,
      },
    ];

    const result = aggregateData(
      data,
      [createPivotField('标准广告场景', 'dimension')],
      [],
      [
        createPivotField('点击次数', 'measure'),
        createPivotField('曝光次数', 'measure'),
        createPivotField('曝光人数', 'measure'),
        createPivotField('注册用户', 'measure'),
      ]
    );

    // ALL 行应被过滤，只展示子场景
    expect(result.rowHeaders).toEqual([['1冷启动'], ['2点控制台']]);
    // 子场景数据
    expect(result.data[0]).toEqual([100, 300, 80, 221]);
    expect(result.data[1]).toEqual([147, 353, 113, 221]);
    // 行总计：可加指标 SUM，半可加指标 MAX by key
    expect(result.rowTotalValues[0][0]).toBe(100); // 点击次数
    expect(result.rowTotalValues[0][1]).toBe(300); // 曝光次数
    expect(result.rowTotalValues[0][3]).toBe(221); // 注册用户
    // 列总计（小计）：注入 ALL 行半可加值
    // 点击次数 = 100+147 = 247（可加）
    // 注册用户 = ALL 行 221（半可加注入）
  });
});
