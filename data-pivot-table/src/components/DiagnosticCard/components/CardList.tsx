import type React from 'react';
import type { AnomalyResult } from '../../../types/anomaly';
import { AnomalyCard } from './AnomalyCard';
import styles from './CardList.module.css';

type TabKey = 'pending' | 'active' | 'history';

interface CardListProps {
  anomalies: AnomalyResult[];
  activeTab: TabKey;
  diagnosticMessage?: string | null;
  onLocate: (anomaly: AnomalyResult) => void;
  onAccept: (id: string) => void;
  onMute: (id: string) => void;
  onUndo: (id: string) => void;
}

export const CardList: React.FC<CardListProps> = ({
  anomalies,
  activeTab,
  diagnosticMessage,
  onLocate,
  onAccept,
  onMute,
  onUndo,
}) => {
  if (anomalies.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyText}>
          {diagnosticMessage ||
            (activeTab === 'pending'
              ? '暂无待处理异常'
              : activeTab === 'active'
                ? '暂无已标记异常'
                : '暂无历史记录')}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.cardList}>
      {diagnosticMessage && <div className={styles.diagnostic}>{diagnosticMessage}</div>}
      {anomalies.map((anomaly) => (
        <AnomalyCard
          key={anomaly.anomalyId}
          anomaly={anomaly}
          activeTab={activeTab}
          onLocate={onLocate}
          onAccept={onAccept}
          onMute={onMute}
          onUndo={onUndo}
        />
      ))}
    </div>
  );
};
