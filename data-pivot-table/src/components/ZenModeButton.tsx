import { Maximize2, Minimize2 } from 'lucide-react';
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
  const label = disabled ? '请先加载数据' : isActive ? '退出沉浸模式' : '进入沉浸模式';
  const Icon = isActive ? Minimize2 : Maximize2;

  return (
    <button
      type="button"
      className={`zen-toggle ${isActive ? 'zen-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <span className="capsule-icon">
        <Icon size={15} />
      </span>
    </button>
  );
};

export default ZenModeButton;
