import React from 'react';
import type { PivotResult } from '../../types';
import FlatPivotTable from './FlatPivotTable';
import TreePivotTable from './TreePivotTable';

interface PivotTableProps {
  result: PivotResult | null;
  valueFieldName?: string;
  emptyMessage?: string;
  showRowTotal?: boolean;
  showColumnTotal?: boolean;
}

const PivotTable: React.FC<PivotTableProps> = React.memo(
  ({
    result,
    emptyMessage = '请配置透视表字段以查看结果',
    showRowTotal = true,
    showColumnTotal = true,
  }) => {
    if (!result) {
      return (
        <div className="pivot-table-empty">
          <p>{emptyMessage}</p>
        </div>
      );
    }

    const canUseRowTree = result.valueAxis === 'columns' && Boolean(result.rowTree?.length);

    // 树形模式
    if (canUseRowTree) {
      return (
        <TreePivotTable
          result={result}
          showRowTotal={showRowTotal}
          showColumnTotal={showColumnTotal}
        />
      );
    }

    // 扁平模式
    return (
      <FlatPivotTable
        result={result}
        showRowTotal={showRowTotal}
        showColumnTotal={showColumnTotal}
      />
    );
  }
);

export default PivotTable;
