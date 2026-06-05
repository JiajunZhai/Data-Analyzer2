import { type RenderOptions, render } from '@testing-library/react';
import type { ReactElement } from 'react';

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    ...options,
  });
}

export { act, fireEvent, screen, waitFor } from '@testing-library/react';
// 显式导出，避免使用 export * 导致 react-refresh 规则警告
export { customRender as render };
