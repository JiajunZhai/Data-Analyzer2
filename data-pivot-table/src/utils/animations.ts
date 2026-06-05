import { gsap } from 'gsap';

/**
 * 检测用户是否偏好减少动画
 */
const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * 字段落位动效 - 淡入 + 微位移
 * 当新字段加入配置区或状态变更时触发
 */
export const animateFieldEntry = (element: HTMLElement) => {
  if (prefersReducedMotion()) {
    gsap.set(element, { autoAlpha: 1, y: 0, scale: 1 });
    return;
  }

  gsap.fromTo(
    element,
    {
      autoAlpha: 0,
      y: 6,
      scale: 0.96,
    },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.25,
      ease: 'power3.out',
      clearProps: 'all',
    }
  );
};

/**
 * 折叠/展开动效
 * @param element 目标元素
 * @param collapse true=折叠, false=展开
 * @param onComplete 动画完成回调
 */
export const animateCollapse = (
  element: HTMLElement,
  collapse: boolean,
  onComplete?: () => void
) => {
  if (prefersReducedMotion()) {
    gsap.set(element, {
      height: collapse ? 0 : 'auto',
      autoAlpha: collapse ? 0 : 1,
    });
    onComplete?.();
    return;
  }

  if (collapse) {
    gsap.to(element, {
      height: 0,
      autoAlpha: 0,
      duration: 0.25,
      ease: 'power2.inOut',
      onComplete,
    });
  } else {
    gsap.fromTo(
      element,
      { height: 0, autoAlpha: 0 },
      {
        height: 'auto',
        autoAlpha: 1,
        duration: 0.3,
        ease: 'power2.out',
        onComplete,
      }
    );
  }
};

/**
 * 表格行头入场动画（带 stagger）
 * 当数据加载完成时触发
 */
export const animateTableRowHeaders = (elements: HTMLElement[]) => {
  if (prefersReducedMotion()) {
    gsap.set(elements, { autoAlpha: 1, x: 0 });
    return;
  }

  gsap.fromTo(
    elements,
    {
      autoAlpha: 0,
      x: -10,
    },
    {
      autoAlpha: 1,
      x: 0,
      duration: 0.3,
      stagger: 0.02,
      ease: 'power2.out',
      clearProps: 'opacity,transform',
    }
  );
};

/**
 * 沉浸模式中临时唤醒配置区（拖拽时）
 */
export const showConfigPanelTemporarily = () => {
  if (prefersReducedMotion()) {
    gsap.set('.spatial-left-rail', { x: '0%', opacity: 0.9 });
    return;
  }

  gsap.to('.spatial-left-rail', {
    x: '0%',
    opacity: 0.9,
    duration: 0.2,
    ease: 'power2.out',
  });
};

/**
 * 沉浸模式中隐藏配置区（拖拽结束）
 */
export const hideConfigPanelTemporarily = () => {
  if (prefersReducedMotion()) {
    gsap.set('.spatial-left-rail', { x: '-100%', opacity: 0 });
    return;
  }

  gsap.to('.spatial-left-rail', {
    x: '-100%',
    opacity: 0,
    duration: 0.2,
    ease: 'power2.in',
  });
};
