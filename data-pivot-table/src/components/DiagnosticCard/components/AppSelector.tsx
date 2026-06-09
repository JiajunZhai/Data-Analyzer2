import { ChevronDown, Play, Search, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './AppSelector.module.css';

interface AppSelectorProps {
  apps: string[];
  selectedApp: string | null;
  onSelect: (app: string | null) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}

export const AppSelector: React.FC<AppSelectorProps> = ({
  apps,
  selectedApp,
  onSelect,
  onAnalyze,
  isAnalyzing,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredApps = useMemo(() => {
    if (!searchText.trim()) return apps;
    const keyword = searchText.trim().toLowerCase();
    return apps.filter((app) => app.toLowerCase().includes(keyword));
  }, [apps, searchText]);

  const displayLabel = selectedApp || (apps.length > 0 ? '全部应用' : '无应用字段');

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) setSearchText('');
      return !prev;
    });
  }, []);

  const handleSelect = useCallback(
    (app: string | null) => {
      onSelect(app);
      setIsOpen(false);
      setSearchText('');
    },
    [onSelect]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(null);
      setIsOpen(false);
      setSearchText('');
    },
    [onSelect]
  );

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchText('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div className={styles.container}>
      <div className={styles.selectWrapper} ref={containerRef}>
        <button type="button" className={styles.selectBtn} onClick={handleToggle}>
          <span className={selectedApp ? styles.selectedLabel : styles.placeholderLabel}>
            {displayLabel}
          </span>
          <span className={styles.selectActions}>
            {selectedApp && (
              <span className={styles.clearBtn} onClick={handleClear} role="button" tabIndex={-1}>
                <X size={12} />
              </span>
            )}
            <ChevronDown
              size={12}
              className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
            />
          </span>
        </button>

        {isOpen && (
          <div className={styles.dropdown}>
            <div className={styles.searchBox}>
              <Search size={12} className={styles.searchIcon} />
              <input
                ref={searchInputRef}
                type="text"
                className={styles.searchInput}
                placeholder="搜索应用..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              {searchText && (
                <span className={styles.searchClear} onClick={() => setSearchText('')} role="button" tabIndex={-1}>
                  <X size={10} />
                </span>
              )}
            </div>

            <div className={styles.optionList}>
              <button
                type="button"
                className={`${styles.option} ${!selectedApp ? styles.optionActive : ''}`}
                onClick={() => handleSelect(null)}
              >
                全部应用
              </button>
              {filteredApps.length > 0 ? (
                filteredApps.map((app) => (
                  <button
                    key={app}
                    type="button"
                    className={`${styles.option} ${selectedApp === app ? styles.optionActive : ''}`}
                    onClick={() => handleSelect(app)}
                  >
                    {searchText ? highlightMatch(app, searchText) : app}
                  </button>
                ))
              ) : (
                <div className={styles.noResult}>未找到匹配的应用</div>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className={styles.analyzeBtn}
        onClick={onAnalyze}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? <span className={styles.spinner} /> : <Play size={12} />}
        <span>{isAnalyzing ? '分析中...' : '分析'}</span>
      </button>
    </div>
  );
};

function highlightMatch(text: string, keyword: string): React.ReactNode {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className={styles.matchHighlight}>{text.slice(idx, idx + keyword.length)}</span>
      {text.slice(idx + keyword.length)}
    </>
  );
}
