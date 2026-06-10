import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVirtualScroll, shouldUseVirtualScroll } from '../../hooks/useVirtualScroll';
import type { PivotResult } from '../../types';
import { animateTableRowHeaders } from '../../utils/animations';
import { calculateAllRowSpans } from '../../utils/rowSpanCalculator';
import {
  formatPivotValue,
  formatColumnHeader,
  getGroupBoundaryClass,
  ROW_HEIGHT,
} from './pivotTableUtils';

interface FlatPivotTableProps {
  result: PivotResult;
  showRowTotal: boolean;
  showColumnTotal: boolean;
}

const FlatPivotTable: React.FC<FlatPivotTableProps> = React.memo(
  ({ result, showRowTotal, showColumnTotal }) => {
    const tableRef = useRef<HTMLTableElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const {
      rowHeaders,
      rowDimensions,
      columnHeaders,
      columnLevels,
      columnValueFieldNames,
      data,
      rowTotalValues,
      rowValueFieldNames,
      totalColumnHeaders,
      totalColumnValueFieldNames,
      totalRows,
      valueFieldNames,
    } = result;

    const rowCount = rowHeaders.length;
    const useVirtual = shouldUseVirtualScroll(rowCount);

    // 虚拟滚动
    const { startIndex, endIndex, onScroll, totalHeight, getRowStyle } = useVirtualScroll({
      rowCount: useVirtual ? rowCount : 0,
      rowHeight: ROW_HEIGHT,
      containerRef,
      overscan: 5,
    });

    // 行合并计算
    const rowSpans = useMemo(
      () => calculateAllRowSpans(rowHeaders, rowDimensions.length),
      [rowHeaders, rowDimensions]
    );

    // 动画效果
    useEffect(() => {
      if (!tableRef.current) return;

      const timer = setTimeout(() => {
        const headers = tableRef.current?.querySelectorAll('.row-header');
        if (headers && headers.length > 0) {
          animateTableRowHeaders(Array.from(headers) as HTMLElement[]);
        }
      }, 50);

      return () => clearTimeout(timer);
    }, [result]);

    // 冻结列偏移计算
    useEffect(() => {
      if (!tableRef.current) return;
      const timer = setTimeout(() => {
        const rows = tableRef.current?.querySelectorAll('tr');
        if (!rows) return;
        rows.forEach((row) => {
          const stickyCells = row.querySelectorAll('.frozen-cell-inner');
          let leftOffset = 0;
          stickyCells.forEach((cell) => {
            const el = cell as HTMLElement;
            el.style.left = `${leftOffset}px`;
            leftOffset += el.offsetWidth;
          });
        });
      }, 60);
      return () => clearTimeout(timer);
    }, [result]);

    // 工具函数
    const isTotalRow = useCallback(
      (rowIndex: number): boolean => {
        const row = rowHeaders[rowIndex];
        const dimCount = result.valueAxis === 'rows'
          ? rowDimensions.length - 1
          : rowDimensions.length;
        return row.slice(0, dimCount).every((val) => val === '总计');
      },
      [rowHeaders, rowDimensions, result.valueAxis]
    );

    const getDataMetricName = useCallback(
      (rowIndex: number, colIndex: number): string => {
        return (
          columnValueFieldNames[colIndex] ||
          rowValueFieldNames[rowIndex] ||
          valueFieldNames[0] ||
          ''
        );
      },
      [columnValueFieldNames, rowValueFieldNames, valueFieldNames]
    );

    const getRowTotalMetricName = useCallback(
      (rowIndex: number, totalIndex: number): string => {
        return (
          totalColumnValueFieldNames[totalIndex] ||
          rowValueFieldNames[rowIndex] ||
          valueFieldNames[totalIndex] ||
          ''
        );
      },
      [totalColumnValueFieldNames, rowValueFieldNames, valueFieldNames]
    );

    const hasColumnLevels = columnLevels.length > 0;
    const hasMultipleTotalColumns = totalColumnHeaders.length > 1;
    const dimensionCount = rowDimensions.length;

    // 渲染列头
    const renderColumnHeader = (
      col: { value: string; colspan: number },
      levelIdx: number,
      colIdx: number
    ) => {
      const isBoundary = getGroupBoundaryClass(columnLevels, colIdx) !== '';
      const isSticky = levelIdx === 0 && col.colspan > 1;

      return (
        <th
          key={`${col.value}-${colIdx}`}
          className={`col-header col-header-level-${levelIdx} ${isBoundary ? 'group-boundary-col' : ''}`}
          colSpan={col.colspan}
        >
          {isSticky ? (
            <span className="sticky-header-label">{col.value || '总计'}</span>
          ) : (
            col.value || '总计'
          )}
        </th>
      );
    };

    // 渲染总计头
    const renderTotalHeaderCells = (levelIndex: number, depth: number) => {
      if (totalColumnHeaders.length === 0 || !showRowTotal) return null;

      const stickyRight = 'total-header-sticky';

      if (!hasMultipleTotalColumns) {
        return levelIndex === 0 ? (
          <th className={`total-header ${stickyRight}`} rowSpan={depth}>
            行总计
          </th>
        ) : null;
      }

      if (depth === 1) {
        return totalColumnHeaders.map((header, index) => (
          <th key={header} className={`total-header total-header-leaf ${stickyRight}`}>
            {header || `总计 ${index + 1}`}
          </th>
        ));
      }

      if (levelIndex === 0) {
        return (
          <th className={`total-header ${stickyRight}`} colSpan={totalColumnHeaders.length}>
            行总计
          </th>
        );
      }

      if (levelIndex === depth - 1) {
        return totalColumnHeaders.map((header, index) => (
          <th key={header} className={`total-header total-header-leaf ${stickyRight}`}>
            {header || `总计 ${index + 1}`}
          </th>
        ));
      }

      return (
        <th
          className={`total-header total-header-spacer ${stickyRight}`}
          colSpan={totalColumnHeaders.length}
        >
          &nbsp;
        </th>
      );
    };

    // 渲染单行数据
    const renderSingleRow = (ri: number) => {
      const row = rowHeaders[ri];
      const totalRow = isTotalRow(ri);

      return (
        <tr key={ri} style={useVirtual ? getRowStyle(ri) : undefined}>
          {row.map((cellValue, ci) => {
            const span = rowSpans[ci]?.[ri] ?? 1;

            if (span === 0) return null;

            if (totalRow && ci === 0) {
              return (
                <td key={ci} className="row-header total-label" colSpan={dimensionCount}>
                  <div className="frozen-cell-inner">列总计</div>
                </td>
              );
            }

            const isLastDimCol = ci === row.length - 1;
            return (
              <td
                key={ci}
                className={`row-header frozen-row-header ${isLastDimCol ? 'dimension-col-end frozen-row-header-last' : ''}`}
                rowSpan={span}
              >
                <div className="frozen-cell-inner">{cellValue || '总计'}</div>
              </td>
            );
          })}

          {(data[ri] || []).map((val, ci) => {
            const { text, isEmpty } = formatPivotValue(val, getDataMetricName(ri, ci));
            const boundaryClass = getGroupBoundaryClass(columnLevels, ci);
            return (
              <td
                key={ci}
                className={`data-cell ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}
              >
                {text}
              </td>
            );
          })}

          {showRowTotal &&
            (rowTotalValues[ri] || []).map((val, ti) => {
              const { text, isEmpty } = formatPivotValue(val, getRowTotalMetricName(ri, ti));
              return (
                <td
                  key={ti}
                  className={`total-cell total-cell-sticky ${isEmpty ? 'empty-cell' : 'number-formatted'}`}
                >
                  {text}
                </td>
              );
            })}
        </tr>
      );
    };

    // 渲染所有行
    const renderAllRows = () => rowHeaders.map((_, ri) => renderSingleRow(ri));

    // 渲染可见行（虚拟滚动）
    const renderVisibleRows = () => {
      const visibleRows = [];
      for (let ri = startIndex; ri <= endIndex; ri++) {
        if (ri < rowCount) {
          visibleRows.push(renderSingleRow(ri));
        }
      }
      return visibleRows;
    };

    // 渲染总计行
    const renderTotalRows = () => {
      if (!showColumnTotal || totalRows.length === 0) return null;

      return totalRows.map((totalRow, totalRowIdx) => (
        <tr
          key={totalRow.label}
          className={`total-row total-row-sticky ${totalRowIdx > 0 ? 'total-row-secondary' : ''}`}
        >
          <td className="total-label frozen-row-header" colSpan={dimensionCount}>
            <div className="frozen-cell-inner">{totalRow.label}</div>
          </td>
          {totalRow.values.map((val, idx) => {
            const { text, isEmpty } = formatPivotValue(
              val,
              totalRow.valueFieldNames[idx] || columnValueFieldNames[idx]
            );
            const boundaryClass = getGroupBoundaryClass(columnLevels, idx);
            return (
              <td
                key={idx}
                className={`total-cell ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}
              >
                {text}
              </td>
            );
          })}
          {totalRow.totalValues.map((val, idx) => {
            const { text, isEmpty } = formatPivotValue(
              val,
              totalRow.totalValueFieldNames[idx] || totalColumnValueFieldNames[idx]
            );
            return (
              <td
                key={idx}
                className={`grand-total summary-intersection ${isEmpty ? 'empty-cell' : 'number-formatted'}`}
              >
                {text}
              </td>
            );
          })}
        </tr>
      ));
    };

    // 虚拟滚动模式
    if (useVirtual) {
      return (
        <div
          className="pivot-table-container"
          ref={containerRef}
          onScroll={onScroll}
          style={{ overflow: 'auto', height: '100%' }}
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            <table
              className="pivot-table"
              ref={tableRef}
              style={{ position: 'absolute', top: 0, width: '100%' }}
            >
              <thead>
                <tr>
                  {rowDimensions.map((dim) => (
                    <th key={dim} className="corner-cell">
                      {dim}
                    </th>
                  ))}
                  {columnHeaders.map((col, idx) => (
                    <th
                      key={idx}
                      className={`col-header ${idx === columnHeaders.length - 1 ? 'group-boundary-col' : ''}`}
                    >
                      {formatColumnHeader(col)}
                    </th>
                  ))}
                  {showRowTotal &&
                    totalColumnHeaders.length > 0 &&
                    (hasMultipleTotalColumns ? (
                      totalColumnHeaders.map((header, idx) => (
                        <th
                          key={idx}
                          className="total-header total-header-leaf total-header-sticky"
                        >
                          {header}
                        </th>
                      ))
                    ) : (
                      <th className="total-header total-header-sticky">行总计</th>
                    ))}
                </tr>
              </thead>
              <tbody>{renderVisibleRows()}</tbody>
            </table>
          </div>
        </div>
      );
    }

    // 非虚拟滚动模式
    return (
      <div className="pivot-table-container" ref={containerRef}>
        <table className="pivot-table" ref={tableRef}>
          <thead>
            {hasColumnLevels ? (
              columnLevels.map((level, levelIdx) => (
                <tr key={levelIdx}>
                  {levelIdx === 0 &&
                    rowDimensions.map((dim) => (
                      <th key={dim} className="corner-cell" rowSpan={columnLevels.length}>
                        {dim}
                      </th>
                    ))}
                  {level.map((col, colIdx) => renderColumnHeader(col, levelIdx, colIdx))}
                  {renderTotalHeaderCells(levelIdx, columnLevels.length)}
                </tr>
              ))
            ) : (
              <tr>
                {rowDimensions.map((dim) => (
                  <th key={dim} className="corner-cell">
                    {dim}
                  </th>
                ))}
                {columnHeaders.map((col, idx) => (
                  <th
                    key={idx}
                    className={`col-header ${idx === columnHeaders.length - 1 ? 'group-boundary-col' : ''}`}
                  >
                    {formatColumnHeader(col)}
                  </th>
                ))}
                {showRowTotal &&
                  totalColumnHeaders.length > 0 &&
                  (hasMultipleTotalColumns ? (
                    totalColumnHeaders.map((header, idx) => (
                      <th key={idx} className="total-header total-header-leaf total-header-sticky">
                        {header}
                      </th>
                    ))
                  ) : (
                    <th className="total-header total-header-sticky">行总计</th>
                  ))}
              </tr>
            )}
          </thead>
          <tbody>
            {renderAllRows()}
            {renderTotalRows()}
          </tbody>
        </table>
      </div>
    );
  }
);

export default FlatPivotTable;
