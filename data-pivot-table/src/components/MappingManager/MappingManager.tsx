import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link2, Paperclip, Pencil, FileEdit, Upload, Trash2 } from 'lucide-react';
import type { StoredMapping } from '../../types/storage';
import MappingEditorModal from './MappingEditorModal';

interface MappingManagerProps {
  mappings: StoredMapping[];
  storageQuota: { mappingCount: number; mappingLimit: number };
  onMappingUpload: (file: File) => void;
  onMappingRename: (id: string, newName: string) => void;
  onMappingDelete: (id: string) => void;
  onMappingUpdate: (id: string, updates: Partial<StoredMapping>) => void;
  onMappingExport: (mapping: StoredMapping) => void;
}

const MappingManager: React.FC<MappingManagerProps> = ({
  mappings,
  storageQuota,
  onMappingUpload,
  onMappingRename,
  onMappingDelete,
  onMappingUpdate,
  onMappingExport,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editorMapping, setEditorMapping] = useState<StoredMapping | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setEditingId(null);
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

  const handleRenameStart = useCallback((mapping: StoredMapping) => {
    setEditingId(mapping.id);
    setEditingName(mapping.name);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (editingId && editingName.trim()) {
      onMappingRename(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, onMappingRename]);

  const handleRenameCancel = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这个映射吗？删除后无法恢复。')) {
      onMappingDelete(id);
    }
  }, [onMappingDelete]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onMappingUpload(file);
      e.target.value = '';
    }
  }, [onMappingUpload]);

  const handleEditorSave = useCallback((id: string, updates: Partial<StoredMapping>) => {
    onMappingUpdate(id, updates);
    setEditorMapping(null);
  }, [onMappingUpdate]);

  return (
    <>
      <div className="mapping-manager-wrapper" ref={dropdownRef}>
        <div
          className={`file-capsule mapping-trigger ${isOpen ? 'capsule-dragging' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="capsule-icon"><Link2 size={14} /></span>
          <span className="capsule-name">场景映射</span>
          <span className="capsule-action">{isOpen ? '▲' : '▼'}</span>
        </div>

        {isOpen && (
          <div className="mapping-dropdown" onClick={(e) => e.stopPropagation()}>
            <div className="mapping-quota">
              <span className="quota-text">
                共 {storageQuota.mappingCount}/{storageQuota.mappingLimit} 个映射
              </span>
            </div>

            {mappings.length > 0 && (
              <div className="mapping-list">
                {mappings.map(mapping => (
                  <div key={mapping.id} className="mapping-card">
                    {editingId === mapping.id ? (
                      <div className="mapping-rename">
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
                        <div className="mapping-info">
                          <div className="mapping-name"><Paperclip size={13} style={{ marginRight: 4 }} /> {mapping.name}</div>
                          <div className="mapping-meta">
                            {mapping.scenarioCount} 个场景 · {mapping.mappedRowCount} 行已匹配
                          </div>
                        </div>
                        <div className="mapping-actions">
                          <button onClick={() => handleRenameStart(mapping)} title="重命名"><Pencil size={14} /></button>
                          <button onClick={() => setEditorMapping(mapping)} title="编辑映射"><FileEdit size={14} /></button>
                          <button onClick={() => onMappingExport(mapping)} title="导出"><Upload size={14} /></button>
                          <button onClick={(e) => handleDelete(mapping.id, e)} title="删除"><Trash2 size={14} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mapping-upload">
              <button
                className="mapping-upload-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={storageQuota.mappingCount >= storageQuota.mappingLimit}
              >
                <Upload size={14} style={{ marginRight: 6 }} /> 上传新映射文件
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
            </div>
          </div>
        )}
      </div>

      {editorMapping && (
        <MappingEditorModal
          mapping={editorMapping}
          onSave={handleEditorSave}
          onClose={() => setEditorMapping(null)}
        />
      )}
    </>
  );
};

export default MappingManager;
