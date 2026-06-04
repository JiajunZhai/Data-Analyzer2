import type { DataRow, ScenarioMapping } from '../types';

const KEY_SEP = '\t';
const APP_FIELD = '应用';
const RAW_SCENARIO_FIELD = '广告场景';
const MAPPED_SCENARIO_FIELD = '实际场景';
const ALL_SCENARIO_VALUE = 'ALL';

// 状态指标列表（不可简单求和，需要取最大值）
const STATE_METRICS = new Set(['注册用户', '曝光人数']);

// 事件指标列表（可以求和）
const EVENT_METRICS = new Set(['广告收益', '曝光次数', '点击次数']);

interface ScenarioConfigLike {
  appCode: string;
  originalScenario: string;
  targetScenario: string;
}

export interface ScenarioMatchStats {
  mappedRowCount: number;
  sourceRowCount: number;
}

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
}

function normalizeAppCode(value: unknown): string {
  return normalizeText(value).toUpperCase();
}

function normalizeScenarioCode(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

export function createScenarioMappingKey(appCode: unknown, originalScenario: unknown): string {
  return normalizeAppCode(appCode) + KEY_SEP + normalizeScenarioCode(originalScenario);
}

function createLegacyMappingKey(appCode: unknown, originalScenario: unknown): string {
  return normalizeText(appCode) + KEY_SEP + normalizeText(originalScenario);
}

function isAllScenario(value: unknown): boolean {
  return normalizeText(value).toUpperCase() === ALL_SCENARIO_VALUE;
}

function addLookupEntry(
  lookupMap: Map<string, string>,
  appCode: unknown,
  originalScenario: unknown,
  targetScenario: unknown
): number {
  const target = normalizeText(targetScenario);
  if (!target) return 0;

  const originals = normalizeText(originalScenario)
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

  let added = 0;
  for (const original of originals) {
    const normalizedApp = normalizeAppCode(appCode);
    const normalizedScenario = normalizeScenarioCode(original);
    if (!normalizedApp || !normalizedScenario) continue;

    lookupMap.set(normalizedApp + KEY_SEP + normalizedScenario, target);
    added++;
  }

  return added;
}

export function buildLookupMap(headers: string[], rows: string[][]): ScenarioMapping {
  const lookupMap = new Map<string, string>();
  const appCodes = headers.slice(1).map(normalizeText).filter(Boolean);
  const scenarioSet = new Set<string>();
  let mappedRowCount = 0;

  for (const row of rows) {
    const mappedName = normalizeText(row[0]);
    if (!mappedName) continue;

    scenarioSet.add(mappedName);

    for (let i = 0; i < appCodes.length; i++) {
      const cell = normalizeText(row[i + 1]);
      if (!cell) continue;

      mappedRowCount += addLookupEntry(lookupMap, appCodes[i], cell, mappedName);
    }
  }

  return {
    lookupMap,
    appCodes,
    scenarioCount: scenarioSet.size,
    mappedRowCount,
  };
}

export function buildLookupMapFromConfigs(
  scenarioConfigs: ScenarioConfigLike[],
  appCodes?: string[]
): ScenarioMapping {
  const lookupMap = new Map<string, string>();
  const normalizedAppCodes = (appCodes ?? scenarioConfigs.map((config) => config.appCode))
    .map(normalizeText)
    .filter(Boolean);
  const uniqueAppCodes = [...new Set(normalizedAppCodes)];
  const scenarioSet = new Set<string>();
  let mappedRowCount = 0;

  for (const config of scenarioConfigs) {
    const targetScenario = normalizeText(config.targetScenario);
    if (!targetScenario) continue;

    scenarioSet.add(targetScenario);
    mappedRowCount += addLookupEntry(
      lookupMap,
      config.appCode,
      config.originalScenario,
      targetScenario
    );
  }

  return {
    lookupMap,
    appCodes: uniqueAppCodes,
    scenarioCount: scenarioSet.size,
    mappedRowCount,
  };
}

export function scenarioMappingToRecord(mapping: ScenarioMapping): Record<string, string> {
  return Object.fromEntries(mapping.lookupMap.entries());
}

function resolveMappedScenario(
  lookupMap: Map<string, string>,
  appCode: unknown,
  originalScenario: unknown
): string | undefined {
  return (
    lookupMap.get(createScenarioMappingKey(appCode, originalScenario)) ??
    lookupMap.get(createLegacyMappingKey(appCode, originalScenario))
  );
}

export function applyScenarioMapping(data: DataRow[], mapping: ScenarioMapping): DataRow[] {
  const { lookupMap } = mapping;

  // 第一步：映射场景并添加实际场景字段
  const mappedData = data.map((row) => {
    const app = row[APP_FIELD];
    const orig = row[RAW_SCENARIO_FIELD];
    const mapped = resolveMappedScenario(lookupMap, app, orig) ?? normalizeText(orig);

    return { ...row, [MAPPED_SCENARIO_FIELD]: mapped };
  });

  // 第二步：按 [日期+应用+国家+版本+渠道+实际场景] 分组合并
  const groupKeys = ['日期', '应用', '国家', '版本', '渠道', MAPPED_SCENARIO_FIELD];
  const groups = new Map<string, DataRow[]>();

  mappedData.forEach((row) => {
    const key = groupKeys.map((dim) => String(row[dim] ?? '')).join(KEY_SEP);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(row);
  });

  // 第三步：合并每组的数据行
  const mergedData: DataRow[] = [];
  groups.forEach((rows, key) => {
    if (rows.length === 1) {
      // 只有一行，直接添加
      mergedData.push(rows[0]);
      return;
    }

    // 多行需要合并
    const merged: DataRow = {};
    const keyParts = key.split(KEY_SEP);

    // 设置维度字段
    groupKeys.forEach((dim, i) => {
      merged[dim] = keyParts[i] || '';
    });

    // 合并指标字段
    const allMetricNames = new Set([...STATE_METRICS, ...EVENT_METRICS]);
    allMetricNames.forEach((metric) => {
      if (STATE_METRICS.has(metric)) {
        // 状态指标：取最大值
        const values = rows.map((r) => Number(r[metric]) || 0).filter((v) => v > 0);
        merged[metric] = values.length > 0 ? Math.max(...values) : 0;
      } else if (EVENT_METRICS.has(metric)) {
        // 事件指标：求和
        merged[metric] = rows.reduce((sum, r) => sum + (Number(r[metric]) || 0), 0);
      }
    });

    mergedData.push(merged);
  });

  return mergedData;
}

export function calculateScenarioMatchStats(
  data: DataRow[],
  mapping: ScenarioMapping
): ScenarioMatchStats {
  let sourceRowCount = 0;
  let mappedRowCount = 0;

  for (const row of data) {
    const originalScenario = row[RAW_SCENARIO_FIELD];
    if (!normalizeText(originalScenario) || isAllScenario(originalScenario)) {
      continue;
    }

    sourceRowCount++;
    if (resolveMappedScenario(mapping.lookupMap, row[APP_FIELD], originalScenario)) {
      mappedRowCount++;
    }
  }

  return { mappedRowCount, sourceRowCount };
}

export function validateMappingAppCodes(mappingAppCodes: string[], data: DataRow[]): string[] {
  const dataAppCodes = new Set(data.map((row) => normalizeAppCode(row[APP_FIELD])));
  return mappingAppCodes.filter((code) => !dataAppCodes.has(normalizeAppCode(code)));
}
