import type React from 'react';
import styles from '../DiagnosticCard.module.css';

export const SkeletonCard: React.FC = () => (
  <div className={styles.skeletonCard}>
    <div className={styles.skeletonHeader}><div className={styles.skeletonTitle} /><div className={styles.skeletonPeriod} /></div>
    <div className={styles.skeletonBar} /><div className={styles.skeletonBar} /><div className={styles.skeletonBar} />
  </div>
);
