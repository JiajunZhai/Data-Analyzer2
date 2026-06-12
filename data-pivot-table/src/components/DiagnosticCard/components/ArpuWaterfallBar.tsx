import React from 'react';
import type { ArpuDecomposition } from '../../../types/anomaly';
import styles from './ArpuWaterfallBar.module.css';

const ArpuWaterfallBar: React.FC<{ decomposition: ArpuDecomposition }> = ({ decomposition }) => {
  const { attribution, arpu, ipuPerUser, ecpm } = decomposition;
  const qtyPct = Math.round(attribution.quantityContribution * 100);
  const pricePct = Math.round(attribution.priceContribution * 100);
  const isDown = arpu.changeRate < 0;
  return (
    <div className={styles.container}>
      <div className={styles.title}>ARPU 量价归因拆解</div>
      <div className={styles.barContainer}><div className={styles.barLabels}><span className={styles.barLabelLeft}>Σ 量因子 {qtyPct}%</span><span className={styles.barLabelRight}>Σ 价因子 {pricePct}%</span></div><div className={styles.bar}>
        <div className={`${styles.barSegment} ${styles.quantity}`} style={{ width: `${qtyPct}%` }}><span className={styles.barLabel}>量因子 {qtyPct}%</span></div>
        <div className={`${styles.barSegment} ${styles.price}`} style={{ width: `${pricePct}%` }}><span className={styles.barLabel}>价因子 {pricePct}%</span></div>
      </div></div>
      <div className={styles.factors}>
        <div className={styles.factor}><span>📊</span><div className={styles.factorInfo}><span className={styles.factorName}>量因子（注册IPU）</span><span className={`${styles.factorValue} ${ipuPerUser.changeRate < 0 ? styles.down : styles.up}`}>{ipuPerUser.changeRate > 0 ? '+' : ''}{(ipuPerUser.changeRate * 100).toFixed(1)}%</span></div></div>
        <div className={styles.factor}><span>💰</span><div className={styles.factorInfo}><span className={styles.factorName}>价因子（eCPM）</span><span className={`${styles.factorValue} ${ecpm.changeRate < 0 ? styles.down : styles.up}`}>{ecpm.changeRate > 0 ? '+' : ''}{(ecpm.changeRate * 100).toFixed(1)}%</span></div></div>
      </div>
      <div className={styles.conclusion}>本次ARPU{isDown ? '下降' : '增长'}，{attribution.primaryFactor === 'price' ? pricePct : qtyPct}%归结于{attribution.primaryFactor === 'price' ? 'eCPM的剧烈变化' : '曝光量的变化'}。</div>
    </div>
  );
};
export default ArpuWaterfallBar;
