import React from 'react';
import type { DiagnosticResult } from '../../../types/anomaly';
import styles from './AppSummaryCard.module.css';

const AppSummaryCard: React.FC<{ result: DiagnosticResult }> = ({ result }) => {
  const { level1, conclusion, appName, currentDate, previousDate, comparisonMode, revenue } = result;
  const { arpu, attribution } = level1;
  const isDown = arpu.changeRate < 0;
  const factor = attribution.primaryFactor === 'price' ? '价格因素（eCPM下跌）' : attribution.primaryFactor === 'quantity' ? '数量因素（曝光量变化）' : '量价双重因素';

  const modeLabels: Record<string, string> = { day: '日环比', prev_day: '昨日对比前日', multi_day: '多日环比', week: '周环比' };

  return (
    <div className={styles.summaryCard}>
      <div className={styles.accentBar} />
      <div className={styles.cardContent}>
        <div className={styles.header}><span>💡</span><span className={styles.title}>{appName} 诊断摘要</span></div>

        <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <span>📅 {previousDate} → {currentDate}</span>
          <span>📊 {modeLabels[comparisonMode] || comparisonMode}</span>
          <span>💰 收益: ${revenue.revenue.previous.toFixed(4)} → ${revenue.revenue.current.toFixed(4)}</span>
          <span>👥 用户: {revenue.registeredUsers.previous.toFixed(0)} → {revenue.registeredUsers.current.toFixed(0)}</span>
        </div>

        <div className={styles.comparison}>
          <div className={styles.compValue}><span className={styles.compLabel}>ARPU</span><span className={styles.compFrom}>${arpu.previous.toFixed(4)}</span></div>
          <span className={styles.compArrow}>➡</span>
          <div className={styles.compValue}>
            <span className={`${styles.compTo} ${isDown ? styles.downText : styles.upText}`}>${arpu.current.toFixed(4)}</span>
            <span className={`${styles.compChange} ${isDown ? styles.downText : styles.upText}`}>{isDown ? '▼' : '▲'} {isDown ? '' : '+'}{Math.abs(arpu.changeRate * 100).toFixed(1)}%</span>
          </div>
        </div>
        <div className={styles.narrative}>该应用整体走势呈<span className={isDown ? styles.downTag : styles.upTag}>{isDown ? '负向' : '正向'}</span>（{isDown ? '↓' : '↑'}）。ARPU {isDown ? '下滑' : '增长'} {Math.abs(arpu.changeRate * 100).toFixed(1)}%，主要由<strong>{factor}</strong>驱动。</div>
        <div className={styles.conclusion}>{conclusion}</div>
      </div>
    </div>
  );
};
export default AppSummaryCard;
