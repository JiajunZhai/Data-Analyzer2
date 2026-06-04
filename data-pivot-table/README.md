# 📊 数据透视表分析工具

一个基于 React + TypeScript 的交互式数据透视表应用，支持 Excel/CSV 文件导入、字段勾选配置和实时数据分析。

## ✨ 功能特性

- **文件导入**: 支持 Excel (.xlsx/.xls) 和 CSV 文件拖拽上传
- **智能识别**: 自动区分维度字段和指标字段
- **勾选配置**: 通过 checkbox 勾选字段到行/列/值区域，支持区域内拖拽排序
- **实时筛选**: 顶栏筛选器支持按日期、应用、版本、渠道、国家、广告场景多维筛选
- **数据聚合**: 支持求和、平均、计数、最小、最大聚合方式
- **计算字段**: 内置 eCPM、CTR、ARPU、渗透率、IPU 五个常用指标（加权计算）
- **双值轴**: 支持将指标放在行轴或列轴
- **场景映射**: 支持导入场景映射 CSV，自动转换广告场景名称
- **配置管理**: 支持保存/加载透视表配置
- **数据持久化**: 使用 IndexedDB 本地存储数据集和配置

## 🚀 快速启动

### 前置要求
- Node.js >= 18
- npm >= 9

### 安装步骤

1. 进入项目目录
   ```bash
   cd data-pivot-table
   ```

2. 安装依赖
   ```bash
   npm install
   ```

3. 启动开发服务器
   ```bash
   npm run dev
   ```

4. 打开浏览器访问
   ```
   http://localhost:5173/
   ```

或直接运行项目根目录的 `启动.bat` 一键启动。

## 📖 使用指南

### 1. 上传数据
- 将 Excel 或 CSV 文件拖拽到顶部上传区域
- 或点击上传区域选择文件

### 2. 配置字段
- **值配置区**: 勾选指标字段（如注册用户、eCPM 等）
- **行配置区**: 勾选维度字段作为行标题（如国家、应用）
- **列配置区**: 勾选维度字段作为列标题（如广告场景）
- 同一维度字段不能同时出现在行和列区域
- 已启用的字段可通过拖拽 ⋮⋮ 手柄调整顺序

### 3. 筛选数据
- 顶部筛选栏支持按维度筛选数据
- 点击筛选 chip 展开下拉菜单，支持搜索和全选
- 默认显示全部数据

### 4. 查看结果
- 透视表实时渲染，无需点击生成按钮
- 行总计和列总计自动计算
- 计算指标（如 eCPM）基于聚合后的基础指标加权计算

## 📐 内置计算字段

| 指标 | 公式 | 说明 |
|------|------|------|
| eCPM | (广告收益 / 曝光次数) × 1000 | 千次展示收益 |
| CTR | 点击次数 / 曝光次数 | 点击率 |
| ARPU | 广告收益 / 注册用户 | 每用户平均收益 |
| 渗透率 | 曝光人数 / 注册用户 | 广告触达率 |
| IPU | 曝光次数 / 注册用户 | 人均曝光次数 |

## 📐 数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| 日期 | 维度 | 数据日期 |
| 国家 | 维度 | 国家代码 |
| 应用 | 维度 | 应用标识 |
| 渠道 | 维度 | 买量渠道 |
| 版本 | 维度 | 应用版本 |
| 广告场景 | 维度 | 广告场景名称 |
| 注册用户 | 指标 | 新注册用户数 |
| 曝光人数 | 指标 | 广告曝光独立用户数 |
| 曝光次数 | 指标 | 广告曝光总次数 |
| 广告收益 | 指标 | 广告收益 (USD) |
| 点击次数 | 指标 | 广告点击总次数 |

## 🛠️ 技术栈

- **前端框架**: React 19 + TypeScript 6
- **构建工具**: Vite 8
- **拖拽库**: @dnd-kit
- **Excel解析**: xlsx (SheetJS)
- **动画库**: GSAP
- **存储**: IndexedDB (idb)
- **代码格式化**: Biome
- **单元测试**: Vitest + Testing Library
- **端到端测试**: Playwright

## 📦 项目结构

```
src/
├── components/
│   ├── AdMobFilterBar/    # 顶栏筛选器组件
│   ├── ConfigManager/     # 配置管理组件
│   ├── DataSourceManager/ # 数据源管理组件
│   ├── FileUpload/        # 文件上传组件
│   ├── MappingManager/    # 映射管理组件
│   ├── PivotTable/        # 透视表渲染组件
│   └── SpatialFieldZone   # 空间字段区域组件
├── hooks/                 # 自定义 Hooks
│   ├── usePivotState.ts   # 透视表状态管理
│   ├── useDatasetManager.ts # 数据集管理
│   ├── useDragAndDrop.ts  # 拖拽逻辑
│   ├── useMappings.ts     # 映射管理
│   └── useConfigs.ts      # 配置管理
├── services/
│   └── storage.ts         # IndexedDB 存储服务
├── styles/                # 样式文件
│   ├── variables.css      # CSS 变量
│   └── global.css         # 全局样式
├── types/                 # TypeScript 类型定义
├── utils/
│   ├── aggregator.ts      # 数据聚合引擎
│   ├── calculatedField.ts # 计算字段逻辑
│   ├── fieldDetector.ts   # 字段类型自动检测
│   ├── fileParser.ts      # Excel/CSV 文件解析
│   └── __tests__/         # 单元测试
├── App.tsx                # 主应用组件
└── App.css                # 样式文件
```

## 🔧 可用脚本

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建结果 |
| `npm run test` | 运行单元测试（watch 模式） |
| `npm run test:run` | 运行单元测试一次 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run test:e2e` | 运行 Playwright 端到端测试 |
| `npm run test:e2e:ui` | 打开 Playwright UI |
| `npm run format` | Biome 格式化代码 |
| `npm run format:check` | 检查代码格式 |
| `npm run lint:biome` | Biome lint 检查 |
| `npm run check` | Biome 格式化 + lint |

## 🧪 测试

### 单元测试
```bash
# 运行测试（watch 模式）
npm run test

# 运行测试一次
npm run test:run

# 运行测试并生成覆盖率
npm run test:coverage
```

### 端到端测试
```bash
# 运行 Playwright 测试
npm run test:e2e

# 打开 Playwright UI
npm run test:e2e:ui

# 调试模式
npm run test:e2e:debug
```

## 📄 License

MIT
