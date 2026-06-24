import {
  BarChart3,
  Check,
  Copy,
  Database,
  FileCode,
  FolderOpen,
  GitCompareArrows,
  History,
  Plus,
  Save,
  Tag,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import s from './SQLTemplateModal.module.css';
import { ToastManager } from './Toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface SQLTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  dimensions: string[];
  metrics: string[];
  verified: boolean;
  sql: string;
  createdAt: number;
  updatedAt: number;
}

interface TemplatesData {
  templates: SQLTemplate[];
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  走势分析: <TrendingUp size={14} />,
  差异分析: <GitCompareArrows size={14} />,
  综合对比: <BarChart3 size={14} />,
  环比分析: <History size={14} />,
};

const CATEGORY_ORDER = ['走势分析', '差异分析', '综合对比', '环比分析'];

const DIMENSION_OPTIONS_ATTR = ['日期', '安装日期', '国家', '应用', '版本', '买量渠道', '生命周期'];
const DIMENSION_OPTIONS_BEHAV = ['标准广告场景', '聚合广告场景', '广告类型', '变现渠道'];
const METRIC_OPTIONS = ['注册用户', '活跃用户', '曝光人数', '曝光次数', '点击次数', '广告收益'];

// 维度关键词映射（SQL别名 -> 维度标签）
const DIMENSION_KEYWORDS: Record<string, string> = {
  安装日期: '安装日期',
  install_date: '安装日期',
  生命周期: '生命周期',
  day_x: '生命周期',
  日期: '日期',
  dt: '日期',
  国家: '国家',
  country_code: '国家',
  应用: '应用',
  app_code: '应用',
  版本: '版本',
  app_version: '版本',
  买量渠道: '买量渠道',
  渠道: '买量渠道',
  network_name: '买量渠道',
  广告类型: '广告类型',
  ad_type: '广告类型',
  变现渠道: '变现渠道',
  广告变现渠道: '变现渠道',
  ad_revenue_network: '变现渠道',
  标准广告场景: '标准广告场景',
  standard_scene: '标准广告场景',
  聚合广告场景: '聚合广告场景',
  aggregate_scene: '聚合广告场景',
};

// 指标关键词映射（SQL别名 -> 指标标签）
const METRIC_KEYWORDS: Record<string, string> = {
  注册用户: '注册用户',
  user_count: '注册用户',
  活跃用户: '活跃用户',
  active_user: '活跃用户',
  active_user_count: '活跃用户',
  曝光人数: '曝光人数',
  ad_user_count: '曝光人数',
  曝光次数: '曝光次数',
  ad_count: '曝光次数',
  点击次数: '点击次数',
  ad_click_count: '点击次数',
  广告收益: '广告收益',
  ad_profit: '广告收益',
  revenue_usd: '广告收益',
};

const API_URL = '/api/sql-templates';

function autoDetectTags(sql: string): { dimensions: string[]; metrics: string[] } {
  const detectedDimensions = new Set<string>();
  const detectedMetrics = new Set<string>();

  // 提取最后一个SELECT语句（主查询）中的AS别名
  // 找到最后一个SELECT的位置
  const lastSelectIndex = sql.lastIndexOf('SELECT');
  if (lastSelectIndex === -1) {
    return { dimensions: [], metrics: [] };
  }

  // 从最后一个SELECT开始截取到FROM或ORDER BY
  const mainQuery = sql.substring(lastSelectIndex);
  const fromIndex = mainQuery.search(/\bFROM\b/i);
  const selectPart = fromIndex !== -1 ? mainQuery.substring(0, fromIndex) : mainQuery;

  // 匹配 AS "中文别名" 或 AS '中文别名' 或 AS `中文别名`
  const aliasRegex = /AS\s+["'`]([^"'`]+)["'`]/gi;

  let match = aliasRegex.exec(selectPart);
  while (match !== null) {
    const alias = match[1];
    if (DIMENSION_KEYWORDS[alias]) {
      detectedDimensions.add(DIMENSION_KEYWORDS[alias]);
    }
    if (METRIC_KEYWORDS[alias]) {
      detectedMetrics.add(METRIC_KEYWORDS[alias]);
    }
    match = aliasRegex.exec(selectPart);
  }

  return {
    dimensions: Array.from(detectedDimensions),
    metrics: Array.from(detectedMetrics),
  };
}

const SQLTemplateModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [templates, setTemplates] = useState<SQLTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('走势分析');
  const [editDescription, setEditDescription] = useState('');
  const [editDimensions, setEditDimensions] = useState<string[]>([]);
  const [editMetrics, setEditMetrics] = useState<string[]>([]);
  const [editVerified, setEditVerified] = useState(false);
  const [editSql, setEditSql] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [showNewMenu, setShowNewMenu] = useState(false);
  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>
  >([]);
  const initializedRef = useRef(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = `toast_${Date.now()}`;
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadTemplates = useCallback(async (): Promise<SQLTemplate[]> => {
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error('Failed to load');
      const data: TemplatesData = await res.json();
      setTemplates(data.templates);
      return data.templates;
    } catch (err) {
      console.error('Failed to load SQL templates:', err);
      return [];
    }
  }, []);

  const saveTemplates = useCallback(async (newTemplates: SQLTemplate[]) => {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: newTemplates }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setTemplates(newTemplates);
    } catch (err) {
      console.error('Failed to save SQL templates:', err);
      throw err;
    }
  }, []);

  const initSelection = useCallback((all: SQLTemplate[]) => {
    if (all.length > 0) {
      setSelectedId(all[0].id);
      setEditName(all[0].name);
      setEditCategory(all[0].category);
      setEditDescription(all[0].description || '');
      setEditDimensions(all[0].dimensions || []);
      setEditMetrics(all[0].metrics || []);
      setEditVerified(all[0].verified || false);
      setEditSql(all[0].sql);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      return;
    }

    if (!initializedRef.current) {
      loadTemplates().then((all) => {
        initSelection(all);
        initializedRef.current = true;
      });
    }
  }, [isOpen, loadTemplates, initSelection]);

  useEffect(() => {
    if (!showNewMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNewMenu]);

  const handleTextareaScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      const t = templates.find((x) => x.id === id);
      if (t) {
        setSelectedId(id);
        setEditName(t.name);
        setEditCategory(t.category);
        setEditDescription(t.description || '');
        setEditDimensions(t.dimensions || []);
        setEditMetrics(t.metrics || []);
        setEditVerified(t.verified || false);
        setEditSql(t.sql);
        setCopied(false);
        setSaved(false);
        setDeleted(false);
      }
    },
    [templates]
  );

  const toggleDimension = useCallback((dim: string) => {
    setEditDimensions((prev) =>
      prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim]
    );
  }, []);

  const toggleMetric = useCallback((metric: string) => {
    setEditMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    );
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const now = Date.now();
      // 保存时自动检测标签
      const detected = autoDetectTags(editSql);
      const finalDimensions = detected.dimensions;
      const finalMetrics = detected.metrics;

      let newTemplates: SQLTemplate[];

      if (selectedId) {
        newTemplates = templates.map((t) =>
          t.id === selectedId
            ? {
                ...t,
                name: editName,
                category: editCategory,
                description: editDescription,
                dimensions: finalDimensions,
                metrics: finalMetrics,
                verified: editVerified,
                sql: editSql,
                updatedAt: now,
              }
            : t
        );
      } else {
        const newId = `template_${now}`;
        const newTemplate: SQLTemplate = {
          id: newId,
          name: editName,
          category: editCategory,
          description: editDescription,
          dimensions: finalDimensions,
          metrics: finalMetrics,
          verified: editVerified,
          sql: editSql,
          createdAt: now,
          updatedAt: now,
        };
        newTemplates = [...templates, newTemplate];
        setSelectedId(newId);
      }

      await saveTemplates(newTemplates);
      setSaved(true);
      addToast('模板已保存', 'success');
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save SQL template:', err);
      addToast('保存失败', 'error');
    }
  }, [
    selectedId,
    editName,
    editCategory,
    editDescription,
    editVerified,
    editSql,
    templates,
    saveTemplates,
    addToast,
  ]);

  const handleNew = useCallback(
    async (category: string) => {
      try {
        const now = Date.now();
        const newId = `template_${now}`;
        const newTemplate: SQLTemplate = {
          id: newId,
          name: '新建 SQL 模板',
          category,
          description: '',
          dimensions: [],
          metrics: [],
          verified: false,
          sql: '-- 在此编写 SQL\nSELECT * FROM daily_ad_monetization\nLIMIT 10;',
          createdAt: now,
          updatedAt: now,
        };

        const newTemplates = [...templates, newTemplate];
        await saveTemplates(newTemplates);

        setSelectedId(newId);
        setEditName('新建 SQL 模板');
        setEditCategory(category);
        setEditDescription('');
        setEditDimensions([]);
        setEditMetrics([]);
        setEditVerified(false);
        setEditSql('-- 在此编写 SQL\nSELECT * FROM daily_ad_monetization\nLIMIT 10;');
        setSaved(false);
        setShowNewMenu(false);
        addToast('新模板已创建', 'success');
      } catch (err) {
        console.error('Failed to create SQL template:', err);
        addToast('创建失败', 'error');
      }
    },
    [templates, saveTemplates, addToast]
  );

  const handleDelete = useCallback(async () => {
    if (!selectedId) return;

    try {
      const newTemplates = templates.filter((t) => t.id !== selectedId);
      await saveTemplates(newTemplates);

      setDeleted(true);
      addToast('模板已删除', 'success');
      setTimeout(() => setDeleted(false), 2000);

      if (newTemplates.length > 0) {
        setSelectedId(newTemplates[0].id);
        setEditName(newTemplates[0].name);
        setEditCategory(newTemplates[0].category);
        setEditDescription(newTemplates[0].description || '');
        setEditDimensions(newTemplates[0].dimensions || []);
        setEditMetrics(newTemplates[0].metrics || []);
        setEditVerified(newTemplates[0].verified || false);
        setEditSql(newTemplates[0].sql);
      } else {
        setSelectedId('');
        setEditName('');
        setEditCategory('走势分析');
        setEditDescription('');
        setEditDimensions([]);
        setEditMetrics([]);
        setEditVerified(false);
        setEditSql('');
      }
    } catch (err) {
      console.error('Failed to delete SQL template:', err);
      addToast('删除失败', 'error');
    }
  }, [selectedId, templates, saveTemplates, addToast]);

  const handleCopy = useCallback(() => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(editSql)
        .then(() => {
          setCopied(true);
          addToast('SQL 已复制到剪贴板', 'success');
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          addToast('复制失败', 'error');
        });
    } else {
      // Fallback for environments without clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = editSql;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        addToast('SQL 已复制到剪贴板', 'success');
        setTimeout(() => setCopied(false), 2000);
      } catch {
        addToast('复制失败', 'error');
      }
      document.body.removeChild(textArea);
    }
  }, [editSql, addToast]);

  if (!isOpen) return null;

  const selected = templates.find((t) => t.id === selectedId);
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    icon: CATEGORY_ICONS[cat],
    items: templates.filter((t) => t.category === cat),
  })).filter((g) => g.items.length > 0);

  const uncategorized = templates.filter((t) => !CATEGORY_ORDER.includes(t.category));

  return (
    <>
      <ToastManager toasts={toasts} onRemove={removeToast} />
      <div
        className={s.backdrop}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="SQL 模板管理"
      >
        <div className={s.container}>
          <header className={s.header}>
            <div className={s.headerLeft}>
              <div className={s.logo}>
                <Database />
              </div>
              <div>
                <h1 className={s.title}>原始数据 SQL 库</h1>
                <div className={s.pathRow}>
                  <FolderOpen size={12} />
                  <span className={s.path}>project/data/sql-templates.json</span>
                </div>
              </div>
            </div>
            <div className={s.headerActions}>
              <span className={s.connectedBadge}>
                <Check size={13} />
                局域网共享
              </span>
              <button type="button" className={s.closeBtn} onClick={onClose}>
                <X size={16} />
              </button>
            </div>
          </header>

          <div className={s.body}>
            <aside className={s.sidebar}>
              <div className={s.sidebarList}>
                {grouped.map((g) => (
                  <div key={g.category} className={s.group}>
                    <div className={s.groupHead}>
                      {g.icon}
                      <span>{g.category}</span>
                      <span className={s.groupCount}>{g.items.length}</span>
                    </div>
                    {g.items.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`${s.item} ${selectedId === t.id ? s.itemActive : ''}`}
                        onClick={() => handleSelect(t.id)}
                      >
                        <FileCode size={13} />
                        <div className={s.itemInfo}>
                          <span className={s.itemName}>{t.name}</span>
                          {t.description && <span className={s.itemDesc}>{t.description}</span>}
                        </div>
                        <span
                          className={`${s.statusDot} ${t.verified ? s.statusDotVerified : ''}`}
                          title={t.verified ? '已验证可用' : '未验证'}
                        />
                      </button>
                    ))}
                  </div>
                ))}
                {uncategorized.length > 0 && (
                  <div className={s.group}>
                    <div className={s.groupHead}>
                      <FileCode size={13} />
                      <span>其他</span>
                      <span className={s.groupCount}>{uncategorized.length}</span>
                    </div>
                    {uncategorized.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`${s.item} ${selectedId === t.id ? s.itemActive : ''}`}
                        onClick={() => handleSelect(t.id)}
                      >
                        <FileCode size={13} />
                        <div className={s.itemInfo}>
                          <span className={s.itemName}>{t.name}</span>
                          {t.description && <span className={s.itemDesc}>{t.description}</span>}
                        </div>
                        <span
                          className={`${s.statusDot} ${t.verified ? s.statusDotVerified : ''}`}
                          title={t.verified ? '已验证可用' : '未验证'}
                        />
                      </button>
                    ))}
                  </div>
                )}
                {templates.length === 0 && (
                  <div className={s.emptyState}>
                    <Database size={32} style={{ opacity: 0.3 }} />
                    <p>暂无 SQL 模板</p>
                    <p style={{ fontSize: 11 }}>点击下方按钮创建</p>
                  </div>
                )}
              </div>
              <div className={s.sidebarFooter}>
                <div className={s.newMenuWrap} ref={newMenuRef}>
                  <button
                    type="button"
                    className={s.btnNew}
                    onClick={() => setShowNewMenu(!showNewMenu)}
                  >
                    <Plus size={14} />
                    新建 SQL 模板
                  </button>
                  {showNewMenu && (
                    <div className={s.newMenu}>
                      <div className={s.newMenuTitle}>选择分析场景</div>
                      {CATEGORY_ORDER.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          className={s.newMenuItem}
                          onClick={() => handleNew(cat)}
                        >
                          {CATEGORY_ICONS[cat]}
                          <span>{cat}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </aside>

            <main className={s.editor}>
              {selected ? (
                <>
                  <div className={s.editorToolbar}>
                    <input
                      type="text"
                      className={s.nameInput}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="输入模板名称"
                    />
                    <select
                      className={s.categorySelect}
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                    >
                      {CATEGORY_ORDER.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <div className={s.toolbarActions}>
                      <button type="button" className={s.btn} onClick={handleCopy}>
                        {copied ? <Check size={13} /> : <Copy size={13} />}
                        {copied ? '已复制' : '复制'}
                      </button>
                      <button
                        type="button"
                        className={`${s.btn} ${s.btnPrimary}`}
                        onClick={handleSave}
                      >
                        {saved ? <Check size={13} /> : <Save size={13} />}
                        {saved ? '已保存' : '保存'}
                      </button>
                      <button
                        type="button"
                        className={`${s.btn} ${s.btnDanger}`}
                        onClick={handleDelete}
                      >
                        {deleted ? <Check size={13} /> : <Trash2 size={13} />}
                        {deleted ? '已删除' : '删除'}
                      </button>
                    </div>
                  </div>

                  <div className={s.metadataSection}>
                    <div className={s.metadataRow}>
                      <span className={s.metadataLabel}>描述</span>
                      <input
                        type="text"
                        className={s.metadataInput}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="输入模板描述（可选）"
                      />
                    </div>
                    <div className={s.metadataRow}>
                      <span className={s.metadataLabel}>状态</span>
                      <button
                        type="button"
                        className={`${s.toggleBtn} ${editVerified ? s.toggleBtnActive : ''}`}
                        onClick={() => setEditVerified(!editVerified)}
                      >
                        <span
                          className={`${s.toggleDot} ${editVerified ? s.toggleDotActive : ''}`}
                        />
                        <span>{editVerified ? '已验证可用' : '未验证'}</span>
                      </button>
                    </div>
                    <div className={s.metadataRow}>
                      <span className={s.metadataLabel}>
                        <Tag size={12} />
                        属性维度
                      </span>
                      <div className={s.tagList}>
                        {DIMENSION_OPTIONS_ATTR.map((dim) => (
                          <button
                            key={dim}
                            type="button"
                            className={`${s.tag} ${editDimensions.includes(dim) ? s.tagActive : ''}`}
                            onClick={() => toggleDimension(dim)}
                          >
                            {dim}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={s.metadataRow}>
                      <span className={s.metadataLabel}>
                        <Tag size={12} />
                        行为维度
                      </span>
                      <div className={s.tagList}>
                        {DIMENSION_OPTIONS_BEHAV.map((dim) => (
                          <button
                            key={dim}
                            type="button"
                            className={`${s.tag} ${editDimensions.includes(dim) ? s.tagActive : ''}`}
                            onClick={() => toggleDimension(dim)}
                          >
                            {dim}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={s.metadataRow}>
                      <span className={s.metadataLabel}>
                        <Tag size={12} />
                        指标标签
                      </span>
                      <div className={s.tagList}>
                        {METRIC_OPTIONS.map((metric) => (
                          <button
                            key={metric}
                            type="button"
                            className={`${s.tag} ${s.tagMetric} ${editMetrics.includes(metric) ? s.tagMetricActive : ''}`}
                            onClick={() => toggleMetric(metric)}
                          >
                            {metric}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className={s.editorArea}>
                    <div className={s.lineNumbers} ref={lineNumbersRef}>
                      <div className={s.lineNumbersInner}>
                        {Array.from(
                          { length: editSql.split('\n').length },
                          (_, lineNumber) => lineNumber + 1
                        ).map((lineNumber) => (
                          <span key={`line-${lineNumber}`}>{lineNumber}</span>
                        ))}
                      </div>
                    </div>
                    <textarea
                      ref={textareaRef}
                      className={s.codeArea}
                      value={editSql}
                      onChange={(e) => setEditSql(e.target.value)}
                      onScroll={handleTextareaScroll}
                      spellCheck={false}
                      placeholder="在此编写 SQL 语句..."
                    />
                  </div>
                </>
              ) : (
                <div className={s.empty}>
                  <Database size={48} style={{ opacity: 0.3 }} />
                  <p>选择左侧模板查看 SQL</p>
                  <p style={{ fontSize: 12, color: '#747685' }}>或点击「新建 SQL 模板」创建</p>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
};

export default SQLTemplateModal;
