# AGENTS.md

## Commands

```bash
npm run dev      # 开发服务器 (localhost:5173)
npm run build    # tsc -b && vite build
npm run lint     # eslint .
npm run preview  # 预览构建产物
```

Lint 必须在提交前运行。已知的 2 个既有错误（DateRangeFilterChip.tsx:151, PivotTable.tsx:37）可忽略。

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

## Drag & Drop

使用 `@dnd-kit/core` + `@dnd-kit/sortable`。

**跨区拖拽规则**:
- 行 ↔ 列：允许（维度互转）
- 值 ↔ 行/列：禁止（指标与维度隔离）

校验逻辑在 `src/utils/fieldHelpers.ts`（`canDropToZone`）。

**Inner Target 策略**: GSAP 动画绑定在 `.field-capsule-inner`，外层 DOM 留给 dnd-kit 的 transform。

## CSS System

**变量**: `App.css` 顶部的 `:root` 块

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

## Responsive Breakpoints

- `1920px` - 大屏居中
- `1440px` - 增加表格间距
- `1280px` - 左侧面板缩窄至 240px
- `1024px` - 布局转为上下结构
