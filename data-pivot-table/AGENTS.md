# AGENTS.md

## Commands

```bash
npm run dev          # 开发服务器 (localhost:5173)
npm run build        # tsc -b && vite build
npm run lint         # eslint .
npm run lint:biome   # biome lint ./src
npm run format       # biome format --write ./src
npm run format:check # biome format ./src
npm run check        # biome check --write ./src
npm run test         # vitest (watch 模式)
npm run test:run     # vitest run
npm run test:coverage # vitest run --coverage
npm run test:e2e     # playwright test
npm run test:e2e:ui  # playwright test --ui
npm run test:e2e:debug # playwright test --debug
npm run preview      # 预览构建产物
```

Lint 必须在提交前运行。使用 `npm run check` 进行格式化和 lint 检查。

## Architecture

单页 React 19 应用，数据透视表工具。

**入口**: `src/main.tsx` → `src/App.tsx`

**核心数据流**:
1. 文件上传 (`FileUpload`) → 解析 (`utils/fileParser.ts`)
2. 字段检测 (`utils/fieldDetector.ts`) → 区分维度/指标
3. 用户配置行/列/值 → 聚合 (`utils/aggregator.ts`)
4. 渲染透视表 (`components/PivotTable/PivotTable.tsx`)

**关键类型**: `src/types/index.ts`
- `PivotResult.rowHeaders`: `string[][]`（二维数组，非字符串拼接）
- `PivotResult.rowDimensions`: 行维度名称列表
- `PivotResult.valueAxis`: `'rows' | 'columns'`

## Custom Hooks

应用使用自定义 hooks 管理状态：

- `usePivotState` - 透视表状态（字段、数据、行/列/值配置）
- `useDatasetManager` - 数据集管理（存储、配额）
- `useDragAndDrop` - 拖拽逻辑
- `useMappings` - 映射管理
- `useConfigs` - 配置管理

## Drag & Drop

使用 `@dnd-kit/core` + `@dnd-kit/sortable`。

**跨区拖拽规则**:
- 行 ↔ 列：允许（维度互转）
- 值 ↔ 行/列：禁止（指标与维度隔离）

校验逻辑在 `src/utils/fieldHelpers.ts`（`canDropToZone`）。

**Inner Target 策略**: GSAP 动画绑定在 `.field-capsule-inner`，外层 DOM 留给 dnd-kit 的 transform。

## CSS System

**变量**: `src/styles/variables.css`

**全局样式**: `src/styles/global.css`

**组件样式**: 各组件目录下的 `.module.css` 文件

**色彩**: OKLCH 色彩系统 + Hex 降级
- 值配置区: `--color-values-bg/border`
- 行配置区: `--color-rows-bg/border`
- 列配置区: `--color-cols-bg/border`

**深色模式**: `[data-theme="dark"]` 手动触发（非 `prefers-color-scheme`）

**圆角分级**:
- `--radius-container: 12px` - 容器
- `--radius-card: 8px` - 卡片
- `--radius-element: 6px` - 按钮/输入框
- `--radius-capsule: 9999px` - 胶囊标签

**字体**: Inter（`@fontsource/inter`），数字等宽 `font-variant-numeric: tabular-nums`

## PivotTable rowSpan

行维度并排展示，外层维度使用 `rowSpan` 合并。

计算工具: `src/utils/rowSpanCalculator.ts`
- `calculateAllRowSpans(rowHeaders, dimensionCount)` 返回 `number[][]`
- 已用 `useMemo` 缓存，避免 Hover 触发重算

总计行合并所有维度列（`colSpan = dimensionCount`）。

## Animation

GSAP 工具: `src/utils/animations.ts`
- `playCheckboxScale(element)` - 勾选弹性缩放
- `animateFieldEntry(element)` - 字段落位淡入

## Testing

**单元测试**: Vitest + Testing Library
- 测试文件: `src/utils/__tests__/*.test.ts`
- 运行: `npm run test:run`

**端到端测试**: Playwright
- 测试文件: `e2e/*.spec.ts`
- 运行: `npm run test:e2e`

## Responsive Breakpoints

- `1920px` - 大屏居中
- `1440px` - 增加表格间距
- `1280px` - 左侧面板缩窄至 240px
- `1024px` - 布局转为上下结构
