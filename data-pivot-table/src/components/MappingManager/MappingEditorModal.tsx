import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScenarioConfig, StoredMapping } from '../../types/storage';
import { buildLookupMapFromConfigs, scenarioMappingToRecord } from '../../utils/scenarioMapper';
import { generateId } from '../../utils/storageUtils';

interface MappingEditorModalProps {
  mapping: StoredMapping;
  onSave: (id: string, updates: Partial<StoredMapping>) => void;
  onClose: () => void;
}

interface GridCell {
  value: string;
  configId?: string;
}

const MappingEditorModal: React.FC<MappingEditorModalProps> = ({ mapping, onSave, onClose }) => {
  const [name, setName] = useState(mapping.name);
  const [appCodes, setAppCodes] = useState<string[]>(() => [
    ...new Set(mapping.scenarioConfigs.map((c) => c.appCode)),
  ]);
  const [gridData, setGridData] = useState<Map<string, Map<string, GridCell>>>(() => {
    // 初始化2D网格数据
    const grid = new Map<string, Map<string, GridCell>>();

    mapping.scenarioConfigs.forEach((config) => {
      if (!grid.has(config.targetScenario)) {
        grid.set(config.targetScenario, new Map());
      }
      grid.get(config.targetScenario)!.set(config.appCode, {
        value: config.originalScenario,
        configId: config.id,
      });
    });

    return grid;
  });

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [newAppCode, setNewAppCode] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  // 获取所有目标场景
  const targetScenarios = useMemo(() => Array.from(gridData.keys()), [gridData]);

  // 全选/反选
  const handleSelectAll = useCallback(() => {
    if (isSelectAll) {
      setSelectedRows(new Set());
      setIsSelectAll(false);
    } else {
      setSelectedRows(new Set(targetScenarios));
      setIsSelectAll(true);
    }
  }, [isSelectAll, targetScenarios]);

  // 单行选择
  const handleSelectRow = useCallback((target: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(target)) {
        next.delete(target);
      } else {
        next.add(target);
      }
      return next;
    });
  }, []);

  // 批量删除行
  const handleBatchDeleteRows = useCallback(() => {
    if (selectedRows.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedRows.size} 行吗？`)) return;

    setGridData((prev) => {
      const next = new Map(prev);
      selectedRows.forEach((target) => next.delete(target));
      return next;
    });
    setSelectedRows(new Set());
    setIsSelectAll(false);
  }, [selectedRows]);

  // 删除单行
  const handleDeleteRow = useCallback((target: string) => {
    setGridData((prev) => {
      const next = new Map(prev);
      next.delete(target);
      return next;
    });
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.delete(target);
      return next;
    });
  }, []);

  // 添加新行
  const handleAddRow = useCallback(() => {
    const newTarget = `新场景_${Date.now()}`;
    setGridData((prev) => {
      const next = new Map(prev);
      next.set(newTarget, new Map());
      return next;
    });

    setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  // 添加新列（应用标识）
  const handleAddColumn = useCallback(() => {
    if (!newAppCode.trim()) return;
    if (appCodes.includes(newAppCode.trim())) {
      alert('该应用标识已存在');
      return;
    }
    setAppCodes((prev) => [...prev, newAppCode.trim()]);
    setNewAppCode('');
  }, [newAppCode, appCodes]);

  // 删除列（应用标识）
  const handleDeleteColumn = useCallback((code: string) => {
    if (!confirm(`确定要删除应用标识"${code}"及其所有映射吗？`)) return;

    setAppCodes((prev) => prev.filter((c) => c !== code));
    setGridData((prev) => {
      const next = new Map(prev);
      next.forEach((row) => {
        row.delete(code);
      });
      return next;
    });
  }, []);

  // 修改单元格值
  const handleCellChange = useCallback((target: string, appCode: string, value: string) => {
    setGridData((prev) => {
      const next = new Map(prev);
      if (!next.has(target)) {
        next.set(target, new Map());
      }
      next.get(target)!.set(appCode, { value });
      return next;
    });
  }, []);

  // 修改目标场景名称
  const handleTargetChange = useCallback(
    (oldTarget: string, newTarget: string) => {
      if (oldTarget === newTarget) return;
      if (gridData.has(newTarget)) {
        alert('目标场景名称已存在');
        return;
      }

      setGridData((prev) => {
        const next = new Map(prev);
        const row = next.get(oldTarget);
        if (row) {
          next.delete(oldTarget);
          next.set(newTarget, row);
        }
        return next;
      });

      setSelectedRows((prev) => {
        const next = new Set(prev);
        if (next.has(oldTarget)) {
          next.delete(oldTarget);
          next.add(newTarget);
        }
        return next;
      });
    },
    [gridData]
  );

  // 保存
  const handleSave = useCallback(() => {
    // 将2D网格转换为ScenarioConfig列表
    const scenarioConfigs: ScenarioConfig[] = [];

    gridData.forEach((row, target) => {
      row.forEach((cell, appCode) => {
        if (cell.value) {
          scenarioConfigs.push({
            id: cell.configId || generateId(),
            appCode,
            originalScenario: cell.value,
            targetScenario: target,
          });
        }
      });
    });

    const scenarioMapping = buildLookupMapFromConfigs(scenarioConfigs, appCodes);

    onSave(mapping.id, {
      name,
      scenarioConfigs,
      lookupMap: scenarioMappingToRecord(scenarioMapping),
      appCodes: scenarioMapping.appCodes,
      scenarioCount: scenarioMapping.scenarioCount,
    });
  }, [mapping.id, name, appCodes, gridData, onSave]);

  // 导出CSV
  const handleExport = useCallback(() => {
    const header = ['目标场景', ...appCodes].join(',');
    const rows = targetScenarios.map((target) => {
      const cells = [
        target,
        ...appCodes.map((code) => {
          const cell = gridData.get(target)?.get(code);
          return cell?.value || '';
        }),
      ];
      return cells.join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }, [name, appCodes, targetScenarios, gridData]);

  // Escape 键关闭
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div className="mapping-modal-overlay" onClick={onClose}>
      <div className="mapping-modal" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="mapping-modal-header">
          <h3>编辑映射：{mapping.name}</h3>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* 主体 */}
        <div className="mapping-modal-body" ref={bodyRef}>
          {/* 配置名称 */}
          <div className="modal-section">
            <label className="modal-label">配置名称</label>
            <input
              type="text"
              className="modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* 应用标识管理 */}
          <div className="modal-section">
            <div className="modal-section-header">
              <span className="modal-section-title">应用标识 ({appCodes.length})</span>
              <div className="modal-section-actions">
                <input
                  type="text"
                  className="modal-input-small"
                  placeholder="新应用标识"
                  value={newAppCode}
                  onChange={(e) => setNewAppCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddColumn();
                  }}
                />
                <button className="btn-text" onClick={handleAddColumn}>
                  + 添加
                </button>
              </div>
            </div>
            <div className="app-code-list">
              {appCodes.map((code) => (
                <span key={code} className="app-code-tag">
                  {code}
                  <button onClick={() => handleDeleteColumn(code)}>✕</button>
                </span>
              ))}
            </div>
          </div>

          {/* 2D映射表格 */}
          <div className="modal-section">
            <div className="modal-section-header">
              <span className="modal-section-title">映射规则 ({targetScenarios.length} 行)</span>
              <div className="modal-section-actions">
                <span className="selected-count">
                  {selectedRows.size > 0 && `已选 ${selectedRows.size} 行`}
                </span>
                <button
                  className="btn-text btn-danger"
                  onClick={handleBatchDeleteRows}
                  disabled={selectedRows.size === 0}
                >
                  批量删除
                </button>
                <button className="btn-text" onClick={handleSelectAll}>
                  {isSelectAll ? '取消全选' : '全选'}
                </button>
              </div>
            </div>

            <div className="mapping-2d-table-wrapper">
              <table className="mapping-2d-table">
                <thead>
                  <tr>
                    <th className="col-checkbox">
                      <input type="checkbox" checked={isSelectAll} onChange={handleSelectAll} />
                    </th>
                    <th className="col-target">目标场景</th>
                    {appCodes.map((code) => (
                      <th key={code} className="col-appcode">
                        <div className="appcode-header">
                          <span>{code}</span>
                          <button
                            className="btn-delete-col"
                            onClick={() => handleDeleteColumn(code)}
                            title="删除列"
                          >
                            ✕
                          </button>
                        </div>
                      </th>
                    ))}
                    <th className="col-actions">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {targetScenarios.map((target) => (
                    <tr key={target} className={selectedRows.has(target) ? 'selected' : ''}>
                      <td className="col-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(target)}
                          onChange={() => handleSelectRow(target)}
                        />
                      </td>
                      <td className="col-target">
                        <input
                          type="text"
                          className="cell-input"
                          value={target}
                          onChange={(e) => handleTargetChange(target, e.target.value)}
                          placeholder="目标场景"
                        />
                      </td>
                      {appCodes.map((code) => {
                        const cell = gridData.get(target)?.get(code);
                        return (
                          <td key={code} className="col-appcode">
                            <input
                              type="text"
                              className="cell-input"
                              value={cell?.value || ''}
                              onChange={(e) => handleCellChange(target, code, e.target.value)}
                              placeholder="-"
                            />
                          </td>
                        );
                      })}
                      <td className="col-actions">
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => handleDeleteRow(target)}
                          title="删除行"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="btn-add-rule" onClick={handleAddRow}>
              + 添加映射行
            </button>
          </div>
        </div>

        {/* 底部 */}
        <div className="mapping-modal-footer">
          <button className="btn-secondary" onClick={handleExport}>
            📤 导出 CSV
          </button>
          <div className="modal-footer-actions">
            <button className="btn-secondary" onClick={onClose}>
              取消
            </button>
            <button className="btn-primary" onClick={handleSave}>
              💾 保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MappingEditorModal;
