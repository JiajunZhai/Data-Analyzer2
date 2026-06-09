import type React from 'react';
import type { AnomalyResult } from '../../../types/anomaly';
import styles from './AnomalyCard.module.css';
import { CardActions } from './CardActions';
import { CardBody } from './CardBody';
import { CardHeader } from './CardHeader';

type TabKey = 'pending' | 'active' | 'history';

interface AnomalyCardProps {
  anomaly: AnomalyResult;
  activeTab: TabKey;
  onLocate: (anomaly: AnomalyResult) => void;
  onAccept: (id: string) => void;
  onMute: (id: string) => void;
  onUndo: (id: string) => void;
}

export const AnomalyCard: React.FC<AnomalyCardProps> = ({
  anomaly,
  activeTab,
  onLocate,
  onAccept,
  onMute,
  onUndo,
}) => {
  const isHistory = anomaly.status === 'RESOLVED' || anomaly.status === 'MUTED';
  const isResolved = anomaly.status === 'RESOLVED';
  const isMuted = anomaly.status === 'MUTED';

  return (
    <div
      className={`${styles.card} ${isHistory ? styles.history : ''} ${isResolved ? styles.resolved : ''} ${isMuted ? styles.muted : ''}`}
    >
      <CardHeader anomaly={anomaly} />
      <CardBody description={anomaly.diagnosisDesc} />
      <CardActions
        anomaly={anomaly}
        activeTab={activeTab}
        onLocate={onLocate}
        onAccept={onAccept}
        onMute={onMute}
        onUndo={onUndo}
      />
    </div>
  );
};
