import { useCallback, useEffect, useRef, useState } from 'react';

interface UseZenModeOptions {
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

interface UseZenModeResult {
  isZenMode: boolean;
  isIdle: boolean;
  isFullscreen: boolean;
  toggleZenMode: () => void;
  exitZenMode: () => void;
  toggleFullscreen: () => void;
}

const IDLE_TIMEOUT = 3000; // 3 秒无操作视为闲置
const DRAG_DEBOUNCE = 100; // 拖拽防抖延迟

/**
 * 沉浸模式 Hook
 * 管理沉浸模式状态、快捷键、鼠标静止检测、全屏 API
 */
export function useZenMode(options: UseZenModeOptions = {}): UseZenModeResult {
  const { onDragStart, onDragEnd } = options;
  const [isZenMode, setIsZenMode] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isZenModeRef = useRef(isZenMode);

  // 同步 ref
  useEffect(() => {
    isZenModeRef.current = isZenMode;
  }, [isZenMode]);

  // 重置闲置计时器
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    setIsIdle(false);
    idleTimerRef.current = setTimeout(() => {
      if (isZenModeRef.current) {
        setIsIdle(true);
      }
    }, IDLE_TIMEOUT);
  }, []);

  // 进入沉浸模式
  const enterZenMode = useCallback(() => {
    setIsZenMode(true);
    setIsIdle(false);
    resetIdleTimer();
    // 锁定 body 滚动
    document.body.style.overflow = 'hidden';
  }, [resetIdleTimer]);

  // 退出沉浸模式
  const exitZenMode = useCallback(() => {
    setIsZenMode(false);
    setIsIdle(false);
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    // 恢复 body 滚动
    document.body.style.overflow = '';
    // 退出系统全屏
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  // 切换沉浸模式
  const toggleZenMode = useCallback(() => {
    if (isZenModeRef.current) {
      exitZenMode();
    } else {
      enterZenMode();
    }
  }, [enterZenMode, exitZenMode]);

  // 切换系统全屏
  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('全屏 API 不可用:', err);
    }
  }, []);

  // 键盘监听（带输入框保护）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;

      // 保护屏障：焦点在可输入元素上时忽略快捷键
      const isInputElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInputElement) return;

      if (event.key === 'Escape' && isZenModeRef.current) {
        exitZenMode();
      } else if (event.key === 'f' || event.key === 'F') {
        toggleZenMode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [exitZenMode, toggleZenMode]);

  // 鼠标移动监听（闲置检测）
  useEffect(() => {
    if (!isZenMode) return;

    const handleMouseMove = () => {
      resetIdleTimer();
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isZenMode, resetIdleTimer]);

  // 全屏状态监听
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 拖拽事件处理（带防抖）
  const handleDragStart = useCallback(() => {
    if (!isZenModeRef.current) return;

    if (dragDebounceRef.current) {
      clearTimeout(dragDebounceRef.current);
    }
    dragDebounceRef.current = setTimeout(() => {
      onDragStart?.();
    }, DRAG_DEBOUNCE);
  }, [onDragStart]);

  const handleDragEnd = useCallback(() => {
    if (!isZenModeRef.current) return;

    if (dragDebounceRef.current) {
      clearTimeout(dragDebounceRef.current);
    }
    onDragEnd?.();
  }, [onDragEnd]);

  // 清理
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (dragDebounceRef.current) clearTimeout(dragDebounceRef.current);
      document.body.style.overflow = '';
    };
  }, []);

  return {
    isZenMode,
    isIdle,
    isFullscreen,
    toggleZenMode,
    exitZenMode,
    toggleFullscreen,
    handleDragStart,
    handleDragEnd,
  } as UseZenModeResult & { handleDragStart: () => void; handleDragEnd: () => void };
}
