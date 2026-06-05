import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PivotResult, PivotTreeNode } from '../../types';
import { animateTableRowHeaders } from '../../utils/animations';
import { calculateAllRowSpans } from '../../utils/rowSpanCalculator';

const KEY_SEPARATOR = '\u001f';
const BASE_METRICS = ['注册用户', '曝光人数', '曝光次数', '广告收益', '点击次数'];

type TreeRowType = 'group' | 'leaf' | 'subtotal';

interface PivotTableProps {
  result: PivotResult | null;
  valueFieldName?: string;
  emptyMessage?: string;
  showRowTotal?: boolean;
  showColumnTotal?: boolean;
}

interface VisibleTreeRow {
  id: string;
  label: string;
  depth: number;
  type: TreeRowType;
  hasChildren: boolean;
  isExpanded: boolean;
  data: number[];
  rowTotalValues: number[];
  rowIndex?: number;
}

const PivotTable: React.FC<PivotTableProps> = ({
  result,
  valueFieldName,
  emptyMessage = '请配置透视表字段以查看结果',
  showRowTotal = true,
  showColumnTotal = true,
}) => {
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLTableElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const canUseRowTree = result?.valueAxis === 'columns' && Boolean(result.rowTree?.length);

  const visibleTreeRows = useMemo<VisibleTreeRow[]>(() => {
    if (!result?.rowTree || result.valueAxis !== 'columns') return [];

    const rows: VisibleTreeRow[] = [];
    const walk = (nodes: PivotTreeNode[]) => {
      nodes.forEach((node) => {
        const hasChildren = node.children.length > 0;
        const isExpanded = !collapsedNodeIds.has(node.id);

        rows.push({
          id: node.id,
          label: node.label,
          depth: node.depth,
          type: hasChildren ? 'group' : 'leaf',
          hasChildren,
          isExpanded,
          data: node.data,
          rowTotalValues: node.rowTotalValues,
          rowIndex: node.rowIndex,
        });

        if (hasChildren && isExpanded) {
          walk(node.children);
          rows.push({
            id: `subtotal:${node.id}`,
            label: '小计',
            depth: node.depth + 1,
            type: 'subtotal',
            hasChildren: false,
            isExpanded: false,
            data: node.data,
            rowTotalValues: node.rowTotalValues,
          });
        }
      });
    };

    walk(result.rowTree);
    return rows;
  }, [result, collapsedNodeIds]);

  const handleTreeToggle = useCallback((nodeId: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleMouseEnter = useCallback((rowIndex: number, colIndex: number) => {
    setHoveredCell({ row: rowIndex, col: colIndex });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
  }, []);

  const isCellHighlighted = useCallback(
    (rowIndex: number, colIndex: number): boolean => {
      if (!hoveredCell) return false;
      return hoveredCell.row === rowIndex || hoveredCell.col === colIndex;
    },
    [hoveredCell]
  );

  const formatValue = useCallback(
    (num: number, metricName?: string): { text: string; isEmpty: boolean } => {
      if (num === 0) return { text: '-', isEmpty: true };

      const val = Number(num);
      if (isNaN(val)) return { text: '-', isEmpty: true };

      let text: string;
      if (metricName === '渗透率' || metricName === 'CTR') {
        text = (val * 100).toFixed(2) + '%';
      } else if (metricName === '收益占比%') {
        text = val.toFixed(2) + '%';
      } else if (metricName === 'ARPU') {
        text = val.toFixed(4);
      } else if (metricName === 'eCPM' || metricName === 'IPU') {
        text = val.toFixed(2);
      } else if (metricName === '广告收益') {
        text = val.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      } else if (BASE_METRICS.includes(metricName || '')) {
        text = Math.round(val).toLocaleString('en-US');
      } else {
        text = val.toFixed(2);
      }

      return { text, isEmpty: false };
    },
    []
  );

  const rowSpans = useMemo(() => {
    if (canUseRowTree || !result?.rowHeaders || !result.rowDimensions) return [];
    return calculateAllRowSpans(result.rowHeaders, result.rowDimensions.length);
  }, [canUseRowTree, result]);

  useEffect(() => {
    if (!result || !tableRef.current) return;

    const timer = setTimeout(() => {
      const rowHeaders = tableRef.current?.querySelectorAll('.row-header');
      if (rowHeaders && rowHeaders.length > 0) {
        animateTableRowHeaders(Array.from(rowHeaders) as HTMLElement[]);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [result, visibleTreeRows.length]);

  useEffect(() => {
    if (!result || !tableRef.current) return;
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
  }, [result, visibleTreeRows.length]);

  const isTotalRow = useCallback(
    (rowIndex: number): boolean => {
      if (!result?.rowHeaders) return false;
      const row = result.rowHeaders[rowIndex];
      const dimCount =
        result.valueAxis === 'rows' ? result.rowDimensions.length - 1 : result.rowDimensions.length;
      return row.slice(0, dimCount).every((val) => val === '总计');
    },
    [result]
  );

  if (!result) {
    return (
      <div className="pivot-table-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

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

  const formatHeader = (header: string): string => {
    return header.split(KEY_SEPARATOR).filter(Boolean).join(' / ') || '总计';
  };

  const getDataMetricName = (rowIndex: number, colIndex: number): string => {
    return (
      columnValueFieldNames[colIndex] ||
      rowValueFieldNames[rowIndex] ||
      valueFieldNames[0] ||
      valueFieldName ||
      ''
    );
  };

  const getRowTotalMetricName = (rowIndex: number, totalIndex: number): string => {
    return (
      totalColumnValueFieldNames[totalIndex] ||
      rowValueFieldNames[rowIndex] ||
      valueFieldNames[totalIndex] ||
      valueFieldName ||
      ''
    );
  };

  const getTreeRowTotalMetricName = (totalIndex: number): string => {
    return (
      totalColumnValueFieldNames[totalIndex] || valueFieldNames[totalIndex] || valueFieldName || ''
    );
  };

  const hasColumnLevels = columnLevels.length > 0;
  const hasMultipleTotalColumns = totalColumnHeaders.length > 1;
  const dimensionCount = canUseRowTree ? 1 : rowDimensions.length;
  const rowHeaderTitle = rowDimensions.filter(Boolean).join(' / ') || '维度';
  const dataColumnCount = columnHeaders.length;

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

  const isGroupBoundary = (levelIdx: number, colIdx: number): boolean => {
    if (!columnLevels[levelIdx]) return false;

    if (colIdx === columnLevels[levelIdx].length - 1) return true;

    if (levelIdx < columnLevels.length - 1) {
      const currentCol = columnLevels[levelIdx][colIdx];
      const nextCol = columnLevels[levelIdx][colIdx + 1];
      if (currentCol && nextCol && currentCol.value !== nextCol.value) {
        return true;
      }
    }

    return false;
  };

  const getGroupBoundaryClass = (colIdx: number): string => {
    if (!hasColumnLevels) return '';

    for (let levelIdx = 0; levelIdx < columnLevels.length; levelIdx++) {
      if (isGroupBoundary(levelIdx, colIdx)) {
        return 'group-boundary-col';
      }
    }

    return '';
  };

  const renderColumnHeader = (
    col: { value: string; colspan: number },
    levelIdx: number,
    colIdx: number
  ) => {
    const isBoundary = isGroupBoundary(levelIdx, colIdx);
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

  const renderTreeRowHeader = (treeRow: VisibleTreeRow) => (
    <td
      className={`row-header frozen-row-header frozen-row-header-last dimension-col-end tree-row-header tree-row-header-${treeRow.type}`}
    >
      <div className="frozen-cell-inner tree-cell-inner">
        <div className="tree-label" style={{ paddingLeft: `${treeRow.depth * 18}px` }}>
          {treeRow.hasChildren ? (
            <button
              type="button"
              className="tree-toggle"
              aria-label={treeRow.isExpanded ? `折叠 ${treeRow.label}` : `展开 ${treeRow.label}`}
              onClick={(event) => {
                event.stopPropagation();
                handleTreeToggle(treeRow.id);
              }}
            >
              {treeRow.isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="tree-toggle-spacer" />
          )}
          <span className="tree-label-text">{treeRow.label || '总计'}</span>
        </div>
      </div>
    </td>
  );

  const renderTreeRows = () =>
    visibleTreeRows.map((treeRow, ri) => {
      const isExpandedGroup = treeRow.type === 'group' && treeRow.isExpanded;
      const dataValues =
        treeRow.data.length > 0 ? treeRow.data : Array.from({ length: dataColumnCount }, () => 0);
      const totalValues =
        treeRow.rowTotalValues.length > 0
          ? treeRow.rowTotalValues
          : Array.from({ length: totalColumnHeaders.length }, () => 0);

      return (
        <tr
          key={treeRow.id}
          className={`tree-table-row tree-row-${treeRow.type} ${treeRow.isExpanded ? 'tree-row-expanded' : ''}`}
        >
          {renderTreeRowHeader(treeRow)}

          {dataValues.map((val, ci) => {
            const highlighted = isCellHighlighted(ri, ci);
            const boundaryClass = getGroupBoundaryClass(ci);

            if (isExpandedGroup) {
              return (
                <td
                  key={ci}
                  className={`data-cell tree-group-placeholder ${highlighted ? 'cell-highlight' : ''} ${boundaryClass}`}
                  onMouseEnter={() => handleMouseEnter(ri, ci)}
                  onMouseLeave={handleMouseLeave}
                >
                  &nbsp;
                </td>
              );
            }

            const { text, isEmpty } = formatValue(
              val,
              getDataMetricName(treeRow.rowIndex ?? 0, ci)
            );
            return (
              <td
                key={ci}
                className={`data-cell ${treeRow.type === 'subtotal' ? 'tree-subtotal-cell' : ''} ${isEmpty ? 'empty-cell' : 'number-formatted'} ${highlighted ? 'cell-highlight' : ''} ${boundaryClass}`}
                onMouseEnter={() => handleMouseEnter(ri, ci)}
                onMouseLeave={handleMouseLeave}
              >
                {text}
              </td>
            );
          })}

          {showRowTotal &&
            totalValues.map((val, ti) => {
              if (isExpandedGroup) {
                return (
                  <td key={ti} className="total-cell total-cell-sticky tree-group-placeholder">
                    &nbsp;
                  </td>
                );
              }

              const { text, isEmpty } = formatValue(val, getTreeRowTotalMetricName(ti));
              return (
                <td
                  key={ti}
                  className={`total-cell total-cell-sticky ${treeRow.type === 'subtotal' ? 'tree-subtotal-cell' : ''} ${isEmpty ? 'empty-cell' : 'number-formatted'}`}
                >
                  {text}
                </td>
              );
            })}
        </tr>
      );
    });

  const renderFlatRows = () =>
    rowHeaders.map((row, ri) => {
      const totalRow = isTotalRow(ri);

      return (
        <tr key={ri}>
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
            const { text, isEmpty } = formatValue(val, getDataMetricName(ri, ci));
            const highlighted = isCellHighlighted(ri, ci);
            const boundaryClass = getGroupBoundaryClass(ci);
            return (
              <td
                key={ci}
                className={`data-cell ${isEmpty ? 'empty-cell' : 'number-formatted'} ${highlighted ? 'cell-highlight' : ''} ${boundaryClass}`}
                onMouseEnter={() => handleMouseEnter(ri, ci)}
                onMouseLeave={handleMouseLeave}
              >
                {text}
              </td>
            );
          })}

          {showRowTotal &&
            (rowTotalValues[ri] || []).map((val, ti) => {
              const { text, isEmpty } = formatValue(val, getRowTotalMetricName(ri, ti));
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
    });

  return (
    <div className="pivot-table-container" ref={containerRef}>
      <table className="pivot-table" ref={tableRef}>
        <thead>
          {hasColumnLevels ? (
            columnLevels.map((level, levelIdx) => (
              <tr key={levelIdx}>
                {levelIdx === 0 &&
                  (canUseRowTree ? (
                    <th className="corner-cell tree-corner-cell" rowSpan={columnLevels.length}>
                      {rowHeaderTitle}
                    </th>
                  ) : (
                    rowDimensions.map((dim) => (
                      <th key={dim} className="corner-cell" rowSpan={columnLevels.length}>
                        {dim}
                      </th>
                    ))
                  ))}
                {level.map((col, colIdx) => renderColumnHeader(col, levelIdx, colIdx))}
                {renderTotalHeaderCells(levelIdx, columnLevels.length)}
              </tr>
            ))
          ) : (
            <tr>
              {canUseRowTree ? (
                <th className="corner-cell tree-corner-cell">{rowHeaderTitle}</th>
              ) : (
                rowDimensions.map((dim) => (
                  <th key={dim} className="corner-cell">
                    {dim}
                  </th>
                ))
              )}
              {columnHeaders.map((col, idx) => (
                <th
                  key={idx}
                  className={`col-header ${idx === columnHeaders.length - 1 ? 'group-boundary-col' : ''}`}
                >
                  {formatHeader(col)}
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
          {canUseRowTree ? renderTreeRows() : renderFlatRows()}

          {showColumnTotal &&
            totalRows.map((totalRow, totalRowIdx) => {
              return (
                <tr
                  key={totalRow.label}
                  className={`total-row total-row-sticky ${totalRowIdx > 0 ? 'total-row-secondary' : ''}`}
                >
                  <td className="total-label frozen-row-header" colSpan={dimensionCount}>
                    <div className="frozen-cell-inner">{totalRow.label}</div>
                  </td>
                  {totalRow.values.map((val, idx) => {
                    const { text, isEmpty } = formatValue(
                      val,
                      totalRow.valueFieldNames[idx] || columnValueFieldNames[idx]
                    );
                    const boundaryClass = getGroupBoundaryClass(idx);
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
                    const { text, isEmpty } = formatValue(
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
              );
            })}
        </tbody>
      </table>
    </div>
  );
};

export default PivotTable;
