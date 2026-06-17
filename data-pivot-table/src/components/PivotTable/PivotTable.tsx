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
