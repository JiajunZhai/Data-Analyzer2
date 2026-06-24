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
  it('标准广告场景维度展开时注册用户应填充 ALL 大盘值', () => {
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
    expect(result.data).toEqual([[100], [100]]);
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

  it('场景不作为维度时应使用 ALL 行口径，避免明细重复求和', () => {
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

    // 场景不作为维度、无行为筛选 → 结果使用 ALL 行口径
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

  it('场景作为维度时 UI 行头不展示 ALL 行，子场景正确聚合', () => {
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

    // 最终 UI 行头不展示 ALL 行，只展示子场景
    expect(result.rowHeaders).toEqual([['1冷启动'], ['2点控制台']]);
    // 子场景数据
    expect(result.data[0]).toEqual([100, 300, 80, 221]);
    expect(result.data[1]).toEqual([147, 353, 113, 221]);
    // 行总计：可加指标 SUM，半可加指标 MAX by key
    expect(result.rowTotalValues[0][0]).toBe(100); // 点击次数
    expect(result.rowTotalValues[0][1]).toBe(300); // 曝光次数
    expect(result.rowTotalValues[0][3]).toBe(221); // 注册用户
    // 列总计（小计）：属性半可加指标从剪枝后的 ALL 大盘口径读取
    // 点击次数 = 100+147 = 247（可加）
    // 注册用户 = ALL 行 221（属性半可加口径）
  });

  describe('异常修复：半可加指标聚合类型', () => {
    it('注册用户即使配置为 count 聚合也应使用 sumSemiAdditiveMetric', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          国家: 'AR',
          版本: '1.0',
          渠道: 'facebook',
          标准广告场景: 'ALL',
          注册用户: 350,
          曝光人数: 180,
        },
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          国家: 'AR',
          版本: '1.0',
          渠道: 'facebook',
          标准广告场景: '1冷启动',
          注册用户: null as unknown as number,
          曝光人数: 100,
        },
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          国家: 'AR',
          版本: '1.0',
          渠道: 'facebook',
          标准广告场景: '2热启动',
          注册用户: null as unknown as number,
          曝光人数: 150,
        },
      ];

      // 使用 count 聚合类型
      const countField: PivotField = {
        field: createField('注册用户', 'measure'),
        aggregation: 'count',
      };

      const result = aggregateData(
        data,
        [createPivotField('标准广告场景', 'dimension')],
        [],
        [countField]
      );

      // 展开场景维度时，最终 UI 行头不展示 ALL 行，明细行为 NULL
      // 属性半可加指标（注册用户）应读取 ALL 行大盘值 350，而非显示 0
      expect(result.data[0][0]).toBe(350);
      expect(result.data[1][0]).toBe(350);

      // 列总计应读取 ALL 行值 350
      expect(result.columnTotals[0]).toBe(350);
    });

    it('曝光人数即使配置为 count 聚合也应使用 sumSemiAdditiveMetric', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          标准广告场景: 'ALL',
          曝光人数: 180,
        },
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          标准广告场景: '1冷启动',
          曝光人数: 100,
        },
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          标准广告场景: '2热启动',
          曝光人数: 150,
        },
      ];

      const countField: PivotField = {
        field: createField('曝光人数', 'measure'),
        aggregation: 'count',
      };

      const result = aggregateData(
        data,
        [createPivotField('标准广告场景', 'dimension')],
        [],
        [countField]
      );

      // 展开场景维度时，最终 UI 行头不展示 ALL 行
      // 曝光人数应返回实际值（100, 150），而非行数（1, 1）
      expect(result.data[0][0]).toBe(100);
      expect(result.data[1][0]).toBe(150);
    });
  });

  describe('异常修复：列总计应按列上下文区分', () => {
    it('不同列的列总计应反映各自列的 ALL 行值，而非全局值', () => {
      const data: DataRow[] = [
        // ALL 行：买量渠道=ALL, 国家=ALL
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          国家: 'ALL',
          买量渠道: 'ALL',
          标准广告场景: 'ALL',
          注册用户: 60,
          曝光人数: 3970,
          广告收益: 100,
        },
        // facebook 巴西 ALL 行
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          国家: 'BR',
          买量渠道: 'facebook',
          标准广告场景: 'ALL',
          注册用户: 30,
          曝光人数: 1600,
          广告收益: 50,
        },
        // facebook 墨西哥 ALL 行
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          国家: 'MX',
          买量渠道: 'facebook',
          标准广告场景: 'ALL',
          注册用户: 30,
          曝光人数: 1333,
          广告收益: 30,
        },
        // unknown 巴西 ALL 行
        {
          日期: '2026-06-10',
          应用: 'RM06B',
          国家: 'BR',
          买量渠道: 'unknown',
          标准广告场景: 'ALL',
          注册用户: 0,
          曝光人数: 1037,
          广告收益: 20,
        },
      ];

      const result = aggregateData(
        data,
        [],
        [createPivotField('买量渠道', 'dimension'), createPivotField('国家', 'dimension')],
        [
          createPivotField('曝光人数', 'measure'),
          createPivotField('注册用户', 'measure'),
          createPivotField('广告收益', 'measure'),
        ]
      );

      // 列总计应按列区分，不应全部相同
      // facebook|BR 的曝光人数应为 1600，不是 3970
      // facebook|MX 的曝光人数应为 1333，不是 3970
      const colHeaders = result.columnHeaders;
      // 多 valueField 时 columnHeader 格式为 "维度值1\u001f维度值2\u001f指标名"
      const fbBrIdx = colHeaders.findIndex(
        (h) => h.startsWith('facebook' + '\u001f' + 'BR') && h.endsWith('曝光人数')
      );
      const fbMxIdx = colHeaders.findIndex(
        (h) => h.startsWith('facebook' + '\u001f' + 'MX') && h.endsWith('曝光人数')
      );
      const fbBrRegIdx = colHeaders.findIndex(
        (h) => h.startsWith('facebook' + '\u001f' + 'BR') && h.endsWith('注册用户')
      );

      expect(fbBrIdx).toBeGreaterThanOrEqual(0);
      expect(fbMxIdx).toBeGreaterThanOrEqual(0);
      expect(fbBrRegIdx).toBeGreaterThanOrEqual(0);
      expect(result.columnTotals).toHaveLength(result.columnHeaders.length);

      // 列总计中各列的曝光人数应不同
      expect(result.columnTotals[fbBrIdx]).not.toBe(result.columnTotals[fbMxIdx]);
      // 注册用户继承当前列的买量渠道/国家条件，不能泄漏到全局 60
      expect(result.columnTotals[fbBrRegIdx]).toBe(30);
    });
  });

  describe('维度分类与过滤器剪枝', () => {
    it('属性类度量（注册用户）不应被行为维度过滤条件影响', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'AppA',
          标准广告场景: 'ALL',
          广告类型: 'ALL',
          注册用户: 500,
          广告收益: 100,
          曝光人数: 300,
          曝光次数: 1000,
        },
        {
          日期: '2026-06-10',
          应用: 'AppA',
          标准广告场景: '冷启动',
          广告类型: 'banner',
          注册用户: null as unknown as number,
          广告收益: 40,
          曝光人数: 120,
          曝光次数: 400,
        },
        {
          日期: '2026-06-10',
          应用: 'AppA',
          标准广告场景: '热启动',
          广告类型: 'interstitial',
          注册用户: null as unknown as number,
          广告收益: 60,
          曝光人数: 180,
          曝光次数: 600,
        },
      ];

      // 行为过滤: 广告类型 = banner
      const result = aggregateData(
        data,
        [createPivotField('日期', 'dimension')],
        [],
        [createPivotField('注册用户', 'measure'), createPivotField('广告收益', 'measure')],
        [{ fieldName: '广告类型', selectedValues: ['banner'] }]
      );

      // 广告收益只含 banner 行的值 = 40
      expect(result.data[0][1]).toBeCloseTo(40);
      // 注册用户应为 ALL 行的去重值 500，不受广告类型过滤影响
      expect(result.data[0][0]).toBe(500);
    });

    it('行为类度量仍应正确响应行为维度过滤', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'AppA',
          广告类型: 'ALL',
          广告收益: 100,
          曝光次数: 1000,
          点击次数: 50,
        },
        {
          日期: '2026-06-10',
          应用: 'AppA',
          广告类型: 'banner',
          广告收益: 40,
          曝光次数: 400,
          点击次数: 20,
        },
        {
          日期: '2026-06-10',
          应用: 'AppA',
          广告类型: 'interstitial',
          广告收益: 60,
          曝光次数: 600,
          点击次数: 30,
        },
      ];

      const result = aggregateData(
        data,
        [createPivotField('日期', 'dimension')],
        [],
        [createPivotField('广告收益', 'measure'), createPivotField('曝光次数', 'measure')],
        [{ fieldName: '广告类型', selectedValues: ['banner'] }]
      );

      // 广告收益应只含 banner 的值
      expect(result.data[0][0]).toBeCloseTo(40);
      expect(result.data[0][1]).toBe(400);
    });

    it('属性类度量在多行为过滤条件下应仅受属性过滤影响', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'AppA',
          国家: 'US',
          标准广告场景: 'ALL',
          广告类型: 'ALL',
          注册用户: 300,
          广告收益: 80,
        },
        {
          日期: '2026-06-10',
          应用: 'AppA',
          国家: 'US',
          标准广告场景: '冷启动',
          广告类型: 'banner',
          注册用户: null as unknown as number,
          广告收益: 30,
        },
        {
          日期: '2026-06-10',
          应用: 'AppA',
          国家: 'DE',
          标准广告场景: 'ALL',
          广告类型: 'ALL',
          注册用户: 200,
          广告收益: 50,
        },
        {
          日期: '2026-06-10',
          应用: 'AppA',
          国家: 'DE',
          标准广告场景: '热启动',
          广告类型: 'interstitial',
          注册用户: null as unknown as number,
          广告收益: 50,
        },
      ];

      const result = aggregateData(
        data,
        [createPivotField('国家', 'dimension')],
        [],
        [createPivotField('注册用户', 'measure'), createPivotField('广告收益', 'measure')],
        [
          { fieldName: '广告类型', selectedValues: ['banner'] },
          { fieldName: '标准广告场景', selectedValues: ['冷启动'] },
        ]
      );

      const usRow = result.rowHeaders.findIndex((h) => h[0] === 'US');
      // 广告收益：仅 banner + 冷启动 → 30
      expect(result.data[usRow][1]).toBeCloseTo(30);
      // 注册用户：ALL 行去重值 300（不受行为过滤影响）
      expect(result.data[usRow][0]).toBe(300);
    });

    it('无行为过滤时，双数据集应产生相同结果', () => {
      const data: DataRow[] = [
        { 日期: '2026-06-10', 应用: 'AppA', 注册用户: 500, 广告收益: 100 },
        { 日期: '2026-06-10', 应用: 'AppB', 注册用户: 300, 广告收益: 50 },
      ];

      const result = aggregateData(
        data,
        [createPivotField('应用', 'dimension')],
        [],
        [createPivotField('注册用户', 'measure'), createPivotField('广告收益', 'measure')]
      );

      // 无行为过滤 → 结果与当前行为一致
      expect(result.data[0][0]).toBe(500);
      expect(result.data[0][1]).toBeCloseTo(100);
    });
  });
});
