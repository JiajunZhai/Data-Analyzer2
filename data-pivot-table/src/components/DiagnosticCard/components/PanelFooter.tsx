import { ChevronRight } from 'lucide-react';
import type React from 'react';
import styles from './PanelFooter.module.css';

interface PanelFooterProps {
  onViewAll?: () => void;
}

export const PanelFooter: React.FC<PanelFooterProps> = ({ onViewAll }) => {
  return (
    <div className={styles.footer}>
      <button type="button" className={styles.viewAllBtn} onClick={onViewAll}>
        <span>查看全部</span>
        <ChevronRight size={12} />
      </button>
    </div>
  );
};
