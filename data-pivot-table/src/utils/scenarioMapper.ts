import type { DataRow, ScenarioMapping } from '../types';

const KEY_SEP = '\t';

export function buildLookupMap(headers: string[], rows: string[][]): ScenarioMapping {
  const lookupMap = new Map<string, string>();
  const appCodes = headers.slice(1);
  const scenarioSet = new Set<string>();
  let mappedRowCount = 0;

  for (const row of rows) {
    const mappedName = row[0]?.trim();
    if (!mappedName) continue;

    scenarioSet.add(mappedName);

    for (let i = 0; i < appCodes.length; i++) {
      const cell = row[i + 1]?.trim();
      if (!cell) continue;

      const originals = cell.split('|');
      for (const orig of originals) {
        const trimmed = orig.trim();
        if (!trimmed) continue;

        const key = appCodes[i] + KEY_SEP + trimmed;
        lookupMap.set(key, mappedName);
        mappedRowCount++;
      }
    }
  }

  return {
    lookupMap,
    appCodes,
    scenarioCount: scenarioSet.size,
    mappedRowCount,
  };
}

export function applyScenarioMapping(
  data: DataRow[],
  mapping: ScenarioMapping
): DataRow[] {
  const { lookupMap } = mapping;

  return data.map(row => {
    const app = String(row['应用'] ?? '');
    const orig = String(row['广告场景'] ?? '');
    const key = app + KEY_SEP + orig;
    const mapped = lookupMap.get(key) ?? orig;

    return { ...row, '实际场景': mapped };
  });
}

export function validateMappingAppCodes(
  mappingAppCodes: string[],
  data: DataRow[]
): string[] {
  const dataAppCodes = new Set(data.map(row => String(row['应用'] ?? '')));
  return mappingAppCodes.filter(code => !dataAppCodes.has(code));
}
