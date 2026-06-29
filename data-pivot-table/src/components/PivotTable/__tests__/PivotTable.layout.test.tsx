import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PivotResult, PivotTreeNode } from '../../../types';
import PivotTable from '../PivotTable';

const columnLevels = [
  [{ value: 'VC001', colspan: 2, startIndex: 0 }],
  [
    { value: '注册用户', colspan: 1, startIndex: 0 },
    { value: 'CTR', colspan: 1, startIndex: 1 },
  ],
];

function makeTreeRows(): PivotTreeNode[] {
  return [
    {
      id: 'group:2026-06-26',
      label: '2026-06-26',
      path: ['2026-06-26'],
      depth: 0,
      data: [42, 0.0952],
      rowTotalValues: [42, 0.0952],
      children: [
        {
          id: 'leaf:2026-06-26:effect_unlock',
          label: 'effect_unlock',
          path: ['2026-06-26', 'effect_unlock'],
          depth: 1,
          data: [21, 0],
          rowTotalValues: [21, 0],
          rowIndex: 0,
          children: [],
        },
        {
          id: 'leaf:2026-06-26:cold-start',
          label: '冷启动',
          path: ['2026-06-26', '冷启动'],
          depth: 1,
          data: [21, 0.0952],
          rowTotalValues: [21, 0.0952],
          rowIndex: 1,
          children: [],
        },
      ],
    },
  ];
}

function makeResult(rowTree?: PivotTreeNode[]): PivotResult {
  return {
    rowHeaders: [
      ['2026-06-26', 'effect_unlock'],
      ['2026-06-26', '冷启动'],
    ],
    rowDimensions: ['日期', '标准广告场景'],
    rowTree,
    columnHeaders: ['VC001\u001f注册用户', 'VC001\u001fCTR'],
    columnLevels,
    data: [
      [21, 0],
      [21, 0.0952],
    ],
    rowTotals: [21, 21],
    columnTotals: [42, 0.0952],
    grandTotal: 42,
    colFieldNames: ['应用'],
    valueFieldNames: ['注册用户', 'CTR'],
    valueAxis: 'columns',
    rowValueFieldNames: ['', ''],
    columnValueFieldNames: ['注册用户', 'CTR'],
    rowTotalValues: [
      [21, 0],
      [21, 0.0952],
    ],
    totalColumnHeaders: ['注册用户', 'CTR'],
    totalColumnValueFieldNames: ['注册用户', 'CTR'],
    totalRows: [],
  };
}

function getPivotTable(container: HTMLElement): HTMLTableElement {
  const table = container.querySelector<HTMLTableElement>('table.pivot-table');
  if (!table) throw new Error('Pivot table was not rendered');
  return table;
}

function getColumnClasses(table: HTMLTableElement): string[] {
  return Array.from(table.querySelectorAll('col')).map((column) => column.className);
}

describe('PivotTable layout structure', () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('aligns flat corner, grouped column headers, data columns, and row totals', () => {
    const { container } = render(
      <PivotTable result={makeResult()} showRowTotal={true} showColumnTotal={false} />
    );
    const table = getPivotTable(container);
    const headerRows = Array.from(table.tHead?.rows ?? []);

    expect(getColumnClasses(table)).toEqual([
      'pivot-col-row-header',
      'pivot-col-row-header',
      'pivot-col-data',
      'pivot-col-data',
      'pivot-col-total',
      'pivot-col-total',
    ]);

    expect(headerRows).toHaveLength(2);
    expect(headerRows[0].cells[0]).toHaveClass('corner-cell');
    expect(headerRows[0].cells[0].colSpan).toBe(2);
    expect(headerRows[0].cells[0].rowSpan).toBe(2);
    expect(headerRows[0].cells[1].textContent).toContain('VC001');
    expect(headerRows[0].cells[1].colSpan).toBe(2);
    expect(headerRows[0].cells[2].colSpan).toBe(2);
    expect(headerRows[1].cells[0].textContent).toContain('注册用户');
    expect(headerRows[1].cells[1].textContent).toContain('CTR');
    expect(table.tBodies[0].rows[0].cells).toHaveLength(6);
  });

  it('aligns tree corner as one physical row-header column', () => {
    const { container } = render(
      <PivotTable result={makeResult(makeTreeRows())} showRowTotal={true} showColumnTotal={false} />
    );
    const table = getPivotTable(container);
    const headerRows = Array.from(table.tHead?.rows ?? []);

    expect(getColumnClasses(table)).toEqual([
      'pivot-col-tree-header',
      'pivot-col-data',
      'pivot-col-data',
      'pivot-col-total',
      'pivot-col-total',
    ]);

    expect(headerRows).toHaveLength(2);
    expect(headerRows[0].cells[0]).toHaveClass('tree-corner-cell');
    expect(headerRows[0].cells[0].textContent).toContain('日期 / 标准广告场景');
    expect(headerRows[0].cells[0].colSpan).toBe(1);
    expect(headerRows[0].cells[0].rowSpan).toBe(2);
    expect(headerRows[0].cells[1].textContent).toContain('VC001');
    expect(headerRows[0].cells[1].colSpan).toBe(2);
    expect(table.tBodies[0].rows[0].cells).toHaveLength(5);
  });
});
