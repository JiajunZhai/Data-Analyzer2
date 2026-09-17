import {
  BarChart3,
  Calendar,
  Globe,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { DataRow, FilterConfig } from '../../types';
import DateRangeFilterChip from './DateRangeFilterChip';

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const FILTER_OPTION_RENDER_LIMIT = 400;

function normalizeFilterValue(value: unknown): string {
  return String(value ?? '').trim();
}

function isUsableFilterValue(value: string): boolean {
  return Boolean(value && value !== 'undefined' && value !== 'null');
}

function buildRawFilterValues(data: DataRow[], fieldNames: string[]): Record<string, string[]> {
  const valueSets = Object.fromEntries(
    fieldNames.map((fieldName) => [fieldName, new Set<string>()])
  );

  for (const row of data) {
    for (const fieldName of fieldNames) {
      const value = normalizeFilterValue(row[fieldName]);
      if (isUsableFilterValue(value)) {
        valueSets[fieldName].add(value);
      }
    }
  }

  return Object.fromEntries(
    fieldNames.map((fieldName) => [
      fieldName,
      Array.from(valueSets[fieldName]).sort((a, b) => collator.compare(a, b)),
    ])
  );
}

function computeRegistrationCounts(
  data: DataRow[],
  dateFieldNames: Set<string>,
  filterConfigs: FilterConfig[],
  targetFieldName: string
): Map<string, number> {
  const otherFilters = filterConfigs.filter(
    (f) =>
      f.fieldName !== targetFieldName &&
      !dateFieldNames.has(f.fieldName) &&
      f.selectedValues.length > 0
  );
  const filterSets = otherFilters.map((f) => ({
    fieldName: f.fieldName,
    valueSet: new Set(f.selectedValues),
  }));
  const counts = new Map<string, number>();
  for (const row of data) {
    if (
      filterSets.length > 0 &&
      !filterSets.every((f) => f.valueSet.has(normalizeFilterValue(row[f.fieldName])))
    ) {
      continue;
    }
    const key = normalizeFilterValue(row[targetFieldName]);
    if (!isUsableFilterValue(key)) continue;
    const reg = Number(row.注册用户 ?? 0);
    counts.set(key, (counts.get(key) ?? 0) + (Number.isNaN(reg) ? 0 : reg));
  }
  return counts;
}

interface FilterChipConfig {
  icon: React.ReactNode;
  label: string;
  fieldName: string;
  type?: 'default' | 'date';
  group?: 'more';
  pairWith?: string;
  source?: 'core' | 'detected';
}

function isDateLikeField(fieldName: string, values: string[]): boolean {
  if (fieldName.includes('日期') || fieldName.toLowerCase().includes('date')) return true;
  return (
    values.length > 0 &&
    values.every((value) => {
      const parsed = new Date(value);
      return value.length >= 8 && !Number.isNaN(parsed.getTime());
    })
  );
}

function getDetectedIcon(fieldName: string, type: 'date' | 'default'): React.ReactNode {
  if (type === 'date') return <Calendar size={14} />;
  if (fieldName.includes('国家') || fieldName.includes('地区')) return <Globe size={14} />;
  if (fieldName.includes('应用') || fieldName.includes('平台') || fieldName.includes('设备')) {
    return <Smartphone size={14} />;
  }
  return <SlidersHorizontal size={14} />;
}

interface FilterChipProps {
  config: FilterChipConfig;
  allValues: string[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  dimensionHint?: string;
  registrationCounts?: Map<string, number>;
  sortByCount?: boolean;
}

const FilterChip: React.FC<FilterChipProps> = ({
  config,
  allValues,
  selectedValues,
  onSelectionChange,
  dimensionHint,
  registrationCounts,
  sortByCount,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tempValues, setTempValues] = useState<string[]>(selectedValues);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isActive = selectedValues.length < allValues.length && selectedValues.length > 0;
  const allValueSet = useMemo(() => new Set(allValues), [allValues]);
  const selectedValueSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const tempValueSet = useMemo(() => new Set(tempValues), [tempValues]);

  const filteredValues = useMemo(() => {
    if (searchQuery) {
      return allValues.filter((v) => v.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    const notAllSelected = selectedValues.length > 0 && selectedValues.length < allValues.length;
    if (notAllSelected) {
      const selected: string[] = [];
      const unselected: string[] = [];
      for (const v of allValues) {
        if (selectedValueSet.has(v)) {
          selected.push(v);
        } else {
          unselected.push(v);
        }
      }
      if (sortByCount && registrationCounts && registrationCounts.size > 0) {
        unselected.sort(
          (a, b) => (registrationCounts.get(b) ?? 0) - (registrationCounts.get(a) ?? 0)
        );
      }
      return [...selected, ...unselected];
    }
    if (sortByCount && registrationCounts && registrationCounts.size > 0) {
      return [...allValues].sort(
        (a, b) => (registrationCounts.get(b) ?? 0) - (registrationCounts.get(a) ?? 0)
      );
    }
    return allValues;
  }, [allValues, searchQuery, selectedValues, selectedValueSet, registrationCounts, sortByCount]);
  const visibleValues = useMemo(
    () => filteredValues.slice(0, FILTER_OPTION_RENDER_LIMIT),
    [filteredValues]
  );

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
      const validValues = selectedValues.filter((v) => allValueSet.has(v));
      if (validValues.length !== selectedValues.length) {
        onSelectionChange(validValues.length > 0 ? validValues : allValues);
      }
    }
  }, [allValues, allValueSet, onSelectionChange, selectedValues]);

  const handleToggleValue = (value: string) => {
    const newValues = tempValues.includes(value)
      ? tempValues.filter((v) => v !== value)
      : [...tempValues, value];
    setTempValues(newValues);
  };

  const handleSelectAll = () => {
    if (searchQuery) {
      // 搜索状态下：全选/取消全选仅针对过滤后的选项
      const filteredSet = new Set(filteredValues);
      const allFilteredSelected = filteredValues.every((v) => tempValueSet.has(v));
      if (allFilteredSelected) {
        setTempValues(tempValues.filter((v) => !filteredSet.has(v)));
      } else {
        const newValues = [...tempValues];
        for (const v of filteredValues) {
          if (!tempValueSet.has(v)) newValues.push(v);
        }
        setTempValues(newValues);
      }
    } else {
      if (isAllSelected) {
        setTempValues([]);
      } else {
        setTempValues([...allValues]);
      }
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
        <span className="chip-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isActive && (
        <button
          type="button"
          className="chip-reset-icon"
          title={`重置${config.label}`}
          onClick={handleChipReset}
        >
          <X size={11} />
        </button>
      )}

      {isOpen && (
        <div className="filter-dropdown-menu" role="menu">
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
            {visibleValues.map((value) => (
              <label key={value} className="filter-dropdown-option">
                <input
                  type="checkbox"
                  checked={tempValueSet.has(value)}
                  onChange={() => handleToggleValue(value)}
                />
                <span className="option-text">{value}</span>
              </label>
            ))}
            {filteredValues.length > visibleValues.length && (
              <div className="filter-dropdown-empty">
                仅显示前 {visibleValues.length} 项，可搜索完整选项
              </div>
            )}
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
  onResetAll?: () => void;
  activeDimensionNames?: Set<string>;
}

/**
 * 筛选器联动逻辑：
 * 对于每个筛选器，应用其他所有已启用的筛选器来过滤数据，
 * 从而只显示当前筛选器在已筛选数据范围内的可选值。
 * 日期筛选器不参与联动（始终使用全量数据）。
 */
/*
function _getLinkedFilterValues(
  data: DataRow[],
  filterConfigs: FilterConfig[],
  targetFieldName: string,
  rawFilterValues: Record<string, string[]>,
  dateFieldNames: Set<string>
): string[] {
  // 收集除目标字段外的所有已启用筛选条件
  const otherFilters = filterConfigs.filter(
    (f) => f.fieldName !== targetFieldName && f.selectedValues.length > 0
  );

  const nonDateFilters = otherFilters.filter((f) => !dateFieldNames.has(f.fieldName));

  // 如果没有其他非日期筛选器，直接返回全量数据的唯一值
  if (nonDateFilters.length === 0) {
    return rawFilterValues[targetFieldName] ?? [];
  }

  // 预构建 Set 加速查找
  const filterSets = nonDateFilters.map((f) => ({
    fieldName: f.fieldName,
    valueSet: new Set(f.selectedValues),
  }));

  const values = new Set<string>();
  for (const row of data) {
    if (
      !filterSets.every((filter) =>
        filter.valueSet.has(normalizeFilterValue(row[filter.fieldName]))
      )
    ) {
      continue;
    }
    const val = normalizeFilterValue(row[targetFieldName]);
    if (isUsableFilterValue(val)) {
      values.add(val);
    }
  }

  return Array.from(values).sort((a, b) => collator.compare(a, b));
}

*/
function buildLinkedFilterValues(
  data: DataRow[],
  configs: FilterChipConfig[],
  filterConfigs: FilterConfig[],
  rawFilterValues: Record<string, string[]>,
  dateFieldNames: Set<string>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const nonDateConfigs = configs.filter((config) => !dateFieldNames.has(config.fieldName));
  const nonDateFieldNames = new Set(nonDateConfigs.map((config) => config.fieldName));
  const activeFilters = filterConfigs
    .filter(
      (filter) =>
        nonDateFieldNames.has(filter.fieldName) &&
        filter.selectedValues.length > 0 &&
        filter.selectedValues.length < (rawFilterValues[filter.fieldName]?.length ?? 0)
    )
    .map((filter) => ({
      fieldName: filter.fieldName,
      valueSet: new Set(filter.selectedValues),
    }));

  for (const config of configs) {
    if (dateFieldNames.has(config.fieldName) || activeFilters.length === 0) {
      result[config.fieldName] = rawFilterValues[config.fieldName] ?? [];
    }
  }

  if (activeFilters.length === 0) return result;

  const linkedValueSets = Object.fromEntries(
    nonDateConfigs.map((config) => [config.fieldName, new Set<string>()])
  );

  for (const row of data) {
    let failedFieldName = '';
    let failedCount = 0;

    for (const filter of activeFilters) {
      if (!filter.valueSet.has(normalizeFilterValue(row[filter.fieldName]))) {
        failedFieldName = filter.fieldName;
        failedCount += 1;
        if (failedCount > 1) break;
      }
    }

    if (failedCount > 1) continue;

    for (const config of nonDateConfigs) {
      if (failedCount === 1 && config.fieldName !== failedFieldName) continue;
      const value = normalizeFilterValue(row[config.fieldName]);
      if (isUsableFilterValue(value)) linkedValueSets[config.fieldName].add(value);
    }
  }

  for (const config of nonDateConfigs) {
    result[config.fieldName] = Array.from(linkedValueSets[config.fieldName]).sort((a, b) =>
      collator.compare(a, b)
    );
  }

  return result;
}

// "更多筛选" 中单个筛选器的子弹窗
interface MoreFilterSubDropdownProps {
  config: FilterChipConfig;
  allValues: string[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
  dimensionHint?: string;
}

const MoreFilterSubDropdown: React.FC<MoreFilterSubDropdownProps> = ({
  config,
  allValues,
  selectedValues,
  onSelectionChange,
  dimensionHint,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tempValues, setTempValues] = useState<string[]>(selectedValues);
  const subRef = useRef<HTMLDivElement>(null);

  const isActive = selectedValues.length < allValues.length && selectedValues.length > 0;
  const allValueSet = useMemo(() => new Set(allValues), [allValues]);
  const tempValueSet = useMemo(() => new Set(tempValues), [tempValues]);

  const filteredValues = useMemo(() => {
    if (searchQuery) {
      return allValues.filter((v) => v.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return allValues;
  }, [allValues, searchQuery]);
  const visibleValues = useMemo(
    () => filteredValues.slice(0, FILTER_OPTION_RENDER_LIMIT),
    [filteredValues]
  );

  const isAllSelected = tempValues.length === allValues.length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (subRef.current && !subRef.current.contains(event.target as Node)) {
        setTempValues(selectedValues);
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedValues]);

  useEffect(() => {
    if (selectedValues.length > 0) {
      const validValues = selectedValues.filter((v) => allValueSet.has(v));
      if (validValues.length !== selectedValues.length) {
        onSelectionChange(validValues.length > 0 ? validValues : allValues);
      }
    }
  }, [allValues, allValueSet, onSelectionChange, selectedValues]);

  const handleToggleValue = (value: string) => {
    setTempValues((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSelectAll = () => {
    if (searchQuery) {
      const filteredSet = new Set(filteredValues);
      const allFilteredSelected = filteredValues.every((v) => tempValueSet.has(v));
      if (allFilteredSelected) {
        setTempValues(tempValues.filter((v) => !filteredSet.has(v)));
      } else {
        const newValues = [...tempValues];
        for (const v of filteredValues) {
          if (!tempValueSet.has(v)) newValues.push(v);
        }
        setTempValues(newValues);
      }
    } else {
      if (isAllSelected) {
        setTempValues([]);
      } else {
        setTempValues([...allValues]);
      }
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
    if (selectedValues.length === allValues.length) return `全部${config.label}`;
    if (selectedValues.length === 0) return `未选${config.label}`;
    if (selectedValues.length <= 2) return selectedValues.join(', ');
    return `已选 ${selectedValues.length} 个`;
  };

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectionChange(allValues);
  };
  return (
    <div className="more-filter-sub-wrapper" ref={subRef}>
      <span className="more-filter-label">
        {config.icon}
        <span>{config.label}</span>
        {dimensionHint && <span className="more-filter-hint">{dimensionHint}</span>}
      </span>
      <button
        type="button"
        className={`more-filter-trigger ${isActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => {
          if (!isOpen) {
            setTempValues(selectedValues);
            setSearchQuery('');
          }
          setIsOpen(!isOpen);
        }}
      >
        <span className="more-filter-trigger-text">{getDisplayValue()}</span>
        <span className="chip-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isActive && (
        <button
          type="button"
          className="more-filter-reset-icon"
          title={`重置${config.label}`}
          onClick={handleReset}
        >
          <X size={11} />
        </button>
      )}

      {isOpen && (
        <div className="filter-dropdown-menu more-filter-dropdown-menu" role="menu">
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
              {searchQuery
                ? filteredValues.every((v) => tempValues.includes(v))
                  ? '取消筛选全选'
                  : '筛选全选'
                : isAllSelected
                  ? '取消全选'
                  : '全选'}
            </button>
          </div>

          <div className="filter-dropdown-options">
            {visibleValues.map((value) => (
              <label key={value} className="filter-dropdown-option">
                <input
                  type="checkbox"
                  checked={tempValueSet.has(value)}
                  onChange={() => handleToggleValue(value)}
                />
                <span className="option-text">{value}</span>
              </label>
            ))}
            {filteredValues.length > visibleValues.length && (
              <div className="filter-dropdown-empty">
                仅显示前 {visibleValues.length} 项，可搜索完整选项
              </div>
            )}
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

// "更多筛选" 下拉组件
interface MoreFiltersDropdownProps {
  configs: FilterChipConfig[];
  allFilterValues: Record<string, string[]>;
  getSelectedValues: (fieldName: string) => string[];
  onFilterChange: (fieldName: string, values: string[]) => void;
  activeDimensionNames?: Set<string>;
  hasActive: boolean;
}

const MoreFiltersDropdown: React.FC<MoreFiltersDropdownProps> = ({
  configs,
  allFilterValues,
  getSelectedValues,
  onFilterChange,
  activeDimensionNames,
  hasActive,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeCount = configs.filter((config) => {
    const selected = getSelectedValues(config.fieldName);
    const total = allFilterValues[config.fieldName]?.length ?? 0;
    return selected.length > 0 && selected.length < total;
  }).length;

  return (
    <div className="more-filters-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`filter-chip more-filters-trigger ${hasActive ? 'active-filter' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="chip-text">
          更多筛选
          {activeCount > 0 && <span className="more-filters-count">{activeCount}</span>}
        </span>
        <span className="chip-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="more-filters-dropdown" role="menu">
          {configs.map((config) => {
            const allValues = allFilterValues[config.fieldName] || [];
            const selectedValues = getSelectedValues(config.fieldName);
            return (
              <MoreFilterSubDropdown
                key={config.fieldName}
                config={config}
                allValues={allValues}
                selectedValues={selectedValues}
                onSelectionChange={(values) => onFilterChange(config.fieldName, values)}
                dimensionHint={
                  activeDimensionNames?.has(config.fieldName) ? '已作为维度' : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

const SORT_BY_REG_FIELDS = new Set(['买量渠道', '渠道', '国家']);

const AdMobFilterBar: React.FC<AdMobFilterBarProps> = ({
  configs,
  data,
  filterConfigs,
  onFilterChange,
  onResetAll,
  activeDimensionNames,
}) => {
  // 日期筛选器始终使用全量数据的唯一值
  const effectiveConfigs = useMemo(() => {
    const availableFields = new Set<string>();
    for (const row of data) {
      Object.keys(row).forEach((fieldName) => {
        availableFields.add(fieldName);
      });
    }
    const configuredNames = new Set(configs.map((config) => config.fieldName));
    const detectedConfigs: FilterChipConfig[] = [];
    for (const fieldName of availableFields) {
      if (configuredNames.has(fieldName)) continue;
      const values = Array.from(
        new Set(data.map((row) => normalizeFilterValue(row[fieldName])).filter(isUsableFilterValue))
      );
      if (values.length <= 1) continue;
      const numericRatio =
        values.filter((value) => !Number.isNaN(Number(value))).length / values.length;
      if (numericRatio > 0.9 && values.length > Math.max(20, data.length * 0.5)) continue;
      const type = isDateLikeField(fieldName, values) ? 'date' : 'default';
      detectedConfigs.push({
        icon: getDetectedIcon(fieldName, type),
        label: fieldName,
        fieldName,
        type,
        group: values.length > 20 ? 'more' : undefined,
        source: 'detected',
      });
    }
    const merged = [...configs, ...detectedConfigs];
    const hasInstallDate = merged.some((config) => config.fieldName === '安装日期');
    const hasLifecycle = merged.some((config) => config.fieldName === '生命周期');
    return merged
      .map((config) => {
        if (hasInstallDate && hasLifecycle && config.fieldName === '安装日期') {
          return { ...config, group: undefined, pairWith: '生命周期' };
        }
        if (hasInstallDate && hasLifecycle && config.fieldName === '生命周期') {
          return { ...config, group: undefined, pairWith: '安装日期' };
        }
        return config;
      })
      .filter(
        (config, index, list) =>
          list.findIndex((item) => item.fieldName === config.fieldName) === index
      );
  }, [configs, data]);

  const dateFieldNames = useMemo(
    () => new Set(effectiveConfigs.filter((c) => c.type === 'date').map((c) => c.fieldName)),
    [effectiveConfigs]
  );
  const filterFieldNames = useMemo(
    () => effectiveConfigs.map((config) => config.fieldName),
    [effectiveConfigs]
  );
  const rawFilterValues = useMemo(
    () => buildRawFilterValues(data, filterFieldNames),
    [data, filterFieldNames]
  );
  const hasLinkedNonDateFilters = useMemo(
    () =>
      filterConfigs.some(
        (filter) => !dateFieldNames.has(filter.fieldName) && filter.selectedValues.length > 0
      ),
    [dateFieldNames, filterConfigs]
  );

  const allFilterValues = useMemo(() => {
    if (!hasLinkedNonDateFilters) return rawFilterValues;
    return buildLinkedFilterValues(
      data,
      effectiveConfigs,
      filterConfigs,
      rawFilterValues,
      dateFieldNames
    );

    // 非日期筛选器：使用联动逻辑
  }, [
    data,
    effectiveConfigs,
    filterConfigs,
    dateFieldNames,
    hasLinkedNonDateFilters,
    rawFilterValues,
  ]);

  const getSelectedValues = (fieldName: string): string[] => {
    const config = filterConfigs.find((f) => f.fieldName === fieldName);
    return config?.selectedValues || allFilterValues[fieldName] || [];
  };

  const hasActiveFilters = filterConfigs.some(
    (f) =>
      f.selectedValues.length > 0 &&
      f.selectedValues.length < (allFilterValues[f.fieldName]?.length ?? 0)
  );

  const handleResetAll = () => {
    if (onResetAll) {
      onResetAll();
      return;
    }

    // fallback: 逐个重置（兼容旧接口）
    for (const f of filterConfigs) {
      if (f.selectedValues.length > 0) {
        // 确认业务需求是重置为“全选”还是“清空”
        const resetValues = allFilterValues?.[f.fieldName] ?? [];
        onFilterChange(f.fieldName, resetValues);
      }
    }
  };

  // 分离主要筛选器和"更多"筛选器
  const primaryConfigs = useMemo(
    () => effectiveConfigs.filter((c) => c.group !== 'more'),
    [effectiveConfigs]
  );
  const moreConfigs = useMemo(
    () => effectiveConfigs.filter((c) => c.group === 'more'),
    [effectiveConfigs]
  );

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [visibleMoreCount, setVisibleMoreCount] = useState(moreConfigs.length);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return undefined;

    const measure = () => {
      const available = toolbar.clientWidth;
      const primaryWidth = primaryConfigs.reduce(
        (sum, config) => sum + Math.min(180, Math.max(92, config.label.length * 12 + 54)),
        0
      );
      const moreTriggerWidth = 124;
      const remaining = Math.max(0, available - primaryWidth - moreTriggerWidth - 24);
      let width = 0;
      let count = 0;
      for (const config of moreConfigs) {
        width += Math.min(180, Math.max(92, config.label.length * 12 + 54));
        if (width > remaining) break;
        count += 1;
      }
      setVisibleMoreCount(count >= moreConfigs.length ? moreConfigs.length : count);
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [moreConfigs, primaryConfigs]);

  const visibleMoreConfigs = moreConfigs.slice(0, visibleMoreCount);
  const overflowMoreConfigs = moreConfigs.slice(visibleMoreCount);

  // "更多"筛选器中是否有激活的
  const hasActiveMoreFilters = moreConfigs.some((config) => {
    const selected = getSelectedValues(config.fieldName);
    const total = allFilterValues[config.fieldName]?.length ?? 0;
    return selected.length > 0 && selected.length < total;
  });

  const appFilterActive = useMemo(() => {
    const appFilter = filterConfigs.find((f) => f.fieldName === '应用');
    if (!appFilter) return false;
    const total = allFilterValues.应用?.length ?? 0;
    return appFilter.selectedValues.length > 0 && appFilter.selectedValues.length < total;
  }, [filterConfigs, allFilterValues]);

  const registrationCountsMap = useMemo(() => {
    if (!appFilterActive) return new Map<string, Map<string, number>>();
    const result = new Map<string, Map<string, number>>();
    for (const fieldName of SORT_BY_REG_FIELDS) {
      result.set(
        fieldName,
        computeRegistrationCounts(data, dateFieldNames, filterConfigs, fieldName)
      );
    }
    return result;
  }, [appFilterActive, data, dateFieldNames, filterConfigs]);

  return (
    <div className="admob-filter-bar" ref={toolbarRef}>
      {primaryConfigs.map((config) =>
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
            registrationCounts={registrationCountsMap.get(config.fieldName)}
            sortByCount={appFilterActive && SORT_BY_REG_FIELDS.has(config.fieldName)}
          />
        )
      )}

      {visibleMoreConfigs.map((config) =>
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
            dimensionHint={activeDimensionNames?.has(config.fieldName) ? 'dimension' : undefined}
            registrationCounts={registrationCountsMap.get(config.fieldName)}
            sortByCount={appFilterActive && SORT_BY_REG_FIELDS.has(config.fieldName)}
          />
        )
      )}

      {overflowMoreConfigs.length > 0 && (
        <MoreFiltersDropdown
          configs={overflowMoreConfigs}
          allFilterValues={allFilterValues}
          getSelectedValues={getSelectedValues}
          onFilterChange={onFilterChange}
          activeDimensionNames={activeDimensionNames}
          hasActive={hasActiveMoreFilters}
        />
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
