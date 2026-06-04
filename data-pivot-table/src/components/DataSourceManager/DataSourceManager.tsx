import { FileSpreadsheet, Paperclip, Pencil, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataRow } from '../../types';
import type { StorageQuota, StoredDataset, StoredMapping } from '../../types/storage';
import { formatBytes } from '../../utils/storageUtils';
import FileUpload from '../FileUpload/FileUpload';

interface DataSourceManagerProps {
  currentDatasetId: string | null;
  datasets: StoredDataset[];
  mappings: StoredMapping[];
  activeMappingId?: string;
  storageQuota: StorageQuota;
  onDatasetSelect: (id: string) => void;
  onDatasetRename: (id: string, newName: string) => void;
  onDatasetDelete: (id: string) => void;
  onDataUpload: (headers: string[], data: DataRow[], fileName: string) => void;
  onMappingSelect: (mappingId: string | null) => void;
}

const DataSourceManager: React.FC<DataSourceManagerProps> = ({
  currentDatasetId,
  datasets,
  mappings,
  activeMappingId,
  storageQuota,
  onDatasetSelect,
  onDatasetRename,
  onDatasetDelete,
  onDataUpload,
  onMappingSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [switchConfirmId, setSwitchConfirmId] = useState<string | null>(null);
  const [showMappingSelector, setShowMappingSelector] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setEditingId(null);
        setSwitchConfirmId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const currentDataset = datasets.find((d) => d.id === currentDatasetId);
  const historicalDatasets = datasets.filter((d) => d.id !== currentDatasetId);

  const handleRenameStart = useCallback((dataset: StoredDataset) => {
    setEditingId(dataset.id);
    setEditingName(dataset.name);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (editingId && editingName.trim()) {
      onDatasetRename(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, onDatasetRename]);

  const handleRenameCancel = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleDelete = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm('确定要删除这个数据集吗？删除后无法恢复。')) {
        onDatasetDelete(id);
      }
    },
    [onDatasetDelete]
  );

  const handleDatasetClick = useCallback(
    (id: string) => {
      if (id === currentDatasetId) return;
      setSwitchConfirmId(id);
    },
    [currentDatasetId]
  );

  const handleSwitchConfirm = useCallback(() => {
    if (switchConfirmId) {
      onDatasetSelect(switchConfirmId);
      setSwitchConfirmId(null);
      setIsOpen(false);
    }
  }, [switchConfirmId, onDatasetSelect]);

  const handleSwitchCancel = useCallback(() => {
    setSwitchConfirmId(null);
  }, []);

  const handleMappingSelect = useCallback(
    (mappingId: string | null) => {
      onMappingSelect(mappingId);
      setShowMappingSelector(false);
    },
    [onMappingSelect]
  );

  const activeMapping = mappings.find((m) => m.id === activeMappingId);

  return (
    <div className="datasource-manager-wrapper" ref={dropdownRef}>
      <div
        className={`file-capsule datasource-trigger ${isOpen ? 'capsule-dragging' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="capsule-icon">
          <FileSpreadsheet size={14} />
        </span>
        <span className="capsule-name">{currentDataset ? currentDataset.name : '数据源管理'}</span>
        <span className="capsule-action">{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div className="datasource-dropdown" onClick={(e) => e.stopPropagation()}>
          {/* 存储容量 */}
          <div className="datasource-quota">
            <div className="quota-bar">
              <div
                className="quota-fill"
                style={{
                  width: `${Math.min(100, (storageQuota.used / storageQuota.limit) * 100)}%`,
                }}
              />
            </div>
            <span className="quota-text">
              {formatBytes(storageQuota.used)} / {formatBytes(storageQuota.limit)}
            </span>
          </div>

          {/* 当前数据源 */}
          {currentDataset && (
            <div className="datasource-section">
              <div className="section-title">当前数据源</div>
              <div className="dataset-card active">
                <div className="dataset-info">
                  {editingId === currentDataset.id ? (
                    <div className="dataset-rename">
                      <input
                        ref={inputRef}
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameConfirm();
                          if (e.key === 'Escape') handleRenameCancel();
                        }}
                        onBlur={handleRenameConfirm}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="dataset-name">{currentDataset.name}</div>
                      <div className="dataset-meta">
                        {currentDataset.rowCount.toLocaleString()} 行 ·{' '}
                        {currentDataset.fieldCount.dimensions} 维度 ·{' '}
                        {currentDataset.fieldCount.measures} 指标
                        {currentDataset.activeMappingId && (
                          <span className="mapping-badge"> · 场景映射 ✓</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="dataset-actions">
                  <button onClick={() => handleRenameStart(currentDataset)} title="重命名">
                    <Pencil size={14} />
                  </button>
                </div>
              </div>

              {/* 场景映射选择器 */}
              <div className="mapping-section">
                <div className="section-title">场景映射</div>
                <div className="mapping-selector">
                  <div
                    className="mapping-selector-trigger"
                    onClick={() => setShowMappingSelector(!showMappingSelector)}
                  >
                    <span className="mapping-icon">
                      <Paperclip size={14} />
                    </span>
                    <span className="mapping-name">
                      {activeMapping ? activeMapping.name : '未选择映射'}
                    </span>
                    <span className="mapping-arrow">{showMappingSelector ? '▲' : '▼'}</span>
                  </div>

                  {showMappingSelector && (
                    <div className="mapping-selector-dropdown">
                      <div
                        className={`mapping-option ${!activeMappingId ? 'active' : ''}`}
                        onClick={() => handleMappingSelect(null)}
                      >
                        <span className="mapping-option-icon">
                          <X size={14} />
                        </span>
                        <span className="mapping-option-name">不使用映射</span>
                      </div>
                      {mappings.map((mapping) => (
                        <div
                          key={mapping.id}
                          className={`mapping-option ${mapping.id === activeMappingId ? 'active' : ''}`}
                          onClick={() => handleMappingSelect(mapping.id)}
                        >
                          <span className="mapping-option-icon">
                            <Paperclip size={14} />
                          </span>
                          <span className="mapping-option-name">{mapping.name}</span>
                          <span className="mapping-option-meta">
                            {mapping.scenarioCount} 个场景
                          </span>
                        </div>
                      ))}
                      {mappings.length === 0 && (
                        <div className="mapping-option-empty">
                          暂无可用映射，请先在场景映射中上传
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 历史数据源 */}
          {historicalDatasets.length > 0 && (
            <div className="datasource-section">
              <div className="section-title">
                历史数据源 ({historicalDatasets.length}/{storageQuota.datasetLimit})
              </div>
              {historicalDatasets.map((ds) => (
                <div key={ds.id} className="dataset-card">
                  {switchConfirmId === ds.id ? (
                    <div className="switch-confirm">
                      <div className="confirm-text">切换到此数据源？当前未保存的配置将丢失。</div>
                      <div className="confirm-actions">
                        <button className="btn-confirm" onClick={handleSwitchConfirm}>
                          确认切换
                        </button>
                        <button className="btn-cancel" onClick={handleSwitchCancel}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="dataset-info" onClick={() => handleDatasetClick(ds.id)}>
                        <div className="dataset-name">{ds.name}</div>
                        <div className="dataset-meta">
                          {ds.rowCount.toLocaleString()} 行 · 点击加载
                        </div>
                      </div>
                      <div className="dataset-actions">
                        <button onClick={(e) => handleDelete(ds.id, e)} title="删除">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 上传新数据源 */}
          <div className="datasource-upload">
            <FileUpload onDataLoaded={onDataUpload} variant="capsule" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DataSourceManager;
