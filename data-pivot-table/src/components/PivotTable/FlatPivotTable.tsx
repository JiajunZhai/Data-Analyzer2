import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shouldUseVirtualScroll, useVirtualScroll } from '../../hooks/useVirtualScroll';
import type { ColumnLevel, PivotResult, SortConfig } from '../../types';
import { calculateAllRowSpans } from '../../utils/rowSpanCalculator';
import { PivotFullTextTooltip } from './PivotFullTextTooltip';
import type { ToggleSortFn } from './PivotTable';
import {
  createFlatColumnSpecs,
  formatColumnHeader,
  formatPivotValue,
  getFullTextAttributes,
  getGroupBoundaryClass,
  getRowHeaderColumnCount,
  getSortIcon,
  isSortActive,
  KEY_SEPARATOR,
  makeStableKeys,
  ROW_HEIGHT,
} from './pivotTableUtils';

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
      aria-label="切换排序"
      title="点击排序"
    >
      {getSortIcon(type, value, sortConfig)}
    </button>
  );
};

const FlatPivotTable: React.FC<FlatPivotTableProps> = React.memo(
  ({ result, showRowTotal, showColumnTotal, sortConfig, onToggleSort }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [enableStickyTotals, setEnableStickyTotals] = useState(false);

    const {
      rowHeaders,
      rowDimensions,
      columnHeaders,
      columnLevels: rawColumnLevels,
      colFieldNames,
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

    // 统一的响应式叶子列数组 — 表头和数据行共用此源
    const activeColumns = useMemo(() => {
      return columnHeaders.map((header, idx) => ({
        header,
        valueFieldName: columnValueFieldNames[idx],
      }));
    }, [columnHeaders, columnValueFieldNames]);

    // 直接使用聚合引擎的 columnLevels，不做降级替换
    const columnLevels = rawColumnLevels;

    const columnBoundaryLevels = useMemo(
      () => columnLevels.slice(0, colFieldNames.length),
      [columnLevels, colFieldNames.length]
    );

    const rowCount = rowHeaders.length;
    const useVirtual = shouldUseVirtualScroll(rowCount);

    const { startIndex, endIndex, onScroll, totalHeight, getRowStyle } = useVirtualScroll({
      rowCount: useVirtual ? rowCount : 0,
      rowHeight: ROW_HEIGHT,
      containerRef,
      overscan: 5,
    });

    const dimensionCount = getRowHeaderColumnCount(rowDimensions, rowHeaders);

    const rowSpans = useMemo(
      () => calculateAllRowSpans(rowHeaders, dimensionCount),
      [dimensionCount, rowHeaders]
    );
    const rowKeys = useMemo(
      () =>
        makeStableKeys(
          rowHeaders.map((row) => row.join(KEY_SEPARATOR)),
          'row'
        ),
      [rowHeaders]
    );
    const columnKeys = useMemo(
      () =>
        makeStableKeys(
          columnHeaders.map((header) => header || '总计'),
          'col'
        ),
      [columnHeaders]
    );
    const totalColumnKeys = useMemo(
      () =>
        makeStableKeys(
          totalColumnHeaders.map((header) => header || '行总计'),
          'total'
        ),
      [totalColumnHeaders]
    );
    const columnLevelRowKeys = useMemo(
      () =>
        makeStableKeys(
          columnLevels.map((level) =>
            level.map((col) => `${col.value || '总计'}:${col.colspan}`).join(KEY_SEPARATOR)
          ),
          'col-level'
        ),
      [columnLevels]
    );
    const columnLevelCellKeys = useMemo(
      () =>
        columnLevels.map((level) =>
          makeStableKeys(
            level.map((col) => `${col.value || '总计'}:${col.colspan}`),
            'col-level-cell'
          )
        ),
      [columnLevels]
    );

    const frozenColumnStyles = useMemo(
      () =>
        Array.from(
          { length: dimensionCount },
          (_, index) =>
            ({
              left: index === 0 ? 0 : `calc(var(--pivot-dimension-col-width) * ${index})`,
            }) as React.CSSProperties
        ),
      [dimensionCount]
    );

    const isTotalRow = useCallback(
      (rowIndex: number): boolean => {
        const row = rowHeaders[rowIndex];
        const dimCount =
          result.valueAxis === 'rows' ? Math.max(0, dimensionCount - 1) : dimensionCount;
        return row.slice(0, dimCount).every((val) => val === '总计');
      },
      [dimensionCount, rowHeaders, result.valueAxis]
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
    const rowDimensionLabels = useMemo(
      () =>
        Array.from(
          { length: dimensionCount },
          (_, index) => rowDimensions[index] || (index === 0 ? '总计' : `维度 ${index + 1}`)
        ),
      [dimensionCount, rowDimensions]
    );
    const tableColumnSpecs = useMemo(
      () =>
        createFlatColumnSpecs(
          dimensionCount,
          activeColumns.length,
          showRowTotal ? totalColumnHeaders.length : 0
        ),
      [activeColumns.length, dimensionCount, showRowTotal, totalColumnHeaders.length]
    );
    const containerStyle = useMemo(
      () =>
        ({
          '--pivot-total-col-width': '128px',
        }) as React.CSSProperties,
      []
    );

    const totalColumnStickyStyles = useMemo(
      () =>
        totalColumnHeaders.map((_, index) => {
          const offset = Math.max(0, totalColumnHeaders.length - index - 1);
          return {
            right: offset === 0 ? 0 : `calc(var(--pivot-total-col-width) * ${offset})`,
          } as React.CSSProperties;
        }),
      [totalColumnHeaders]
    );

    const getStickyRightStyle = useCallback(
      (index: number, count: number): React.CSSProperties => {
        if (count === totalColumnHeaders.length && totalColumnStickyStyles[index]) {
          return totalColumnStickyStyles[index];
        }
        const offset = Math.max(0, count - index - 1);
        return {
          right: offset === 0 ? 0 : `calc(var(--pivot-total-col-width) * ${offset})`,
        };
      },
      [totalColumnHeaders.length, totalColumnStickyStyles]
    );

    const getOptionalStickyRightStyle = useCallback(
      (index: number, count: number): React.CSSProperties | undefined =>
        enableStickyTotals ? getStickyRightStyle(index, count) : undefined,
      [enableStickyTotals, getStickyRightStyle]
    );
    const totalHeaderStickyClass = enableStickyTotals ? 'total-header-sticky' : '';
    const totalCellStickyClass = enableStickyTotals ? 'total-cell-sticky' : '';

    useEffect(() => {
      const container = containerRef.current;
      const table = tableRef.current;
      if (!container || !table) return undefined;

      const measureOverflow = () => {
        const next = table.offsetWidth > container.clientWidth + 1;
        setEnableStickyTotals(next);
      };

      measureOverflow();

      if (typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', measureOverflow);
        return () => window.removeEventListener('resize', measureOverflow);
      }

      const resizeObserver = new ResizeObserver(measureOverflow);
      resizeObserver.observe(container);
      resizeObserver.observe(table);
      window.addEventListener('resize', measureOverflow);

      return () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', measureOverflow);
      };
    }, []);

    const renderColGroup = () => (
      <colgroup>
        {tableColumnSpecs.map((column) => (
          <col key={column.key} className={column.className} style={{ width: column.width }} />
        ))}
      </colgroup>
    );

    // 渲染列头
    const renderColumnHeader = (
      col: ColumnLevel,
      levelIdx: number,
      colIdx: number,
      headerKey: string
    ) => {
      const isSticky = levelIdx === 0 && col.colspan > 1;
      const isLeaf = levelIdx === columnLevels.length - 1;

      // 计算该列头对应的数据列索引
      let dataColIdx = col.startIndex ?? 0;
      if (col.startIndex === undefined) {
        for (let i = 0; i < colIdx; i++) {
          dataColIdx += columnLevels[levelIdx]?.[i]?.colspan ?? 1;
        }
      }
      const boundaryLeafIndex = dataColIdx + col.colspan - 1;
      const isBoundary = getGroupBoundaryClass(columnBoundaryLevels, boundaryLeafIndex) !== '';
      const colIdxStr = String(dataColIdx);
      const canSort = isLeaf && onToggleSort && col.value && col.value !== '总计';
      const headerText = col.value || '总计';

      return (
        <th
          key={headerKey}
          className={`col-header col-header-level-${levelIdx} ${isBoundary ? 'group-boundary-col' : ''} ${canSort ? 'sortable' : ''}`}
          colSpan={col.colspan}
          {...getFullTextAttributes(headerText)}
        >
          {isSticky ? (
            <span className="sticky-header-label" {...getFullTextAttributes(headerText)}>
              {headerText}
            </span>
          ) : (
            <>
              {headerText}
              {canSort && (
                <SortButton
                  type="column"
                  value={colIdxStr}
                  sortConfig={sortConfig}
                  onToggleSort={onToggleSort}
                />
              )}
            </>
          )}
        </th>
      );
    };

    // 渲染角标维度头 — colSpan 跨所有行维度列，与数据行的维度单元格对齐
    const renderCornerCells = () => {
      const cornerText = rowDimensionLabels.join(' / ');

      return (
        <th
          key="corner"
          className="corner-cell sortable"
          colSpan={dimensionCount}
          rowSpan={columnLevels.length || 1}
          {...getFullTextAttributes(cornerText)}
        >
          {cornerText}
          {rowDimensions.length === 1 && onToggleSort && (
            <SortButton
              type="dimension"
              value={rowDimensions[0]}
              sortConfig={sortConfig}
              onToggleSort={onToggleSort}
            />
          )}
        </th>
      );
    };

    // 渲染行总计头
    const renderTotalHeaderCells = (levelIndex: number, depth: number) => {
      if (totalColumnHeaders.length === 0 || !showRowTotal) return null;
      const stickyRight = totalHeaderStickyClass;

      if (!hasMultipleTotalColumns) {
        return levelIndex === 0 ? (
          <th
            className={`total-header ${stickyRight} sortable`}
            rowSpan={depth}
            {...getFullTextAttributes('行总计')}
          >
            行总计
            <SortButton
              type="total"
              value="total"
              sortConfig={sortConfig}
              onToggleSort={onToggleSort}
            />
          </th>
        ) : null;
      }

      if (depth === 1) {
        return totalColumnHeaders.map((header, index) => (
          <th
            key={totalColumnKeys[index]}
            className={`total-header total-header-leaf ${stickyRight}`}
            style={getOptionalStickyRightStyle(index, totalColumnHeaders.length)}
            {...getFullTextAttributes(header || `总计 ${index + 1}`)}
          >
            {header || `总计 ${index + 1}`}
          </th>
        ));
      }

      if (levelIndex === 0) {
        return (
          <th className="total-header total-header-group" colSpan={totalColumnHeaders.length}>
            行总计
          </th>
        );
      }

      if (levelIndex === depth - 1) {
        return totalColumnHeaders.map((header, index) => (
          <th
            key={totalColumnKeys[index]}
            className={`total-header total-header-leaf ${stickyRight}`}
            style={getOptionalStickyRightStyle(index, totalColumnHeaders.length)}
            {...getFullTextAttributes(header || `总计 ${index + 1}`)}
          >
            {header || `总计 ${index + 1}`}
          </th>
        ));
      }

      return (
        <th
          className="total-header total-header-group total-header-spacer"
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
        <tr key={rowKeys[ri]} style={useVirtual ? getRowStyle(ri) : undefined}>
          {Array.from({ length: dimensionCount }, (_, ci) => {
            const cellValue = row[ci] ?? '';
            const span = rowSpans[ci]?.[ri] ?? 1;
            if (span === 0) return null;
            if (totalRow && ci > 0) return null;

            if (totalRow && ci === 0) {
              const totalLabel = '列总计';

              return (
                <td
                  key={rowDimensions[ci] || 'total-label'}
                  className="row-header total-label"
                  colSpan={dimensionCount}
                  {...getFullTextAttributes(totalLabel)}
                >
                  <div className="frozen-cell-inner" {...getFullTextAttributes(totalLabel)}>
                    {totalLabel}
                  </div>
                </td>
              );
            }

            const isLastDimCol = ci === dimensionCount - 1;
            const displayValue = cellValue || '总计';
            return (
              <td
                key={rowDimensionLabels[ci] || cellValue || `dimension-${ci}`}
                className={`row-header frozen-row-header ${isLastDimCol ? 'dimension-col-end frozen-row-header-last' : ''}`}
                rowSpan={span}
                style={frozenColumnStyles[ci]}
                {...getFullTextAttributes(displayValue)}
              >
                <div className="frozen-cell-inner" {...getFullTextAttributes(displayValue)}>
                  {displayValue}
                </div>
              </td>
            );
          })}

          {activeColumns.map((_col, ci) => {
            const val = data[ri]?.[ci] ?? 0;
            const metricName = getDataMetricName(ri, ci);
            const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
            const boundaryClass = getGroupBoundaryClass(columnBoundaryLevels, ci);
            return (
              <td
                key={columnKeys[ci]}
                className={`data-cell ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}
              >
                {text}
              </td>
            );
          })}

          {showRowTotal &&
            Array.from(
              { length: totalColumnHeaders.length },
              (_, index) => rowTotalValues[ri]?.[index] ?? 0
            ).map((val, ti) => {
              const totalMetricName = getRowTotalMetricName(ri, ti);
              const { text, isEmpty } = formatPivotValue(
                val,
                totalMetricName,
                valueFormats?.[totalMetricName]
              );
              return (
                <td
                  key={totalColumnKeys[ti]}
                  className={`total-cell ${totalCellStickyClass} ${isEmpty ? 'empty-cell' : 'number-formatted'}`}
                  style={getOptionalStickyRightStyle(ti, totalColumnHeaders.length)}
                >
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
        <tr
          key={totalRow.label}
          className={`total-row total-row-sticky ${totalRowIdx > 0 ? 'total-row-secondary' : ''}`}
        >
          <td
            className="total-label frozen-row-header"
            colSpan={dimensionCount}
            style={frozenColumnStyles[0]}
            {...getFullTextAttributes(totalRow.label)}
          >
            <div className="frozen-cell-inner" {...getFullTextAttributes(totalRow.label)}>
              {totalRow.label}
            </div>
          </td>
          {totalRow.values.map((val, idx) => {
            const metricName = totalRow.valueFieldNames[idx] || columnValueFieldNames[idx];
            const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
            const boundaryClass = getGroupBoundaryClass(columnBoundaryLevels, idx);
            return (
              <td
                key={columnKeys[idx]}
                className={`total-cell ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}
              >
                {text}
              </td>
            );
          })}
          {totalRow.totalValues.map((val, idx) => {
            const metricName =
              totalRow.totalValueFieldNames[idx] || totalColumnValueFieldNames[idx];
            const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
            return (
              <td
                key={totalColumnKeys[idx]}
                className={`grand-total ${enableStickyTotals ? 'summary-intersection' : ''} ${isEmpty ? 'empty-cell' : 'number-formatted'}`}
                style={getOptionalStickyRightStyle(idx, totalRow.totalValues.length)}
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
          style={{ ...containerStyle, overflow: 'auto', height: '100%' }}
        >
          <PivotFullTextTooltip containerRef={containerRef} />
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            <table
              ref={tableRef}
              className="pivot-table"
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              {renderColGroup()}
              <thead>
                {hasColumnLevels ? (
                  columnLevels.map((level, levelIdx) => (
                    <tr key={columnLevelRowKeys[levelIdx]}>
                      {levelIdx === 0 && renderCornerCells()}
                      {level.map((col, colIdx) =>
                        renderColumnHeader(
                          col,
                          levelIdx,
                          colIdx,
                          columnLevelCellKeys[levelIdx]?.[colIdx] || `${col.value}:${col.colspan}`
                        )
                      )}
                      {renderTotalHeaderCells(levelIdx, columnLevels.length)}
                    </tr>
                  ))
                ) : (
                  <tr>
                    {renderCornerCells()}
                    {columnHeaders.map((col, idx) => (
                      <th
                        key={columnKeys[idx]}
                        className={`col-header ${idx === columnHeaders.length - 1 ? 'group-boundary-col' : ''} sortable`}
                        {...getFullTextAttributes(formatColumnHeader(col))}
                      >
                        {formatColumnHeader(col)}
                        <SortButton
                          type="column"
                          value={String(idx)}
                          sortConfig={sortConfig}
                          onToggleSort={onToggleSort}
                        />
                      </th>
                    ))}
                    {showRowTotal &&
                      totalColumnHeaders.length > 0 &&
                      (hasMultipleTotalColumns ? (
                        totalColumnHeaders.map((header, idx) => (
                          <th
                            key={totalColumnKeys[idx]}
                            className={`total-header total-header-leaf ${totalHeaderStickyClass}`}
                            style={getOptionalStickyRightStyle(idx, totalColumnHeaders.length)}
                            {...getFullTextAttributes(header)}
                          >
                            {header}
                          </th>
                        ))
                      ) : (
                        <th
                          className={`total-header ${totalHeaderStickyClass} sortable`}
                          {...getFullTextAttributes('行总计')}
                        >
                          行总计
                          <SortButton
                            type="total"
                            value="total"
                            sortConfig={sortConfig}
                            onToggleSort={onToggleSort}
                          />
                        </th>
                      ))}
                  </tr>
                )}
              </thead>
              <tbody>{renderVisibleRows()}</tbody>
            </table>
          </div>
        </div>
      );
    }

    // 非虚拟滚动模式
    return (
      <div className="pivot-table-container" ref={containerRef} style={containerStyle}>
        <PivotFullTextTooltip containerRef={containerRef} />
        <table ref={tableRef} className="pivot-table">
          {renderColGroup()}
          <thead>
            {hasColumnLevels ? (
              columnLevels.map((level, levelIdx) => (
                <tr key={columnLevelRowKeys[levelIdx]}>
                  {levelIdx === 0 && renderCornerCells()}
                  {level.map((col, colIdx) =>
                    renderColumnHeader(
                      col,
                      levelIdx,
                      colIdx,
                      columnLevelCellKeys[levelIdx]?.[colIdx] || `${col.value}:${col.colspan}`
                    )
                  )}
                  {renderTotalHeaderCells(levelIdx, columnLevels.length)}
                </tr>
              ))
            ) : (
              <tr>
                {renderCornerCells()}
                {columnHeaders.map((col, idx) => (
                  <th
                    key={columnKeys[idx]}
                    className={`col-header ${idx === columnHeaders.length - 1 ? 'group-boundary-col' : ''}`}
                    {...getFullTextAttributes(formatColumnHeader(col))}
                  >
                    {formatColumnHeader(col)}
                  </th>
                ))}
                {showRowTotal &&
                  totalColumnHeaders.length > 0 &&
                  (hasMultipleTotalColumns ? (
                    totalColumnHeaders.map((header, idx) => (
                      <th
                        key={totalColumnKeys[idx]}
                        className={`total-header total-header-leaf ${totalHeaderStickyClass}`}
                        style={getOptionalStickyRightStyle(idx, totalColumnHeaders.length)}
                        {...getFullTextAttributes(header)}
                      >
                        {header}
                      </th>
                    ))
                  ) : (
                    <th
                      className={`total-header ${totalHeaderStickyClass}`}
                      {...getFullTextAttributes('行总计')}
                    >
                      行总计
                    </th>
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
