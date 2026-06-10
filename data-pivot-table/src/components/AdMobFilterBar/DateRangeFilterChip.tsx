import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface DateRangeFilterChipProps {
  icon: React.ReactNode;
  label: string;
  allValues: string[];
  selectedValues: string[];
  onSelectionChange: (values: string[]) => void;
}

function parseDate(str: string): Date | null {
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isDateInRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function generateDateRange(start: Date, end: Date): string[] {
  const result: string[] = [];
  const current = new Date(start);
  while (current.getTime() <= end.getTime()) {
    result.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

const MONTH_NAMES = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
];
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

interface Preset {
  label: string;
  getRange: (sortedDates: Date[]) => [Date, Date] | null;
}

const PRESETS: Preset[] = [
  { label: '全部', getRange: () => null },
  {
    label: '今天',
    getRange: () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return [today, today];
    },
  },
  {
    label: '最近7天',
    getRange: (sorted) => {
      if (sorted.length === 0) return null;
      const end = sorted[sorted.length - 1];
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return [start < sorted[0] ? sorted[0] : start, end];
    },
  },
  {
    label: '最近30天',
    getRange: (sorted) => {
      if (sorted.length === 0) return null;
      const end = sorted[sorted.length - 1];
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      return [start < sorted[0] ? sorted[0] : start, end];
    },
  },
  {
    label: '本月',
    getRange: (sorted) => {
      if (sorted.length === 0) return null;
      const last = sorted[sorted.length - 1];
      const start = new Date(last.getFullYear(), last.getMonth(), 1);
      return [start, last];
    },
  },
  {
    label: '上月',
    getRange: (sorted) => {
      if (sorted.length === 0) return null;
      const last = sorted[sorted.length - 1];
      const prevMonth = new Date(last.getFullYear(), last.getMonth() - 1, 1);
      const endOfPrev = new Date(last.getFullYear(), last.getMonth(), 0);
      return [
        prevMonth < sorted[0] ? sorted[0] : prevMonth,
        endOfPrev > sorted[sorted.length - 1] ? sorted[sorted.length - 1] : endOfPrev,
      ];
    },
  },
];

const DateRangeFilterChip: React.FC<DateRangeFilterChipProps> = ({
  icon,
  label,
  allValues,
  selectedValues,
  onSelectionChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (allValues.length > 0) {
      const last = parseDate(allValues[allValues.length - 1]);
      if (last) return new Date(last.getFullYear(), last.getMonth(), 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const sortedDates = useMemo(() => {
    return allValues
      .map((v) => parseDate(v))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
  }, [allValues]);

  const isAllSelected = selectedValues.length === allValues.length;

  // 使用 useCallback 包装状态更新逻辑
  const syncRangeState = useCallback(() => {
    if (isAllSelected || selectedValues.length === 0) {
      setRangeStart(null);
      setRangeEnd(null);
      setActivePreset(0);
      return;
    }
    const dates = selectedValues
      .map((v) => parseDate(v))
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    if (dates.length > 0) {
      setRangeStart(dates[0]);
      setRangeEnd(dates[dates.length - 1]);
      setActivePreset(null);
    }
  }, [selectedValues, isAllSelected]);

  // 使用 ref 跟踪上一次的 selectedValues
  const prevSelectedValuesRef = useRef(selectedValues);
  useEffect(() => {
    if (prevSelectedValuesRef.current !== selectedValues) {
      prevSelectedValuesRef.current = selectedValues;
      syncRangeState();
    }
  }, [selectedValues, syncRangeState]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayValue = useMemo(() => {
    if (isAllSelected) return `全部${label}`;
    if (selectedValues.length === 0) return `未选${label}`;
    if (rangeStart && rangeEnd) {
      if (isSameDay(rangeStart, rangeEnd)) return `${label}: ${formatDate(rangeStart)}`;
      return `${label}: ${formatDate(rangeStart)} ~ ${formatDate(rangeEnd)}`;
    }
    if (selectedValues.length <= 2) return `${label}: ${selectedValues.join(', ')}`;
    return `${label}: 已选 ${selectedValues.length} 个`;
  }, [isAllSelected, selectedValues, rangeStart, rangeEnd, label]);

  const isActive = !isAllSelected && selectedValues.length > 0;

  const effectiveStart = rangeStart ?? (hoverDate && !rangeEnd ? hoverDate : null);
  const effectiveEnd = rangeEnd ?? (hoverDate && rangeStart && !rangeEnd ? hoverDate : null);

  const handleDayClick = useCallback(
    (date: Date) => {
      setActivePreset(null);
      if (!rangeStart || (rangeStart && rangeEnd)) {
        setRangeStart(date);
        setRangeEnd(null);
      } else {
        if (date.getTime() < rangeStart.getTime()) {
          setRangeEnd(rangeStart);
          setRangeStart(date);
        } else {
          setRangeEnd(date);
        }
      }
      setHoverDate(null);
    },
    [rangeStart, rangeEnd]
  );

  const handlePresetClick = useCallback(
    (index: number) => {
      setActivePreset(index);
      const preset = PRESETS[index];
      const range = preset.getRange(sortedDates);
      if (!range) {
        setRangeStart(null);
        setRangeEnd(null);
        onSelectionChange([...allValues]);
        setIsOpen(false);
        return;
      }
      setRangeStart(range[0]);
      setRangeEnd(range[1]);
      const dates = generateDateRange(range[0], range[1]);
      const validDates = dates.filter((d) => allValues.includes(d));
      onSelectionChange(validDates);
      setIsOpen(false);
    },
    [sortedDates, allValues, onSelectionChange]
  );

  const handleConfirm = useCallback(() => {
    if (!rangeStart) {
      onSelectionChange([...allValues]);
    } else if (!rangeEnd) {
      onSelectionChange([formatDate(rangeStart)]);
    } else {
      const dates = generateDateRange(rangeStart, rangeEnd);
      const validDates = dates.filter((d) => allValues.includes(d));
      onSelectionChange(validDates);
    }
    setIsOpen(false);
  }, [rangeStart, rangeEnd, allValues, onSelectionChange]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d);
  while (calendarDays.length < 42) calendarDays.push(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const renderDay = (day: number | null, index: number) => {
    if (day === null) return <div key={`empty-${index}`} className="calendar-day empty" />;
    const date = new Date(year, month, day);
    const dateStr = formatDate(date);
    const isInData = allValues.includes(dateStr);
    const isToday = isSameDay(date, today);

    let isStart = false;
    let isEnd = false;
    let isInRange = false;

    if (effectiveStart && effectiveEnd) {
      const s = effectiveStart.getTime() < effectiveEnd.getTime() ? effectiveStart : effectiveEnd;
      const e = effectiveStart.getTime() < effectiveEnd.getTime() ? effectiveEnd : effectiveStart;
      isStart = isSameDay(date, s);
      isEnd = isSameDay(date, e);
      isInRange = isDateInRange(date, s, e) && !isStart && !isEnd;
    } else if (effectiveStart) {
      isStart = isSameDay(date, effectiveStart);
    }

    const classNames = [
      'calendar-day',
      !isInData ? 'disabled' : '',
      isToday ? 'today' : '',
      isStart ? 'range-start' : '',
      isEnd ? 'range-end' : '',
      isInRange ? 'in-range' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        type="button"
        key={`day-${day}`}
        className={classNames}
        onClick={() => isInData && handleDayClick(date)}
        onMouseEnter={() => isInData && setHoverDate(date)}
        onMouseLeave={() => setHoverDate(null)}
      >
        {day}
      </button>
    );
  };

  return (
    <div className="date-range-chip-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`filter-chip ${isActive ? 'active-filter' : ''} ${isOpen ? 'open' : ''}`}
        onClick={() => {
          if (!isOpen) {
            if (isAllSelected) {
              setRangeStart(null);
              setRangeEnd(null);
              setActivePreset(0);
            }
          }
          setIsOpen(!isOpen);
        }}
      >
        <span className="chip-icon">{icon}</span>
        <span className="chip-text">{displayValue}</span>
        <span className="chip-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div
          className="date-range-dropdown"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="date-range-presets">
            {PRESETS.map((preset, i) => (
              <button
                type="button"
                key={preset.label}
                className={`date-preset-item ${activePreset === i ? 'active' : ''}`}
                onClick={() => handlePresetClick(i)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="date-calendar">
            <div className="calendar-header">
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
              >
                ‹
              </button>
              <span className="calendar-title">
                {year}年{MONTH_NAMES[month]}
              </span>
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                ›
              </button>
            </div>
            <div className="calendar-weekdays">
              {WEEKDAYS.map((w) => (
                <div key={w} className="calendar-weekday">
                  {w}
                </div>
              ))}
            </div>
            <div className="calendar-grid">{calendarDays.map((day, i) => renderDay(day, i))}</div>
            <div className="calendar-footer">
              <span className="calendar-footer-hint">
                {rangeStart && !rangeEnd ? '请点击结束日期' : '点击选择开始日期'}
              </span>
              <div className="calendar-footer-buttons">
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
        </div>
      )}
    </div>
  );
};

export default DateRangeFilterChip;
