import { describe, expect, it } from 'vitest';
import type { DataRow, Field, PivotField } from '../../types';
import { aggregateData, getUniqueValues } from '../aggregator';
import { preprocessData } from '../dataPreprocessor';
import { detectFieldTypes } from '../fieldDetector';

const createField = (name: string, type: Field['type']): Field => ({
  name,
  type,
  dataType: type === 'measure' ? 'number' : 'string',
});

const createPivotField = (name: string, type: Field['type']): PivotField => ({
  field: createField(name, type),
  aggregation: type === 'measure' ? 'sum' : undefined,
});

describe('新维度字段验证：广告类型、变现渠道、生命周期', () => {
  // 模拟新 SQL 输出的数据
  const mockData: DataRow[] = [
    {
      日期: '2026-06-10',
      应用: 'fr006b',
      国家: 'US',
      版本: '1.0',
      买量渠道: 'google',
      注册用户: 500,
      广告类型: 'banner',
      变现渠道: 'admob',
      生命周期: 'D0',
      曝光人数: 300,
      曝光次数: 1000,
      广告收益: 12.5,
      点击次数: 80,
    },
    {
      日期: '2026-06-10',
      应用: 'fr006b',
      国家: 'US',
      版本: '1.0',
      买量渠道: 'google',
      注册用户: 400,
      广告类型: 'interstitial',
      变现渠道: 'admob',
      生命周期: 'D0',
      曝光人数: 250,
      曝光次数: 600,
      广告收益: 25.0,
      点击次数: 50,
    },
    {
      日期: '2026-06-10',
      应用: 'fr006b',
      国家: 'US',
      版本: '1.0',
      买量渠道: 'google',
      注册用户: 300,
      广告类型: 'banner',
      变现渠道: 'unity',
      生命周期: 'D0',
      曝光人数: 180,
      曝光次数: 500,
      广告收益: 5.0,
      点击次数: 30,
    },
    {
      日期: '2026-06-10',
      应用: 'fr006b',
      国家: 'US',
      版本: '1.0',
      买量渠道: 'google',
      注册用户: 450,
      广告类型: 'banner',
      变现渠道: 'admob',
      生命周期: 'D1',
      曝光人数: 280,
      曝光次数: 900,
      广告收益: 10.0,
      点击次数: 70,
    },
    {
      日期: '2026-06-10',
      应用: 'fr006b',
      国家: 'DE',
      版本: '1.0',
      买量渠道: 'facebook',
      注册用户: 200,
      广告类型: 'rewarded',
      变现渠道: 'applovin',
      生命周期: 'D0',
      曝光人数: 150,
      曝光次数: 400,
      广告收益: 18.0,
      点击次数: 45,
    },
  ];

  describe('字段检测', () => {
    it('广告类型应被识别为维度字段', () => {
      const headers = ['广告类型', '变现渠道', '生命周期', '注册用户', '广告收益'];
      const fields = detectFieldTypes(headers, mockData);

      expect(fields.find((f) => f.name === '广告类型')?.type).toBe('dimension');
      expect(fields.find((f) => f.name === '广告类型')?.dataType).toBe('string');
    });

    it('变现渠道应被识别为维度字段', () => {
      const headers = ['广告类型', '变现渠道', '生命周期', '注册用户'];
      const fields = detectFieldTypes(headers, mockData);

      expect(fields.find((f) => f.name === '变现渠道')?.type).toBe('dimension');
      expect(fields.find((f) => f.name === '变现渠道')?.dataType).toBe('string');
    });

    it('生命周期应被识别为维度字段', () => {
      const headers = ['广告类型', '变现渠道', '生命周期', '注册用户'];
      const fields = detectFieldTypes(headers, mockData);

      expect(fields.find((f) => f.name === '生命周期')?.type).toBe('dimension');
      expect(fields.find((f) => f.name === '生命周期')?.dataType).toBe('string');
    });

    it('新旧字段同时存在时应全部正确识别', () => {
      const headers = [
        '日期',
        '应用',
        '标准广告场景',
        '广告类型',
        '变现渠道',
        '生命周期',
        '注册用户',
        '广告收益',
      ];
      const fields = detectFieldTypes(headers, mockData);

      const dimensions = fields.filter((f) => f.type === 'dimension');
      expect(dimensions.map((f) => f.name)).toEqual(
        expect.arrayContaining(['日期', '应用', '标准广告场景', '广告类型', '变现渠道', '生命周期'])
      );

      const measures = fields.filter((f) => f.type === 'measure');
      expect(measures.map((f) => f.name)).toEqual(expect.arrayContaining(['注册用户', '广告收益']));
    });
  });

  describe('广告类型作为行维度', () => {
    it('应按广告类型正确聚合', () => {
      const result = aggregateData(
        mockData,
        [createPivotField('广告类型', 'dimension')],
        [],
        [createPivotField('广告收益', 'measure')]
      );

      // banner: 12.5 + 5.0 + 10.0 = 27.5 (D0 admob + D0 unity + D1 admob)
      // interstitial: 25.0
      // rewarded: 18.0
      const bannerRow = result.rowHeaders.findIndex((h) => h[0] === 'banner');
      const interstitialRow = result.rowHeaders.findIndex((h) => h[0] === 'interstitial');
      const rewardedRow = result.rowHeaders.findIndex((h) => h[0] === 'rewarded');

      expect(bannerRow).toBeGreaterThanOrEqual(0);
      expect(interstitialRow).toBeGreaterThanOrEqual(0);
      expect(rewardedRow).toBeGreaterThanOrEqual(0);

      expect(result.data[bannerRow][0]).toBeCloseTo(27.5);
      expect(result.data[interstitialRow][0]).toBeCloseTo(25.0);
      expect(result.data[rewardedRow][0]).toBeCloseTo(18.0);
    });
  });

  describe('变现渠道作为列维度', () => {
    it('应按变现渠道正确生成列头', () => {
      const result = aggregateData(
        mockData,
        [createPivotField('广告类型', 'dimension')],
        [createPivotField('变现渠道', 'dimension')],
        [createPivotField('广告收益', 'measure')]
      );

      // 唯一渠道: admob, applovin, unity
      expect(result.colFieldNames).toEqual(['变现渠道']);
      expect(result.columnHeaders.sort()).toEqual(['admob', 'applovin', 'unity']);
    });
  });

  describe('生命周期作为维度', () => {
    it('应按生命周期正确聚合', () => {
      const result = aggregateData(
        mockData,
        [createPivotField('生命周期', 'dimension')],
        [],
        [createPivotField('广告收益', 'measure'), createPivotField('曝光次数', 'measure')]
      );

      const d0Row = result.rowHeaders.findIndex((h) => h[0] === 'D0');
      const d1Row = result.rowHeaders.findIndex((h) => h[0] === 'D1');

      expect(d0Row).toBeGreaterThanOrEqual(0);
      expect(d1Row).toBeGreaterThanOrEqual(0);

      // D0 广告收益: 12.5 + 25.0 + 5.0 + 18.0 = 60.5
      expect(result.data[d0Row][0]).toBeCloseTo(60.5);
      // D0 曝光次数: 1000 + 600 + 500 + 400 = 2500
      expect(result.data[d0Row][1]).toBe(2500);

      // D1 广告收益: 10.0
      expect(result.data[d1Row][0]).toBeCloseTo(10.0);
      // D1 曝光次数: 900
      expect(result.data[d1Row][1]).toBe(900);
    });
  });

  describe('注册用户半可加去重', () => {
    it('跨广告类型聚合时注册用户应取 max 而非 sum', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          版本: '1.0',
          买量渠道: 'google',
          广告类型: 'banner',
          变现渠道: 'admob',
          生命周期: 'D0',
          注册用户: 500,
          广告收益: 12.5,
          曝光人数: 300,
          曝光次数: 1000,
          点击次数: 80,
        },
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          版本: '1.0',
          买量渠道: 'google',
          广告类型: 'interstitial',
          变现渠道: 'admob',
          生命周期: 'D0',
          注册用户: 500,
          广告收益: 25.0,
          曝光人数: 250,
          曝光次数: 600,
          点击次数: 50,
        },
      ];

      // 按广告类型分行，无列维度 → 行总计应正确
      const result = aggregateData(
        data,
        [createPivotField('广告类型', 'dimension')],
        [],
        [createPivotField('注册用户', 'measure'), createPivotField('广告收益', 'measure')]
      );

      // banner: 注册用户=500, interstitial: 注册用户=500
      expect(result.data[0][0]).toBe(500);
      expect(result.data[1][0]).toBe(500);

      // 行总计（列总计）：注册用户应为 500（半可加取 max），不是 1000
      // columnTotals 对应列总计行
      expect(result.columnTotals[0]).toBe(500); // 注册用户去重
      expect(result.columnTotals[1]).toBeCloseTo(37.5); // 广告收益可加 sum
    });

    it('跨生命周期聚合时注册用户应取 max 而非 sum', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          版本: '1.0',
          买量渠道: 'google',
          广告类型: 'banner',
          变现渠道: 'admob',
          生命周期: 'D0',
          注册用户: 500,
          广告收益: 12.5,
          曝光人数: 300,
          曝光次数: 1000,
          点击次数: 80,
        },
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          版本: '1.0',
          买量渠道: 'google',
          广告类型: 'banner',
          变现渠道: 'admob',
          生命周期: 'D1',
          注册用户: 450,
          广告收益: 10.0,
          曝光人数: 280,
          曝光次数: 900,
          点击次数: 70,
        },
      ];

      const result = aggregateData(
        data,
        [createPivotField('生命周期', 'dimension')],
        [],
        [
          createPivotField('注册用户', 'measure'),
          createPivotField('广告收益', 'measure'),
          createPivotField('曝光人数', 'measure'),
        ]
      );

      const d0Row = result.rowHeaders.findIndex((h) => h[0] === 'D0');
      const d1Row = result.rowHeaders.findIndex((h) => h[0] === 'D1');

      // 各行原始值
      expect(result.data[d0Row][0]).toBe(500);
      expect(result.data[d1Row][0]).toBe(450);

      // 列总计：注册用户半可加 max(500,450)=500，不是 950
      expect(result.columnTotals[0]).toBe(500);
      // 广告收益可加 sum: 12.5 + 10.0 = 22.5
      expect(result.columnTotals[1]).toBeCloseTo(22.5);
      // 曝光人数半可加 max(300,280)=300
      expect(result.columnTotals[2]).toBe(300);
    });

    it('跨变现渠道聚合时注册用户应取 max 而非 sum', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          版本: '1.0',
          买量渠道: 'google',
          广告类型: 'banner',
          变现渠道: 'admob',
          生命周期: 'D0',
          注册用户: 500,
          广告收益: 12.5,
          曝光人数: 300,
          曝光次数: 1000,
          点击次数: 80,
        },
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          版本: '1.0',
          买量渠道: 'google',
          广告类型: 'banner',
          变现渠道: 'unity',
          生命周期: 'D0',
          注册用户: 500,
          广告收益: 5.0,
          曝光人数: 180,
          曝光次数: 500,
          点击次数: 30,
        },
      ];

      const result = aggregateData(
        data,
        [],
        [createPivotField('变现渠道', 'dimension')],
        [createPivotField('注册用户', 'measure'), createPivotField('广告收益', 'measure')]
      );

      // 列总计：注册用户半可加 max(500,500)=500
      expect(result.grandTotal).toBe(500);
    });
  });

  describe('新维度筛选', () => {
    it('广告类型筛选应正确过滤数据', () => {
      const result = aggregateData(
        mockData,
        [createPivotField('生命周期', 'dimension')],
        [],
        [createPivotField('广告收益', 'measure')],
        [{ fieldName: '广告类型', selectedValues: ['banner'] }]
      );

      // 只有 banner 行：D0(admob 12.5 + unity 5.0) + D1(admob 10.0)
      const d0Row = result.rowHeaders.findIndex((h) => h[0] === 'D0');
      const d1Row = result.rowHeaders.findIndex((h) => h[0] === 'D1');

      expect(result.data[d0Row][0]).toBeCloseTo(17.5); // 12.5 + 5.0
      expect(result.data[d1Row][0]).toBeCloseTo(10.0);
    });

    it('变现渠道筛选应正确过滤数据', () => {
      const result = aggregateData(
        mockData,
        [createPivotField('广告类型', 'dimension')],
        [],
        [createPivotField('广告收益', 'measure')],
        [{ fieldName: '变现渠道', selectedValues: ['admob'] }]
      );

      const bannerRow = result.rowHeaders.findIndex((h) => h[0] === 'banner');
      const interstitialRow = result.rowHeaders.findIndex((h) => h[0] === 'interstitial');

      // banner: D0 admob 12.5 + D1 admob 10.0 = 22.5
      expect(result.data[bannerRow][0]).toBeCloseTo(22.5);
      // interstitial: D0 admob 25.0
      expect(result.data[interstitialRow][0]).toBeCloseTo(25.0);
    });

    it('生命周期筛选应正确过滤数据', () => {
      const result = aggregateData(
        mockData,
        [createPivotField('广告类型', 'dimension')],
        [],
        [createPivotField('广告收益', 'measure')],
        [{ fieldName: '生命周期', selectedValues: ['D0'] }]
      );

      const bannerRow = result.rowHeaders.findIndex((h) => h[0] === 'banner');
      // banner D0: admob 12.5 + unity 5.0 = 17.5
      expect(result.data[bannerRow][0]).toBeCloseTo(17.5);
    });
  });

  describe('新维度筛选候选值', () => {
    it('getUniqueValues 应返回广告类型的唯一值', () => {
      expect(getUniqueValues(mockData, '广告类型').sort()).toEqual([
        'banner',
        'interstitial',
        'rewarded',
      ]);
    });

    it('getUniqueValues 应返回变现渠道的唯一值', () => {
      expect(getUniqueValues(mockData, '变现渠道').sort()).toEqual(['admob', 'applovin', 'unity']);
    });

    it('getUniqueValues 应返回生命周期的唯一值', () => {
      expect(getUniqueValues(mockData, '生命周期').sort()).toEqual(['D0', 'D1']);
    });
  });

  describe('新旧维度共存', () => {
    it('标准广告场景和广告类型同时作为维度时应正确聚合', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          标准广告场景: '冷启动',
          广告类型: 'banner',
          注册用户: 500,
          广告收益: 10,
        },
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          标准广告场景: '冷启动',
          广告类型: 'interstitial',
          注册用户: 500,
          广告收益: 20,
        },
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          标准广告场景: '热启动',
          广告类型: 'banner',
          注册用户: 300,
          广告收益: 5,
        },
      ];

      const result = aggregateData(
        data,
        [createPivotField('标准广告场景', 'dimension')],
        [createPivotField('广告类型', 'dimension')],
        [createPivotField('广告收益', 'measure')]
      );

      // 行: 冷启动, 热启动
      expect(result.rowHeaders).toEqual([['冷启动'], ['热启动']]);
      // 列: banner, interstitial（单 valueField 不追加指标名）
      expect(result.columnHeaders.sort()).toEqual(['banner', 'interstitial']);

      // 冷启动 / banner = 10, 冷启动 / interstitial = 20
      expect(result.data[0]).toEqual([10, 20]);
      // 热启动 / banner = 5, 热启动 / interstitial = 0
      expect(result.data[1]).toEqual([5, 0]);
    });
  });

  describe('计算字段在新维度下', () => {
    it('eCPM 在按广告类型分组时应正确计算', () => {
      const result = aggregateData(
        mockData,
        [createPivotField('广告类型', 'dimension')],
        [],
        [createPivotField('eCPM', 'measure')]
      );

      const bannerRow = result.rowHeaders.findIndex((h) => h[0] === 'banner');
      // banner: 广告收益=27.5, 曝光次数=2400, eCPM = (27.5/2400)*1000 ≈ 11.458
      expect(result.data[bannerRow][0]).toBeCloseTo((27.5 / 2400) * 1000, 2);
    });

    it('ARPU 在按生命周期分组时应正确计算', () => {
      const result = aggregateData(
        mockData,
        [createPivotField('生命周期', 'dimension')],
        [],
        [createPivotField('ARPU', 'measure')]
      );

      const d0Row = result.rowHeaders.findIndex((h) => h[0] === 'D0');
      // D0: 广告收益=60.5
      // 注册用户半可加：google 渠道 max(500,400,300)=500, facebook 渠道 200 → 500+200=700
      // ARPU = 60.5 / 700
      expect(result.data[d0Row][0]).toBeCloseTo(60.5 / 700, 3);
    });
  });

  describe('行为维度 ALL 行展示过滤与计算口径', () => {
    // 模拟 SQL GROUPING SETS 输出：含 ALL 行的数据
    const dataWithAllRows: DataRow[] = [
      // ALL 汇总行（广告类型=ALL）
      {
        日期: '2026-06-10',
        应用: 'fr006b',
        国家: 'US',
        版本: '1.0',
        买量渠道: 'google',
        广告类型: 'ALL',
        注册用户: 500,
        活跃用户: 800,
        曝光人数: 300,
        曝光次数: 1600,
        广告收益: 37.5,
        点击次数: 130,
      },
      // 拆分行 1：banner
      {
        日期: '2026-06-10',
        应用: 'fr006b',
        国家: 'US',
        版本: '1.0',
        买量渠道: 'google',
        广告类型: 'banner',
        注册用户: null as unknown as number,
        活跃用户: null as unknown as number,
        曝光人数: 150,
        曝光次数: 1000,
        广告收益: 12.5,
        点击次数: 80,
      },
      // 拆分行 2：interstitial
      {
        日期: '2026-06-10',
        应用: 'fr006b',
        国家: 'US',
        版本: '1.0',
        买量渠道: 'google',
        广告类型: 'interstitial',
        注册用户: null as unknown as number,
        活跃用户: null as unknown as number,
        曝光人数: 200,
        曝光次数: 600,
        广告收益: 25.0,
        点击次数: 50,
      },
    ];

    it('广告类型作为行维度时 UI 仅展示拆分项', () => {
      const result = aggregateData(
        dataWithAllRows,
        [createPivotField('广告类型', 'dimension')],
        [],
        [createPivotField('曝光人数', 'measure'), createPivotField('广告收益', 'measure')]
      );

      // UI 行头应该只有 banner 和 interstitial，没有 ALL
      const adTypes = result.rowHeaders.map((h) => h[0]);
      expect(adTypes).toContain('banner');
      expect(adTypes).toContain('interstitial');
      expect(adTypes).not.toContain('ALL');

      // banner: 曝光人数=150, 广告收益=12.5
      const bannerRow = adTypes.indexOf('banner');
      expect(result.data[bannerRow][0]).toBe(150);
      expect(result.data[bannerRow][1]).toBeCloseTo(12.5);

      // interstitial: 曝光人数=200, 广告收益=25.0
      const interstitialRow = adTypes.indexOf('interstitial');
      expect(result.data[interstitialRow][0]).toBe(200);
      expect(result.data[interstitialRow][1]).toBeCloseTo(25.0);
    });

    it('广告类型不作为维度时应使用 ALL 行口径', () => {
      const result = aggregateData(
        dataWithAllRows,
        [createPivotField('日期', 'dimension')],
        [],
        [createPivotField('曝光人数', 'measure'), createPivotField('广告收益', 'measure')]
      );

      // 只有一个日期行，度量值来自 ALL 行口径
      expect(result.rowHeaders).toEqual([['2026-06-10']]);
      // 曝光人数：ALL 行的去重值 300（不是 150+200=350）
      expect(result.data[0][0]).toBe(300);
      // 广告收益：ALL 行的值 37.5
      expect(result.data[0][1]).toBeCloseTo(37.5);
    });

    it('广告类型不作为维度时，列总计应使用 ALL 行去重值', () => {
      const result = aggregateData(
        dataWithAllRows,
        [],
        [],
        [createPivotField('曝光人数', 'measure'), createPivotField('注册用户', 'measure')]
      );

      // 总计：曝光人数=300（ALL 行去重值），注册用户=500（ALL 行值）
      expect(result.grandTotal).toBe(300);
    });
  });

  describe('NULL 隔离保护：属性指标读取 ALL 大盘口径', () => {
    it('detail 行属性指标为 NULL 时，聚合总计应使用 ALL 行的值', () => {
      const data: DataRow[] = [
        // ALL 行：注册用户=350
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          广告类型: 'ALL',
          注册用户: 350,
          活跃用户: 800,
          曝光人数: 180,
          广告收益: 50,
        },
        // 拆分行 1：注册用户=NULL
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          广告类型: 'banner',
          注册用户: null as unknown as number,
          活跃用户: null as unknown as number,
          曝光人数: 100,
          广告收益: 20,
        },
        // 拆分行 2：注册用户=NULL
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'US',
          广告类型: 'interstitial',
          注册用户: null as unknown as number,
          活跃用户: null as unknown as number,
          曝光人数: 150,
          广告收益: 30,
        },
      ];

      // 按广告类型展开 → 属性指标应通过剪枝读取 ALL 大盘值
      const resultExpanded = aggregateData(
        data,
        [createPivotField('广告类型', 'dimension')],
        [],
        [createPivotField('注册用户', 'measure'), createPivotField('曝光人数', 'measure')]
      );

      const bannerRow = resultExpanded.rowHeaders.findIndex((h) => h[0] === 'banner');
      const interstitialRow = resultExpanded.rowHeaders.findIndex((h) => h[0] === 'interstitial');

      // detail 行注册用户为 NULL → 使用 ALL 行大盘值填充
      expect(resultExpanded.data[bannerRow][0]).toBe(350);
      expect(resultExpanded.data[interstitialRow][0]).toBe(350);

      // detail 行曝光人数正常显示
      expect(resultExpanded.data[bannerRow][1]).toBe(100);
      expect(resultExpanded.data[interstitialRow][1]).toBe(150);

      // 不按广告类型展开 → 使用 ALL 行
      const resultCollapsed = aggregateData(
        data,
        [createPivotField('日期', 'dimension')],
        [],
        [createPivotField('注册用户', 'measure'), createPivotField('曝光人数', 'measure')]
      );

      // 注册用户=350（ALL 行值），曝光人数=180（ALL 行去重值）
      expect(resultCollapsed.data[0][0]).toBe(350);
      expect(resultCollapsed.data[0][1]).toBe(180);
    });
  });

  describe('数据预处理口径', () => {
    it('注册用户回填应使用映射后的国家键，避免大小写或国家名映射导致查找失败', () => {
      const data: DataRow[] = [
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'br',
          广告类型: 'ALL',
          注册用户: 123,
          曝光人数: 50,
          曝光次数: 100,
          广告收益: 10,
        },
        {
          日期: '2026-06-10',
          应用: 'fr006b',
          国家: 'BR',
          广告类型: 'banner',
          注册用户: null as unknown as number,
          曝光人数: 5,
          曝光次数: 20,
          广告收益: 2,
        },
      ];

      const result = preprocessData(data);

      expect(result[0].国家).toBe('巴西');
      expect(result[1].国家).toBe('巴西');
      expect(result[1].注册用户).toBe(123);
      expect(result[1].IPU).toBeCloseTo(20 / 123, 5);
    });
  });
});
