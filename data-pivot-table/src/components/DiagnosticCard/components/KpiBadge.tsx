import React from 'react';

interface KpiBadgeProps {
  label: string;
  value: string;
  trend: number;
  prefix?: string;
}

export const KpiBadge: React.FC<KpiBadgeProps> = ({ label, value, trend, prefix }) => {
  const isPositive = trend >= 0;
  const trendColor = isPositive ? '#065F46' : '#991B1B';
  const trendBg = isPositive ? '#D1FAE5' : '#FEE2E2';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '12px', color: '#94A3B8' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ fontSize: '24px', fontWeight: 700, color: '#1E293B', fontFamily: 'Inter, sans-serif' }}>
          {prefix}{value}
        </span>
        <span style={{
          backgroundColor: trendBg,
          color: trendColor,
          padding: '2px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 600
        }}>
          {isPositive ? '▲' : '▼'} {isPositive ? '+' : ''}{trend.toFixed(1)}%
        </span>
      </div>
    </div>
  );
};
