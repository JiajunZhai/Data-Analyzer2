import { BellOff, Check, MapPin, X } from 'lucide-react';
import type React from 'react';
import { useCallback } from 'react';
import type { AnomalyResult } from '../../../types/anomaly';
import { parseHighlightSegments } from '../../../utils/textHighlighter';
import styles from './ViewAllModal.module.css';

type TabKey = 'pending' | 'active' | 'history';

interface ViewAllModalProps {
  isOpen: boolean;
  onClose: () => void;
  anomalies: AnomalyResult[];
  activeTab: TabKey;
  onLocate: (anomaly: AnomalyResult) => void;
  onAccept: (id: string) => void;
  onMute: (id: string) => void;
  onUndo: (id: string) => void;
}

export const ViewAllModal: React.FC<ViewAllModalProps> = ({
  isOpen,
  onClose,
  anomalies,
  activeTab,
  onLocate,
  onAccept,
  onMute,
  onUndo,
}) => {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) return null;

  const getSeverityClass = (level: string) => {
    return level === 'CRITICAL' ? styles.critical : styles.warning;
  };

  const getStatusBadge = (anomaly: AnomalyResult) => {
    if (anomaly.status === 'RESOLVED') {
      return <span className={styles.statusResolved}>已恢复</span>;
    }
    if (anomaly.status === 'MUTED') {
      return <span className={styles.statusMuted}>已忽略</span>;
    }
    return null;
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="全部异常"
      tabIndex={-1}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            全部异常
            <span className={styles.count}>{anomalies.length}</span>
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.content}>
          {anomalies.length === 0 ? (
            <div className={styles.empty}>
              <span>暂无异常记录</span>
            </div>
          ) : (
            <div className={styles.list}>
              {anomalies.map((anomaly) => {
                const segments = parseHighlightSegments(anomaly.diagnosisDesc);
                return (
                  <div key={anomaly.anomalyId} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardLeft}>
                        <span
                          className={`${styles.dot} ${getSeverityClass(anomaly.severityLevel)}`}
                        />
                        <span className={styles.cardTitle}>{anomaly.anomalyTitle}</span>
                        <span
                          className={`${styles.levelBadge} ${getSeverityClass(anomaly.severityLevel)}`}
                        >
                          {anomaly.severityLevel === 'CRITICAL' ? '严重' : '警告'}
                        </span>
                        {getStatusBadge(anomaly)}
                      </div>
                      <div className={styles.cardRight}>
                        <span
                          className={`${styles.deviation} ${anomaly.deviationRate < 0 ? styles.negative : styles.positive}`}
                        >
                          {anomaly.deviationRateDesc}
                        </span>
                        <span className={styles.baseline}>{anomaly.baselineDesc}</span>
                      </div>
                    </div>

                    <div className={styles.cardBody}>
                      <p className={styles.diagnosis}>
                        {segments.map((segment) => (
                          <span
                            key={`${segment.text}-${segment.isHighlight ? 'h' : 'n'}`}
                            className={segment.isHighlight ? styles.highlight : undefined}
                          >
                            {segment.text}
                          </span>
                        ))}
                      </p>
                      <span className={styles.timeInfo}>{anomaly.timeInfoDesc}</span>
                    </div>

                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.locateBtn}
                        onClick={() => onLocate(anomaly)}
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
                          >
                            <Check size={12} />
                            <span>接受</span>
                          </button>
                          <button
                            type="button"
                            className={styles.muteBtn}
                            onClick={() => onMute(anomaly.anomalyId)}
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
                        >
                          撤销
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
