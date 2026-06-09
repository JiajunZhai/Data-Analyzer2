import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Layers,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import type { ComparisonMode, DiagnosticResult, MetricSnapshot, RevenueSnapshot } from '../../../types/anomaly';
import { COMPARISON_MODES } from '../../../types/anomaly';
import { ArpuFactorCard } from './ArpuFactorCard';
import { DimensionContributionList } from './DimensionContributionList';
import { FactorBreakdownPanel } from './FactorBreakdownPanel';
import styles from './DiagnosticDashboard.module.css';

const COMPARISON_LABELS: Record<ComparisonMode, string> = Object.fromEntries(
  COMPARISON_MODES.map((m) => [m.mode, m.label])
) as Record<ComparisonMode, string>;

interface DiagnosticDashboardProps {
  result: DiagnosticResult;
  onLocate?: (dimension: string, value: string) => void;
}

function formatRate(rate: number): string {
  const pct = Math.abs(rate * 100);
  if (pct < 0.1) return '0%';
  return `${rate > 0 ? '+' : '-'}${pct.toFixed(1)}%`;
}

function formatValue(val: number): string {
  if (val >= 10000) return `${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `${Math.round(val)}`;
  return val.toFixed(2);
}

function formatMoney(val: number): string {
  if (val >= 10000) return `$${(val / 1000).toFixed(1)}k`;
  if (val >= 100) return `$${Math.round(val)}`;
  return `$${val.toFixed(2)}`;
}

function ChangeIndicator({ snapshot }: { snapshot: MetricSnapshot }) {
  const { changeRate } = snapshot;
  const isUp = changeRate > 0.001;
  const isDown = changeRate < -0.001;
  const severity = Math.abs(changeRate) > 0.1 ? 'strong' : 'mild';

  return (
    <span
      className={`${styles.changeIndicator} ${isUp ? styles.up : isDown ? styles.down : styles.flat} ${severity === 'strong' ? styles.strong : ''}`}
    >
      {isUp ? <ArrowUp size={11} /> : isDown ? <ArrowDown size={11} /> : <Minus size={11} />}
      {formatRate(changeRate)}
    </span>
  );
}

export const DiagnosticDashboard: React.FC<DiagnosticDashboardProps> = ({ result, onLocate }) => {
  const [expandedLevel, setExpandedLevel] = useState<number | null>(1);

  const toggleLevel = (level: number) => {
    setExpandedLevel(expandedLevel === level ? null : level);
  };

  const { level1, level2, level3, revenue } = result;

  // 提取关键发现
  const findings = buildKeyFindings(result);

  return (
    <div className={styles.dashboard}>
      {/* 对比信息条 */}
      <div className={styles.comparisonBar}>
        <ArrowLeftRight size={12} className={styles.comparisonIcon} />
        <span className={styles.comparisonLabel}>{COMPARISON_LABELS[result.comparisonMode]}</span>
        <span className={styles.comparisonDates}>
          <span className={styles.dateTag}>{result.previousDate}</span>
          <span className={styles.dateArrow}>→</span>
          <span className={styles.dateTagCurrent}>{result.currentDate}</span>
        </span>
      </div>

      {/* 收益波动概览 */}
      <div className={styles.revenueSection}>
        <div className={styles.revenueHeader}>
          <DollarSign size={13} />
          <span>收益波动</span>
        </div>
        <div className={styles.revenueGrid}>
          <RevenueCard
            label="广告收益"
            snapshot={revenue.revenue}
            format={formatMoney}
            highlight
          />
          <RevenueCard
            label="注册用户"
            snapshot={revenue.registeredUsers}
            format={(v) => formatValue(v)}
          />
          <RevenueCard
            label="曝光次数"
            snapshot={revenue.impressions}
            format={(v) => formatValue(v)}
          />
          <RevenueCard
            label="曝光人数"
            snapshot={revenue.impressionUsers}
            format={(v) => formatValue(v)}
          />
        </div>
      </div>

      {/* 关键指标速览 */}
      <div className={styles.metricsOverview}>
        <div className={styles.overviewTitle}>
          <BarChart3 size={13} />
          <span>关键指标速览</span>
        </div>
        <div className={styles.metricsGrid}>
          <MetricMiniCard
            label="ARPU"
            snapshot={level1.arpu}
            suffix="$"
            isPrimary
          />
          <MetricMiniCard
            label="注册IPU"
            snapshot={level1.ipuPerUser}
            suffix="次"
          />
          <MetricMiniCard
            label="eCPM"
            snapshot={level1.ecpm}
            suffix="$"
          />
          <MetricMiniCard
            label="渗透率"
            snapshot={level2.ipuBreakdown.penetration}
          />
          <MetricMiniCard
            label="曝光IPU"
            snapshot={level2.ipuBreakdown.impressionUserIpu}
            suffix="次"
          />
        </div>
      </div>

      {/* 自动结论文本 */}
      <div className={styles.conclusion}>
        <div className={styles.conclusionHeader}>
          <Zap size={14} className={styles.conclusionIcon} />
          <span className={styles.conclusionTitle}>诊断结论</span>
        </div>
        <div className={styles.conclusionBody}>{result.conclusion}</div>
      </div>

      {/* 关键发现列表 */}
      {findings.length > 0 && (
        <div className={styles.findingsSection}>
          <div className={styles.findingsTitle}>
            <Target size={13} />
            <span>关键发现</span>
          </div>
          <div className={styles.findingsList}>
            {findings.map((finding, idx) => (
              <div
                key={idx}
                className={`${styles.findingItem} ${
                  finding.type === 'critical'
                    ? styles.findingCritical
                    : finding.type === 'warning'
                      ? styles.findingWarning
                      : styles.findingInfo
                }`}
              >
                <span className={styles.findingIcon}>
                  {finding.type === 'critical' ? (
                    <AlertTriangle size={12} />
                  ) : finding.type === 'warning' ? (
                    <TrendingDown size={12} />
                  ) : (
                    <TrendingUp size={12} />
                  )}
                </span>
                <span className={styles.findingText}>{finding.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 第一级：ARPU 双因子分流 */}
      <div className={styles.level}>
        <button
          type="button"
          className={styles.levelHeader}
          onClick={() => toggleLevel(1)}
        >
          <div className={styles.levelTitle}>
            <Target size={14} />
            <span>第一级：双因子分流</span>
            <span className={styles.levelHint}>
              ARPU = 注册IPU x eCPM / 1000
            </span>
          </div>
          {expandedLevel === 1 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expandedLevel === 1 && (
          <div className={styles.levelBody}>
            <ArpuFactorCard decomposition={level1} />
            <div className={styles.levelInsight}>
              <InsightText level1={level1} />
            </div>
          </div>
        )}
      </div>

      {/* 第二级：因子深度拆解 */}
      <div className={styles.level}>
        <button
          type="button"
          className={styles.levelHeader}
          onClick={() => toggleLevel(2)}
        >
          <div className={styles.levelTitle}>
            <Layers size={14} />
            <span>第二级：因子深度拆解</span>
            <span className={styles.levelHint}>
              {level1.attribution.primaryFactor === 'quantity' ? '注册IPU 拆解' : 'eCPM 维度分析'}
            </span>
          </div>
          {expandedLevel === 2 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expandedLevel === 2 && (
          <div className={styles.levelBody}>
            <FactorBreakdownPanel
              primaryFactor={level1.attribution.primaryFactor}
              ipuBreakdown={level2.ipuBreakdown}
              ecpmDimensions={level2.ecpmDimensions}
            />
            <div className={styles.levelInsight}>
              <Level2Insight primaryFactor={level1.attribution.primaryFactor} level2={level2} />
            </div>
          </div>
        )}
      </div>

      {/* 第三级：维度异动定位 */}
      <div className={styles.level}>
        <button
          type="button"
          className={styles.levelHeader}
          onClick={() => toggleLevel(3)}
        >
          <div className={styles.levelTitle}>
            <TrendingDown size={14} />
            <span>第三级：维度异动定位</span>
            <span className={styles.levelHint}>版本 / 渠道 / 国家 / 场景</span>
          </div>
          {expandedLevel === 3 ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {expandedLevel === 3 && (
          <div className={styles.levelBody}>
            <DimensionContributionList
              contributions={[
                level3.versionContrib,
                level3.channelContrib,
                level3.countryContrib,
                level3.scenarioContrib,
              ]}
              onLocate={onLocate}
            />
            <div className={styles.levelInsight}>
              <Level3Insight level3={level3} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ 子组件 ============

const RevenueCard: React.FC<{
  label: string;
  snapshot: MetricSnapshot;
  format: (v: number) => string;
  highlight?: boolean;
}> = ({ label, snapshot, format, highlight }) => (
  <div className={`${styles.revenueCard} ${highlight ? styles.revenueCardHighlight : ''}`}>
    <span className={styles.revenueLabel}>{label}</span>
    <div className={styles.revenueValues}>
      <span className={styles.revenuePrev}>{format(snapshot.previous)}</span>
      <span className={styles.revenueArrow}>→</span>
      <span className={styles.revenueCurr}>{format(snapshot.current)}</span>
    </div>
    <ChangeIndicator snapshot={snapshot} />
  </div>
);

const MetricMiniCard: React.FC<{
  label: string;
  snapshot: MetricSnapshot;
  suffix?: string;
  isPrimary?: boolean;
}> = ({ label, snapshot, suffix = '', isPrimary }) => (
  <div className={`${styles.miniCard} ${isPrimary ? styles.miniCardPrimary : ''}`}>
    <span className={styles.miniLabel}>{label}</span>
    <span className={styles.miniValue}>
      {formatValue(snapshot.current)}
      {suffix && <span className={styles.miniSuffix}>{suffix}</span>}
    </span>
    <ChangeIndicator snapshot={snapshot} />
  </div>
);

// ============ 辅助逻辑 ============

interface Finding {
  type: 'critical' | 'warning' | 'info';
  text: string;
}

function buildKeyFindings(result: DiagnosticResult): Finding[] {
  const findings: Finding[] = [];
  const { level1, level2, level3, revenue } = result;

  // 收益变化
  if (Math.abs(revenue.revenue.changeRate) > 0.05) {
    const direction = revenue.revenue.changeRate < 0 ? '下降' : '增长';
    const pct = (Math.abs(revenue.revenue.changeRate) * 100).toFixed(1);
    findings.push({
      type: Math.abs(revenue.revenue.changeRate) > 0.2 ? 'critical' : 'warning',
      text: `广告收益 ${direction} ${pct}%（${formatMoney(revenue.revenue.previous)} → ${formatMoney(revenue.revenue.current)}）`,
    });
  }

  // ARPU 变化
  if (Math.abs(level1.arpu.changeRate) > 0.05) {
    const direction = level1.arpu.changeRate < 0 ? '下跌' : '上涨';
    const pct = (Math.abs(level1.arpu.changeRate) * 100).toFixed(1);
    const factorName = level1.attribution.primaryFactor === 'quantity'
      ? '量因子（注册IPU）'
      : level1.attribution.primaryFactor === 'price'
        ? '价因子（eCPM）'
        : '量价均衡';
    findings.push({
      type: Math.abs(level1.arpu.changeRate) > 0.15 ? 'critical' : 'warning',
      text: `ARPU ${direction} ${pct}%，主要由 ${factorName} 驱动（贡献 ${
        level1.attribution.primaryFactor === 'quantity'
          ? (level1.attribution.quantityContribution * 100).toFixed(0)
          : (level1.attribution.priceContribution * 100).toFixed(0)
      }%）`,
    });
  }

  // IPU 二级分析
  if (level1.attribution.primaryFactor === 'quantity') {
    const { diagnosis, penetration, impressionUserIpu } = level2.ipuBreakdown;
    if (diagnosis === 'penetration_down') {
      findings.push({
        type: 'critical',
        text: `广告渗透率下降 ${(Math.abs(penetration.changeRate) * 100).toFixed(1)}%，曝光用户IPU基本稳定`,
      });
    } else if (diagnosis === 'frequency_down') {
      findings.push({
        type: 'warning',
        text: `曝光用户IPU下降 ${(Math.abs(impressionUserIpu.changeRate) * 100).toFixed(1)}%，渗透率稳定`,
      });
    } else if (diagnosis === 'both_down') {
      findings.push({
        type: 'critical',
        text: `渗透率和曝光用户IPU均下降，需重点排查流量入口`,
      });
    }
  }

  // 维度贡献
  const allContribs = [
    { dim: '版本', data: level3.versionContrib },
    { dim: '渠道', data: level3.channelContrib },
    { dim: '国家', data: level3.countryContrib },
    { dim: '场景', data: level3.scenarioContrib },
  ];

  for (const { dim, data } of allContribs) {
    if (data.members.length > 0 && Math.abs(data.members[0].contribution) > 0.3) {
      const top = data.members[0];
      const direction = top.contribution > 0 ? '上升' : '下降';
      findings.push({
        type: Math.abs(top.contribution) > 0.5 ? 'critical' : 'warning',
        text: `${dim}维度：${top.value} 贡献了 ${Math.abs(top.contribution * 100).toFixed(0)}% 的${direction}`,
      });
    }
  }

  return findings;
}

const InsightText: React.FC<{ level1: DiagnosticResult['level1'] }> = ({ level1 }) => {
  const { arpu, ipuPerUser, ecpm, attribution } = level1;
  const factorName = attribution.primaryFactor === 'quantity' ? '量因子（注册IPU）' : '价因子（eCPM）';
  const factorSnap = attribution.primaryFactor === 'quantity' ? ipuPerUser : ecpm;
  const otherSnap = attribution.primaryFactor === 'quantity' ? ecpm : ipuPerUser;
  const otherName = attribution.primaryFactor === 'quantity' ? '价因子（eCPM）' : '量因子（注册IPU）';
  const mainContrib = attribution.primaryFactor === 'quantity' ? attribution.quantityContribution : attribution.priceContribution;

  return (
    <div className={styles.insightDetail}>
      <div className={styles.insightLine}>
        <strong>ARPU</strong> 从 {formatValue(arpu.previous)}$ 变为 {formatValue(arpu.current)}$，
        变化 {formatRate(arpu.changeRate)}。
      </div>
      <div className={styles.insightLine}>
        <strong>{factorName}</strong> 变化 {formatRate(factorSnap.changeRate)}（{formatValue(factorSnap.previous)} → {formatValue(factorSnap.current)}），
        贡献占比 {(mainContrib * 100).toFixed(0)}%，为主要驱动因子。
      </div>
      <div className={styles.insightLine}>
        <strong>{otherName}</strong> 变化 {formatRate(otherSnap.changeRate)}（{formatValue(otherSnap.previous)} → {formatValue(otherSnap.current)}），
        影响较小。
      </div>
      <div className={styles.insightLine}>
        归因结论：ARPU 变动主要由{factorName}驱动，建议重点关注
        {attribution.primaryFactor === 'quantity' ? '用户获取和广告曝光覆盖' : '广告单价和竞价效率'}方向。
      </div>
    </div>
  );
};

const Level2Insight: React.FC<{
  primaryFactor: 'quantity' | 'price' | 'balanced';
  level2: DiagnosticResult['level2'];
}> = ({ primaryFactor, level2 }) => {
  if (primaryFactor === 'quantity') {
    const { ipuPerUser, diagnosis, penetration, impressionUserIpu } = level2.ipuBreakdown;
    return (
      <div className={styles.insightDetail}>
        <div className={styles.insightLine}>
          <strong>注册IPU</strong>（曝光次数/注册用户）从 {formatValue(ipuPerUser.previous)} 次变为 {formatValue(ipuPerUser.current)} 次，变化 {formatRate(ipuPerUser.changeRate)}。
        </div>
        <div className={styles.insightLine}>
          <strong>广告渗透率</strong>（曝光人数(去重)/注册用户）{formatRate(penetration.changeRate)}：
          {formatValue(penetration.previous)} → {formatValue(penetration.current)}
          {diagnosis === 'penetration_down' || diagnosis === 'both_down' ? '，为主要下降因子' : '，基本稳定'}。
        </div>
        <div className={styles.insightLine}>
          <strong>曝光用户IPU</strong>（曝光次数/曝光人数(去重)）{formatRate(impressionUserIpu.changeRate)}：
          {formatValue(impressionUserIpu.previous)} → {formatValue(impressionUserIpu.current)}
          {diagnosis === 'frequency_down' || diagnosis === 'both_down' ? '，为主要下降因子' : '，基本稳定'}。
        </div>
        {diagnosis === 'penetration_down' && (
          <div className={styles.insightLine}>结论：渗透率下降为主因，新用户未被有效曝光，建议优化广告位展示策略和新用户引导。</div>
        )}
        {diagnosis === 'frequency_down' && (
          <div className={styles.insightLine}>结论：曝光用户频次下降为主因，已曝光用户看广告减少，建议检查广告展示频次和场景覆盖。</div>
        )}
        {diagnosis === 'both_down' && (
          <div className={styles.insightLine}>结论：渗透率和曝光用户频次双降，需全面排查流量入口、广告位和展示策略。</div>
        )}
        {diagnosis === 'stable' && (
          <div className={styles.insightLine}>结论：注册IPU 二级指标均稳定，量因子变化可能来自注册用户基数变动。</div>
        )}
      </div>
    );
  }

  // 价因子
  const significantDims = level2.ecpmDimensions.filter(
    (d) => d.members.length > 0 && Math.abs(d.members[0].contribution) > 0.15
  );

  return (
    <div className={styles.insightDetail}>
      <div className={styles.insightLine}>
        <strong>eCPM</strong> 变化分析：按维度拆解广告单价贡献。
      </div>
      {significantDims.length === 0 ? (
        <div className={styles.insightLine}>各维度变化均匀，无明显异常。</div>
      ) : (
        <>
          {significantDims.slice(0, 2).map((dim) => {
            const top = dim.members[0];
            return (
              <div key={dim.dimensionName} className={styles.insightLine}>
                <strong>{dim.dimensionName}</strong>：{top.value} 贡献 {(Math.abs(top.contribution) * 100).toFixed(0)}%
                （{formatValue(top.previousMetric)} → {formatValue(top.currentMetric)}）。
              </div>
            );
          })}
          <div className={styles.insightLine}>
            结论：eCPM 变化主要由【{significantDims[0].dimensionName} {significantDims[0].members[0].value}】驱动，
            建议排查该维度下的广告类型和竞价策略变化。
          </div>
        </>
      )}
    </div>
  );
};

const Level3Insight: React.FC<{ level3: DiagnosticResult['level3'] }> = ({ level3 }) => {
  const dims = [
    { name: '版本', data: level3.versionContrib },
    { name: '渠道', data: level3.channelContrib },
    { name: '国家', data: level3.countryContrib },
    { name: '场景', data: level3.scenarioContrib },
  ];

  const significantDims = dims
    .filter((d) => d.data.members.length > 0 && Math.abs(d.data.members[0].contribution) > 0.15)
    .sort((a, b) => Math.abs(b.data.members[0].contribution) - Math.abs(a.data.members[0].contribution));

  if (significantDims.length === 0) {
    return (
      <div className={styles.insightDetail}>
        <div className={styles.insightLine}>各维度贡献均匀，无明显异常维度。</div>
      </div>
    );
  }

  return (
    <div className={styles.insightDetail}>
      {significantDims.map((dim) => {
        const top = dim.data.members[0];
        const top2 = dim.data.members.length > 1 ? dim.data.members[1] : null;
        const direction = top.contribution > 0 ? '上升' : '下降';
        return (
          <div key={dim.name} className={styles.insightLine}>
            <strong>{dim.name}</strong>：{top.value} 贡献 {Math.abs(top.contribution * 100).toFixed(0)}% 的{direction}
            （{formatValue(top.previousMetric)} → {formatValue(top.currentMetric)}）
            {top2 && Math.abs(top2.contribution) > 0.1 && `，${top2.value} 贡献 ${Math.abs(top2.contribution * 100).toFixed(0)}%`}。
          </div>
        );
      })}
      <div className={styles.insightLine}>
        结论：最大贡献维度为【{significantDims[0].name} {significantDims[0].data.members[0].value}】，
        建议重点排查该维度下的数据变化及业务策略调整。
      </div>
    </div>
  );
};
