import { describe, expect, it } from 'vitest';
import type { DataRow, Field, PivotField } from '../../types';
import {
  buildPivotConfigPayload,
  createExportFilename,
  filterRowsByConfigs,
  getDataHeaders,
} from '../exportUtils';

const createField = (name: string, type: Field['type']): Field => ({
  name,
  type,
  dataType: type === 'measure' ? 'number' : 'string',
});

const createPivotField = (name: string, type: Field['type']): PivotField => ({
  field: createField(name, type),
  aggregation: type === 'measure' ? 'sum' : undefined,
});

describe('exportUtils', () => {
  it('filters detail rows with all configured selected values', () => {
    const rows: DataRow[] = [
      { 日期: '2026-06-26', 国家: 'US', 注册用户: 21 },
      { 日期: '2026-06-26', 国家: 'JP', 注册用户: 12 },
      { 日期: '2026-06-25', 国家: 'US', 注册用户: 32 },
    ];

    const result = filterRowsByConfigs(rows, [
      { fieldName: '日期', selectedValues: ['2026-06-26'] },
      { fieldName: '国家', selectedValues: ['US'] },
    ]);

    expect(result).toEqual([{ 日期: '2026-06-26', 国家: 'US', 注册用户: 21 }]);
  });

  it('uses field order first and then appends row-only headers', () => {
    const headers = getDataHeaders(
      [createField('日期', 'dimension'), createField('注册用户', 'measure')],
      [{ 日期: '2026-06-26', 注册用户: 21, 版本: '1.0' }]
    );

    expect(headers).toEqual(['日期', '注册用户', '版本']);
  });

  it('serializes pivot config with totals and filters', () => {
    const payload = buildPivotConfigPayload({
      datasetName: 'demo',
      rowFields: [createPivotField('日期', 'dimension')],
      colFields: [createPivotField('国家', 'dimension')],
      valueFields: [createPivotField('注册用户', 'measure')],
      filterConfigs: [{ fieldName: '版本', selectedValues: ['1.0'] }],
      showRowTotal: true,
      showColumnTotal: false,
    });

    expect(payload).toMatchObject({
      schemaVersion: 1,
      type: 'pivot-config',
      datasetName: 'demo',
      rowFields: [{ name: '日期', type: 'dimension' }],
      colFields: [{ name: '国家', type: 'dimension' }],
      valueFields: [{ name: '注册用户', type: 'measure', aggregation: 'sum' }],
      filters: [{ fieldName: '版本', selectedValues: ['1.0'] }],
      totals: { rowTotal: true, columnTotal: false },
    });
    expect(payload.exportedAt).toEqual(expect.any(String));
  });

  it('sanitizes generated export filenames', () => {
    expect(createExportFilename('Demo:/ 报告', 'pivot', 'xlsx')).toMatch(
      /^Demo--报告-pivot-\d{4}-\d{2}-\d{2}\.xlsx$/
    );
  });
});
