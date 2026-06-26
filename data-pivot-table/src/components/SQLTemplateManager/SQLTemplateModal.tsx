import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  FileCode,
  FolderOpen,
  GitCompareArrows,
  History,
  Plus,
  Save,
  Tag,
  Terminal,
  Trash2,
  TrendingUp,
  Wand2,
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

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS',
  'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER',
  'DROP', 'WITH', 'UNION', 'ALL', 'DISTINCT', 'NULL', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'EXISTS',
  'CAST', 'COALESCE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'OVER', 'PARTITION', 'ROW_NUMBER',
  'RANK', 'DENSE', 'DESC', 'ASC', 'FETCH', 'NEXT', 'ROWS', 'ONLY', 'TABLE', 'VIEW', 'INDEX',
  'IF', 'IS', 'TRUE', 'FALSE', 'INTERVAL', 'CURRENT_DATE', 'CURRENT_TIMESTAMP', 'DATE_TRUNC',
]);

function formatSql(sql: string): string {
  let result = sql.replace(/--[^\n]*/g, (m) => `__COMMENT_${btoa(m)}__`);
  result = result.replace(/\s+/g, ' ').trim();

  const newlineBefore = [
    'WITH', 'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'GROUP BY', 'ORDER BY',
    'HAVING', 'LIMIT', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'CROSS JOIN',
    'FULL JOIN', 'ON', 'UNION', 'UNION ALL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  ];

  for (const kw of newlineBefore) {
    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
    result = result.replace(regex, `\n${kw}`);
  }

  result = result.replace(/,/g, ',\n  ');
  result = result.replace(/\(\s*SELECT/gi, '(\n  SELECT');
  result = result.replace(/\)\s*(AS|,|\))/gi, '\n)$1');

  result = result.replace(
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
    (match) => {
      const upper = match.toUpperCase();
      if (SQL_KEYWORDS.has(upper)) return upper;
      return match;
    }
  );

  result = result.replace(
    /__COMMENT_([A-Za-z0-9+/=]+)__/g,
    (_, encoded) => atob(encoded)
  );

  const lines = result.split('\n');
  let indent = 0;
  const formatted: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(')') || trimmed.startsWith('END')) indent = Math.max(0, indent - 1);
    formatted.push('  '.repeat(indent) + trimmed);
    if (
      trimmed.endsWith('(') ||
      (/\b(CASE|WITH|SELECT|FROM|WHERE|GROUP|ORDER|HAVING|JOIN|ON|AND|OR|UNION)\b/i.test(trimmed) &&
        !trimmed.endsWith(';') && !trimmed.endsWith(')'))
    ) {
      indent++;
    }
  }

  return formatted.join('\n');
}

interface SimulateResult {
  valid: boolean;
  error?: string;
  columns?: { name: string; type: 'dimension' | 'metric' }[];
  rows?: string[][];
  summary?: string;
}

const MOCK_DIMENSION_DATA: Record<string, string[]> = {
  日期: ['2025-06-20', '2025-06-21', '2025-06-22'],
  安装日期: ['2025-06-15', '2025-06-16', '2025-06-17'],
  国家: ['US', 'JP', 'DE'],
  应用: ['fr001b', 'fr002b', 'fr004'],
  版本: ['1.2.0', '1.2.1', '1.3.0'],
  买量渠道: ['facebook', 'google', 'tiktok'],
  标准广告场景: ['1冷启动', '2热启动', '3新手插屏'],
  聚合广告场景: ['1冷启动', '2热启动', '3新手插屏'],
  广告类型: ['interstitial', 'banner', 'rewarded'],
  变现渠道: ['admob', 'unity', 'applovin'],
  生命周期: ['0', '1', '3'],
};

const MOCK_METRIC_DATA: Record<string, string[]> = {
  注册用户: ['1,280', '956', '2,103'],
  活跃用户: ['8,420', '6,315', '12,050'],
  曝光人数: ['5,630', '4,210', '8,740'],
  曝光次数: ['42,800', '31,500', '65,200'],
  点击次数: ['3,120', '2,340', '4,890'],
  广告收益: ['$1,245.30', '$923.18', '$1,876.50'],
};

function simulateSql(sql: string): SimulateResult {
  const trimmed = sql.trim();
  if (!trimmed) return { valid: false, error: 'SQL 为空' };

  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    return { valid: false, error: `括号不匹配：${openParens} 个左括号，${closeParens} 个右括号` };
  }

  const hasSelect = /\bSELECT\b/i.test(trimmed);
  const hasFrom = /\bFROM\b/i.test(trimmed);
  if (hasSelect && !hasFrom) {
    return { valid: false, error: 'SELECT 语句缺少 FROM 子句' };
  }

  const cteMatch = trimmed.match(/\bWITH\b\s+(\w+)\s+AS\s*\(/gi);
  if (cteMatch) {
    const cteNames = [...trimmed.matchAll(/\bWITH\b\s+(\w+)\s+AS\s*\(/gi)].map((m) =>
      m[1].toLowerCase()
    );
    for (const name of cteNames) {
      const usageRegex = new RegExp(`\\bFROM\\s+${name}\\b|\\bJOIN\\s+${name}\\b`, 'i');
      if (!usageRegex.test(trimmed)) {
        return { valid: false, error: `CTE "${name}" 定义但未被引用` };
      }
    }
  }

  // Extract columns from last SELECT
  const lastSelectIdx = trimmed.lastIndexOf('SELECT');
  if (lastSelectIdx === -1) {
    return { valid: false, error: '未找到 SELECT 语句' };
  }

  const afterSelect = trimmed.substring(lastSelectIdx + 6);
  const fromIdx = afterSelect.search(/\bFROM\b/i);
  const selectClause = fromIdx !== -1 ? afterSelect.substring(0, fromIdx) : afterSelect;

  // Parse "expr AS alias" patterns
  const aliasRegex = /AS\s+["'`]([^"'`]+)["'`]/gi;
  const columns: { name: string; type: 'dimension' | 'metric' }[] = [];
  let match = aliasRegex.exec(selectClause);
  while (match !== null) {
    const alias = match[1];
    const isMetric = Object.keys(MOCK_METRIC_DATA).some(
      (k) => k === alias || METRIC_KEYWORDS[alias] === k
    );
    columns.push({ name: alias, type: isMetric ? 'metric' : 'dimension' });
    match = aliasRegex.exec(selectClause);
  }

  if (columns.length === 0) {
    return { valid: false, error: '未检测到列别名（AS "别名"），请确认 SQL 使用了中文双引号别名' };
  }

  // Generate mock rows
  const rowCount = 3;
  const rows: string[][] = [];
  for (let i = 0; i < rowCount; i++) {
    const row: string[] = [];
    for (const col of columns) {
      if (col.type === 'dimension') {
        const data = MOCK_DIMENSION_DATA[col.name];
        row.push(data ? data[i % data.length] : `dim_${i + 1}`);
      } else {
        const data = MOCK_METRIC_DATA[col.name];
        row.push(data ? data[i % data.length] : `${(i + 1) * 100}`);
      }
    }
    rows.push(row);
  }

  const dimCount = columns.filter((c) => c.type === 'dimension').length;
  const metCount = columns.filter((c) => c.type === 'metric').length;

  return {
    valid: true,
    columns,
    rows,
    summary: `模拟执行成功  |  ${columns.length} 列  |  ${dimCount} 维度 + ${metCount} 指标  |  ${rowCount} 行预览`,
  };
}

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
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleContent, setConsoleContent] = useState('');
  const [consoleType, setConsoleType] = useState<'info' | 'error' | 'success'>('info');
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
        setConsoleContent('');
        setConsoleType('info');
        setSimResult(null);
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

  const handleFormatSql = useCallback(() => {
    try {
      const formatted = formatSql(editSql);
      setEditSql(formatted);
      addToast('SQL 已格式化', 'success');
    } catch {
      addToast('格式化失败', 'error');
    }
  }, [editSql, addToast]);

  const [simResult, setSimResult] = useState<SimulateResult | null>(null);

  const handleValidate = useCallback(() => {
    const result = simulateSql(editSql);
    setSimResult(result);
    setConsoleOpen(true);
    setConsoleType(result.valid ? 'success' : 'error');
  }, [editSql]);

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
                    <div className={s.titleRow}>
                      <input
                        type="text"
                        className={s.nameTitle}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="输入模板名称"
                      />
                      <span
                        className={`${s.verifiedBadge} ${editVerified ? s.verifiedBadgeActive : ''}`}
                        onClick={() => setEditVerified(!editVerified)}
                        title="点击切换验证状态"
                      >
                        <Check size={12} />
                        {editVerified ? '已验证' : '待验证'}
                      </span>
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
                    </div>
                    <div className={s.descRow}>
                      <input
                        type="text"
                        className={s.descInput}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="输入模板描述（可选）"
                      />
                      <div className={s.toolbarActions}>
                        <button type="button" className={s.btnIcon} onClick={handleCopy} title="复制 SQL">
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                        <button type="button" className={s.btnIcon} onClick={handleFormatSql} title="格式化 SQL">
                          <Wand2 size={14} />
                        </button>
                        <button
                          type="button"
                          className={`${s.btnIcon} ${s.btnIconDanger}`}
                          onClick={handleDelete}
                          title="删除模板"
                        >
                          {deleted ? <Check size={14} /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className={s.metadataSection}>
                    <div className={s.autoTagHint}>
                      标签由 SQL 别名自动检测，保存时更新
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

                  {consoleOpen && (
                    <div className={`${s.consolePanel} ${s[`console_${consoleType}`]}`}>
                      {!simResult && (
                        <div className={s.consolePlaceholder}>
                          <Terminal size={13} />
                          <span>点击「验证 SQL」模拟执行查询</span>
                        </div>
                      )}
                      {simResult && !simResult.valid && (
                        <div className={s.consoleError}>
                          <Terminal size={13} />
                          <span>{simResult.error}</span>
                        </div>
                      )}
                      {simResult && simResult.valid && simResult.columns && simResult.rows && (
                        <div className={s.consoleResult}>
                          <div className={s.consoleSummary}>
                            <Terminal size={13} />
                            <span>{simResult.summary}</span>
                          </div>
                          <div className={s.tableWrap}>
                            <table className={s.previewTable}>
                              <thead>
                                <tr>
                                  {simResult.columns.map((col) => (
                                    <th
                                      key={col.name}
                                      className={col.type === 'metric' ? s.thMetric : s.thDim}
                                    >
                                      {col.name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {simResult.rows.map((row, ri) => (
                                  <tr key={`row-${ri}`}>
                                    {row.map((cell, ci) => (
                                      <td
                                        key={`cell-${ri}-${ci}`}
                                        className={
                                          simResult.columns?.[ci]?.type === 'metric'
                                            ? s.tdMetric
                                            : s.tdDim
                                        }
                                      >
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={s.bottomBar}>
                    <button type="button" className={s.btnValidate} onClick={handleValidate}>
                      <Terminal size={14} />
                      验证 SQL
                    </button>
                    <div className={s.bottomBarRight}>
                      <button
                        type="button"
                        className={s.btnConsole}
                        onClick={() => setConsoleOpen(!consoleOpen)}
                      >
                        {consoleOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        控制台
                      </button>
                      <button
                        type="button"
                        className={`${s.btn} ${s.btnPrimary}`}
                        onClick={handleSave}
                      >
                        {saved ? <Check size={13} /> : <Save size={13} />}
                        {saved ? '已保存' : '保存模板'}
                      </button>
                    </div>
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
