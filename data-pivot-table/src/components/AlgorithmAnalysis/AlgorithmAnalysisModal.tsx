import {
  BarChart3,
  Download,
  GitCompareArrows,
  History,
  Lightbulb,
  PieChart,
  Play,
  Settings2,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import type { Field } from '../../types';
import s from './AlgorithmAnalysis.module.css';

type Tab = 'trend' | 'variance' | 'comparison' | 'pop';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  fields: Field[];
  dimensions: Field[];
  measures: Field[];
  currentDatasetName?: string;
}

const COLORS = ['#2952c9', '#00658d', '#ba1a1a', '#5b21b6', '#476ce3', '#006d43'];

const AlgorithmAnalysisModal: React.FC<Props> = ({ isOpen, onClose, dimensions, measures }) => {
  const [tab, setTab] = useState<Tab>('trend');
  const dims = useMemo(() => dimensions.map((d) => d.name), [dimensions]);
  const mets = useMemo(() => measures.map((m) => m.name), [measures]);

  if (!isOpen) return null;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'trend', label: '数据走势', icon: <TrendingUp /> },
    { id: 'variance', label: '差异分析', icon: <GitCompareArrows /> },
    { id: 'comparison', label: '综合对比', icon: <BarChart3 /> },
    { id: 'pop', label: '环比分析', icon: <History /> },
  ];

  return (
    <div
      className={s.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="智能算法分析中心"
    >
      <div className={s.container}>
        <div className={s.top}>
          <header className={s.header}>
            <div className={s.headerLeft}>
              <div className={s.logo}>
                <Sparkles />
              </div>
              <span className={s.title}>智能算法分析中心</span>
            </div>
            <div className={s.headerRight}>
              <button type="button" className={`${s.btn} ${s.btnGhost}`}>
                <Settings2 />
                高级设置
              </button>
              <button type="button" className={`${s.btn} ${s.btnPrimary}`}>
                保存视图
              </button>
              <button type="button" className={s.btnClose} onClick={onClose}>
                <X size={16} />
              </button>
            </div>
          </header>
          <div className={s.tabs}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className={s.body}>
          <aside className={s.panel}>
            <div className={s.panelScroll}>
              {tab === 'trend' && <TrendPanel dims={dims} mets={mets} />}
              {tab === 'variance' && <VariancePanel dims={dims} mets={mets} />}
              {tab === 'comparison' && <ComparePanel dims={dims} mets={mets} />}
              {tab === 'pop' && <PoPPanel dims={dims} mets={mets} />}
            </div>
            <div className={s.panelFooter}>
              <button type="button" className={s.btnRun}>
                <Play />
                运行分析
              </button>
            </div>
          </aside>
          <main className={s.canvas}>
            {tab === 'trend' && <TrendCanvas mets={mets} />}
            {tab === 'variance' && <VarianceCanvas dims={dims} />}
            {tab === 'comparison' && <CompareCanvas mets={mets} />}
            {tab === 'pop' && <PoPCanvas />}
          </main>
        </div>
      </div>
    </div>
  );
};

/* ===== 通用表单组件 ===== */
const GroupTitle: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className={s.groupTitle}>
    {icon}
    {label}
  </div>
);

const Select: React.FC<{ label: string; opts: string[]; def?: string; hint?: string }> = ({
  label,
  opts,
  def,
  hint,
}) => (
  <div className={s.group}>
    <span className={s.label}>{label}</span>
    <select className={s.select} defaultValue={def}>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
    {hint && <span className={s.hint}>{hint}</span>}
  </div>
);

const CheckList: React.FC<{
  label: string;
  items: { name: string; color?: string; checked?: boolean }[];
}> = ({ label, items }) => (
  <div className={s.group}>
    <span className={s.label}>{label}</span>
    <div className={s.checkList}>
      {items.map((it) => (
        <label key={it.name} className={s.checkItem}>
          <input type="checkbox" defaultChecked={it.checked} />
          <span className={s.checkName}>{it.name}</span>
          {it.color && <span className={s.colorDot} style={{ background: it.color }} />}
        </label>
      ))}
    </div>
  </div>
);

const RadioList: React.FC<{
  label: string;
  name: string;
  items: { v: string; l: string; c?: boolean }[];
}> = ({ label, name, items }) => (
  <div className={s.group}>
    <span className={s.label}>{label}</span>
    <div className={s.radioList}>
      {items.map((it) => (
        <label key={it.v} className={s.radioItem}>
          <input type="radio" name={name} defaultChecked={it.c} />
          <span>{it.l}</span>
        </label>
      ))}
    </div>
  </div>
);

const Slider: React.FC<{
  label: string;
  min: number;
  max: number;
  step: number;
  val: number;
  left?: string;
  right?: string;
}> = ({ label, min, max, step, val, left, right }) => (
  <div className={s.sliderGroup}>
    <div className={s.sliderHeader}>
      <span className={s.label}>{label}</span>
      <span className={s.sliderValue}>{val}</span>
    </div>
    <input type="range" min={min} max={max} step={step} defaultValue={val} className={s.slider} />
    {(left || right) && (
      <div className={s.sliderLabels}>
        <span>{left}</span>
        <span>{right}</span>
      </div>
    )}
  </div>
);

const Toggle: React.FC<{ label: string; on?: boolean }> = ({ label, on }) => (
  <div className={s.toggle}>
    <span className={s.toggleLabel}>{label}</span>
    <div className={`${s.toggleTrack} ${on ? s.toggleOn : ''}`} />
  </div>
);

/* ===== 走势分析面板 ===== */
const TrendPanel: React.FC<{ dims: string[]; mets: string[] }> = ({ dims, mets }) => (
  <>
    <GroupTitle icon={<Settings2 />} label="基础配置" />
    <Select label="时间粒度" opts={['天', '周', '月']} hint="数据跨度≥15天时推荐选天" />
    <CheckList
      label="分析指标（最多3项）"
      items={mets.slice(0, 5).map((m, i) => ({ name: m, color: COLORS[i], checked: i < 2 }))}
    />
    <GroupTitle icon={<Zap />} label="高级参数" />
    <Slider label="平滑因子" min={0} max={1} step={0.1} val={0.4} left="原始" right="平滑" />
    <div className={s.divider} />
    <Toggle label="🔮 开启趋势预测" on />
    <Select label="预测周期" opts={['未来 3 天', '未来 7 天', '未来 14 天']} />
    <Select label="分析维度" opts={dims.length ? dims : ['日期']} def="日期" />
  </>
);

/* ===== 差异分析面板 ===== */
const VariancePanel: React.FC<{ dims: string[]; mets: string[] }> = ({ dims, mets }) => (
  <>
    <GroupTitle icon={<Settings2 />} label="分析参数" />
    <Select label="控制变量" opts={dims.filter((d) => !d.includes('日期'))} hint="选择分组依据" />
    <CheckList
      label="对比对象"
      items={[
        { name: '按应用分组', checked: true },
        { name: '按买量渠道分组' },
        { name: '按国家分组' },
      ]}
    />
    <RadioList
      label="分析指标"
      name="v_metric"
      items={mets.slice(0, 4).map((m, i) => ({ v: m, l: m, c: i === 0 }))}
    />
    <GroupTitle icon={<Zap />} label="过滤条件" />
    <Select label="极值过滤" opts={['差异最大的 Top 5', '全部', '异常阈值 > 2σ']} />
    <Select label="排序方式" opts={['按差异度降序', '按差异度升序', '按名称排序']} />
  </>
);

/* ===== 综合对比面板 ===== */
const ComparePanel: React.FC<{ dims: string[]; mets: string[] }> = ({ dims, mets }) => (
  <>
    <GroupTitle icon={<Settings2 />} label="对比配置" />
    <CheckList
      label="评估指标（3-6项）"
      items={mets.map((m, i) => ({ name: m, checked: i < 4 }))}
    />
    <Select label="分组维度" opts={dims.filter((d) => !d.includes('日期'))} hint="选择对比分组" />
    <GroupTitle icon={<Zap />} label="权重配置" />
    <Toggle label="⚖️ 自定义权重" on />
    <div className={s.weightsBox}>
      {mets.slice(0, 4).map((m, i) => (
        <div key={m} className={s.weightRow}>
          <div className={s.weightLabel}>
            <span>{m}</span>
            <span className={s.weightPct}>{[40, 30, 20, 10][i] || 10}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            defaultValue={[40, 30, 20, 10][i] || 10}
            className={s.slider}
          />
        </div>
      ))}
    </div>
  </>
);

/* ===== 环比分析面板 ===== */
const PoPPanel: React.FC<{ dims: string[]; mets: string[] }> = ({ dims, mets }) => (
  <>
    <GroupTitle icon={<Settings2 />} label="分析模式" />
    <RadioList
      label="对比模式"
      name="pop_mode"
      items={[
        { v: 'basic', l: '基础环比：本期 vs 上期' },
        { v: 'ladder', l: '阶梯环比：同周期历史对比', c: true },
      ]}
    />
    <GroupTitle icon={<Zap />} label="阶梯参数" />
    <Select
      label="周期属性"
      opts={['周一', '周二', '周三', '周四', '周五', '周六', '周日', '月初']}
    />
    <Select
      label="追溯深度"
      opts={['过去 4 周', '过去 8 周', '过去 12 周', '过去 26 周', '过去 52 周']}
    />
    <Slider label="平滑因子" min={0} max={1} step={0.1} val={0.5} left="原始" right="平滑" />
    <GroupTitle icon={<Settings2 />} label="指标选择" />
    <CheckList
      label="分析指标"
      items={mets.slice(0, 5).map((m, i) => ({ name: m, checked: i < 2 }))}
    />
    <Select
      label="分析维度"
      opts={dims.filter((d) => d.includes('日期')).concat(['日期'])}
      def="日期"
    />
  </>
);

/* ===== 走势画布 ===== */
const TrendCanvas: React.FC<{ mets: string[] }> = ({ mets }) => (
  <>
    <div className={s.canvasHeader}>
      <div>
        <h2 className={s.canvasTitle}>数据走势洞察</h2>
        <p className={s.canvasSub}>基于 {mets.slice(0, 2).join('、')} 的历史趋势与 AI 预测</p>
      </div>
      <div className={s.canvasActions}>
        <button type="button" className={`${s.btn} ${s.btnGhost}`}>
          <Download />
          导出
        </button>
      </div>
    </div>
    <div className={s.canvasContent}>
      <div className={s.chartCard}>
        <div className={s.chartTop}>
          <div className={s.legend}>
            {mets.slice(0, 2).map((m, i) => (
              <span key={m} className={s.legendItem}>
                <span className={s.legendLine} style={{ background: COLORS[i] }} />
                {m}
              </span>
            ))}
            <span className={s.legendItem} style={{ marginLeft: 8 }}>
              <span className={s.legendDash} style={{ borderColor: COLORS[0] }} />
              预测
            </span>
          </div>
          <span style={{ fontSize: 11, color: '#747685' }}>2分钟前更新</span>
        </div>
        <div className={s.chartArea} style={{ height: 280, padding: '16px 40px 36px' }}>
          <div className={s.yAxis}>
            <span>10k</span>
            <span>8k</span>
            <span>6k</span>
            <span>4k</span>
            <span>2k</span>
            <span>0</span>
          </div>
          {[0, 25, 50, 75].map((t) => (
            <div key={t} className={s.gridLine} style={{ top: `${t}%` }} />
          ))}
          <div className={s.forecastZone}>
            <span className={s.forecastTag}>AI 预测</span>
          </div>
          <svg
            viewBox="0 0 1000 300"
            style={{ width: '100%', height: '100%', overflow: 'visible' }}
            preserveAspectRatio="none"
          >
            <title>趋势预测图</title>
            <path
              className={s.areaPrimary}
              d="M0,300 L0,220 Q100,250 200,180 T400,150 T600,100 T750,150 L750,300Z"
            />
            <path
              className={`${s.chartLine} ${s.linePrimary}`}
              d="M0,220 Q100,250 200,180 T400,150 T600,100 T750,150"
            />
            <path
              className={`${s.chartLine} ${s.linePrimary} ${s.lineDashed}`}
              d="M750,150 Q850,200 950,120 T1000,90"
            />
            <path
              className={`${s.chartLine} ${s.lineSecondary}`}
              d="M0,180 Q150,140 250,200 T500,180 T650,220 T750,190"
            />
            <path
              className={`${s.chartLine} ${s.lineSecondary} ${s.lineDashed}`}
              d="M750,190 Q850,150 950,180 T1000,160"
            />
            <circle cx="600" cy="100" r="4" className={`${s.dot} ${s.dotPrimary}`} />
          </svg>
          <div className={s.xAxis}>
            <span>05-01</span>
            <span>05-05</span>
            <span>05-10</span>
            <span>05-15</span>
            <span className={s.xAxisCurrent}>05-20</span>
            <span className={s.xAxisForecast}>05-27</span>
          </div>
        </div>
      </div>
      <div className={s.insights}>
        <div className={`${s.insight} ${s.insightPrimary}`}>
          <div className={s.insightHead}>
            <Lightbulb style={{ color: 'var(--aa-primary)' }} />
            <h3>核心发现</h3>
          </div>
          <div className={s.insightBody}>
            <p>
              检测到显著的 <strong>7天周期性规律</strong>，日均增长{' '}
              <span className={s.tagSuccess}>+0.5%</span>
            </p>
          </div>
        </div>
        <div className={`${s.insight} ${s.insightSecondary}`}>
          <div className={s.insightHead}>
            <PieChart style={{ color: 'var(--aa-secondary)' }} />
            <h3>归因拆解</h3>
          </div>
          <div className={s.insightBody}>
            <p>
              增长主要由 <strong>{mets[0] || '注册用户'}</strong> 驱动，贡献率{' '}
              <span className={s.tagSuccess}>+1.2%</span>
            </p>
          </div>
        </div>
        <div className={`${s.insight} ${s.insightTertiary}`}>
          <div className={s.insightHead}>
            <Zap style={{ color: 'var(--aa-tertiary)' }} />
            <h3>诊断建议</h3>
          </div>
          <div className={s.insightBody}>
            <p>建议关注周期性高峰的资源配置，与营销活动存在强相关性。</p>
          </div>
        </div>
      </div>
    </div>
  </>
);

/* ===== 差异画布 ===== */
const VarianceCanvas: React.FC<{ dims: string[] }> = ({ dims }) => {
  const cv = dims.find((d) => d === '国家') || dims[0] || '维度';
  const countries = ['美国', '日本', '英国', '德国', '法国'];
  const rows = [
    { n: 'VD002B', v: ['45k', '12k', '8k', '3k', '2.5k'], l: ['H', 'MH', 'M', 'L', 'L'] },
    { n: 'PT001', v: ['4k', '28k', '15k', '9k', '7k'], l: ['L', 'H', 'MH', 'M', 'M'] },
    { n: 'SY045X', v: ['1.2k', '3.5k', '22k', '11k', '8.5k'], l: ['VL', 'L', 'H', 'MH', 'M'] },
    { n: 'MN992Z', v: ['2k', '2.1k', '3k', '19k', '14k'], l: ['L', 'L', 'L', 'H', 'MH'] },
  ];
  const cellCls: Record<string, string> = {
    H: s.cellHigh,
    MH: s.cellMedHigh,
    M: s.cellMed,
    L: s.cellLow,
    VL: s.cellVeryLow,
  };

  return (
    <>
      <div className={s.canvasHeader}>
        <div>
          <h2 className={s.canvasTitle}>差异分布矩阵</h2>
          <p className={s.canvasSub}>控制【{cv}】变量，颜色深浅展示差异强度</p>
        </div>
        <div className={s.heatLegend}>
          <span>低值</span>
          <div className={s.heatLegendBar} />
          <span>高值</span>
        </div>
      </div>
      <div className={s.canvasContent}>
        <div className={s.chartCard}>
          <div className={s.chartArea} style={{ minHeight: 360, padding: 20 }}>
            <div className={s.heatmap}>
              <div className={s.heatmapHead}>
                <div style={{ textAlign: 'left' }}>应用 / {cv}</div>
                {countries.map((c, i) => (
                  <div key={c} className={s.heatmapHeadCell}>
                    {c}
                    <span className={`${s.cv} ${i === 0 ? s.cvHigh : ''}`}>
                      CV: {[0.85, 0.22, 0.31, 0.18, 0.15][i]}
                    </span>
                  </div>
                ))}
              </div>
              {rows.map((r) => (
                <div key={r.n} className={s.heatmapRow}>
                  <div className={s.heatmapLabel}>{r.n}</div>
                  {r.v.map((v, i) => {
                    const country = countries[i];
                    return (
                      <div
                        key={`${r.n}-${country}`}
                        className={`${s.heatmapCell} ${cellCls[r.l[i]]}`}
                      >
                        {v}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className={s.diag}>
          <div className={`${s.insight} ${s.insightError}`}>
            <div className={s.insightHead}>
              <span style={{ color: 'var(--aa-error)', fontSize: 14 }}>⚠</span>
              <span
                className={s.badge}
                style={{ background: 'var(--aa-error-bg)', color: 'var(--aa-error)' }}
              >
                核心发现
              </span>
            </div>
            <div className={s.insightBody}>【美国】市场差异最显著 (CV=0.85)，【日本】最均衡。</div>
          </div>
          <div className={`${s.insight} ${s.insightSecondary}`}>
            <div className={s.insightHead}>
              <PieChart size={14} style={{ color: 'var(--aa-secondary)' }} />
              <span
                className={s.badge}
                style={{ background: 'var(--aa-secondary-bg)', color: 'var(--aa-secondary)' }}
              >
                归因拆解
              </span>
            </div>
            <div className={s.insightBody}>美国市场 VD002B 占比 81%，是离散度极高的核心原因。</div>
          </div>
          <div className={`${s.insight} ${s.insightTertiary}`}>
            <div className={s.insightHead}>
              <Lightbulb size={14} style={{ color: 'var(--aa-tertiary)' }} />
              <span
                className={s.badge}
                style={{ background: 'var(--aa-tertiary-bg)', color: 'var(--aa-tertiary)' }}
              >
                诊断建议
              </span>
            </div>
            <div className={s.insightBody}>建议调研头部应用在高离散度市场的本地化策略。</div>
          </div>
        </div>
      </div>
    </>
  );
};

/* ===== 综合对比画布 ===== */
const CompareCanvas: React.FC<{ mets: string[] }> = ({ mets }) => (
  <>
    <div className={s.canvasHeader}>
      <div>
        <h2 className={s.canvasTitle}>多维能力评估</h2>
        <p className={s.canvasSub}>基于 {mets.slice(0, 4).join('、')} 的 TOPSIS 综合评估</p>
      </div>
    </div>
    <div className={s.canvasContent}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className={s.chartCard}>
          <div className={s.chartTop}>
            <span className={s.chartTitle}>能力雷达图</span>
          </div>
          <div className={s.radarWrap}>
            <svg
              viewBox="0 0 200 200"
              style={{ maxWidth: 260, maxHeight: 260 }}
              width="100%"
              height="100%"
            >
              <title>能力雷达图</title>
              <polygon
                points="100,10 178,55 178,145 100,190 22,145 22,55"
                fill="none"
                stroke="#e0e3e5"
                strokeWidth="1"
              />
              <polygon
                points="100,32 159,66 159,134 100,168 41,134 41,66"
                fill="none"
                stroke="#e0e3e5"
                strokeWidth="1"
              />
              <polygon
                points="100,55 139,78 139,122 100,145 61,122 61,78"
                fill="none"
                stroke="#e0e3e5"
                strokeWidth="1"
              />
              {[
                { key: 'top', x: 100, y: 10 },
                { key: 'upper-right', x: 178, y: 55 },
                { key: 'lower-right', x: 178, y: 145 },
                { key: 'bottom', x: 100, y: 190 },
                { key: 'lower-left', x: 22, y: 145 },
                { key: 'upper-left', x: 22, y: 55 },
              ].map((point) => {
                return (
                  <line
                    key={point.key}
                    x1="100"
                    y1="100"
                    x2={point.x}
                    y2={point.y}
                    stroke="#e0e3e5"
                    strokeWidth="1"
                  />
                );
              })}
              <polygon
                points="100,20 160,70 140,160 100,170 50,130 80,60"
                fill="rgba(41,82,201,0.2)"
                stroke="#2952c9"
                strokeWidth="2"
              />
              <polygon
                points="100,40 170,60 120,130 100,140 30,120 40,70"
                fill="rgba(0,101,141,0.2)"
                stroke="#00658d"
                strokeWidth="2"
              />
              <polygon
                points="100,60 140,80 150,120 100,120 60,110 70,80"
                fill="rgba(186,26,26,0.2)"
                stroke="#ba1a1a"
                strokeWidth="2"
              />
              {mets.slice(0, 6).map((m, i, a) => {
                const ang = (Math.PI * 2 * i) / a.length - Math.PI / 2;
                return (
                  <text
                    key={m}
                    x={100 + 85 * Math.cos(ang)}
                    y={100 + 85 * Math.sin(ang)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#444654"
                    fontSize="8"
                    fontWeight="600"
                  >
                    {m}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className={s.finding}>
            <div className={s.findingHead}>
              <Lightbulb />
              <h3 className={s.findingTitle}>核心发现</h3>
            </div>
            <p className={s.findingBody}>
              <strong>VD002B</strong> 综合评分 <span className={s.tagHighlight}>88</span>{' '}
              分领先，核心优势在于规模扩张。
            </p>
          </div>
          <div className={s.stats}>
            <div className={s.stat}>
              <div
                className={s.statIcon}
                style={{ background: 'var(--aa-primary-bg)', color: 'var(--aa-primary)' }}
              >
                📊
              </div>
              <div>
                <div className={s.statLabel}>综合第一</div>
                <div className={s.statValue}>VD002B</div>
              </div>
            </div>
            <div className={s.stat}>
              <div
                className={s.statIcon}
                style={{ background: 'var(--aa-success-bg)', color: 'var(--aa-success)' }}
              >
                ⚡
              </div>
              <div>
                <div className={s.statLabel}>效率之王</div>
                <div className={s.statValue}>PT001</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className={s.attrCard}>
          <h3 className={s.attrTitle}>📈 维度得分拆解</h3>
          <div className={s.attrItem}>
            VD002B {mets[0] || '规模'} 得分{' '}
            <span style={{ color: 'var(--aa-secondary)', fontWeight: 700 }}>95</span> (强)，但{' '}
            {mets[2] || '跳出率'} 得分{' '}
            <span style={{ color: 'var(--aa-error)', fontWeight: 700 }}>42</span> (短板)。
          </div>
        </div>
        <div className={s.recCard}>
          <h3 className={s.recTitle}>🩺 优化建议</h3>
          <div className={s.recList}>
            <div className={s.recItem}>
              <div className={s.recNum}>1</div>
              <p className={s.recText}>建议头部应用借鉴效率之王的留存设计。</p>
            </div>
            <div className={s.recItem}>
              <div className={s.recNum}>2</div>
              <p className={s.recText}>规模较小的应用建议加大营销预算拓宽漏斗上游。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>
);

/* ===== 环比画布 ===== */
const PoPCanvas: React.FC = () => {
  const heights = [40, 48, 42, 50, 45, 50, 49, 68];
  const labels = ['04-27', '05-04', '05-11', '05-18', '05-25', '06-01', '06-08', '06-15'];
  const bars = labels.map((label, index) => ({
    label,
    height: heights[index],
    current: index === labels.length - 1,
  }));

  return (
    <>
      <div className={s.canvasHeader}>
        <div>
          <h2 className={s.canvasTitle}>阶梯环比分析</h2>
          <p className={s.canvasSub}>连续周期对比，识别结构性异常</p>
        </div>
      </div>
      <div className={s.canvasContent}>
        <div className={s.chartCard} style={{ flex: 1 }}>
          <div className={s.chartTop}>
            <div className={s.legend}>
              <span className={s.legendItem}>
                <span className={s.legendLine} style={{ background: 'var(--aa-surface-2)' }} />
                历史周期
              </span>
              <span className={s.legendItem}>
                <span className={s.legendLine} style={{ background: 'var(--aa-primary)' }} />
                当前周期
              </span>
              <span className={s.legendItem} style={{ marginLeft: 8 }}>
                <span className={s.legendDash} style={{ borderColor: 'var(--aa-secondary)' }} />
                中位数
              </span>
            </div>
          </div>
          <div className={s.chartArea} style={{ flex: 1 }}>
            <div className={s.yAxis}>
              <span>20k</span>
              <span>15k</span>
              <span>10k</span>
              <span>5k</span>
              <span>0</span>
            </div>
            {[0, 25, 50, 75].map((t) => (
              <div key={t} className={s.gridLine} style={{ top: `${t}%` }} />
            ))}
            <div className={s.median} style={{ top: '45%' }}>
              <span className={s.medianTag}>中位数: 11.2K</span>
            </div>
            <div className={s.bars}>
              {bars.map((bar) => (
                <div
                  key={bar.label}
                  className={`${s.bar} ${bar.current ? s.barCurrent : ''}`}
                  style={{ height: `${bar.height}%` }}
                >
                  <div className={s.barTip}>{bar.current ? '13.5k (+18.5%)' : bar.label}</div>
                </div>
              ))}
            </div>
            <div className={s.xAxis} style={{ bottom: -20, left: 40, right: 24 }}>
              {bars.map((bar) => (
                <span key={bar.label} className={bar.current ? s.xAxisCurrent : ''}>
                  {bar.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className={s.diag}>
          <div className={s.diagCard}>
            <div className={s.diagTitle}>核心发现</div>
            <div className={s.diagBody}>
              本周对比过去 8 周中位数上升 <span className={s.tagError}>18.5%</span>
              ，判定为结构性增长。
            </div>
          </div>
          <div className={s.diagCard}>
            <div className={s.diagTitle}>归因拆解</div>
            <div className={s.diagBody}>异常增长 90% 归因于特定渠道的营销推送活动。</div>
          </div>
          <div className={`${s.diagCard} ${s.diagCardAccent}`}>
            <div className={s.diagTitle}>诊断建议</div>
            <div className={s.diagBody}>建议追踪活动后续留存效应，考虑上调高回报通道基准值。</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AlgorithmAnalysisModal;
