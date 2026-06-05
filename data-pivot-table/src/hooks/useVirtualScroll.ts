import { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualScrollOptions {
  /** 总行数 */
  rowCount: number;
  /** 每行高度（像素） */
  rowHeight: number;
  /** 容器高度（像素） */
  containerHeight: number;
  /** 预渲染的额外行数 */
  overscan?: number;
}

interface VirtualScrollResult {
  /** 可见行的起始索引 */
  startIndex: number;
  /** 可见行的结束索引 */
  endIndex: number;
  /** 容器的 onScroll 处理函数 */
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  /** 容器的 style */
  containerStyle: React.CSSProperties;
  /** 内容的 style */
  contentStyle: React.CSSProperties;
  /** 获取行的 style */
  getRowStyle: (index: number) => React.CSSProperties;
}

/**
 * 虚拟滚动 Hook
 * 用于优化大数据量表格的渲染性能
 */
export function useVirtualScroll(options: VirtualScrollOptions): VirtualScrollResult {
  const { rowCount, rowHeight, containerHeight, overscan = 5 } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  // 计算可见行的范围
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    rowCount - 1,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  );

  // 使用 requestAnimationFrame 优化滚动性能
  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
    });
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const containerStyle: React.CSSProperties = {
    height: containerHeight,
    overflow: 'auto',
  };

  const contentStyle: React.CSSProperties = {
    height: rowCount * rowHeight,
    position: 'relative',
  };

  const getRowStyle = useCallback(
    (index: number): React.CSSProperties => ({
      position: 'absolute',
      top: index * rowHeight,
      width: '100%',
      height: rowHeight,
    }),
    [rowHeight]
  );

  return {
    startIndex,
    endIndex,
    onScroll,
    containerStyle,
    contentStyle,
    getRowStyle,
  };
}

/**
 * 判断是否应该使用虚拟滚动
 * 当行数超过阈值时启用
 */
export function shouldUseVirtualScroll(rowCount: number, threshold: number = 100): boolean {
  return rowCount > threshold;
}
