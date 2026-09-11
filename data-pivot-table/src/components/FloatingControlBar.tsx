import { Maximize2, Minimize2, PanelBottom, PanelRight, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface FloatingControlBarProps {
  isIdle: boolean;
  isFullscreen: boolean;
  showRowTotal: boolean;
  showColumnTotal: boolean;
  onExit: () => void;
  onToggleFullscreen: () => void;
  onToggleRowTotal: () => void;
  onToggleColumnTotal: () => void;
}

const FloatingControlBar: React.FC<FloatingControlBarProps> = ({
  isIdle,
  isFullscreen,
  showRowTotal,
  showColumnTotal,
  onExit,
  onToggleFullscreen,
  onToggleRowTotal,
  onToggleColumnTotal,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // 进入时延迟显示（等待布局动画完成）
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={barRef}
      className={`floating-control-bar ${isVisible ? 'visible' : ''} ${isIdle ? 'idle' : ''}`}
    >
      <span className="zen-status">沉浸模式中...</span>
      <div className="zen-bar-divider" />
      <button
        type="button"
        className={`zen-bar-switch ${showRowTotal ? 'active' : ''}`}
        onClick={onToggleRowTotal}
        aria-pressed={showRowTotal}
        title={showRowTotal ? '隐藏行总计' : '显示行总计'}
      >
        <PanelRight size={13} />
        <span>行总计</span>
      </button>
      <button
        type="button"
        className={`zen-bar-switch ${showColumnTotal ? 'active' : ''}`}
        onClick={onToggleColumnTotal}
        aria-pressed={showColumnTotal}
        title={showColumnTotal ? '隐藏列总计' : '显示列总计'}
      >
        <PanelBottom size={13} />
        <span>列总计</span>
      </button>
      <div className="zen-bar-divider" />
      <button
        type="button"
        className="zen-bar-btn"
        onClick={onToggleFullscreen}
        title={isFullscreen ? '退出系统全屏' : '进入系统全屏'}
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
      <button
        type="button"
        className="zen-bar-btn zen-bar-btn-exit"
        onClick={onExit}
        title="退出沉浸模式"
      >
        <X size={14} />
        <span>退出</span>
        <kbd>Esc</kbd>
      </button>
    </div>
  );
};

export default React.memo(FloatingControlBar);
