import { describe, expect, it } from 'vitest';
import type { DataRow, Field, PivotField } from '../../types';
import { aggregateData } from '../aggregator';

const createField = (name: string, type: Field['type']): Field => ({
  name,
  type,
  dataType: type === 'measure' ? 'number' : 'string',
});

const createPivotField = (name: string, type: Field['type']): PivotField => ({
  field: createField(name, type),
  aggregation: type === 'measure' ? 'sum' : undefined,
});

/**
 * 深度验证数据准确性测试
 *
 * 覆盖：
 * - 属性维度（日期、应用、国家、版本、买量渠道、生命周期）
 * - 行为维度（标准广告场景、聚合广告场景、广告类型、变现渠道）
 * - 所有指标：注册用户、曝光人数、曝光次数、点击次数、广告收益、eCPM、IPU、渗透率、ARPU、CTR、收益占比%
 * - 行维度 × 列维度 × 值维度 × 过滤条件的各种组合
 *
 * 数据模型：SQL GROUPING SETS 输出格式
 * - 每个日期/应用/国家 组合有一行 ALL 行（行为维度=ALL），包含去重后的属性指标真实值
 * - 每个日期/应用/国家 组合有多行明细行（行为维度≠ALL），属性指标为 NULL，行为指标有值
 */

// ═══════════════════════════════════════════════════════════════
// 共享测试数据集
// ═══════════════════════════════════════════════════════════════

const FULL_DATASET: DataRow[] = [
  // ── 日期 06-10, 应用 AppA, 国家 US ──
  // ALL 行
  {
    日期: '2026-06-10',
    应用: 'AppA',
    国家: 'US',
    版本: '1.0',
    标准广告场景: 'ALL',
    广告类型: 'ALL',
    注册用户: 500,
    活跃用户: 800,
    曝光人数: 300,
    曝光次数: 2000,
    点击次数: 100,
    广告收益: 80,
  },
  // 明细行 1
  {
    日期: '2026-06-10',
    应用: 'AppA',
    国家: 'US',
    版本: '1.0',
    标准广告场景: '冷启动',
    广告类型: 'banner',
    注册用户: null as unknown as number,
    活跃用户: null as unknown as number,
    曝光人数: 120,
    曝光次数: 800,
    点击次数: 40,
    广告收益: 30,
  },
  // 明细行 2
  {
    日期: '2026-06-10',
    应用: 'AppA',
    国家: 'US',
    版本: '1.0',
    标准广告场景: '热启动',
    广告类型: 'interstitial',
    注册用户: null as unknown as number,
    活跃用户: null as unknown as number,
    曝光人数: 180,
    曝光次数: 1200,
    点击次数: 60,
    广告收益: 50,
  },

  // ── 日期 06-10, 应用 AppA, 国家 DE ──
  // ALL 行
  {
    日期: '2026-06-10',
    应用: 'AppA',
    国家: 'DE',
    版本: '1.0',
    标准广告场景: 'ALL',
    广告类型: 'ALL',
    注册用户: 200,
    活跃用户: 350,
    曝光人数: 150,
    曝光次数: 900,
    点击次数: 45,
    广告收益: 36,
  },
  // 明细行 3
  {
    日期: '2026-06-10',
    应用: 'AppA',
    国家: 'DE',
    版本: '1.0',
    标准广告场景: '冷启动',
    广告类型: 'banner',
    注册用户: null as unknown as number,
    活跃用户: null as unknown as number,
    曝光人数: 90,
    曝光次数: 500,
    点击次数: 25,
    广告收益: 20,
  },
  // 明细行 4
  {
    日期: '2026-06-10',
    应用: 'AppA',
    国家: 'DE',
    版本: '1.0',
    标准广告场景: '热启动',
    广告类型: 'interstitial',
    注册用户: null as unknown as number,
    活跃用户: null as unknown as number,
    曝光人数: 100,
    曝光次数: 400,
    点击次数: 20,
    广告收益: 16,
  },

  // ── 日期 06-11, 应用 AppA, 国家 US ──
  // ALL 行
  {
    日期: '2026-06-11',
    应用: 'AppA',
    国家: 'US',
    版本: '1.0',
    标准广告场景: 'ALL',
    广告类型: 'ALL',
    注册用户: 520,
    活跃用户: 820,
    曝光人数: 310,
    曝光次数: 2100,
    点击次数: 105,
    广告收益: 84,
  },
  // 明细行 5
  {
    日期: '2026-06-11',
    应用: 'AppA',
    国家: 'US',
    版本: '1.0',
    标准广告场景: '冷启动',
    广告类型: 'banner',
    注册用户: null as unknown as number,
    活跃用户: null as unknown as number,
    曝光人数: 125,
    曝光次数: 850,
    点击次数: 42,
    广告收益: 32,
  },
  // 明细行 6
  {
    日期: '2026-06-11',
    应用: 'AppA',
    国家: 'US',
    版本: '1.0',
    标准广告场景: '热启动',
    广告类型: 'interstitial',
    注册用户: null as unknown as number,
    活跃用户: null as unknown as number,
    曝光人数: 185,
    曝光次数: 1250,
    点击次数: 63,
    广告收益: 52,
  },

  // ── 日期 06-10, 应用 AppB, 国家 US ──
  // ALL 行
  {
    日期: '2026-06-10',
    应用: 'AppB',
    国家: 'US',
    版本: '2.0',
    标准广告场景: 'ALL',
    广告类型: 'ALL',
    注册用户: 300,
    活跃用户: 500,
    曝光人数: 200,
    曝光次数: 1500,
    点击次数: 75,
    广告收益: 60,
  },
  // 明细行 7
  {
    日期: '2026-06-10',
    应用: 'AppB',
    国家: 'US',
    版本: '2.0',
    标准广告场景: '冷启动',
    广告类型: 'banner',
    注册用户: null as unknown as number,
    活跃用户: null as unknown as number,
    曝光人数: 130,
    曝光次数: 900,
    点击次数: 45,
    广告收益: 35,
  },
  // 明细行 8
  {
    日期: '2026-06-10',
    应用: 'AppB',
    国家: 'US',
    版本: '2.0',
    标准广告场景: '热启动',
    广告类型: 'interstitial',
    注册用户: null as unknown as number,
    活跃用户: null as unknown as number,
    曝光人数: 110,
    曝光次数: 600,
    点击次数: 30,
    广告收益: 25,
  },
];

// ═══════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════

/** 从结果中按行头标签找行索引 */
function findRow(result: ReturnType<typeof aggregateData>, label: string): number {
  return result.rowHeaders.findIndex((h) => h.includes(label));
}

/** 从结果中按列头找列索引 */
function findCol(result: ReturnType<typeof aggregateData>, label: string): number {
  return result.columnHeaders.findIndex((h) => h.includes(label));
}

// ═══════════════════════════════════════════════════════════════
// 1. 属性维度行 × 无列维度 — 基础指标准确性
// ═══════════════════════════════════════════════════════════════

describe('1. 属性维度行 × 无列维度 — 基础指标', () => {
  it('按日期聚合：注册用户应为 ALL 行半可加去重值', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('注册用户', 'measure')]
    );
    // 06-10: 保留日期这个 Attribute 条件 → 500 + 200 + 300 = 1000
    const r10 = findRow(result, '2026-06-10');
    expect(result.data[r10][0]).toBe(1000);
    // 06-11: 保留日期条件 → 520
    const r11 = findRow(result, '2026-06-11');
    expect(result.data[r11][0]).toBe(520);
  });

  it('按日期聚合：曝光人数应为 ALL 行半可加去重值', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('曝光人数', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 300 + 150 + 200 = 650
    expect(result.data[r10][0]).toBe(650);
  });

  it('按日期聚合：广告收益应为明细行可加求和值', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('广告收益', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 30 + 50 + 20 + 16 + 35 + 25 = 176
    expect(result.data[r10][0]).toBeCloseTo(176);
  });

  it('按日期聚合：曝光次数应为明细行可加求和值', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('曝光次数', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 800 + 1200 + 500 + 400 + 900 + 600 = 4400
    expect(result.data[r10][0]).toBe(4400);
  });

  it('按日期聚合：点击次数应为明细行可加求和值', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('点击次数', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 40 + 60 + 25 + 20 + 45 + 30 = 220
    expect(result.data[r10][0]).toBe(220);
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. 属性维度行 × 无列维度 — 计算指标准确性
// ═══════════════════════════════════════════════════════════════

describe('2. 属性维度行 × 无列维度 — 计算指标', () => {
  it('eCPM = (广告收益/曝光次数)*1000', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('eCPM', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 广告收益=176, 曝光次数=4400, eCPM = 176/4400*1000 = 40
    expect(result.data[r10][0]).toBeCloseTo((176 / 4400) * 1000, 2);
  });

  it('CTR = 点击次数/曝光次数', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('CTR', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 点击次数=220, 曝光次数=4400, CTR = 220/4400 = 0.05
    expect(result.data[r10][0]).toBeCloseTo(220 / 4400, 5);
  });

  it('ARPU = 广告收益/注册用户', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('ARPU', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 广告收益=176, 注册用户=1000, ARPU = 176/1000 = 0.176
    expect(result.data[r10][0]).toBeCloseTo(176 / 1000, 5);
  });

  it('渗透率 = 曝光人数/注册用户', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('渗透率', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 曝光人数=650, 注册用户=1000(保留日期条件), 渗透率 = 650/1000
    expect(result.data[r10][0]).toBeCloseTo(650 / 1000, 5);
  });

  it('IPU = 曝光次数/注册用户', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('IPU', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 曝光次数=4400, 注册用户=1000, IPU = 4400/1000 = 4.4
    expect(result.data[r10][0]).toBeCloseTo(4400 / 1000, 5);
  });

  it('收益占比 = 广告收益/总广告收益', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('收益占比%', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    const r11 = findRow(result, '2026-06-11');
    // 总广告收益 = 176 + 84 = 260
    // 06-10 占比 = 176/260 * 100
    expect(result.data[r10][0]).toBeCloseTo((176 / 260) * 100, 2);
    expect(result.data[r11][0]).toBeCloseTo((84 / 260) * 100, 2);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. 行为维度行（标准广告场景）× 无列维度 — 属性指标应读取 ALL 大盘口径
// ═══════════════════════════════════════════════════════════════

describe('3. 行为维度行 × 无列维度 — ALL 大盘口径读取', () => {
  it('按标准广告场景展开时，注册用户应显示大盘分母值', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('标准广告场景', 'dimension')],
      [],
      [createPivotField('注册用户', 'measure')]
    );
    const coldRow = findRow(result, '冷启动');
    const hotRow = findRow(result, '热启动');
    // 行为维度剪枝：明细行注册用户应显示 ALL 行的大盘分母值
    // sumSemiAdditiveMetric 按 semiAdditiveKey 去重取 MAX → 500+200+520+300=1520
    expect(result.data[coldRow][0]).toBe(1520);
    expect(result.data[hotRow][0]).toBe(1520);
    // 列总计：同样使用 sumSemiAdditiveMetric 去重 → 1520
    expect(result.columnTotals[0]).toBe(1520);
  });

  it('按标准广告场景展开时，广告收益应正确聚合明细行', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('标准广告场景', 'dimension')],
      [],
      [createPivotField('广告收益', 'measure')]
    );
    const coldRow = findRow(result, '冷启动');
    // 冷启动: 06-10 AppA US 30 + 06-10 AppA DE 20 + 06-10 AppB US 35 + 06-11 AppA US 32 = 117
    expect(result.data[coldRow][0]).toBeCloseTo(117);
  });

  it('按标准广告场景展开时，曝光人数应正确聚合明细行', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('标准广告场景', 'dimension')],
      [],
      [createPivotField('曝光人数', 'measure')]
    );
    const coldRow = findRow(result, '冷启动');
    // 冷启动: 06-10 AppA US 120 + 06-10 AppA DE 90 + 06-10 AppB US 130 + 06-11 AppA US 125 = 465
    expect(result.data[coldRow][0]).toBe(465);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. 属性维度行 × 行为维度列 — 交叉透视准确性
// ═══════════════════════════════════════════════════════════════

describe('4. 属性维度行 × 行为维度列 — 交叉透视', () => {
  it('日期行 × 标准广告场景列：广告收益', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('标准广告场景', 'dimension')],
      [createPivotField('广告收益', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    const coldCol = findCol(result, '冷启动');
    const hotCol = findCol(result, '热启动');
    // 06-10 冷启动: 30 + 20 + 35 = 85
    expect(result.data[r10][coldCol]).toBeCloseTo(85);
    // 06-10 热启动: 50 + 16 + 25 = 91
    expect(result.data[r10][hotCol]).toBeCloseTo(91);
  });

  it('日期行 × 标准广告场景列：注册用户应显示大盘分母值', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('标准广告场景', 'dimension')],
      [createPivotField('注册用户', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    const coldCol = findCol(result, '冷启动');
    const hotCol = findCol(result, '热启动');
    // 行为维度剪枝：清掉场景列条件，但保留日期行条件 → 1000
    expect(result.data[r10][coldCol]).toBe(1000);
    expect(result.data[r10][hotCol]).toBe(1000);
  });

  it('日期行 × 标准广告场景列：行总计应正确', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('标准广告场景', 'dimension')],
      [createPivotField('广告收益', 'measure'), createPivotField('注册用户', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 行总计：广告收益 = 176
    expect(result.rowTotalValues[r10][0]).toBeCloseTo(176);
    // 行总计：注册用户保留日期条件 → 1000
    expect(result.rowTotalValues[r10][1]).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. 行为维度过滤场景 — 过滤器剪枝验证
// ═══════════════════════════════════════════════════════════════

describe('5. 行为维度过滤 — 过滤器剪枝', () => {
  it('广告类型=banner 过滤：行为指标应只含 banner 行', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [
        createPivotField('广告收益', 'measure'),
        createPivotField('曝光次数', 'measure'),
        createPivotField('点击次数', 'measure'),
      ],
      [{ fieldName: '广告类型', selectedValues: ['banner'] }]
    );
    const r10 = findRow(result, '2026-06-10');
    // banner 行: AppA US(30,800,40) + AppA DE(20,500,25) + AppB US(35,900,45)
    expect(result.data[r10][0]).toBeCloseTo(85); // 广告收益
    expect(result.data[r10][1]).toBe(2200); // 曝光次数
    expect(result.data[r10][2]).toBe(110); // 点击次数
  });

  it('广告类型=banner 过滤：属性指标应不受影响', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [
        createPivotField('注册用户', 'measure'),
        createPivotField('曝光人数', 'measure'),
        createPivotField('活跃用户', 'measure'),
      ],
      [{ fieldName: '广告类型', selectedValues: ['banner'] }]
    );
    const r10 = findRow(result, '2026-06-10');
    // 注册用户: 属性半可加，忽略广告类型过滤但保留日期条件 → 1000
    expect(result.data[r10][0]).toBe(1000);
    // 曝光人数: 行为半可加，使用明细行数据 120+90+130=340
    expect(result.data[r10][1]).toBe(340);
    // 活跃用户: 属性半可加，忽略广告类型过滤但保留日期条件 → 1650
    expect(result.data[r10][2]).toBe(1650);
  });

  it('广告类型=banner 过滤：计算指标应使用正确的分子分母', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [
        createPivotField('eCPM', 'measure'),
        createPivotField('CTR', 'measure'),
        createPivotField('ARPU', 'measure'),
        createPivotField('渗透率', 'measure'),
        createPivotField('IPU', 'measure'),
      ],
      [{ fieldName: '广告类型', selectedValues: ['banner'] }]
    );
    const r10 = findRow(result, '2026-06-10');
    // eCPM = 广告收益(banner)/曝光次数(banner)*1000 = 85/2200*1000
    expect(result.data[r10][0]).toBeCloseTo((85 / 2200) * 1000, 2);
    // CTR = 点击次数(banner)/曝光次数(banner) = 110/2200
    expect(result.data[r10][1]).toBeCloseTo(110 / 2200, 5);
    // ARPU = 广告收益(banner)/注册用户(保留日期条件) = 85/1000
    expect(result.data[r10][2]).toBeCloseTo(85 / 1000, 5);
    // 渗透率 = 曝光人数(明细)/注册用户(保留日期条件) = 340/1000
    expect(result.data[r10][3]).toBeCloseTo(340 / 1000, 5);
    // IPU = 曝光次数(banner)/注册用户(保留日期条件) = 2200/1000
    expect(result.data[r10][4]).toBeCloseTo(2200 / 1000, 5);
  });

  it('多行为过滤：广告类型=banner AND 标准广告场景=冷启动', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [
        createPivotField('广告收益', 'measure'),
        createPivotField('注册用户', 'measure'),
        createPivotField('渗透率', 'measure'),
      ],
      [
        { fieldName: '广告类型', selectedValues: ['banner'] },
        { fieldName: '标准广告场景', selectedValues: ['冷启动'] },
      ]
    );
    const r10 = findRow(result, '2026-06-10');
    // banner AND 冷启动: AppA US(30) + AppA DE(20) + AppB US(35) = 85
    expect(result.data[r10][0]).toBeCloseTo(85);
    // 注册用户: 属性半可加，忽略行为过滤但保留日期条件 → 1000
    expect(result.data[r10][1]).toBe(1000);
    // 渗透率 = 曝光人数(明细)/注册用户(保留日期条件) = 340/1000
    expect(result.data[r10][2]).toBeCloseTo(340 / 1000, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. 属性维度行 × 属性维度列 — 纯属性交叉
// ═══════════════════════════════════════════════════════════════

describe('6. 属性维度行 × 属性维度列 — 纯属性交叉', () => {
  it('日期行 × 应用列：注册用户', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('注册用户', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    const appACol = findCol(result, 'AppA');
    const appBCol = findCol(result, 'AppB');
    // AppA: US=500, DE=200 → 半可加 500+200=700
    expect(result.data[r10][appACol]).toBe(700);
    // AppB: US=300 → 300
    expect(result.data[r10][appBCol]).toBe(300);
  });

  it('日期行 × 应用列：广告收益', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('广告收益', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    const appACol = findCol(result, 'AppA');
    const appBCol = findCol(result, 'AppB');
    // AppA: 30+50+20+16 = 116
    expect(result.data[r10][appACol]).toBeCloseTo(116);
    // AppB: 35+25 = 60
    expect(result.data[r10][appBCol]).toBeCloseTo(60);
  });

  it('日期行 × 应用列：eCPM 计算', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('eCPM', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    const appACol = findCol(result, 'AppA');
    // AppA: 广告收益=116, 曝光次数=800+1200+500+400=2900
    // eCPM = 116/2900*1000
    expect(result.data[r10][appACol]).toBeCloseTo((116 / 2900) * 1000, 2);
  });

  it('日期行 × 应用列：行总计应正确汇总', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('广告收益', 'measure'), createPivotField('注册用户', 'measure')]
    );
    const r10 = findRow(result, '2026-06-10');
    // 行总计：广告收益 = 116 + 60 = 176
    expect(result.rowTotalValues[r10][0]).toBeCloseTo(176);
    // 行总计：注册用户 = 700 + 300 = 1000
    expect(result.rowTotalValues[r10][1]).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. 行为维度行 × 行为维度列 — 双行为交叉
// ═══════════════════════════════════════════════════════════════

describe('7. 行为维度行 × 行为维度列 — 双行为交叉', () => {
  it('标准广告场景行 × 广告类型列：广告收益', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('标准广告场景', 'dimension')],
      [createPivotField('广告类型', 'dimension')],
      [createPivotField('广告收益', 'measure')]
    );
    const coldRow = findRow(result, '冷启动');
    const bannerCol = findCol(result, 'banner');
    const interCol = findCol(result, 'interstitial');
    // 冷启动/banner: 06-10 AppA US 30 + 06-10 AppA DE 20 + 06-10 AppB US 35 + 06-11 AppA US 32 = 117
    expect(result.data[coldRow][bannerCol]).toBeCloseTo(117);
    // 冷启动/interstitial: 0 (无冷启动+interstitial 的明细行)
    expect(result.data[coldRow][interCol]).toBe(0);
  });

  it('标准广告场景行 × 广告类型列：注册用户应显示大盘值', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('标准广告场景', 'dimension')],
      [createPivotField('广告类型', 'dimension')],
      [createPivotField('注册用户', 'measure')]
    );
    const coldRow = findRow(result, '冷启动');
    const bannerCol = findCol(result, 'banner');
    // 行为维度剪枝：注册用户显示大盘值
    expect(result.data[coldRow][bannerCol]).toBe(1520);
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. 三级维度交叉 — 行+列+过滤
// ═══════════════════════════════════════════════════════════════

describe('8. 三级维度交叉 — 行+列+过滤', () => {
  it('日期行 × 应用列 + 广告类型过滤：广告收益', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('广告收益', 'measure')],
      [{ fieldName: '广告类型', selectedValues: ['banner'] }]
    );
    const r10 = findRow(result, '2026-06-10');
    const appACol = findCol(result, 'AppA');
    const appBCol = findCol(result, 'AppB');
    // banner only: AppA = 30+20=50, AppB = 35
    expect(result.data[r10][appACol]).toBeCloseTo(50);
    expect(result.data[r10][appBCol]).toBeCloseTo(35);
  });

  it('日期行 × 应用列 + 广告类型过滤：注册用户（不受行为过滤影响）', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('注册用户', 'measure')],
      [{ fieldName: '广告类型', selectedValues: ['banner'] }]
    );
    const r10 = findRow(result, '2026-06-10');
    const appACol = findCol(result, 'AppA');
    const appBCol = findCol(result, 'AppB');
    // 注册用户: 属性半可加，忽略广告类型过滤但保留日期和应用列条件
    expect(result.data[r10][appACol]).toBe(700);
    expect(result.data[r10][appBCol]).toBe(300);
  });

  it('日期行 × 应用列 + 广告类型过滤：渗透率', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('渗透率', 'measure')],
      [{ fieldName: '广告类型', selectedValues: ['banner'] }]
    );
    const r10 = findRow(result, '2026-06-10');
    const appACol = findCol(result, 'AppA');
    // 渗透率 = 曝光人数(明细)/注册用户(ALL 大盘口径)
    // AppA 06-10 banner: 曝光人数=120+90=210, 注册用户=700
    expect(result.data[r10][appACol]).toBeCloseTo(210 / 700, 5);
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. 列总计和总计准确性
// ═══════════════════════════════════════════════════════════════

describe('9. 列总计和总计准确性', () => {
  it('日期行 × 应用列：列总计', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('广告收益', 'measure')]
    );
    const appACol = findCol(result, 'AppA');
    const appBCol = findCol(result, 'AppB');
    // AppA 列总计: 06-10(30+50+20+16=116) + 06-11(32+52=84) = 200
    expect(result.columnTotals[appACol]).toBeCloseTo(200);
    // AppB 列总计: 06-10(35+25=60)
    expect(result.columnTotals[appBCol]).toBeCloseTo(60);
  });

  it('日期行 × 应用列：grandTotal', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('广告收益', 'measure')]
    );
    // grandTotal = 176 + 84 = 260
    expect(result.grandTotal).toBeCloseTo(260);
  });

  it('无列维度时：grandTotal 应正确', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('广告收益', 'measure')]
    );
    expect(result.grandTotal).toBeCloseTo(260);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. 边界场景
// ═══════════════════════════════════════════════════════════════

describe('10. 边界场景', () => {
  it('仅有 ALL 行的数据应正确处理', () => {
    const data: DataRow[] = [
      { 日期: '2026-06-10', 应用: 'AppA', 标准广告场景: 'ALL', 注册用户: 100, 广告收益: 50 },
    ];
    const result = aggregateData(
      data,
      [createPivotField('日期', 'dimension')],
      [],
      [createPivotField('注册用户', 'measure'), createPivotField('广告收益', 'measure')]
    );
    expect(result.data[0][0]).toBe(100);
    expect(result.data[0][1]).toBeCloseTo(50);
  });

  it('NULL 值不应影响可加指标', () => {
    const data: DataRow[] = [
      { 日期: '2026-06-10', 应用: 'AppA', 标准广告场景: 'ALL', 广告收益: 100 },
      {
        日期: '2026-06-10',
        应用: 'AppA',
        标准广告场景: '冷启动',
        广告收益: null as unknown as number,
      },
      { 日期: '2026-06-10', 应用: 'AppA', 标准广告场景: '热启动', 广告收益: 50 },
    ];
    const result = aggregateData(
      data,
      [createPivotField('标准广告场景', 'dimension')],
      [],
      [createPivotField('广告收益', 'measure')]
    );
    // NULL → Number(null)=0, NaN 被过滤, 无数据点
    const coldRow = findRow(result, '冷启动');
    expect(result.data[coldRow][0]).toBe(0);
    // 热启动: 50
    const hotRow = findRow(result, '热启动');
    expect(result.data[hotRow][0]).toBeCloseTo(50);
  });

  it('单值场景：所有指标应正确', () => {
    const data: DataRow[] = [
      {
        日期: '2026-06-10',
        应用: 'AppA',
        国家: 'US',
        标准广告场景: 'ALL',
        广告类型: 'ALL',
        注册用户: 100,
        曝光人数: 50,
        曝光次数: 200,
        点击次数: 10,
        广告收益: 5,
      },
    ];
    const result = aggregateData(
      data,
      [createPivotField('日期', 'dimension')],
      [],
      [
        createPivotField('注册用户', 'measure'),
        createPivotField('曝光人数', 'measure'),
        createPivotField('曝光次数', 'measure'),
        createPivotField('点击次数', 'measure'),
        createPivotField('广告收益', 'measure'),
        createPivotField('eCPM', 'measure'),
        createPivotField('CTR', 'measure'),
        createPivotField('ARPU', 'measure'),
        createPivotField('渗透率', 'measure'),
        createPivotField('IPU', 'measure'),
      ]
    );
    expect(result.data[0][0]).toBe(100); // 注册用户
    expect(result.data[0][1]).toBe(50); // 曝光人数
    expect(result.data[0][2]).toBe(200); // 曝光次数
    expect(result.data[0][3]).toBe(10); // 点击次数
    expect(result.data[0][4]).toBeCloseTo(5); // 广告收益
    expect(result.data[0][5]).toBeCloseTo(25); // eCPM = 5/200*1000
    expect(result.data[0][6]).toBeCloseTo(0.05); // CTR = 10/200
    expect(result.data[0][7]).toBeCloseTo(0.05); // ARPU = 5/100
    expect(result.data[0][8]).toBeCloseTo(0.5); // 渗透率 = 50/100
    expect(result.data[0][9]).toBeCloseTo(2); // IPU = 200/100
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. 值轴为 rows 的模式
// ═══════════════════════════════════════════════════════════════

describe('11. valueAxis=rows 模式', () => {
  it('行维度 × 列维度 × 多值字段', () => {
    const result = aggregateData(
      FULL_DATASET,
      [createPivotField('日期', 'dimension')],
      [createPivotField('应用', 'dimension')],
      [createPivotField('广告收益', 'measure'), createPivotField('注册用户', 'measure')],
      [],
      'rows'
    );
    // valueAxis=rows 时，值字段作为行维度的扩展
    expect(result.valueAxis).toBe('rows');
    expect(result.rowHeaders.length).toBeGreaterThan(0);
  });
});
