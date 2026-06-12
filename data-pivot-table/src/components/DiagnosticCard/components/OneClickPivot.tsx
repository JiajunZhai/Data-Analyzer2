import React from 'react';
import type { DiagnosticResult, PivotSuggestion } from '../../../types/anomaly';
import styles from './OneClickPivot.module.css';

function buildSuggestion(result: DiagnosticResult): PivotSuggestion {
  const filters: Record<string, string[]> = {};
  filters['应用'] = [result.appName];
  const rowDimensions: string[] = [];
  const valueMetrics: string[] = ['注册用户', '广告收益', '曝光次数'];
  const { level3, level1 } = result;
  const contribs = [
    { dim: '国家', data: level3.countryContrib },
    { dim: '版本', data: level3.versionContrib },
    { dim: '渠道', data: level3.channelContrib },
    { dim: '标准广告场景', data: level3.scenarioContrib },
  ];
  const significant = contribs.filter(c => c.data.members.some(m => Math.abs(m.contribution) > 0.3)).slice(0, 2);
  for (const s of significant) { rowDimensions.push(s.dim); const topMember = s.data.members.find(m => Math.abs(m.contribution) > 0.3); if (topMember) filters[s.dim] = [topMember.value]; }
  if (rowDimensions.length === 0) rowDimensions.push('国家');
  if (level1.attribution.primaryFactor === 'price') valueMetrics.push('eCPM'); else valueMetrics.push('曝光人数');
  return { rowDimensions, valueMetrics, filters };
}

const OneClickPivot: React.FC<{ result: DiagnosticResult; onApply: (s: PivotSuggestion) => void }> = ({ result, onApply }) => (
  <div className={styles.container}>
    <button type="button" className={styles.btn} onClick={() => onApply(buildSuggestion(result))}>
      <span className={styles.btnIcon}>👉</span>
      <span className={styles.btnText}>一键配置透视表，查看异常详情</span>
    </button>
    <div className={styles.hint}>自动配置行/列/值维度和筛选条件，直达异常数据切片</div>
  </div>
);
export default OneClickPivot;
