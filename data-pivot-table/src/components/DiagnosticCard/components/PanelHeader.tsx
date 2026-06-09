import { Search, Settings, X } from 'lucide-react';
import type React from 'react';
import styles from './PanelHeader.module.css';

interface PanelHeaderProps {
  onClose?: () => void;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ onClose }) => {
  return (
    <div className={styles.header}>
      <div className={styles.titleRow}>
        <Search size={14} className={styles.icon} />
        <span className={styles.title}>智能数据诊断</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.settingsBtn} title="设置">
          <Settings size={14} />
        </button>
        {onClose && (
          <button type="button" className={styles.closeBtn} onClick={onClose} title="收起诊断面板">
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
