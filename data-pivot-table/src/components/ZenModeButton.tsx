import { Maximize2 } from 'lucide-react';
import type React from 'react';

interface ZenModeButtonProps {
  disabled?: boolean;
  isActive?: boolean;
  onClick: () => void;
}

const ZenModeButton: React.FC<ZenModeButtonProps> = ({
  disabled = false,
  isActive = false,
  onClick,
}) => {
  return (
    <button
      type="button"
      className={`zen-toggle ${isActive ? 'zen-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? '请先加载数据' : isActive ? '退出沉浸模式 (Esc)' : '进入沉浸模式 (F)'}
    >
      <span className="capsule-icon">
        <Maximize2 size={13} />
      </span>
      <span>{isActive ? '沉浸中' : '沉浸'}</span>
      {!isActive && <span className="capsule-shortcut">F</span>}
    </button>
  );
};

export default ZenModeButton;
