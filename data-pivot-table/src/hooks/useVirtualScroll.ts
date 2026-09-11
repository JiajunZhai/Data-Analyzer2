import { useCallback, useEffect, useRef, useState } from 'react';

interface VirtualScrollOptions {
  /** 总行数 */
  rowCount: number;
  /** 每行高度（像素） */
  rowHeight: number;
  /** 容器引用（动态获取高度） */
  containerRef: React.RefObject<HTMLElement | null>;
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
  /** 内容的总高度 */
  totalHeight: number;
  /** 获取行的 style */
  getRowStyle: (index: number) => React.CSSProperties;
}

/**
 * 虚拟滚动 Hook
 * 用于优化大数据量表格的渲染性能
 */
export function useVirtualScroll(options: VirtualScrollOptions): VirtualScrollResult {
  const { rowCount, rowHeight, containerRef, overscan = 5 } = options;
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const rafRef = useRef<number | null>(null);
  const scrollTopRef = useRef(0);
  const containerHeightRef = useRef(600);

  // 动态监听容器高度
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      const nextHeight = container.clientHeight;
      if (nextHeight !== containerHeightRef.current) {
        containerHeightRef.current = nextHeight;
        setContainerHeight(nextHeight);
      }
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [containerRef]);

  // 计算可见行的范围
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    rowCount - 1,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
  );

  const totalHeight = rowCount * rowHeight;

  useEffect(() => {
    const maxScrollTop = Math.max(0, totalHeight - containerHeight);
    if (scrollTopRef.current <= maxScrollTop) return;

    scrollTopRef.current = maxScrollTop;
    setScrollTop(maxScrollTop);

    const container = containerRef.current;
    if (container && container.scrollTop > maxScrollTop) {
      container.scrollTop = maxScrollTop;
    }
  }, [containerHeight, containerRef, totalHeight]);

  // 使用 requestAnimationFrame 优化滚动性能
  const onScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      const nextScrollTop = target.scrollTop;
      if (nextScrollTop !== scrollTopRef.current) {
        scrollTopRef.current = nextScrollTop;
        setScrollTop(nextScrollTop);
      }
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
    totalHeight,
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
