# 数据透视表分析工具

基于 React 19 + TypeScript 的交互式数据透视表应用，支持 Excel/CSV 文件导入、字段拖拽配置、多维筛选和实时数据分析。

## 功能特性

- **文件导入**: 支持 Excel (.xlsx/.xls) 和 CSV 文件拖拽上传，Web Worker 后台解析不阻塞 UI
- **智能识别**: 自动区分维度字段和指标字段，支持中英文字段名模糊匹配
- **勾选配置**: 通过 checkbox 勾选字段到行/列/值区域，支持区域内拖拽排序
- **实时筛选**: 顶栏筛选器支持按日期、应用、版本、渠道、国家、标准广告场景、聚合广告场景多维筛选，筛选器之间联动
- **筛选重置**: 每个筛选项支持单独重置（点击 X 图标），也可一键重置所有筛选
- **数据聚合**: 支持求和、平均、计数、最小、最大聚合方式
- **计算字段**: 内置 eCPM、CTR、ARPU、渗透率、IPU 五个常用指标（加权计算）
- **双值轴**: 支持将指标放在行轴或列轴
- **配置管理**: 支持保存/加载透视表配置，支持模板快速应用
- **数据持久化**: 使用 IndexedDB 本地存储数据集和配置，刷新页面不丢失
- **沉浸模式**: 按 F 进入沉浸模式，隐藏侧边栏和顶栏，专注数据查看，支持全屏
- **虚拟滚动**: 大数据量场景下自动启用虚拟滚动，保证流畅渲染
- **场景映射**: 支持标准广告场景与聚合广告场景的字段拆分

---

## 快速启动

### 前置要求
- Node.js >= 18
- npm >= 9

### 启动

```bash
cd data-pivot-table
npm install
npm run dev
```

然后访问 http://localhost:5173/

---

## 使用指南

### 1. 上传数据
- 将 Excel 或 CSV 文件拖拽到顶部上传区域
- 或点击上传区域选择文件
- 支持自动检测文件编码（UTF-8、GBK 等）

### 2. 配置字段
- **值配置区**: 勾选指标字段（如注册用户、eCPM 等）
- **行配置区**: 勾选维度字段作为行标题（如国家、应用）
- **列配置区**: 勾选维度字段作为列标题（如广告场景）
- 同一维度字段不能同时出现在行和列区域
- 已启用的字段可通过拖拽手柄调整顺序

### 3. 筛选数据
- 顶部筛选栏支持按维度筛选数据
- 点击筛选 chip 展开下拉菜单，支持搜索和全选
- 激活的筛选项右侧显示 X 图标，点击可单独重置
- 底部显示"重置"按钮可一键清除所有筛选条件
- 非日期筛选器之间自动联动，只显示已筛选范围内的可选值

### 4. 沉浸模式
- 按 `F` 键或点击顶栏按钮进入，隐藏侧边栏和顶栏
- 顶部悬浮控制条可切换行/列总计、进入全屏
- 按 `Esc` 退出

### 5. 配置管理
- 支持保存当前透视表配置（行列值维度 + 筛选条件）
- 支持从已保存的配置列表中快速加载
- 内置常用模板（按国家分析、按渠道分析等）

---

## 内置计算字段

| 指标 | 公式 | 说明 |
|------|------|------|
| eCPM | (广告收益 / 曝光次数) × 1000 | 千次展示收益 |
| CTR | 点击次数 / 曝光次数 | 点击率 |
| ARPU | 广告收益 / 注册用户 | 每用户平均收益 |
| 渗透率 | 曝光人数 / 注册用户 | 广告触达率 |
| IPU | 曝光次数 / 注册用户 | 人均曝光次数 |

### 指标准确性保障

所有计算指标均采用**加权聚合**而非简单平均，确保数据准确性：

| 指标 | 为什么准确 |
|------|-----------|
| eCPM | 先聚合总收益和总曝光，再做除法。而非先算每天 eCPM 再平均（会因曝光量权重不同产生偏差） |
| ARPU | 基于聚合后的总收益 / 总注册用户，避免低注册量日期的 ARPU 异常值拉偏均值 |
| 渗透率 | 使用 ALL 行的去重曝光人数，避免跨广告场景重复计数 |
| IPU | 同上，基于去重后的聚合数据计算 |
| CTR | 先聚合总点击和总曝光，比率不受各场景权重差异影响 |

**半可加指标处理**：`注册用户`和`曝光人数`是半可加指标（每个场景行都包含去重后的总量，不能直接求和）。聚合引擎通过 `SEMI_ADDITIVE_SUM_METRICS` 机制，在计算总计/小计时自动使用 ALL 行的值而非简单求和，避免数值膨胀。

**ALL 行过滤机制**：当数据包含广告场景维度时，系统自动识别并优先使用 `ALL` 行（包含去重后的真实聚合值），避免曝光人数等状态指标在不同场景间重复求和导致数值膨胀。

---

## 数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| 日期 | 维度 | 数据日期 |
| 国家 | 维度 | 国家代码 |
| 应用 | 维度 | 应用标识 |
| 渠道 | 维度 | 买量渠道 |
| 版本 | 维度 | 应用版本 |
| 标准广告场景 | 维度 | 场景一级分类（L1） |
| 聚合广告场景 | 维度 | 场景二级分类（L2） |
| 注册用户 | 指标 | 新注册用户数（半可加） |
| 曝光人数 | 指标 | 曝光独立用户数-去重（半可加） |
| 曝光次数 | 指标 | 曝光总次数 |
| 广告收益 | 指标 | 广告收益 (USD) |
| 点击次数 | 指标 | 广告点击总次数 |

---

## 技术栈

- **前端框架**: React 19 + TypeScript
- **构建工具**: Vite
- **拖拽库**: @dnd-kit
- **Excel解析**: xlsx (SheetJS)
- **动画库**: GSAP
- **存储**: IndexedDB (idb)
- **代码格式化**: Biome
- **单元测试**: Vitest + Testing Library
- **端到端测试**: Playwright

## 项目结构

```
data-pivot-table/
├── src/
│   ├── components/
│   │   ├── AdMobFilterBar/         # 顶栏筛选器（日期范围、单项重置、联动）
│   │   │   ├── AdMobFilterBar.tsx
│   │   │   └── DateRangeFilterChip.tsx
│   │   ├── ConfigManager/          # 配置管理（保存/加载/模板）
│   │   ├── DataSourceManager/      # 数据源管理（IndexedDB 数据集列表）
│   │   ├── FileUpload/             # 文件上传（拖拽 + 编码检测）
│   │   ├── PivotTable/             # 透视表渲染
│   │   │   ├── PivotTable.tsx      # 主组件（自动选择树形/扁平模式）
│   │   │   ├── TreePivotTable.tsx  # 树形透视表
│   │   │   ├── FlatPivotTable.tsx  # 扁平透视表
│   │   │   └── pivotTableUtils.ts  # 表格工具函数
│   │   ├── SpatialFieldZone.tsx    # 空间字段区域（行/列/值拖拽区）
│   │   ├── FloatingControlBar.tsx  # 沉浸模式悬浮控制条
│   │   ├── ZenModeButton.tsx       # 沉浸模式按钮
│   │   └── TemplateSelector/       # 配置模板选择器
│   ├── hooks/
│   │   ├── usePivotState.ts        # 透视表核心状态（数据/字段/筛选/聚合）
│   │   ├── useDatasetManager.ts    # 数据集 CRUD + IndexedDB 持久化
│   │   ├── useConfigs.ts           # 配置管理 hook
│   │   ├── useDragAndDrop.ts       # 拖拽逻辑（@dnd-kit 封装）
│   │   ├── useVirtualScroll.ts     # 虚拟滚动（大数据量优化）
│   │   └── useZenMode.ts           # 沉浸模式（全屏 + 快捷键）
│   ├── utils/
│   │   ├── aggregator.ts           # 数据聚合引擎（半可加指标、ALL 行过滤）
│   │   ├── calculatedField.ts      # 计算字段（加权公式求值）
│   │   ├── fieldDetector.ts        # 字段类型自动检测
│   │   ├── fieldHelpers.ts         # 字段工具函数
│   │   ├── fileParser.ts           # Excel/CSV 解析（编码检测）
│   │   ├── dataPreprocessor.ts     # 数据预处理
│   │   ├── formatters.ts           # 数字/日期格式化
│   │   ├── countryMapper.ts        # 国家代码映射
│   │   ├── rowSpanCalculator.ts    # 行合并计算
│   │   ├── textHighlighter.ts      # 文本高亮（筛选搜索）
│   │   ├── encodingUtils.ts        # 编码检测工具
│   │   ├── storageUtils.ts         # 存储工具函数
│   │   ├── animations.ts           # GSAP 动画封装
│   │   └── __tests__/              # 单元测试
│   ├── workers/
│   │   ├── csvWorker.ts            # CSV 解析 Web Worker
│   │   └── workerBridge.ts         # Worker 通信桥接
│   ├── services/
│   │   └── storage.ts              # IndexedDB 存储服务（数据集/配置/偏好）
│   ├── styles/
│   │   ├── variables.css           # CSS 变量（含深色模式）
│   │   └── global.css              # 全局样式
│   ├── types/
│   │   ├── index.ts                # 核心类型（DataRow, Field, PivotField, FilterConfig）
│   │   └── storage.ts              # 存储类型（StoredDataset, StoredConfig）
│   ├── App.tsx                     # 主应用组件
│   ├── App.css                     # 应用样式
│   └── main.tsx                    # 入口文件
├── e2e/                            # Playwright 端到端测试
├── docs/                           # 项目文档
├── index.html                      # HTML 入口
├── vite.config.ts                  # Vite 配置
├── vitest.config.ts                # Vitest 配置
├── playwright.config.ts            # Playwright 配置
├── eslint.config.js                # ESLint 配置
└── package.json
```

## 可用脚本

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建结果 |
| `npm run test` | 运行单元测试（watch 模式） |
| `npm run test:run` | 运行单元测试一次 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run test:e2e` | 运行 Playwright 端到端测试 |
| `npm run format` | Biome 格式化代码 |
| `npm run lint:biome` | Biome lint 检查 |
| `npm run check` | Biome 格式化 + lint |
