import { Film, Globe, Megaphone, Pencil, Save, Settings, Smartphone, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import templatesData from '../../data/pivotTemplates.json';
import type { Field, FilterConfig, PivotField } from '../../types';
import type { StoredConfig } from '../../types/storage';

interface PivotTemplate {
  id: string;
  category: string;
  categoryIcon: string;
  name: string;
  description: string;
  rows: string[];
  cols: string[];
  values: string[];
}

const FALLBACK_MAP: Record<string, string> = {
  实际场景: '广告场景',
  实际国家: '国家',
  买量渠道: '渠道',
};

function resolveField(name: string, fields: Field[]): Field | null {
  const direct = fields.find((f) => f.name === name);
  if (direct) return direct;
  const fbName = FALLBACK_MAP[name];
  if (fbName) return fields.find((f) => f.name === fbName) ?? null;
  return null;
}

function createPivotField(field: Field): PivotField {
  return {
    field,
    aggregation: field.type === 'measure' ? 'sum' : undefined,
  };
}

interface ConfigManagerProps {
  currentDatasetId: string | null;
  currentConfig: {
    rowFields: PivotField[];
    colFields: PivotField[];
    valueFields: PivotField[];
    filterConfigs: FilterConfig[];
  };
  savedConfigs: StoredConfig[];
  fields: Field[];
  onConfigSave: (name: string) => void;
  onConfigLoad: (id: string) => void;
  onConfigDelete: (id: string) => void;
  onConfigRename: (id: string, newName: string) => void;
  onTemplateApply: (rows: PivotField[], cols: PivotField[], values: PivotField[]) => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  应用维度: <Smartphone size={13} />,
  版本维度: <Settings size={13} />,
  国家维度: <Globe size={13} />,
  渠道维度: <Megaphone size={13} />,
  广告场景维度: <Film size={13} />,
};

const ConfigManager: React.FC<ConfigManagerProps> = ({
  currentDatasetId,
  currentConfig,
  savedConfigs,
  fields,
  onConfigSave,
  onConfigLoad,
  onConfigDelete,
  onConfigRename,
  onTemplateApply,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setEditingId(null);
        setShowTemplates(false);
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

  const templates: PivotTemplate[] = useMemo(() => templatesData as PivotTemplate[], []);

  const categories = useMemo(() => {
    const map = new Map<string, PivotTemplate[]>();
    for (const t of templates) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)?.push(t);
    }
    return map;
  }, [templates]);

  const hasCurrentConfig =
    currentConfig.rowFields.length > 0 ||
    currentConfig.colFields.length > 0 ||
    currentConfig.valueFields.length > 0;

  const getConfigSummary = (config: {
    rowFields: PivotField[];
    colFields: PivotField[];
    valueFields: PivotField[];
  }) => {
    const parts: string[] = [];
    if (config.rowFields.length > 0) {
      parts.push(`行: ${config.rowFields.map((f) => f.field.name).join(' → ')}`);
    }
    if (config.colFields.length > 0) {
      parts.push(`列: ${config.colFields.map((f) => f.field.name).join(' → ')}`);
    }
    if (config.valueFields.length > 0) {
      parts.push(`值: ${config.valueFields.map((f) => f.field.name).join(', ')}`);
    }
    return parts.join('  ');
  };

  // 一键保存（自动生成名称）
  const handleQuickSave = useCallback(() => {
    const name = `配置 ${savedConfigs.length + 1}`;
    onConfigSave(name);
  }, [savedConfigs, onConfigSave]);

  const handleDelete = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (confirm('确定要删除这个配置吗？')) {
        onConfigDelete(id);
      }
    },
    [onConfigDelete]
  );

  const handleRenameStart = useCallback((config: StoredConfig) => {
    setEditingId(config.id);
    setEditingName(config.name);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (editingId && editingName.trim()) {
      onConfigRename(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, onConfigRename]);

  const handleRenameCancel = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleTemplateSelect = useCallback(
    (template: PivotTemplate) => {
      const toPivotFields = (names: string[]): PivotField[] =>
        names
          .map((name) => resolveField(name, fields))
          .filter((f): f is Field => f !== null)
          .map((f) => createPivotField(f));

      const rowFields = toPivotFields(template.rows);
      const colFields = toPivotFields(template.cols);
      const valueFields = toPivotFields(template.values);

      onTemplateApply(rowFields, colFields, valueFields);
      setIsOpen(false);
      setShowTemplates(false);
    },
    [fields, onTemplateApply]
  );

  const templateBlocks = useMemo(() => {
    return Array.from(categories.entries()).map((entry) => {
      const category = entry[0];
      const items = entry[1];
      return (
        <div key={category} className="template-category">
          <div className="template-category-header">
            <span className="template-category-icon">{CATEGORY_ICONS[category] ?? null}</span>
            <span className="template-category-name">{category}</span>
          </div>
          {items.map((template) => (
            <button
              type="button"
              key={template.id}
              className="template-item"
              onClick={() => handleTemplateSelect(template)}
            >
              <div className="template-item-name">{template.name}</div>
              <div className="template-item-desc">{template.description}</div>
            </button>
          ))}
        </div>
      );
    });
  }, [categories, handleTemplateSelect]);

  return (
    <div className="config-manager-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`file-capsule config-trigger ${isOpen ? 'capsule-dragging' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="capsule-icon">
          <Settings size={14} />
        </span>
        <span className="capsule-name">配置管理</span>
        <span className="capsule-action">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="config-dropdown" role="presentation" onClick={(e) => e.stopPropagation()}>
          {/* 一键保存按钮 */}
          {currentDatasetId && (
            <div className="config-save-section">
              <button
                type="button"
                className="btn-quick-save"
                onClick={handleQuickSave}
                disabled={!hasCurrentConfig}
              >
                <Save size={14} style={{ marginRight: 6 }} /> 保存当前配置
              </button>
            </div>
          )}

          {/* 当前配置 */}
          {hasCurrentConfig && (
            <div className="config-section">
              <div className="section-title">当前配置</div>
              <div className="config-card current">
                <div className="config-info">
                  <div className="config-summary">{getConfigSummary(currentConfig)}</div>
                </div>
              </div>
            </div>
          )}

          {/* 保存的配置列表 */}
          {savedConfigs.length > 0 && (
            <div className="config-section">
              <div className="section-title">保存的配置 ({savedConfigs.length}/10)</div>
              {savedConfigs.map((config) => (
                <div key={config.id} className="config-card">
                  {editingId === config.id ? (
                    <div className="config-rename">
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
                      <button
                        type="button"
                        className="config-info"
                        onClick={() => onConfigLoad(config.id)}
                      >
                        <div className="config-name">{config.name}</div>
                        <div className="config-summary">{getConfigSummary(config)}</div>
                      </button>
                      <div className="config-actions">
                        <button
                          type="button"
                          onClick={() => handleRenameStart(config)}
                          title="重命名"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(config.id, e)}
                          title="删除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 快速模板 */}
          <div className="config-section">
            <button
              type="button"
              className="section-title clickable"
              onClick={() => setShowTemplates(!showTemplates)}
            >
              快速模板 {showTemplates ? '▾' : '▸'}
            </button>
            {showTemplates && <div className="templates-list">{templateBlocks}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigManager;
