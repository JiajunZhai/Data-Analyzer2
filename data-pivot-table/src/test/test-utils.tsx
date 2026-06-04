import { type RenderOptions, render } from '@testing-library/react';
import type { ReactElement } from 'react';

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    ...options,
  });
}

// 显式导出，避免使用 export * 导致 react-refresh 规则警告
export { customRender as render };
export { screen, fireEvent, waitFor, act } from '@testing-library/react';
