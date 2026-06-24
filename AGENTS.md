# AGENTS.md

## Repo Structure

This is **not** a monorepo. The actual app lives in `data-pivot-table/`. All commands below must be run from that directory.

```
data-pivot-table/     # React 19 + TypeScript + Vite app (the real codebase)
数据分析功能/          # UI reference images and requirements docs (Chinese)
lookthis/             # SQL reference files, not part of the app
```

Root-level `AGENT.md` contains behavioral guidelines (Karpathy principles). Read it for working style expectations.

## Commands

All commands run from `data-pivot-table/`:

```bash
npm run dev            # Vite dev server at localhost:5173
npm run build          # tsc -b && vite build (build WILL fail if tsc fails)
npm run lint           # ESLint
npm run lint:biome     # Biome lint
npm run format         # Biome format --write
npm run format:check   # Biome format (check only)
npm run check          # Biome lint + format + auto-fix (preferred pre-commit)
npm run test:run       # Vitest single run
npm run test:coverage  # Vitest run with coverage
npm run test:e2e       # Playwright (auto-starts dev server)
npm run test:e2e:ui    # Playwright UI mode
npm run test:e2e:debug # Playwright debug mode
npm run preview        # Preview production build
```

Single test file:
```bash
npx vitest run src/utils/__tests__/aggregator.test.ts
```

## Linting & Formatting

**Two linters coexist**: ESLint (`npm run lint`) and Biome (`npm run lint:biome`). Biome handles formatting; ESLint handles React-specific rules.

Preferred pre-commit: `npm run check` (Biome lint + format in one pass).

Biome config: `biome.json` — 2-space indent, single quotes, trailing commas ES5, line width 100.

## Build

`npm run build` runs `tsc -b` first. TypeScript errors block the build. Fix type errors before building.

Vite chunks: react, @dnd-kit, gsap are split into separate vendor chunks (`vite.config.ts` manualChunks).

## Testing

- **Unit tests**: Vitest + jsdom + Testing Library. Files in `src/utils/__tests__/*.test.ts`.
- **E2E tests**: Playwright. Files in `e2e/*.spec.ts`. Runs against Chromium, Firefox, WebKit. Auto-starts dev server.
- Test setup: `src/test/setup.ts`

## Architecture Quick Reference

Detailed architecture is in `data-pivot-table/AGENTS.md` and `data-pivot-table/CLAUDE.md`. Key facts:

- **Entry**: `src/main.tsx` → `src/App.tsx`
- **Data flow**: Excel upload → `fileParser.ts` → `fieldDetector.ts` → user configures rows/cols/values → `aggregator.ts` → `PivotTable.tsx`
- **Drag & drop**: @dnd-kit. Cross-zone rules: row ↔ col allowed, value ↔ row/col forbidden. Validation in `fieldHelpers.ts` (`canDropToZone`).
- **State**: Custom hooks — `usePivotState`, `useDatasetManager`, `useDragAndDrop`, `useMappings`, `useConfigs`
- **Persistence**: IndexedDB via `idb` library
- **Styling**: CSS variables in `src/styles/variables.css`, component styles as `.module.css`, OKLCH colors, dark mode via `[data-theme="dark"]`
- **Animation**: GSAP via `@gsap/react`, utilities in `src/utils/animations.ts`

## Gotchas

- Semi-additive metrics (注册用户, 曝光人数) need special handling in aggregation — see `aggregator.ts` SEMI_ADDITIVE logic.
- Row config has max 5 priority slots (`MAX_PRIORITY_FIELDS = 5`).
- GSAP animations bind to `.field-capsule-inner`; outer DOM is reserved for dnd-kit transforms.
- PivotResult.rowHeaders is `string[][]` (2D array), not concatenated strings.
- Dev server allows all `.ts.net` Tailscale hosts (`vite.config.ts` allowedHosts).
- CSS uses `.module.css` files (CSS Modules) — not global class names.
- Web Worker for CSV parsing lives in `src/workers/csvWorker.ts` with bridge in `workerBridge.ts`.
- Calculated fields (eCPM, CTR, ARPU, etc.) use weighted aggregation, not simple averages.
