import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PivotField } from '../../types';
import ValueFieldSettings from '../ValueFieldSettings';

function makePivotField(format: PivotField['format'] = {}): PivotField {
  return {
    field: {
      name: '注册用户',
      type: 'measure',
      dataType: 'number',
      aggregation: 'sum',
    },
    format,
  };
}

describe('ValueFieldSettings', () => {
  it('renders as an anchored value format dialog', () => {
    render(
      <ValueFieldSettings
        pivotField={makePivotField({ decimals: 2 })}
        anchor={{ x: 48, y: 96 }}
        onFormatChange={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole('dialog', { name: '注册用户' });

    expect(dialog).toHaveClass('anchored');
    expect(dialog).toHaveStyle({ '--value-settings-x': '48px', '--value-settings-y': '96px' });
    expect(screen.getByText('值格式')).toBeInTheDocument();
    expect(screen.getByText('2 位')).toBeInTheDocument();
  });

  it('updates decimal places, thousands separator, and display mode', () => {
    const onFormatChange = vi.fn();
    render(
      <ValueFieldSettings
        pivotField={makePivotField({ decimals: 2, thousandsSeparator: true, displayAs: 'value' })}
        onFormatChange={onFormatChange}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '4' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭千分位分隔' }));
    fireEvent.click(screen.getByLabelText(/百分比/));

    expect(onFormatChange).toHaveBeenNthCalledWith(1, {
      decimals: 4,
      thousandsSeparator: true,
      displayAs: 'value',
    });
    expect(onFormatChange).toHaveBeenNthCalledWith(2, {
      decimals: 2,
      thousandsSeparator: false,
      displayAs: 'value',
    });
    expect(onFormatChange).toHaveBeenNthCalledWith(3, {
      decimals: 2,
      thousandsSeparator: true,
      displayAs: 'percentage',
    });
  });

  it('closes from the panel close button', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ValueFieldSettings
        pivotField={makePivotField()}
        onFormatChange={vi.fn()}
        onClose={onClose}
      />
    );

    const closeButton = container.querySelector<HTMLButtonElement>('.value-settings-close');
    if (!closeButton) throw new Error('Expected close button to render');

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
