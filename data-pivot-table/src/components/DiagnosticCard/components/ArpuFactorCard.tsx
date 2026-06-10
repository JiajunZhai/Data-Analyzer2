import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import type React from 'react';
import type { ArpuDecomposition } from '../../../types/anomaly';
import { formatRate, formatValue } from '../../../utils/formatters';
import styles from './ArpuFactorCard.module.css';

interface ArpuFactorCardProps {
  decomposition: ArpuDecomposition;
}

function ChangeIcon({ rate }: { rate: number }) {
  if (Math.abs(rate) < 0.001) return <Minus size={12} />;
  return rate > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
}

export const ArpuFactorCard: React.FC<ArpuFactorCardProps> = ({ decomposition }) => {
  const { arpu, ipuPerUser, ecpm, attribution } = decomposition;

  const metrics = [
    {
      label: 'ARPU',
      snapshot: arpu,
      format: (v: number) => formatValue(v, '$'),
      isPrimary: true,
    },
    {
      label: '注册IPU',
      snapshot: ipuPerUser,
      format: (v: number) => formatValue(v, '次'),
      isFactor: true,
      factorType: 'quantity' as const,
    },
    {
      label: 'eCPM',
      snapshot: ecpm,
      format: (v: number) => formatValue(v, '$'),
      isFactor: true,
      factorType: 'price' as const,
    },
  ];

  return (
    <div className={styles.card}>
      <div className={styles.metricsRow}>
        {metrics.map((m) => (
          <div
            key={m.label}
            className={`${styles.metricCard} ${m.isPrimary ? styles.primary : ''} ${
              m.isFactor && m.factorType === attribution.primaryFactor ? styles.highlighted : ''
            }`}
          >
            <div className={styles.metricLabel}>{m.label}</div>
            <div className={styles.metricValue}>{m.format(m.snapshot.current)}</div>
            <div
              className={`${styles.metricChange} ${
                m.snapshot.changeRate < -0.01 ? styles.negative : m.snapshot.changeRate > 0.01 ? styles.positive : styles.neutral
              }`}
            >
              <ChangeIcon rate={m.snapshot.changeRate} />
              <span>{formatRate(m.snapshot.changeRate)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.attribution}>
        <div className={styles.attrBar}>
          <div
            className={styles.attrQuantity}
            style={{ width: `${attribution.quantityContribution * 100}%` }}
          />
          <div
            className={styles.attrPrice}
            style={{ width: `${attribution.priceContribution * 100}%` }}
          />
        </div>
        <div className={styles.attrLabels}>
          <span className={attribution.primaryFactor === 'quantity' ? styles.attrActive : ''}>
            量贡献 {(attribution.quantityContribution * 100).toFixed(0)}%
          </span>
          <span className={styles.attrDivider}>|</span>
          <span className={attribution.primaryFactor === 'price' ? styles.attrActive : ''}>
            价贡献 {(attribution.priceContribution * 100).toFixed(0)}%
          </span>
          <span className={styles.attrArrow}>→</span>
          <span className={styles.attrConclusion}>
            {attribution.primaryFactor === 'quantity' ? '数量归因' : attribution.primaryFactor === 'price' ? '价格归因' : '均衡变化'}
          </span>
        </div>
      </div>
    </div>
  );
};
