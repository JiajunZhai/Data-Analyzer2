import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { PivotResult, PivotTreeNode, SortConfig } from '../../types';
import { formatColumnHeader, formatPivotValue, getGroupBoundaryClass, getSortIcon, isSortActive } from './pivotTableUtils';
import type { ToggleSortFn } from './PivotTable';

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

const TreePivotTable: React.FC<TreePivotTableProps> = React.memo(
  ({ result, showRowTotal, showColumnTotal, sortConfig, onToggleSort }) => {
    const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
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
      valueFormats,
    } = result;

    const visibleTreeRows = useMemo<VisibleTreeRow[]>(() => {
      if (!rowTree) return [];
      const rows: VisibleTreeRow[] = [];
      const walk = (nodes: PivotTreeNode[]) => {
        nodes.forEach((node) => {
          const hasChildren = node.children.length > 0;
          const isExpanded = !collapsedNodeIds.has(node.id);
          rows.push({
            id: node.id, label: node.label, depth: node.depth,
            type: hasChildren ? 'group' : 'leaf', hasChildren, isExpanded,
            data: node.data, rowTotalValues: node.rowTotalValues, rowIndex: node.rowIndex,
          });
          if (hasChildren && isExpanded) {
            walk(node.children);
            rows.push({
              id: `subtotal:${node.id}`, label: '小计', depth: node.depth + 1,
              type: 'subtotal', hasChildren: false, isExpanded: false,
              data: node.data, rowTotalValues: node.rowTotalValues,
            });
          }
        });
      };
      walk(rowTree);
      return rows;
    }, [rowTree, collapsedNodeIds]);

    const handleTreeToggle = useCallback((nodeId: string) => {
      setCollapsedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    }, []);

    const hasColumnLevels = columnLevels.length > 0;
    const hasMultipleTotalColumns = totalColumnHeaders.length > 1;
    const dimensionCount = Math.max(rowDimensions.filter(Boolean).length, 1);
    const hasTreeHierarchy = dimensionCount > 1;
    const treeDimensionWidth =
      dimensionCount <= 1
        ? 'clamp(104px, 7vw, 128px)'
        : dimensionCount === 2
          ? 'clamp(148px, 9vw, 176px)'
          : 'clamp(168px, 11vw, 208px)';
    const containerStyle = {
      '--pivot-tree-dimension-col-width': treeDimensionWidth,
    } as React.CSSProperties;
    const rowHeaderTitle = rowDimensions.filter(Boolean).join(' / ') || '维度';

    const getTreeRowTotalMetricName = useCallback(
      (totalIndex: number): string => totalColumnValueFieldNames[totalIndex] || valueFieldNames[totalIndex] || '',
      [totalColumnValueFieldNames, valueFieldNames]
    );

    const getDataMetricName = useCallback(
      (_rowIndex: number, colIndex: number): string => columnValueFieldNames[colIndex] || valueFieldNames[0] || '',
      [columnValueFieldNames, valueFieldNames]
    );

    const renderColumnHeader = (
      col: { value: string; colspan: number }, levelIdx: number, colIdx: number
    ) => {
      const isBoundary = getGroupBoundaryClass(columnLevels, colIdx) !== '';
      const isSticky = levelIdx === 0 && col.colspan > 1;
      const isLeaf = levelIdx === columnLevels.length - 1;
      let dataColIdx = 0;
      for (let i = 0; i < colIdx; i++) {
        dataColIdx += columnLevels[levelIdx]?.[i]?.colspan ?? 1;
      }
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
            col.value || '总计'
          )}
          {canSort && (
            <SortButton type="column" value={String(dataColIdx)} sortConfig={sortConfig} onToggleSort={onToggleSort} />
          )}
        </th>
      );
    };

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
          <th className={`total-header ${stickyRight}`} colSpan={totalColumnHeaders.length}>行总计</th>
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
        <th className={`total-header total-header-spacer ${stickyRight}`} colSpan={totalColumnHeaders.length}>&nbsp;</th>
      );
    };

    const renderTreeRowHeader = (treeRow: VisibleTreeRow) => (
      <td className={`row-header frozen-row-header frozen-row-header-last dimension-col-end tree-row-header tree-row-header-${treeRow.type}`}>
        <div className="frozen-cell-inner tree-cell-inner">
          <div className="tree-label" style={{ paddingLeft: hasTreeHierarchy ? `${treeRow.depth * 14}px` : undefined }}>
            {treeRow.hasChildren ? (
              <button type="button" className="tree-toggle"
                aria-label={treeRow.isExpanded ? `折叠 ${treeRow.label}` : `展开 ${treeRow.label}`}
                onClick={(event) => { event.stopPropagation(); handleTreeToggle(treeRow.id); }}>
                {treeRow.isExpanded ? '▼' : '▶'}
              </button>
            ) : hasTreeHierarchy ? (
              <span className="tree-toggle-spacer" />
            ) : (
              null
            )}
            <span className="tree-label-text">{treeRow.label || '总计'}</span>
          </div>
        </div>
      </td>
    );

    const renderTreeRows = () => {
      const dataColumnCount = columnHeaders.length;
      return visibleTreeRows.map((treeRow) => {
        const isExpandedGroup = treeRow.type === 'group' && treeRow.isExpanded;
        const dataValues = treeRow.data.length > 0 ? treeRow.data : Array.from({ length: dataColumnCount }, () => 0);
        const totalValues = treeRow.rowTotalValues.length > 0 ? treeRow.rowTotalValues : Array.from({ length: totalColumnHeaders.length }, () => 0);
        return (
          <tr key={treeRow.id} className={`tree-table-row tree-row-${treeRow.type} ${treeRow.isExpanded ? 'tree-row-expanded' : ''}`}>
            {renderTreeRowHeader(treeRow)}
            {dataValues.map((val, ci) => {
              const boundaryClass = getGroupBoundaryClass(columnLevels, ci);
              if (isExpandedGroup) {
                return <td key={ci} className={`data-cell tree-group-placeholder ${boundaryClass}`}>&nbsp;</td>;
              }
              const metricName = getDataMetricName(treeRow.rowIndex ?? 0, ci);
              const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
              return (
                <td key={ci} className={`data-cell ${treeRow.type === 'subtotal' ? 'tree-subtotal-cell' : ''} ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}>
                  {text}
                </td>
              );
            })}
            {showRowTotal && totalValues.map((val, ti) => {
              if (isExpandedGroup) {
                return <td key={ti} className="total-cell total-cell-sticky tree-group-placeholder">&nbsp;</td>;
              }
              const totalMetricName = getTreeRowTotalMetricName(ti);
              const { text, isEmpty } = formatPivotValue(val, totalMetricName, valueFormats?.[totalMetricName]);
              return (
                <td key={ti} className={`total-cell total-cell-sticky ${treeRow.type === 'subtotal' ? 'tree-subtotal-cell' : ''} ${isEmpty ? 'empty-cell' : 'number-formatted'}`}>
                  {text}
                </td>
              );
            })}
          </tr>
        );
      });
    };

    const renderTotalRows = () => {
      if (!showColumnTotal || totalRows.length === 0) return null;
      return totalRows.map((totalRow, totalRowIdx) => (
        <tr key={totalRow.label} className={`total-row total-row-sticky ${totalRowIdx > 0 ? 'total-row-secondary' : ''}`}>
          <td className="row-header total-label frozen-row-header frozen-row-header-last dimension-col-end tree-row-header" colSpan={1}>
            <div className="frozen-cell-inner">{totalRow.label}</div>
          </td>
          {totalRow.values.map((val, idx) => {
            const metricName = totalRow.valueFieldNames[idx] || columnValueFieldNames[idx];
            const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
            const boundaryClass = getGroupBoundaryClass(columnLevels, idx);
            return <td key={idx} className={`total-cell ${isEmpty ? 'empty-cell' : 'number-formatted'} ${boundaryClass}`}>{text}</td>;
          })}
          {totalRow.totalValues.map((val, idx) => {
            const metricName = totalRow.totalValueFieldNames[idx] || totalColumnValueFieldNames[idx];
            const { text, isEmpty } = formatPivotValue(val, metricName, valueFormats?.[metricName]);
            return <td key={idx} className={`grand-total summary-intersection ${isEmpty ? 'empty-cell' : 'number-formatted'}`}>{text}</td>;
          })}
        </tr>
      ));
    };

    return (
      <div
        className={`pivot-table-container ${hasTreeHierarchy ? 'pivot-tree-hierarchical' : 'pivot-tree-flat'} pivot-tree-depth-${Math.min(dimensionCount, 4)}`}
        ref={containerRef}
        style={containerStyle}
      >
        <table className="pivot-table">
          <thead>
            {hasColumnLevels ? (
              columnLevels.map((level, levelIdx) => (
                <tr key={levelIdx}>
                  {levelIdx === 0 && (
                    <th className="corner-cell tree-corner-cell sortable" rowSpan={columnLevels.length}>
                      {rowHeaderTitle}
                      <SortButton type="dimension" value={rowDimensions[0] || ''} sortConfig={sortConfig} onToggleSort={onToggleSort} />
                    </th>
                  )}
                  {level.map((col, colIdx) => renderColumnHeader(col, levelIdx, colIdx))}
                  {renderTotalHeaderCells(levelIdx, columnLevels.length)}
                </tr>
              ))
            ) : (
              <tr>
                <th className="corner-cell tree-corner-cell sortable">
                  {rowHeaderTitle}
                  <SortButton type="dimension" value={rowDimensions[0] || ''} sortConfig={sortConfig} onToggleSort={onToggleSort} />
                </th>
                {columnHeaders.map((col, idx) => (
                  <th key={idx} className={`col-header sortable ${idx === columnHeaders.length - 1 ? 'group-boundary-col' : ''}`}>
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
