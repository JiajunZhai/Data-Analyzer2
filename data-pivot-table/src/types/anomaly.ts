export type AnomalySeverity = 'CRITICAL' | 'WARNING';

export type AnomalyStatus = 'PENDING' | 'ACTIVE' | 'RESOLVED' | 'MUTED';

export interface RootCauseMember {
  dimensionName: string;
  memberValue: string;
  explanatoryPower: number;
}

export interface RootCauseResult {
  topCauses: RootCauseMember[];
}

export interface AnomalyResult {
  anomalyId: string;
  dataDate: string;
  metricName: string;
  status: AnomalyStatus;
  severityLevel: AnomalySeverity;
  anomalyTitle: string;
  diagnosisDesc: string;
  deviationRate: number;
  deviationRateDesc: string;
  baselineDesc: string;
  timeInfoDesc: string;
  rootCause?: RootCauseResult;
  createdAt?: number;
  updatedAt?: number;
  userActionTime?: number;
  mutedUntil?: string;
}

export interface DayAnomaly {
  date: string;
  metricName: string;
  currentValue: number;
  previousValue: number;
  changeRate: number;
  severity: AnomalySeverity;
  rootCause: string;
}

export interface MetricTrend {
  metricName: string;
  startValue: number;
  endValue: number;
  totalChangeRate: number;
  dailyChanges: number[];
  anomalyCount: number;
}

export interface AppAnalysisResult {
  appName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  trends: MetricTrend[];
  anomalies: DayAnomaly[];
  summary: string;
}

export interface AnalysisDiagnostics {
  totalApps: number;
  totalDays: number;
  dateRange: string;
  missingFields: string[];
}

export interface FilterPayload {
  filters: Record<string, string[]>;
  rows: string[];
  columns: string[];
  values: string[];
}

export interface MonitorThreshold {
  metricName: string;
  minVolume: number;
  absoluteDiff: number;
}

export const MONITOR_THRESHOLDS: MonitorThreshold[] = [
  { metricName: '注册用户', minVolume: 100, absoluteDiff: 50 },
  { metricName: '曝光人数', minVolume: 500, absoluteDiff: 100 },
  { metricName: '曝光次数', minVolume: 10000, absoluteDiff: 5000 },
  { metricName: '点击次数', minVolume: 1000, absoluteDiff: 500 },
  { metricName: '广告收益', minVolume: 50, absoluteDiff: 10 },
];

export const METRIC_DISPLAY_NAMES: Record<string, string> = {
  广告收益: '广告收益',
  ARPU: 'ARPU',
  CTR: 'CTR',
  注册用户: '注册用户',
  曝光人数: '曝光人数',
  曝光次数: '曝光次数',
  点击次数: '点击次数',
  eCPM: 'eCPM',
  渗透率: '渗透率',
  IPU: 'IPU',
};

export const FIELD_MAPPING: Record<string, string[]> = {
  日期: ['日期', 'date', 'Date', 'DATE', 'day'],
  应用: ['应用', 'app', 'App', 'APP', '应用名', 'app_name'],
  国家: ['国家', 'country', 'Country', 'COUNTRY', '国家代码'],
  渠道: ['渠道', 'channel', 'Channel', 'CHANNEL', '渠道名'],
  版本: ['版本', 'version', 'Version', 'VERSION', 'app_version'],
  标准广告场景: ['标准广告场景', 'standard_scene', 'StandardScene'],
  聚合广告场景: ['聚合广告场景', 'aggregate_scene', 'AggregateScene'],
  广告场景: ['广告场景', 'scenario', 'Scenario', 'ad_scenario', '场景'],
  注册用户: ['注册用户', 'reg_users', 'registrations', '注册', 'new_users'],
  曝光人数: ['曝光人数', 'impression_users', '曝光用户', 'impression_unique'],
  曝光次数: ['曝光次数', 'impressions', '曝光数', 'impression_count'],
  点击次数: ['点击次数', 'clicks', '点击', 'click_count'],
  广告收益: ['广告收益', 'revenue', 'ad_revenue', '收益', 'earnings'],
};

// ============ 对比模式 ============

/** 对比模式 */
export type ComparisonMode = 'day' | 'prev_day' | 'multi_day' | 'week';

/** 对比模式配置 */
export interface ComparisonModeConfig {
  mode: ComparisonMode;
  label: string;
  description: string;
  /** 所需最少天数 */
  minDays: number;
}

/** 可用的对比模式 */
export const COMPARISON_MODES: ComparisonModeConfig[] = [
  { mode: 'day', label: '日环比', description: '最新日 vs 前一日', minDays: 2 },
  { mode: 'prev_day', label: '昨日对比前日', description: '倒数第二天 vs 倒数第三天', minDays: 3 },
  { mode: 'multi_day', label: '多日环比', description: '近3天 vs 前3天', minDays: 6 },
  { mode: 'week', label: '周环比', description: '近7天 vs 前7天', minDays: 14 },
];

// ============ 诊断模块新增类型 ============

/** 单指标快照（当前值 + 基准值 + 变化率） */
export interface MetricSnapshot {
  current: number;
  previous: number;
  changeRate: number;
}

/** ARPU 双因子拆解结果 */
export interface ArpuDecomposition {
  arpu: MetricSnapshot;
  ipuPerUser: MetricSnapshot;   // 注册IPU（量因子）
  ecpm: MetricSnapshot;         // eCPM（价因子）
  attribution: {
    quantityContribution: number; // 量贡献占比 (0-1)
    priceContribution: number;   // 价贡献占比 (0-1)
    primaryFactor: 'quantity' | 'price' | 'balanced';
  };
}

/** IPU 二级拆解结果 */
export interface IpuDecomposition {
  ipuPerUser: MetricSnapshot;       // 注册IPU = 曝光次数 / 注册用户
  penetration: MetricSnapshot;      // 广告渗透率 = 曝光人数 / 注册用户
  impressionUserIpu: MetricSnapshot; // 曝光用户IPU = 曝光次数 / 曝光人数(去重)
  diagnosis: 'penetration_down' | 'frequency_down' | 'both_down' | 'stable';
}

/** 单个维度成员的贡献度 */
export interface DimensionMemberContribution {
  value: string;
  currentMetric: number;
  previousMetric: number;
  contribution: number;   // 贡献占比 (0-1)
  userShare?: number;     // 用户占比（国家维度用）
  previousUserShare?: number;
}

/** 维度贡献度分析 */
export interface DimensionContribution {
  dimensionName: string;
  members: DimensionMemberContribution[];
}

/** 收益波动快照 */
export interface RevenueSnapshot {
  revenue: MetricSnapshot;         // 广告收益
  registeredUsers: MetricSnapshot; // 注册用户
  impressions: MetricSnapshot;     // 曝光次数
  impressionUsers: MetricSnapshot; // 曝光人数
}

/** 三级诊断结果 */
export interface DiagnosticResult {
  appName: string;
  currentDate: string;
  previousDate: string;
  comparisonMode: ComparisonMode;
  level1: ArpuDecomposition;
  revenue: RevenueSnapshot;
  level2: {
    ipuBreakdown: IpuDecomposition;
    ecpmDimensions: DimensionContribution[];
  };
  level3: {
    versionContrib: DimensionContribution;
    channelContrib: DimensionContribution;
    countryContrib: DimensionContribution;
    scenarioContrib: DimensionContribution;
  };
  conclusion: string;
}
