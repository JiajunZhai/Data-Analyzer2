import { ArrowDown, ArrowUp, MapPin, Minus, TrendingDown } from 'lucide-react';
import type React from 'react';
import type { DimensionContribution } from '../../../types/anomaly';
import styles from './DimensionContributionList.module.css';

interface DimensionContributionListProps {
  contributions: DimensionContribution[];
  onLocate?: (dimension: string, value: string) => void;
}

function formatContribution(val: number): string {
  const pct = Math.abs(val * 100);
  if (pct < 1) return '<1%';
  return `${pct.toFixed(0)}%`;
}

function formatShare(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

const DIMENSION_LABELS: Record<string, string> = {
  版本: '版本排查',
  渠道: '渠道质量',
  国家: '国家结构',
  广告场景: '场景分析',
  应用: '应用分析',
};

export const DimensionContributionList: React.FC<DimensionContributionListProps> = ({
  contributions,
  onLocate,
}) => {
  const significant = contributions.filter(
    (c) => c.members.length > 0 && Math.abs(c.members[0].contribution) > 0.15
  );

  if (significant.length === 0) {
    return (
      <div className={styles.empty}>
        <TrendingDown size={16} />
        <span>各维度变化均匀，无明显异常贡献</span>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {significant.map((dim) => (
        <DimensionSection key={dim.dimensionName} contribution={dim} onLocate={onLocate} />
      ))}
    </div>
  );
};

const DimensionSection: React.FC<{
  contribution: DimensionContribution;
  onLocate?: (dimension: string, value: string) => void;
}> = ({ contribution, onLocate }) => {
  const { dimensionName, members } = contribution;
  const label = DIMENSION_LABELS[dimensionName] || dimensionName;
  const top3 = members.slice(0, 3);
  const isCountry = dimensionName === '国家' || dimensionName === 'country';

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>{label}</span>
        {isCountry && <span className={styles.sectionHint}>含用户占比变化</span>}
      </div>

      <div className={styles.memberList}>
        {top3.map((member) => {
          const isSignificant = Math.abs(member.contribution) > 0.3;
          const shareChange = member.userShare !== undefined && member.previousUserShare !== undefined
            ? member.userShare - member.previousUserShare
            : null;

          return (
            <div
              key={member.value}
              className={`${styles.memberRow} ${isSignificant ? styles.memberSignificant : ''}`}
            >
              <div className={styles.memberInfo}>
                <span className={styles.memberName}>{member.value}</span>
                {shareChange !== null && Math.abs(shareChange) > 0.01 && (
                  <span className={styles.shareChange}>
                    占比 {formatShare(member.previousUserShare || 0)} &rarr; {formatShare(member.userShare || 0)}
                  </span>
                )}
              </div>

              <div className={styles.memberBar}>
                <div
                  className={`${styles.memberBarFill} ${
                    member.contribution > 0 ? styles.positive : styles.negative
                  }`}
                  style={{ width: `${Math.min(Math.abs(member.contribution) * 100, 100)}%` }}
                />
              </div>

              <div className={styles.memberValue}>
                <span
                  className={`${styles.contribBadge} ${
                    member.contribution > 0 ? styles.positive : styles.negative
                  }`}
                >
                  {member.contribution > 0 ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                  {formatContribution(member.contribution)}
                </span>
                {onLocate && isSignificant && (
                  <button
                    type="button"
                    className={styles.locateBtn}
                    onClick={() => onLocate(dimensionName, member.value)}
                    title="定位到透视表"
                  >
                    <MapPin size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
