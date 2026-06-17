import { Film, Globe, Megaphone, Pencil, Save, Settings, Smartphone, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import templatesData from '../../data/pivotTemplates.json';
import type { Field, FilterConfig, PivotField } from '../../types';
import type { StoredConfig } from '../../types/storage';
import { createPivotField } from '../../utils/fieldHelpers';

interface PivotTemplate {
  id: string;
  category: string;
  categoryIcon: string;
  name: string;
  formula?: string;
  description: string;
  rows: string[];
  cols: string[];
  values: string[];
}

const FALLBACK_MAP: Record<string, string> = {
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const [configName, setConfigName] = useState('');

  // 保存配置（使用用户输入的名称）
  const handleSave = useCallback(() => {
    const name = configName.trim() || `配置 ${savedConfigs.length + 1}`;
    onConfigSave(name);
    setConfigName('');
  }, [configName, savedConfigs, onConfigSave]);

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
    },
    [fields, onTemplateApply]
  );

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const templateBlocks = useMemo(() => {
    return Array.from(categories.entries()).map((entry) => {
      const category = entry[0];
      const items = entry[1];
      const isCollapsed = collapsedCategories.has(category);
      return (
        <div key={category} className="template-category">
          <button
            type="button"
            className="template-category-header"
            onClick={() => toggleCategory(category)}
          >
            <span className="template-category-icon">{CATEGORY_ICONS[category] ?? null}</span>
            <span className="template-category-name">{category}</span>
            <span className="template-category-arrow">{isCollapsed ? '▶' : '▼'}</span>
          </button>
          {!isCollapsed &&
            items.map((template) => {
              // 解析维度标签：从 formula 中提取 "×" 分隔的维度
              const dimensionTags = template.formula
                ? template.formula.split('×').map((s) => s.trim())
                : [];
              return (
                <button
                  type="button"
                  key={template.id}
                  className="template-item"
                  onClick={() => handleTemplateSelect(template)}
                >
                  <div className="template-item-main">
                    <div className="template-item-title">{template.name}</div>
                    {dimensionTags.length > 0 && (
                      <div className="template-item-tags">
                        {dimensionTags.map((tag, i) => (
                          <span key={i} className="template-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="template-item-desc">{template.description}</div>
                  </div>
                  <span className="template-item-apply">应用</span>
                </button>
              );
            })}
        </div>
      );
    });
  }, [categories, collapsedCategories, toggleCategory, handleTemplateSelect]);

  return (
    <div className="config-manager-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className={`toolbar-btn ${isOpen ? 'is-open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="capsule-icon">
          <Settings size={13} />
        </span>
        <span className="capsule-name">配置</span>
        <span className="capsule-action">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="config-dropdown" role="presentation" onClick={(e) => e.stopPropagation()}>
          {/* 保存配置 */}
          {currentDatasetId && hasCurrentConfig && (
            <div className="config-save-section">
              <div className="section-title">保存当前配置</div>
              <div className="config-save-row">
                <input
                  type="text"
                  className="config-name-input"
                  placeholder="请输入配置名称（如：核心数据看板）"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave();
                  }}
                />
                <button type="button" className="btn-quick-save" onClick={handleSave}>
                  <Save size={14} /> 保存
                </button>
              </div>
              <div className="config-current-summary">{getConfigSummary(currentConfig)}</div>
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

          {/* 推荐模板 */}
          <div className="config-section">
            <div className="section-title">推荐模板</div>
            <div className="templates-list">{templateBlocks}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ConfigManager);
