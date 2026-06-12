import React from 'react';

interface BalanceBarProps {
  volumeLabel: string;
  volumeValue: number;
  priceLabel: string;
  priceValue: number;
}

export const BalanceBar: React.FC<BalanceBarProps> = ({
  volumeLabel,
  volumeValue,
  priceLabel,
  priceValue
}) => {
  const maxValue = Math.max(Math.abs(volumeValue), Math.abs(priceValue));
  if (maxValue === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748B' }}>
          <span>{volumeLabel}</span>
          <span>{priceLabel}</span>
        </div>
        <div style={{ height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#94A3B8' }}>No variance</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600 }}>
          <span style={{ color: '#3B82F6' }}>0.0%</span>
          <span style={{ color: '#F59E0B' }}>0.0%</span>
        </div>
      </div>
    );
  }
  const volumeWidth = (Math.abs(volumeValue) / maxValue) * 50;
  const priceWidth = (Math.abs(priceValue) / maxValue) * 50;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748B' }}>
        <span>{volumeLabel}</span>
        <span>{priceLabel}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', height: '24px' }}>
        <div style={{
          width: `${volumeWidth}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
          borderRadius: '4px 0 0 4px',
          marginLeft: 'auto'
        }} />
        <div style={{
          width: '2px',
          height: '100%',
          background: '#E2E8F0'
        }} />
        <div style={{
          width: `${priceWidth}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
          borderRadius: '0 4px 4px 0'
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600 }}>
        <span style={{ color: '#3B82F6' }}>{volumeValue >= 0 ? '+' : ''}{volumeValue.toFixed(1)}%</span>
        <span style={{ color: '#F59E0B' }}>{priceValue >= 0 ? '+' : ''}{priceValue.toFixed(1)}%</span>
      </div>
    </div>
  );
};
