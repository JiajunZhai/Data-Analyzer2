import { X } from 'lucide-react';
import React from 'react';
import type { PivotField, ValueFormatConfig } from '../types';

interface ValueFieldSettingsProps {
  pivotField: PivotField;
  anchor?: { x: number; y: number };
  onFormatChange: (format: ValueFormatConfig) => void;
  onClose: () => void;
}

const DECIMAL_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const DISPLAY_OPTIONS: {
  value: ValueFormatConfig['displayAs'];
  label: string;
  description: string;
}[] = [
  { value: 'value', label: '原始值', description: '按聚合后的真实数值展示' },
  { value: 'percentage', label: '百分比', description: '将结果乘以 100 并追加 %' },
];

const ValueFieldSettings: React.FC<ValueFieldSettingsProps> = ({
  pivotField,
  anchor,
  onFormatChange,
  onClose,
}) => {
  const format = pivotField.format || {};
  const decimals = format.decimals ?? 2;
  const displayAs = format.displayAs || 'value';
  const thousandsEnabled = format.thousandsSeparator !== false;

  const update = (patch: Partial<ValueFormatConfig>) => {
    onFormatChange({ ...format, ...patch });
  };

  const dropdownStyle = anchor
    ? ({
        '--value-settings-x': `${anchor.x}px`,
        '--value-settings-y': `${anchor.y}px`,
      } as React.CSSProperties)
    : undefined;

  return (
    <div className="value-settings-overlay">
      <button
        type="button"
        className="value-settings-backdrop"
        aria-label="关闭值格式设置"
        onClick={onClose}
      />
      <div
        className={`value-settings-dropdown ${anchor ? 'anchored' : ''}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="value-settings-title"
        style={dropdownStyle}
      >
        <div className="value-settings-header">
          <div>
            <span className="value-settings-kicker">值格式</span>
            <h3 id="value-settings-title" className="value-settings-title">
              {pivotField.field.name}
            </h3>
          </div>
          <button
            type="button"
            className="value-settings-close"
            aria-label="关闭值格式设置"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        <div className="value-settings-section">
          <div className="value-settings-section-head">
            <span className="value-settings-label">小数位数</span>
            <span className="value-settings-current">{decimals} 位</span>
          </div>
          <div className="value-settings-decimals">
            {DECIMAL_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`decimal-btn ${decimals === d ? 'active' : ''}`}
                aria-pressed={decimals === d}
                onClick={(e) => {
                  e.stopPropagation();
                  update({ decimals: d });
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="value-settings-section value-settings-row-section">
          <div>
            <span className="value-settings-label">千分位分隔</span>
            <span className="value-settings-hint">
              {thousandsEnabled ? '大数值更易扫读' : '保留无分隔数字'}
            </span>
          </div>
          <button
            type="button"
            className={`mini-switch ${thousandsEnabled ? 'active' : ''}`}
            aria-pressed={thousandsEnabled}
            aria-label={thousandsEnabled ? '关闭千分位分隔' : '启用千分位分隔'}
            onClick={(e) => {
              e.stopPropagation();
              update({ thousandsSeparator: !thousandsEnabled });
            }}
          />
        </div>

        <div className="value-settings-section">
          <div className="value-settings-section-head">
            <span className="value-settings-label">显示方式</span>
          </div>
          <div className="value-settings-radio-group">
            {DISPLAY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`value-settings-radio ${displayAs === opt.value ? 'active' : ''}`}
              >
                <input
                  type="radio"
                  name={`displayAs-${pivotField.field.name}`}
                  value={opt.value}
                  checked={displayAs === opt.value}
                  onChange={() => update({ displayAs: opt.value })}
                />
                <span className="value-settings-radio-mark" aria-hidden="true" />
                <span className="value-settings-radio-text">
                  <span className="value-settings-radio-title">{opt.label}</span>
                  <span className="value-settings-radio-desc">{opt.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ValueFieldSettings);
