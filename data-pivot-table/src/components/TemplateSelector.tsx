import { Film, Globe, Megaphone, Plus, Settings, Smartphone } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import templatesData from '../data/pivotTemplates.json';
import type { Field, PivotField } from '../types';

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

interface TemplateSelectorProps {
  fields: Field[];
  onApply: (rows: PivotField[], cols: PivotField[], values: PivotField[]) => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  应用维度: <Smartphone size={13} />,
  版本维度: <Settings size={13} />,
  国家维度: <Globe size={13} />,
  渠道维度: <Megaphone size={13} />,
  广告场景维度: <Film size={13} />,
};

const TemplateSelector: React.FC<TemplateSelectorProps> = ({ fields, onApply }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const templates: PivotTemplate[] = useMemo(() => templatesData as PivotTemplate[], []);

  const categories = useMemo(() => {
    const map = new Map<string, PivotTemplate[]>();
    for (const t of templates) {
      if (!map.has(t.category)) map.set(t.category, []);
      map.get(t.category)!.push(t);
    }
    return map;
  }, [templates]);

  const handleSelect = useCallback(
    (template: PivotTemplate) => {
      const toPivotFields = (names: string[]): PivotField[] =>
        names
          .map((name) => resolveField(name, fields))
          .filter((f): f is Field => f !== null)
          .map((f) => createPivotField(f));

      const rowFields = toPivotFields(template.rows);
      const colFields = toPivotFields(template.cols);
      const valueFields = toPivotFields(template.values);

      onApply(rowFields, colFields, valueFields);
      setIsOpen(false);
    },
    [fields, onApply]
  );

  const templateBlocks = useMemo(() => {
    return Array.from(categories.entries()).map((entry) => {
      const category = entry[0];
      const items = entry[1];
      return (
        <div key={category} className="template-category-group">
          <div className="template-category-header">
            <span className="template-category-icon">{CATEGORY_ICONS[category] ?? null}</span>
            <span className="template-category-name">{category}</span>
          </div>
          <div className="template-category-items">
            {items.map((template) => (
              <div
                key={template.id}
                className="template-item"
                onClick={() => handleSelect(template)}
              >
                <div className="template-item-name">{template.name}</div>
                <div className="template-item-desc">{template.description}</div>
                <div className="template-item-config">
                  {template.rows.length > 0 && (
                    <span className="template-tag tag-row">行: {template.rows.join(' → ')}</span>
                  )}
                  {template.cols.length > 0 && (
                    <span className="template-tag tag-col">列: {template.cols.join(' → ')}</span>
                  )}
                  {template.values.length > 0 && (
                    <span className="template-tag tag-value">值: {template.values.join(', ')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    });
  }, [categories, handleSelect]);

  return (
    <div className="template-selector-wrapper" ref={dropdownRef}>
      <div
        className={`file-capsule template-trigger ${isOpen ? 'capsule-dragging' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="capsule-icon">
          <Plus size={14} />
        </span>
        <span className="capsule-name">快速分析</span>
        <span className="capsule-action">{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div className="template-dropdown" onClick={(e) => e.stopPropagation()}>
          {templateBlocks}
        </div>
      )}
    </div>
  );
};

export default TemplateSelector;
