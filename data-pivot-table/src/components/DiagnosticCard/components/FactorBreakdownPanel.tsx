import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle, Minus } from 'lucide-react';
import type React from 'react';
import type { DimensionContribution, IpuDecomposition } from '../../../types/anomaly';
import styles from './FactorBreakdownPanel.module.css';

interface FactorBreakdownPanelProps {
  primaryFactor: 'quantity' | 'price' | 'balanced';
  ipuBreakdown: IpuDecomposition;
  ecpmDimensions: DimensionContribution[];
}

function formatRate(rate: number): string {
  const pct = Math.abs(rate * 100);
  if (pct < 0.1) return '0%';
  return `${rate > 0 ? '+' : '-'}${pct.toFixed(1)}%`;
}

function formatValue(val: number, suffix = ''): string {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k${suffix}`;
  if (val >= 100) return `${Math.round(val)}${suffix}`;
  return `${val.toFixed(2)}${suffix}`;
}

const DIAGNOSIS_LABELS: Record<string, string> = {
  penetration_down: '渗透率下跌为主因',
  frequency_down: '曝光用户频次下跌为主因',
  both_down: '渗透率和频次均下跌',
  stable: '指标基本稳定',
};

export const FactorBreakdownPanel: React.FC<FactorBreakdownPanelProps> = ({
  primaryFactor,
  ipuBreakdown,
  ecpmDimensions,
}) => {
  if (primaryFactor === 'quantity') {
    return <IpuBreakdownView breakdown={ipuBreakdown} />;
  }
  return <EcpmDimensionView dimensions={ecpmDimensions} />;
};

const IpuBreakdownView: React.FC<{ breakdown: IpuDecomposition }> = ({ breakdown }) => {
  const { ipuPerUser, penetration, impressionUserIpu, diagnosis } = breakdown;

  const factors = [
    {
      label: '广告渗透率',
      desc: '曝光人数(去重) / 注册用户',
      snapshot: penetration,
      isPrimary: diagnosis === 'penetration_down' || diagnosis === 'both_down',
    },
    {
      label: '曝光用户IPU',
      desc: '曝光次数 / 曝光人数(去重)',
      snapshot: impressionUserIpu,
      isPrimary: diagnosis === 'frequency_down' || diagnosis === 'both_down',
    },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>注册IPU 二级拆解</span>
        <span className={styles.panelFormula}>
          注册IPU = 渗透率 x 曝光用户IPU
        </span>
      </div>

      <div className={styles.factorList}>
        {factors.map((f) => (
          <div
            key={f.label}
            className={`${styles.factorRow} ${f.isPrimary ? styles.factorHighlight : ''}`}
          >
            <div className={styles.factorInfo}>
              <div className={styles.factorLabel}>{f.label}</div>
              <div className={styles.factorDesc}>{f.desc}</div>
            </div>
            <div className={styles.factorValues}>
              <span className={styles.factorCurrent}>{formatValue(f.snapshot.current)}</span>
              <span className={styles.factorArrow}>&rarr;</span>
              <span className={styles.factorPrevious}>{formatValue(f.snapshot.previous)}</span>
              <span
                className={`${styles.factorChange} ${
                  f.snapshot.changeRate < -0.01 ? styles.negative : f.snapshot.changeRate > 0.01 ? styles.positive : styles.neutral
                }`}
              >
                {f.snapshot.changeRate < -0.01 ? <ArrowDown size={12} /> : f.snapshot.changeRate > 0.01 ? <ArrowUp size={12} /> : <Minus size={12} />}
                {formatRate(f.snapshot.changeRate)}
              </span>
            </div>
            {f.isPrimary && <AlertTriangle size={14} className={styles.warningIcon} />}
          </div>
        ))}
      </div>

      <div className={styles.diagnosis}>
        {diagnosis === 'stable' ? (
          <CheckCircle size={14} className={styles.successIcon} />
        ) : (
          <AlertTriangle size={14} className={styles.warningIcon} />
        )}
        <span>{DIAGNOSIS_LABELS[diagnosis]}</span>
      </div>
    </div>
  );
};

const EcpmDimensionView: React.FC<{ dimensions: DimensionContribution[] }> = ({ dimensions }) => {
  const significantDims = dimensions.filter(
    (d) => d.members.length > 0 && Math.abs(d.members[0].contribution) > 0.15
  );

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>eCPM 维度分析</span>
        <span className={styles.panelFormula}>
          eCPM = (广告收益 / 曝光次数) x 1000
        </span>
      </div>

      {significantDims.length === 0 ? (
        <div className={styles.empty}>各维度变化均匀，无明显异常</div>
      ) : (
        <div className={styles.dimList}>
          {significantDims.map((dim) => (
            <div key={dim.dimensionName} className={styles.dimSection}>
              <div className={styles.dimTitle}>{dim.dimensionName}</div>
              {dim.members.slice(0, 3).map((member) => (
                <div key={member.value} className={styles.dimRow}>
                  <span className={styles.dimMember}>{member.value}</span>
                  <div className={styles.dimBar}>
                    <div
                      className={`${styles.dimBarFill} ${member.contribution > 0 ? styles.positive : styles.negative}`}
                      style={{ width: `${Math.min(Math.abs(member.contribution) * 100, 100)}%` }}
                    />
                  </div>
                  <span className={styles.dimContrib}>
                    {member.contribution > 0 ? '+' : ''}{(member.contribution * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
