import React from 'react';
import type { PivotResult, SortConfig } from '../../types';
import FlatPivotTable from './FlatPivotTable';
import TreePivotTable from './TreePivotTable';

export type ToggleSortFn = (type: 'column' | 'dimension' | 'total', value: string) => void;

interface PivotTableProps {
  result: PivotResult | null;
  valueFieldName?: string;
  emptyMessage?: string;
  showRowTotal?: boolean;
  showColumnTotal?: boolean;
  sortConfig?: SortConfig | null;
  onToggleSort?: ToggleSortFn;
}

const PivotTable: React.FC<PivotTableProps> = React.memo(
  ({
    result,
    emptyMessage = '请配置透视表字段以查看结果',
    showRowTotal = true,
    showColumnTotal = true,
    sortConfig,
    onToggleSort,
  }) => {
    if (!result) {
      return (
        <div className="pivot-table-empty">
          <p>{emptyMessage}</p>
        </div>
      );
    }

    const canUseRowTree = result.valueAxis === 'columns' && Boolean(result.rowTree?.length);

    console.log('[PivotTable 路由]', {
      valueAxis: result.valueAxis,
      canUseRowTree,
      columnHeaders长度: result.columnHeaders.length,
      columnLevels层数: result.columnLevels.length,
      每层colspan之和: result.columnLevels.map((l, i) => `层${i}: ${l.reduce((s, c) => s + c.colspan, 0)}`),
      colFieldNames: result.colFieldNames,
      valueFieldNames: result.valueFieldNames,
      rowDimensions: result.rowDimensions,
      columnHeaders样例: result.columnHeaders.slice(0, 5),
    });

    if (canUseRowTree) {
      return (
        <TreePivotTable
          result={result}
          showRowTotal={showRowTotal}
          showColumnTotal={showColumnTotal}
          sortConfig={sortConfig}
          onToggleSort={onToggleSort}
        />
      );
    }

    return (
      <FlatPivotTable
        result={result}
        showRowTotal={showRowTotal}
        showColumnTotal={showColumnTotal}
        sortConfig={sortConfig}
        onToggleSort={onToggleSort}
      />
    );
  }
);

export default PivotTable;
