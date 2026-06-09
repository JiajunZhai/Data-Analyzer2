import type React from 'react';
import styles from './TabBar.module.css';

type TabKey = 'pending' | 'active' | 'history';

interface TabBarProps {
  activeTab: TabKey;
  counts: Record<TabKey, number>;
  onTabChange: (tab: TabKey) => void;
}

const TAB_CONFIG: { key: TabKey; label: string }[] = [
  { key: 'pending', label: '待处理' },
  { key: 'active', label: '已标记' },
  { key: 'history', label: '历史' },
];

export const TabBar: React.FC<TabBarProps> = ({ activeTab, counts, onTabChange }) => {
  return (
    <div className={styles.tabBar}>
      {TAB_CONFIG.map((tab) => {
        const isActive = activeTab === tab.key;
        const count = counts[tab.key];
        return (
          <button
            type="button"
            key={tab.key}
            className={`${styles.tab} ${isActive ? styles.active : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            <span>{tab.label}</span>
            {count > 0 && (
              <span className={`${styles.badge} ${isActive ? styles.badgeActive : ''}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
