import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVirtualScroll } from '../useVirtualScroll';

describe('useVirtualScroll', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clamps stale scroll position when the row count shrinks', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      value: 100,
    });
    const containerRef = { current: container };
    const { result, rerender } = renderHook(
      ({ rowCount }) =>
        useVirtualScroll({
          rowCount,
          rowHeight: 20,
          containerRef,
          overscan: 0,
        }),
      { initialProps: { rowCount: 500 } }
    );

    act(() => {
      container.scrollTop = 9000;
      result.current.onScroll({
        currentTarget: container,
      } as React.UIEvent<HTMLDivElement>);
    });
    expect(result.current.startIndex).toBe(450);

    rerender({ rowCount: 20 });

    expect(container.scrollTop).toBe(300);
    expect(result.current.startIndex).toBeLessThan(20);
    expect(result.current.endIndex).toBe(19);
  });
});
