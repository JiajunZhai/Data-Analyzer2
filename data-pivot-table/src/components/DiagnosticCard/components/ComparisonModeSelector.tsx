import { CalendarDays, ChevronDown } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComparisonMode } from '../../../types/anomaly';
import styles from './ComparisonModeSelector.module.css';

interface ModeOption {
  mode: ComparisonMode;
  label: string;
  description: string;
}

interface ComparisonModeSelectorProps {
  modes: ModeOption[];
  selectedMode: ComparisonMode;
  onSelect: (mode: ComparisonMode) => void;
}

const MODE_ICONS: Record<ComparisonMode, string> = {
  day: '日',
  prev_day: '昨',
  multi_day: '3D',
  week: '周',
};

export const ComparisonModeSelector: React.FC<ComparisonModeSelectorProps> = ({
  modes,
  selectedMode,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = modes.find((m) => m.mode === selectedMode) || modes[0];

  const handleSelect = useCallback(
    (mode: ComparisonMode) => {
      onSelect(mode);
      setIsOpen(false);
    },
    [onSelect]
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (modes.length <= 1) {
    return (
      <div className={styles.container}>
        <div className={styles.chip}>
          <CalendarDays size={11} />
          <span>{selected?.label || '日环比'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <button type="button" className={styles.trigger} onClick={() => setIsOpen(!isOpen)}>
        <CalendarDays size={11} className={styles.triggerIcon} />
        <span className={styles.triggerLabel}>{selected?.label}</span>
        <ChevronDown size={11} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          {modes.map((m) => (
            <button
              key={m.mode}
              type="button"
              className={`${styles.option} ${m.mode === selectedMode ? styles.optionActive : ''}`}
              onClick={() => handleSelect(m.mode)}
            >
              <span className={styles.optionBadge}>{MODE_ICONS[m.mode]}</span>
              <div className={styles.optionInfo}>
                <span className={styles.optionLabel}>{m.label}</span>
                <span className={styles.optionDesc}>{m.description}</span>
              </div>
              {m.mode === selectedMode && <span className={styles.checkmark}>&#10003;</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
