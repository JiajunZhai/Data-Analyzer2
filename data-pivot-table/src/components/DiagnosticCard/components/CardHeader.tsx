import type React from 'react';
import type { AnomalyResult } from '../../../types/anomaly';
import { AttributionBar } from './AttributionBar';
import styles from './CardHeader.module.css';

interface CardHeaderProps {
  anomaly: AnomalyResult;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ anomaly }) => {
  const isCritical = anomaly.severityLevel === 'CRITICAL';
  const isResolved = anomaly.status === 'RESOLVED';
  const isMuted = anomaly.status === 'MUTED';

  return (
    <div className={styles.header}>
      <div className={styles.topRow}>
        <div className={styles.left}>
          <span
            className={`${styles.dot} ${isCritical ? styles.dotCritical : styles.dotWarning}`}
          />
          <span className={styles.title}>{anomaly.anomalyTitle}</span>
          <span
            className={`${styles.levelBadge} ${isCritical ? styles.badgeCritical : styles.badgeWarning}`}
          >
            {isCritical ? '严重' : '警告'}
          </span>
          {isResolved && <span className={styles.statusBadge}>已恢复</span>}
          {isMuted && <span className={styles.statusBadgeMuted}>已忽略</span>}
        </div>
        <div className={styles.right}>
          <span
            className={`${styles.deviation} ${anomaly.deviationRate < 0 ? styles.negative : styles.positive}`}
          >
            {anomaly.deviationRateDesc}
          </span>
          <span className={styles.baseline}>{anomaly.baselineDesc}</span>
        </div>
      </div>
      {anomaly.rootCause && <AttributionBar rootCause={anomaly.rootCause} />}
    </div>
  );
};
