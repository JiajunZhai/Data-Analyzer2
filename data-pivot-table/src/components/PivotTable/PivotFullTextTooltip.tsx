import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PivotFullTextTooltipProps {
  containerRef: React.RefObject<HTMLElement | null>;
}

interface TooltipState {
  text: string;
  x: number;
  y: number;
}

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

function getPositionFromElement(target: HTMLElement): Pick<TooltipState, 'x' | 'y'> {
  const rect = target.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.bottom,
  };
}

export const PivotFullTextTooltip: React.FC<PivotFullTextTooltipProps> = ({ containerRef }) => {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const showTooltip = useCallback((target: HTMLElement, x: number, y: number) => {
    const text = getTargetText(target);
    if (!text) {
      setTooltip(null);
      return;
    }

    setTooltip({ text, x, y });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const handleMouseOver = (event: MouseEvent) => {
      const target = getTooltipTarget(container, event.target);
      if (!target) {
        setTooltip(null);
        return;
      }
      showTooltip(target, event.clientX, event.clientY);
    };

    const handleMouseMove = (event: MouseEvent) => {
      const target = getTooltipTarget(container, event.target);
      if (!target) {
        setTooltip(null);
        return;
      }
      showTooltip(target, event.clientX, event.clientY);
    };

    const handleMouseLeave = () => setTooltip(null);

    const handleFocusIn = (event: FocusEvent) => {
      const target = getTooltipTarget(container, event.target);
      if (!target) return;
      const nextPosition = getPositionFromElement(target);
      showTooltip(target, nextPosition.x, nextPosition.y);
    };

    const hideTooltip = () => setTooltip(null);

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);
    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', hideTooltip);
    container.addEventListener('scroll', hideTooltip, { passive: true });
    window.addEventListener('resize', hideTooltip);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', hideTooltip);
      container.removeEventListener('scroll', hideTooltip);
      window.removeEventListener('resize', hideTooltip);
    };
  }, [containerRef, showTooltip]);

  if (!tooltip || typeof document === 'undefined') return null;

  const shouldFlipX = tooltip.x + TOOLTIP_ESTIMATED_WIDTH > window.innerWidth - VIEWPORT_PADDING;
  const shouldFlipY = tooltip.y + TOOLTIP_ESTIMATED_HEIGHT > window.innerHeight - VIEWPORT_PADDING;
  const transform = [shouldFlipX ? 'translateX(-100%)' : '', shouldFlipY ? 'translateY(-100%)' : '']
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      className="pivot-full-text-tooltip"
      role="tooltip"
      style={{
        left: shouldFlipX ? tooltip.x - TOOLTIP_OFFSET : tooltip.x + TOOLTIP_OFFSET,
        top: shouldFlipY ? tooltip.y - TOOLTIP_OFFSET : tooltip.y + TOOLTIP_OFFSET,
        transform: transform || undefined,
      }}
    >
      {tooltip.text}
    </div>,
    document.body
  );
};
