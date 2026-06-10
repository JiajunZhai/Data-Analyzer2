import { BarChart3, RotateCcw, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DataRow, FilterConfig } from '../../types';
import DateRangeFilterChip from './DateRangeFilterChip';

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

/**
 * 直接从原始数据中提取指定字段的唯一值（不经过 getDimensionValue 的场景映射）
 */
function getRawUniqueValues(data: DataRow[], fieldName: string): string[] {
  const values = new Set<string>();
  for (const row of data) {
    const val = String(row[fieldName] ?? '').trim();
    if (val && val !== 'undefined' && val !== 'null') {
      values.add(val);
    }
  }
  return Array.from(values).sort((a, b) => collator.compare(a, b));
}

interface FilterChipConfig {
  icon: React.ReactNode;
  label: string;
  fieldName: string;
  type?: 'default' | 'date';
}

interface FilterChipProps {
  config: FilterChipConfig;
  allValues: string[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  dimensionHint?: string;
}

const FilterChip: React.FC<FilterChipProps> = ({
  config,
  allValues,
  selectedValues,
  onSelectionChange,
  dimensionHint,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tempValues, setTempValues] = useState<string[]>(selectedValues);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isActive = selectedValues.length < allValues.length && selectedValues.length > 0;

  const filteredValues = useMemo(() => {
    if (!searchQuery) return allValues;
    return allValues.filter((v) => v.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allValues, searchQuery]);

  const isAllSelected = tempValues.length === allValues.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setTempValues(selectedValues);
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedValues]);

  // 当可选值变化时，清理已选值中不在可选范围内的项
  useEffect(() => {
    if (selectedValues.length > 0) {
      const validValues = selectedValues.filter((v) => allValues.includes(v));
      if (validValues.length !== selectedValues.length) {
        onSelectionChange(validValues.length > 0 ? validValues : allValues);
      }
    }
  }, [allValues]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleValue = (value: string) => {
    const newValues = tempValues.includes(value)
      ? tempValues.filter((v) => v !== value)
      : [...tempValues, value];
    setTempValues(newValues);
  };

  const handleSelectAll = () => {
    if (isAllSelected) {
      setTempValues([]);
    } else {
      setTempValues([...allValues]);
    }
  };

  const handleConfirm = () => {
    onSelectionChange(tempValues);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setTempValues(selectedValues);
    setIsOpen(false);
  };

  const getDisplayValue = () => {
    if (selectedValues.length === allValues.length) {
      return `全部${config.label}`;
    }
    if (selectedValues.length === 0) {
      return `未选${config.label}`;
    }
    if (selectedValues.length <= 2) {
      return `${config.label}: ${selectedValues.join(', ')}`;
    }
    return `${config.label}: 已选 ${selectedValues.length} 个`;
  };

  const handleChipReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(allValues);
  };

  return (
    <div className="filter-chip-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`filter-chip ${isActive ? 'active-filter' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => {
          if (!isOpen) {
            setTempValues(selectedValues);
            setSearchQuery('');
          }
          setIsOpen(!isOpen);
        }}
      >
        <span className="chip-icon">{config.icon}</span>
        <span className="chip-text">{getDisplayValue()}</span>
        {dimensionHint && (
          <span className="chip-dimension-hint" title={dimensionHint}>
            <BarChart3 size={11} />
          </span>
        )}
        {isActive && (
          <span
            className="chip-reset-icon"
            title={`重置${config.label}`}
            onClick={handleChipReset}
          >
            <X size={11} />
          </span>
        )}
        <span className="chip-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div
          className="filter-dropdown-menu"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="filter-dropdown-search">
            <input
              type="text"
              placeholder={`搜索${config.label}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-dropdown-actions">
            <button type="button" className="filter-dropdown-action-btn" onClick={handleSelectAll}>
              {isAllSelected ? '取消全选' : '全选'}
            </button>
          </div>

          <div className="filter-dropdown-options">
            {filteredValues.map((value) => (
              <label key={value} className="filter-dropdown-option">
                <input
                  type="checkbox"
                  checked={tempValues.includes(value)}
                  onChange={() => handleToggleValue(value)}
                />
                <span className="option-text">{value}</span>
              </label>
            ))}
            {filteredValues.length === 0 && <div className="filter-dropdown-empty">无匹配项</div>}
          </div>

          <div className="filter-dropdown-footer">
            <span className="filter-dropdown-count">
              已选 {tempValues.length} / {allValues.length}
            </span>
            <div className="filter-dropdown-buttons">
              <button
                type="button"
                className="filter-dropdown-btn filter-dropdown-btn-cancel"
                onClick={handleCancel}
              >
                取消
              </button>
              <button
                type="button"
                className="filter-dropdown-btn filter-dropdown-btn-confirm"
                onClick={handleConfirm}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface AdMobFilterBarProps {
  configs: FilterChipConfig[];
  data: DataRow[];
  filterConfigs: FilterConfig[];
  onFilterChange: (fieldName: string, selectedValues: string[]) => void;
  activeDimensionNames?: Set<string>;
}

/**
 * 筛选器联动逻辑：
 * 对于每个筛选器，应用其他所有已启用的筛选器来过滤数据，
 * 从而只显示当前筛选器在已筛选数据范围内的可选值。
 * 日期筛选器不参与联动（始终使用全量数据）。
 */
function getLinkedFilterValues(
  data: DataRow[],
  configs: FilterChipConfig[],
  filterConfigs: FilterConfig[],
  targetFieldName: string
): string[] {
  // 收集除目标字段外的所有已启用筛选条件
  const otherFilters = filterConfigs.filter(
    (f) => f.fieldName !== targetFieldName && f.selectedValues.length > 0
  );

  // 收集日期筛选器（不参与联动，但需要过滤）
  const dateFields = new Set(configs.filter((c) => c.type === 'date').map((c) => c.fieldName));
  const nonDateFilters = otherFilters.filter((f) => !dateFields.has(f.fieldName));

  // 如果没有其他非日期筛选器，直接返回全量数据的唯一值
  if (nonDateFilters.length === 0) {
    return getRawUniqueValues(data, targetFieldName);
  }

  // 预构建 Set 加速查找
  const filterSets = nonDateFilters.map((f) => ({
    fieldName: f.fieldName,
    valueSet: new Set(f.selectedValues),
  }));

  const filtered = data.filter((row) =>
    filterSets.every((filter) => filter.valueSet.has(String(row[filter.fieldName] ?? '').trim()))
  );

  return getRawUniqueValues(filtered, targetFieldName);
}

const AdMobFilterBar: React.FC<AdMobFilterBarProps> = ({
  configs,
  data,
  filterConfigs,
  onFilterChange,
  activeDimensionNames,
}) => {
  // 日期筛选器始终使用全量数据的唯一值
  const dateFieldNames = useMemo(
    () => new Set(configs.filter((c) => c.type === 'date').map((c) => c.fieldName)),
    [configs]
  );

  const allFilterValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    configs.forEach((config) => {
      if (dateFieldNames.has(config.fieldName)) {
        // 日期筛选器：始终使用全量数据
        result[config.fieldName] = getRawUniqueValues(data, config.fieldName);
      } else {
        // 非日期筛选器：使用联动逻辑
        result[config.fieldName] = getLinkedFilterValues(
          data,
          configs,
          filterConfigs,
          config.fieldName
        );
      }
    });
    return result;
  }, [data, configs, filterConfigs, dateFieldNames]);

  const getSelectedValues = (fieldName: string): string[] => {
    const config = filterConfigs.find((f) => f.fieldName === fieldName);
    return config?.selectedValues || allFilterValues[fieldName] || [];
  };

  const hasActiveFilters = filterConfigs.some(
    (f) => f.selectedValues.length > 0 && f.selectedValues.length < (allFilterValues[f.fieldName]?.length ?? 0)
  );

  const handleResetAll = () => {
    filterConfigs.forEach((f) => {
      if (f.selectedValues.length > 0) {
        onFilterChange(f.fieldName, allFilterValues[f.fieldName] || []);
      }
    });
  };

  return (
    <div className="admob-filter-bar">
      {configs.map((config) =>
        config.type === 'date' ? (
          <DateRangeFilterChip
            key={config.fieldName}
            icon={config.icon}
            label={config.label}
            allValues={allFilterValues[config.fieldName] || []}
            selectedValues={getSelectedValues(config.fieldName)}
            onSelectionChange={(values) => onFilterChange(config.fieldName, values)}
          />
        ) : (
          <FilterChip
            key={config.fieldName}
            config={config}
            allValues={allFilterValues[config.fieldName] || []}
            selectedValues={getSelectedValues(config.fieldName)}
            onSelectionChange={(values) => onFilterChange(config.fieldName, values)}
            dimensionHint={
              activeDimensionNames?.has(config.fieldName) ? `已作为维度使用` : undefined
            }
          />
        )
      )}
      {hasActiveFilters && (
        <button
          type="button"
          className="filter-reset-btn"
          onClick={handleResetAll}
          title="重置所有筛选"
        >
          <RotateCcw size={12} />
          <span>重置</span>
        </button>
      )}
    </div>
  );
};

export default React.memo(AdMobFilterBar);
export type { FilterChipConfig };
