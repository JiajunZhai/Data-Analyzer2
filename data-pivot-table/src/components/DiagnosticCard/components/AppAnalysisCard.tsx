import { AlertTriangle, MapPin } from 'lucide-react';
import type React from 'react';
import type { AppAnalysisResult, DayAnomaly } from '../../../types/anomaly';
import styles from './AppAnalysisCard.module.css';

interface AppAnalysisCardProps {
  result: AppAnalysisResult;
  onLocate: (metricName: string) => void;
}

function formatValue(num: number): string {
  if (Math.abs(num) >= 10000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  if (Math.abs(num) >= 100) {
    return Math.round(num).toLocaleString();
  }
  return num.toFixed(2);
}

function formatPercent(rate: number): string {
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${(rate * 100).toFixed(1)}%`;
}

const MetricBar: React.FC<{
  metricName: string;
  totalChangeRate: number;
  anomalyCount: number;
  onLocate: () => void;
}> = ({ metricName, totalChangeRate, anomalyCount, onLocate }) => {
  const isPositive = totalChangeRate >= 0;
  const absRate = Math.min(Math.abs(totalChangeRate), 1);
  const width = Math.max(absRate * 100, 5);

  return (
    <div className={styles.metricRow}>
      <span className={styles.metricName}>{metricName}</span>
      <div className={styles.barContainer}>
        <div
          className={`${styles.bar} ${isPositive ? styles.barPositive : styles.barNegative}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span
        className={`${styles.metricRate} ${isPositive ? styles.ratePositive : styles.rateNegative}`}
      >
        {formatPercent(totalChangeRate)}
      </span>
      {anomalyCount > 0 && (
        <button type="button" className={styles.locateBtn} onClick={onLocate} title="定位到透视表">
          <MapPin size={10} />
        </button>
      )}
    </div>
  );
};

const AnomalyItem: React.FC<{ anomaly: DayAnomaly; onLocate: () => void }> = ({
  anomaly,
  onLocate,
}) => {
  const isCritical = anomaly.severity === 'CRITICAL';
  const isNegative = anomaly.changeRate < 0;

  return (
    <div className={`${styles.anomalyItem} ${isCritical ? styles.critical : styles.warning}`}>
      <div className={styles.anomalyHeader}>
        <span className={styles.anomalyDate}>{anomaly.date}</span>
        <span className={styles.anomalyMetric}>{anomaly.metricName}</span>
        <span
          className={`${styles.anomalyRate} ${isNegative ? styles.rateNegative : styles.ratePositive}`}
        >
          {formatPercent(anomaly.changeRate)}
        </span>
        <button type="button" className={styles.locateSmallBtn} onClick={onLocate} title="定位">
          <MapPin size={10} />
        </button>
      </div>
      <div className={styles.anomalyDetail}>
        <span className={styles.anomalyValues}>
          {formatValue(anomaly.previousValue)} → {formatValue(anomaly.currentValue)}
        </span>
        <span className={styles.anomalyCause}>{anomaly.rootCause}</span>
      </div>
    </div>
  );
};

export const AppAnalysisCard: React.FC<AppAnalysisCardProps> = ({ result, onLocate }) => {
  const significantTrends = result.trends.filter((t) => Math.abs(t.totalChangeRate) > 0.01);
  const topAnomalies = result.anomalies.slice(0, 5);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.appInfo}>
          <span className={styles.appName}>{result.appName}</span>
          <span className={styles.period}>
            {result.startDate} ~ {result.endDate} ({result.totalDays}天)
          </span>
        </div>
      </div>

      <div className={styles.trendsSection}>
        {significantTrends.length > 0 ? (
          significantTrends.map((trend) => (
            <MetricBar
              key={trend.metricName}
              metricName={trend.metricName}
              totalChangeRate={trend.totalChangeRate}
              anomalyCount={trend.anomalyCount}
              onLocate={() => onLocate(trend.metricName)}
            />
          ))
        ) : (
          <div className={styles.noTrend}>各指标整体稳定</div>
        )}
      </div>

      {topAnomalies.length > 0 && (
        <div className={styles.anomaliesSection}>
          <div className={styles.sectionTitle}>
            <AlertTriangle size={12} />
            <span>异常日期 ({result.anomalies.length})</span>
          </div>
          <div className={styles.anomalyList}>
            {topAnomalies.map((anomaly) => (
              <AnomalyItem
                key={`${anomaly.date}-${anomaly.metricName}-${anomaly.currentValue}-${anomaly.previousValue}`}
                anomaly={anomaly}
                onLocate={() => onLocate(anomaly.metricName)}
              />
            ))}
          </div>
        </div>
      )}

      <div className={styles.summary}>{result.summary}</div>
    </div>
  );
};
