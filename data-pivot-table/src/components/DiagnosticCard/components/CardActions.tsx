import { BellOff, Check, MapPin, Undo2 } from 'lucide-react';
import type React from 'react';
import type { AnomalyResult } from '../../../types/anomaly';
import styles from './CardActions.module.css';

type TabKey = 'pending' | 'active' | 'history';

interface CardActionsProps {
  anomaly: AnomalyResult;
  activeTab: TabKey;
  onLocate: (anomaly: AnomalyResult) => void;
  onAccept: (id: string) => void;
  onMute: (id: string) => void;
  onUndo: (id: string) => void;
}

export const CardActions: React.FC<CardActionsProps> = ({
  anomaly,
  activeTab,
  onLocate,
  onAccept,
  onMute,
  onUndo,
}) => {
  const isHistory = anomaly.status === 'RESOLVED' || anomaly.status === 'MUTED';

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.locateBtn}
        onClick={() => onLocate(anomaly)}
        title="一键定位到透视表"
      >
        <MapPin size={12} />
        <span>定位</span>
      </button>

      {activeTab === 'pending' && (
        <>
          <button
            type="button"
            className={styles.acceptBtn}
            onClick={() => onAccept(anomaly.anomalyId)}
            title="标记为已知问题"
          >
            <Check size={12} />
            <span>接受</span>
          </button>
          <button
            type="button"
            className={styles.muteBtn}
            onClick={() => onMute(anomaly.anomalyId)}
            title="忽略此异常"
          >
            <BellOff size={12} />
            <span>忽略</span>
          </button>
        </>
      )}

      {activeTab === 'active' && (
        <button
          type="button"
          className={styles.undoBtn}
          onClick={() => onUndo(anomaly.anomalyId)}
          title="撤销标记，退回待处理"
        >
          <Undo2 size={12} />
          <span>撤销</span>
        </button>
      )}

      {isHistory && (
        <span className={styles.historyLabel}>
          {anomaly.status === 'RESOLVED' ? '已自动恢复' : '已忽略'}
        </span>
      )}
    </div>
  );
};
