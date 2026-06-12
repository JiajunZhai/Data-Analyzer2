import React from 'react';
import type { DimensionContribution } from '../../../types/anomaly';
import styles from './DrilldownTree.module.css';

const DIM_LABELS: Record<string, string> = {
  '国家': '🌍 国家',
  '版本': '📱 版本',
  '渠道': '📢 渠道',
  '标准广告场景': '🎬 广告场景',
  '聚合广告场景': '🎬 聚合场景',
};

const DrilldownTree: React.FC<{ contributions: DimensionContribution[]; onLocate: (dim: string, val: string) => void }> = ({ contributions, onLocate }) => {
  const sorted = [...contributions].filter(c => c.members.length > 0).sort((a, b) => Math.max(...b.members.map(m => Math.abs(m.contribution))) - Math.max(...a.members.map(m => Math.abs(m.contribution))));
  if (sorted.length === 0) return <div className={styles.empty}>暂无维度下钻数据</div>;
  const topMembers = sorted.flatMap(dim => dim.members.filter(m => Math.abs(m.contribution) > 0.15).slice(0, 1).map(m => ({ dimension: dim.dimensionName, ...m }))).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return (
    <div className={styles.container}>
      <div className={styles.title}>📍 维度下钻定位</div>
      {topMembers.length > 0 && <div className={styles.verdict}>最终定位：{topMembers.slice(0, 3).map(m => m.value).join(' · ')} 出现异常</div>}
      <div className={styles.dimensionList}>
        {sorted.map((dim, di) => (
          <div key={dim.dimensionName} className={styles.dimensionCard}>
            <div className={styles.dimensionHeader}><span className={styles.dimensionRank}>维度 {di + 1}</span><span className={styles.dimensionName}>{DIM_LABELS[dim.dimensionName] || dim.dimensionName}</span></div>
            <div className={styles.memberList}>
              {dim.members.slice(0, 3).map(member => {
                const pct = member.contribution * 100; const isDown = member.contribution < 0;
                return (
                  <div key={member.value} className={styles.memberRow}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>{member.value}</span>
                        <span style={{ fontSize: '14px', color: '#64748B' }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', background: '#F1F5F9', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, Math.abs(pct))}%`, background: isDown ? 'linear-gradient(90deg, #FCA5A5, #EF4444)' : 'linear-gradient(90deg, #10B981, #34D399)', borderRadius: '4px', transition: 'width 0.6s ease-out' }} />
                      </div>
                    </div>
                    <button type="button" className={styles.locateBtn} onClick={() => onLocate(dim.dimensionName, member.value)}>📍</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default DrilldownTree;
