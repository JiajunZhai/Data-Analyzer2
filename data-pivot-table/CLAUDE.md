# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个基于 React 19 + TypeScript + Vite 的数据透视表分析工具，主要用于 AdMob 广告数据的多维分析。支持拖拽配置行/列/值维度，实时生成透视表，并提供诊断分析功能。

## 常用命令

```bash
# 开发
npm run dev              # 启动 Vite 开发服务器
npm run build            # TypeScript 编译 + Vite 构建
npm run preview          # 预览构建产物

# 代码质量
npm run lint             # ESLint 检查
npm run lint:biome       # Biome 检查
npm run format           # Biome 格式化
npm run format:check     # 检查格式
npm run check            # Biome 检查 + 自动修复

# 测试
npm run test             # Vitest 监听模式
npm run test:run         # 运行所有测试一次
npm run test:coverage    # 运行测试并生成覆盖率报告
npm run test:e2e         # Playwright E2E 测试
npm run test:e2e:ui      # Playwright UI 模式
npm run test:e2e:debug   # Playwright 调试模式

# 运行单个测试文件
npx vitest run src/utils/__tests__/aggregator.test.ts
```

## 架构概览

### 核心数据流

```
数据源 (Excel/CSV) → DataSourceManager → useDatasetManager → usePivotState → PivotTable
                                                           ↓
                                                    SpatialFieldZone (拖拽配置)
```

### 关键 Hooks

- **usePivotState**: 核心状态管理，维护 rowFields/colFields/valueFields，调用 aggregator 计算透视结果
- **useDragAndDrop**: 基于 @dnd-kit 的拖拽逻辑，处理字段在 zones 间的移动和排序
- **useDatasetManager**: 数据集加载、切换、管理
- **useConfigs**: 透视表配置的持久化和恢复
- **useZenMode**: 专注模式，隐藏配置面板

### 组件结构

- **SpatialFieldZone**: 行/列/值配置区的统一组件，支持 vertical（行/值）和 horizontal（列）两种布局
  - 使用 `PrioritySlot` 实现行配置的 5 个优先级插槽
  - 使用 `FieldCapsule` 渲染可拖拽的字段胶囊
- **PivotTable**: 透视表渲染，支持虚拟滚动
- **DiagnosticCard**: 数据诊断分析面板，包含异常检测、因子分析等
- **AdMobFilterBar**: AdMob 数据的筛选栏，支持日期、应用、版本等维度筛选

### 工具函数

- **aggregator.ts**: 核心聚合引擎，处理半加性指标（注册用户、曝光人数）的特殊逻辑
- **fieldDetector.ts**: 自动检测字段类型（dimension/measure）
- **calculatedField.ts**: 计算字段的公式解析和计算
- **fieldHelpers.ts**: 字段工具函数，包括 SpatialZoneId 类型定义

### 类型系统

- **Field**: 字段定义，包含 name、type（dimension/measure）、dataType
- **PivotField**: 带聚合方式的字段配置
- **PivotResult**: 透视结果，包含 rowHeaders、columnHeaders、data、totals 等

### 样式系统

- 使用 CSS 变量定义主题（variables.css）
- 组件样式在 App.css 中，按区域组织
- 行配置区使用立式卡带样式（.row-slot），列配置区使用横向标签流（.column-flow）

### 数据持久化

- 使用 IndexedDB（idb 库）存储数据集和配置
- storageService 提供数据集的增删改查

## 测试规范

- 单元测试放在 `src/utils/__tests__/` 目录下
- 使用 Vitest + @testing-library/react
- E2E 测试使用 Playwright，放在 `e2e/` 目录下

## 注意事项

- 半加性指标（注册用户、曝光人数）在多维度聚合时需要特殊处理，参考 aggregator.ts 中的 SEMI_ADDITIVE 逻辑
- 行配置区最多支持 5 个优先级字段（MAX_PRIORITY_FIELDS = 5）
- 拖拽系统使用 @dnd-kit，支持跨 zone 拖拽和排序
- 动画使用 GSAP，通过 @gsap/react 集成
