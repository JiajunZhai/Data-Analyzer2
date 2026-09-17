import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PivotFullTextTooltipProps {
  containerRef: React.RefObject<HTMLElement | null>;
}

interface TooltipState {
  text: string;
  targetRect: DOMRect;
}

const TOOLTIP_DELAY = 500;
const TOOLTIP_OFFSET = 12;
const VIEWPORT_PADDING = 12;
const TOOLTIP_ESTIMATED_WIDTH = 420;
const TOOLTIP_ESTIMATED_HEIGHT = 180;

function getTooltipTarget(container: HTMLElement, target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;

  const textElement = target.closest<HTMLElement>('[data-full-text]');
  if (!textElement || !container.contains(textElement)) return null;

  const headerCell = textElement.closest<HTMLElement>('th[data-full-text]');
  if (headerCell && container.contains(headerCell)) return headerCell;

  const rowHeaderCell = textElement.closest<HTMLElement>('.row-header[data-full-text]');
  if (!rowHeaderCell || !container.contains(rowHeaderCell)) return null;

  return rowHeaderCell;
}

function getTargetText(target: HTMLElement): string {
  return target.dataset.fullText?.trim() ?? '';
}

function getTextElement(target: HTMLElement): HTMLElement {
  return (
    target.querySelector<HTMLElement>(
      '.frozen-cell-inner, .sticky-header-label, .tree-label-text'
    ) ?? target
  );
}

function isTextTruncated(target: HTMLElement): boolean {
  const textElement = getTextElement(target);
  const { clientWidth, scrollWidth, clientHeight, scrollHeight } = textElement;

  // jsdom does not perform layout. Keep the interaction testable while real cells use
  // the overflow measurements below.
  if (clientWidth === 0 && scrollWidth === 0) return true;

  return scrollWidth > clientWidth + 1 || scrollHeight > clientHeight + 1;
}

export const PivotFullTextTooltip: React.FC<PivotFullTextTooltipProps> = ({ containerRef }) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const hideTooltip = useCallback(() => {
    clearTimer();
    activeTargetRef.current = null;
    setTooltip(null);
  }, [clearTimer]);

  const scheduleTooltip = useCallback(
    (target: HTMLElement) => {
      if (activeTargetRef.current === target) return;

      clearTimer();
      activeTargetRef.current = target;
      setTooltip(null);

      const text = getTargetText(target);
      if (!text || !isTextTruncated(target)) {
        activeTargetRef.current = null;
        return;
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        if (activeTargetRef.current !== target || !containerRef.current?.contains(target)) return;

        setTooltip({ text, targetRect: target.getBoundingClientRect() });
      }, TOOLTIP_DELAY);
    },
    [clearTimer, containerRef]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handlePointerTarget = (event: MouseEvent) => {
      const target = getTooltipTarget(container, event.target);
      if (!target) {
        hideTooltip();
        return;
      }
      scheduleTooltip(target);
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = getTooltipTarget(container, event.target);
      if (target) scheduleTooltip(target);
    };

    container.addEventListener('mouseover', handlePointerTarget);
    container.addEventListener('mousemove', handlePointerTarget);
    container.addEventListener('mouseleave', hideTooltip);
    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', hideTooltip);
    container.addEventListener('scroll', hideTooltip, { passive: true });
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);

    return () => {
      container.removeEventListener('mouseover', handlePointerTarget);
      container.removeEventListener('mousemove', handlePointerTarget);
      container.removeEventListener('mouseleave', hideTooltip);
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', hideTooltip);
      container.removeEventListener('scroll', hideTooltip);
      window.removeEventListener('scroll', hideTooltip, true);
      window.removeEventListener('resize', hideTooltip);
      clearTimer();
    };
  }, [clearTimer, containerRef, hideTooltip, scheduleTooltip]);

  if (!tooltip || typeof document === 'undefined') return null;

  const { targetRect } = tooltip;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = Math.min(TOOLTIP_ESTIMATED_WIDTH, viewportWidth - VIEWPORT_PADDING * 2);
  const spaceAbove = targetRect.top - TOOLTIP_OFFSET - VIEWPORT_PADDING;
  const spaceBelow = viewportHeight - targetRect.bottom - TOOLTIP_OFFSET - VIEWPORT_PADDING;
  const shouldPlaceBelow = spaceAbove < TOOLTIP_ESTIMATED_HEIGHT && spaceBelow >= spaceAbove;
  const anchorX = targetRect.left + targetRect.width / 2;
  const minX = VIEWPORT_PADDING + tooltipWidth / 2;
  const maxX = Math.max(minX, viewportWidth - VIEWPORT_PADDING - tooltipWidth / 2);
  const x = Math.min(maxX, Math.max(minX, anchorX));
  const y = shouldPlaceBelow
    ? Math.min(
        Math.max(VIEWPORT_PADDING, targetRect.bottom + TOOLTIP_OFFSET),
        Math.max(VIEWPORT_PADDING, viewportHeight - VIEWPORT_PADDING - TOOLTIP_ESTIMATED_HEIGHT)
      )
    : Math.min(
        Math.max(VIEWPORT_PADDING + TOOLTIP_ESTIMATED_HEIGHT, targetRect.top - TOOLTIP_OFFSET),
        Math.max(VIEWPORT_PADDING + TOOLTIP_ESTIMATED_HEIGHT, viewportHeight - VIEWPORT_PADDING)
      );

  return createPortal(
    <div
      className="pivot-full-text-tooltip"
      role="tooltip"
      style={{
        left: x,
        top: y,
        transform: shouldPlaceBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)',
      }}
    >
      {tooltip.text}
    </div>,
    document.body
  );
};
