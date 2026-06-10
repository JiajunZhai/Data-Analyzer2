import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PivotResult, PivotTreeNode } from '../../types';
import { animateTableRowHeaders } from '../../utils/animations';
import {
  formatPivotValue,
  formatColumnHeader,
  getGroupBoundaryClass,
} from './pivotTableUtils';

type TreeRowType = 'group' | 'leaf' | 'subtotal';

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

interface TreePivotTableProps {
  result: PivotResult;
  showRowTotal: boolean;
  showColumnTotal: boolean;
}

const TreePivotTable: React.FC<TreePivotTableProps> = React.memo(
  ({ result, showRowTotal, showColumnTotal }) => {
    const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
    const tableRef = useRef<HTMLTableElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const {
      rowTree,
      rowDimensions,
      columnHeaders,
      columnLevels,
      columnValueFieldNames,
      totalColumnHeaders,
      totalColumnValueFieldNames,
      totalRows,
      valueFieldNames,
    } = result;

    // 构建可见的树行
    const visibleTreeRows = useMemo<VisibleTreeRow[]>(() => {
      if (!rowTree) return [];

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

      walk(rowTree);
      return rows;
    }, [rowTree, collapsedNodeIds]);

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
    }, [result, visibleTreeRows.length]);

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
    }, [result, visibleTreeRows.length]);

    // 切换树节点折叠
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

    // 工具函数
    const hasColumnLevels = columnLevels.length > 0;
    const hasMultipleTotalColumns = totalColumnHeaders.length > 1;
    const rowHeaderTitle = rowDimensions.filter(Boolean).join(' / ') || '维度';

    const getTreeRowTotalMetricName = useCallback(
      (totalIndex: number): string => {
        return (
          totalColumnValueFieldNames[totalIndex] ||
          valueFieldNames[totalIndex] ||
          ''
        );
      },
      [totalColumnValueFieldNames, valueFieldNames]
    );

    const getDataMetricName = useCallback(
      (_rowIndex: number, colIndex: number): string => {
        return (
          columnValueFieldNames[colIndex] ||
          valueFieldNames[0] ||
          ''
        );
      },
      [columnValueFieldNames, valueFieldNames]
    );

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

    // 渲染树行头
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

    // 渲染树行
    const renderTreeRows = () => {
      const dataColumnCount = columnHeaders.length;

      return visibleTreeRows.map((treeRow) => {
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
              const boundaryClass = getGroupBoundaryClass(columnLevels, ci);

              if (isExpandedGroup) {
                return (
                  <td key={ci} className={`data-cell tree-group-placeholder ${boundaryClass}`}>
                    &nbsp;
                  </td>
                );
              }

              const { text, isEmpty } = formatPivotValue(
                val,
                getDataMetricName(treeRow.rowIndex ?? 0, ci)
              );
              return (
                <td
                  key={ci}
                  className={`data-cell ${treeRow.type === 'subtotal' ? 'tree-subtotal-cell' : ''} ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}
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

                const { text, isEmpty } = formatPivotValue(val, getTreeRowTotalMetricName(ti));
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
    };

    // 渲染总计行
    const renderTotalRows = () => {
      if (!showColumnTotal || totalRows.length === 0) return null;

      return totalRows.map((totalRow, totalRowIdx) => (
        <tr
          key={totalRow.label}
          className={`total-row total-row-sticky ${totalRowIdx > 0 ? 'total-row-secondary' : ''}`}
        >
          <td className="total-label frozen-row-header" colSpan={1}>
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

    return (
      <div className="pivot-table-container" ref={containerRef}>
        <table className="pivot-table" ref={tableRef}>
          <thead>
            {hasColumnLevels ? (
              columnLevels.map((level, levelIdx) => (
                <tr key={levelIdx}>
                  {levelIdx === 0 && (
                    <th className="corner-cell tree-corner-cell" rowSpan={columnLevels.length}>
                      {rowHeaderTitle}
                    </th>
                  )}
                  {level.map((col, colIdx) => renderColumnHeader(col, levelIdx, colIdx))}
                  {renderTotalHeaderCells(levelIdx, columnLevels.length)}
                </tr>
              ))
            ) : (
              <tr>
                <th className="corner-cell tree-corner-cell">{rowHeaderTitle}</th>
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
            {renderTreeRows()}
            {renderTotalRows()}
          </tbody>
        </table>
      </div>
    );
  }
);

export default TreePivotTable;
