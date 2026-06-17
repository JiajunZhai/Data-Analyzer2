import React from 'react';
import type { PivotField, ValueFormatConfig } from '../types';

interface ValueFieldSettingsProps {
  pivotField: PivotField;
  onFormatChange: (format: ValueFormatConfig) => void;
  onClose: () => void;
}

const DECIMAL_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
const DISPLAY_OPTIONS: { value: ValueFormatConfig['displayAs']; label: string }[] = [
  { value: 'value', label: '原始值' },
  { value: 'percentage', label: '百分比' },
];

const ValueFieldSettings: React.FC<ValueFieldSettingsProps> = ({
  pivotField,
  onFormatChange,
  onClose,
}) => {
  const format = pivotField.format || {};

  const update = (patch: Partial<ValueFormatConfig>) => {
    onFormatChange({ ...format, ...patch });
  };

  return (
    <div className="value-settings-overlay" onClick={onClose}>
      <div
        className="value-settings-dropdown"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="value-settings-header">
          <span className="value-settings-title">{pivotField.field.name}</span>
        </div>

        {/* 小数位数 */}
        <div className="value-settings-section">
          <label className="value-settings-label">小数位数</label>
          <div className="value-settings-decimals">
            {DECIMAL_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`decimal-btn ${(format.decimals ?? 2) === d ? 'active' : ''}`}
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

        {/* 千分位 */}
        <div className="value-settings-section">
          <label className="value-settings-label">千分位分隔</label>
          <button
            type="button"
            className={`mini-switch ${format.thousandsSeparator !== false ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              update({ thousandsSeparator: format.thousandsSeparator === false });
            }}
          />
        </div>

        {/* 显示方式 */}
        <div className="value-settings-section">
          <label className="value-settings-label">显示方式</label>
          <div className="value-settings-radio-group">
            {DISPLAY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`value-settings-radio ${(format.displayAs || 'value') === opt.value ? 'active' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="radio"
                  name={`displayAs-${pivotField.field.name}`}
                  value={opt.value}
                  checked={(format.displayAs || 'value') === opt.value}
                  onChange={() => update({ displayAs: opt.value })}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ValueFieldSettings);
