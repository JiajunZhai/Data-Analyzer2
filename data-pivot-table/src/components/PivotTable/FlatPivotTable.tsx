import React, { useCallback, useMemo, useRef } from 'react';
import { shouldUseVirtualScroll, useVirtualScroll } from '../../hooks/useVirtualScroll';
import type { PivotResult, SortConfig } from '../../types';
import { calculateAllRowSpans } from '../../utils/rowSpanCalculator';
import {
  formatColumnHeader,
  formatPivotValue,
  getGroupBoundaryClass,
  getSortIcon,
  isSortActive,
  ROW_HEIGHT,
} from './pivotTableUtils';
import type { ToggleSortFn } from './PivotTable';

interface FlatPivotTableProps {
  result: PivotResult;
  showRowTotal: boolean;
  showColumnTotal: boolean;
  sortConfig?: SortConfig | null;
  onToggleSort?: ToggleSortFn;
}

// 排序按钮组件
const SortButton: React.FC<{
  type: 'column' | 'dimension' | 'total';
  value: string;
  sortConfig?: SortConfig | null;
  onToggleSort?: ToggleSortFn;
}> = ({ type, value, sortConfig, onToggleSort }) => {
  if (!onToggleSort) return null;
  return (
    <button
      type="button"
      className={`sort-btn ${isSortActive(type, value, sortConfig) ? 'active' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSort(type, value);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title="点击排序"
    >
      {getSortIcon(type, value, sortConfig)}
    </button>
  );
};

const FlatPivotTable: React.FC<FlatPivotTableProps> = React.memo(
  ({ result, showRowTotal, showColumnTotal, sortConfig, onToggleSort }) => {
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
      valueFormats,
    } = result;

    const rowCount = rowHeaders.length;
    const useVirtual = shouldUseVirtualScroll(rowCount);

    const { startIndex, endIndex, onScroll, totalHeight, getRowStyle } = useVirtualScroll({
      rowCount: useVirtual ? rowCount : 0,
      rowHeight: ROW_HEIGHT,
      containerRef,
      overscan: 5,
    });

    const rowSpans = useMemo(
      () => calculateAllRowSpans(rowHeaders, rowDimensions.length),
      [rowHeaders, rowDimensions]
    );

    const frozenColumnStyles = useMemo(
      () =>
        rowDimensions.map(
          (_, index) =>
            ({
              left: index === 0 ? 0 : `calc(var(--pivot-dimension-col-width) * ${index})`,
            }) as React.CSSProperties
        ),
      [rowDimensions]
    );

    const isTotalRow = useCallback(
      (rowIndex: number): boolean => {
        const row = rowHeaders[rowIndex];
        const dimCount =
          result.valueAxis === 'rows' ? rowDimensions.length - 1 : rowDimensions.length;
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
      const isLeaf = levelIdx === columnLevels.length - 1;

      // 计算该列头对应的数据列索引
      let dataColIdx = 0;
      for (let i = 0; i < colIdx; i++) {
        dataColIdx += columnLevels[levelIdx]?.[i]?.colspan ?? 1;
      }
      const colIdxStr = String(dataColIdx);
      const canSort = isLeaf && onToggleSort && col.value && col.value !== '总计';

      return (
        <th
          key={`${col.value}-${colIdx}`}
          className={`col-header col-header-level-${levelIdx} ${isBoundary ? 'group-boundary-col' : ''} ${canSort ? 'sortable' : ''}`}
          colSpan={col.colspan}
        >
          {isSticky ? (
            <span className="sticky-header-label">{col.value || '总计'}</span>
          ) : (
            <>
              {col.value || '总计'}
              {canSort && (
                <SortButton type="column" value={colIdxStr} sortConfig={sortConfig} onToggleSort={onToggleSort} />
              )}
            </>
          )}
        </th>
      );
    };

    // 渲染角标维度头
    const renderCornerCells = () =>
      rowDimensions.map((dim, index) => (
        <th
          key={dim}
          className="corner-cell sortable"
          rowSpan={hasColumnLevels ? columnLevels.length : 1}
          style={frozenColumnStyles[index]}
        >
          {dim}
          <SortButton type="dimension" value={dim} sortConfig={sortConfig} onToggleSort={onToggleSort} />
        </th>
      ));

    // 渲染行总计头
    const renderTotalHeaderCells = (levelIndex: number, depth: number) => {
      if (totalColumnHeaders.length === 0 || !showRowTotal) return null;
      const stickyRight = 'total-header-sticky';

      if (!hasMultipleTotalColumns) {
        return levelIndex === 0 ? (
          <th className={`total-header ${stickyRight} sortable`} rowSpan={depth}>
            行总计
            <SortButton type="total" value="total" sortConfig={sortConfig} onToggleSort={onToggleSort} />
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
        <th className={`total-header total-header-spacer ${stickyRight}`} colSpan={totalColumnHeaders.length}>
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
                style={frozenColumnStyles[ci]}
              >
                <div className="frozen-cell-inner">{cellValue || '总计'}</div>
              </td>
            );
          })}

          {(data[ri] || []).map((val, ci) => {
            const metricName = getDataMetricName(ri, ci);
            const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
            const boundaryClass = getGroupBoundaryClass(columnLevels, ci);
            return (
              <td key={ci} className={`data-cell ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}>
                {text}
              </td>
            );
          })}

          {showRowTotal &&
            (rowTotalValues[ri] || []).map((val, ti) => {
              const totalMetricName = getRowTotalMetricName(ri, ti);
              const { text, isEmpty } = formatPivotValue(val, totalMetricName, valueFormats?.[totalMetricName]);
              return (
                <td key={ti} className={`total-cell total-cell-sticky ${isEmpty ? 'empty-cell' : 'number-formatted'}`}>
                  {text}
                </td>
              );
            })}
        </tr>
      );
    };

    const renderAllRows = () => rowHeaders.map((_, ri) => renderSingleRow(ri));

    const renderVisibleRows = () => {
      const visibleRows = [];
      for (let ri = startIndex; ri <= endIndex; ri++) {
        if (ri < rowCount) visibleRows.push(renderSingleRow(ri));
      }
      return visibleRows;
    };

    const renderTotalRows = () => {
      if (!showColumnTotal || totalRows.length === 0) return null;
      return totalRows.map((totalRow, totalRowIdx) => (
        <tr key={totalRow.label} className={`total-row total-row-sticky ${totalRowIdx > 0 ? 'total-row-secondary' : ''}`}>
          <td className="total-label frozen-row-header" colSpan={dimensionCount} style={frozenColumnStyles[0]}>
            <div className="frozen-cell-inner">{totalRow.label}</div>
          </td>
          {totalRow.values.map((val, idx) => {
            const metricName = totalRow.valueFieldNames[idx] || columnValueFieldNames[idx];
            const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
            const boundaryClass = getGroupBoundaryClass(columnLevels, idx);
            return (
              <td key={idx} className={`total-cell ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}>
                {text}
              </td>
            );
          })}
          {totalRow.totalValues.map((val, idx) => {
            const metricName = totalRow.totalValueFieldNames[idx] || totalColumnValueFieldNames[idx];
            const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
            return (
              <td key={idx} className={`grand-total summary-intersection ${isEmpty ? 'empty-cell' : 'number-formatted'}`}>
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
        <div className="pivot-table-container" ref={containerRef} onScroll={onScroll} style={{ overflow: 'auto', height: '100%' }}>
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            <table className="pivot-table" style={{ position: 'absolute', top: 0, width: '100%' }}>
              <thead>
                <tr>
                  {renderCornerCells()}
                  {columnHeaders.map((col, idx) => (
                    <th key={idx} className={`col-header ${idx === columnHeaders.length - 1 ? 'group-boundary-col' : ''} sortable`}>
                      {formatColumnHeader(col)}
                      <SortButton type="column" value={String(idx)} sortConfig={sortConfig} onToggleSort={onToggleSort} />
                    </th>
                  ))}
                  {showRowTotal && totalColumnHeaders.length > 0 && (
                    hasMultipleTotalColumns ? (
                      totalColumnHeaders.map((header, idx) => (
                        <th key={idx} className="total-header total-header-leaf total-header-sticky">{header}</th>
                      ))
                    ) : (
                      <th className="total-header total-header-sticky sortable">
                        行总计
                        <SortButton type="total" value="total" sortConfig={sortConfig} onToggleSort={onToggleSort} />
                      </th>
                    )
                  )}
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
        <table className="pivot-table">
          <thead>
            {hasColumnLevels ? (
              columnLevels.map((level, levelIdx) => (
                <tr key={levelIdx}>
                  {levelIdx === 0 && renderCornerCells()}
                  {level.map((col, colIdx) => renderColumnHeader(col, levelIdx, colIdx))}
                  {renderTotalHeaderCells(levelIdx, columnLevels.length)}
                </tr>
              ))
            ) : (
              <tr>
                {renderCornerCells()}
                {columnHeaders.map((col, idx) => (
                  <th key={idx} className={`col-header ${idx === columnHeaders.length - 1 ? 'group-boundary-col' : ''}`}>
                    {formatColumnHeader(col)}
                  </th>
                ))}
                {showRowTotal && totalColumnHeaders.length > 0 && (
                  hasMultipleTotalColumns ? (
                    totalColumnHeaders.map((header, idx) => (
                      <th key={idx} className="total-header total-header-leaf total-header-sticky">{header}</th>
                    ))
                  ) : (
                    <th className="total-header total-header-sticky">行总计</th>
                  )
                )}
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
