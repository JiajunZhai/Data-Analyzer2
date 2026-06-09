import type React from 'react';
import type { RootCauseResult } from '../../../types/anomaly';
import styles from './AttributionBar.module.css';

interface AttributionBarProps {
  rootCause: RootCauseResult;
}

export const AttributionBar: React.FC<AttributionBarProps> = ({ rootCause }) => {
  if (!rootCause.topCauses || rootCause.topCauses.length === 0) {
    return null;
  }

  const top3 = rootCause.topCauses.slice(0, 3);
  const maxEP = Math.max(...top3.map((c) => Math.abs(c.explanatoryPower)), 0.01);

  return (
    <div className={styles.container}>
      {top3.map((cause) => {
        const widthPercent = (Math.abs(cause.explanatoryPower) / maxEP) * 100;
        const isNegative = cause.explanatoryPower < 0;

        return (
          <div key={`${cause.dimensionName}-${cause.memberValue}`} className={styles.row}>
            <span className={styles.label}>
              {cause.dimensionName === '广告场景' ? '场景' : cause.dimensionName}{' '}
              {cause.memberValue}
            </span>
            <div className={styles.barContainer}>
              <div
                className={`${styles.bar} ${isNegative ? styles.barNegative : styles.barPositive}`}
                style={{ width: `${widthPercent}%` }}
              />
            </div>
            <span
              className={`${styles.value} ${isNegative ? styles.valueNegative : styles.valuePositive}`}
            >
              {(cause.explanatoryPower * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};
