import { describe, expect, it } from 'vitest';
import type { DataRow, Field } from '../../types';
import {
  buildComparisonAnalysis,
  buildPeriodAnalysis,
  buildTrendAnalysis,
  buildVarianceAnalysis,
} from '../algorithmAnalysis';

const dimensions: Field[] = [
  { name: '日期', type: 'dimension', dataType: 'date' },
  { name: '应用', type: 'dimension', dataType: 'string' },
  { name: '国家', type: 'dimension', dataType: 'string' },
];

const measures: Field[] = [
  { name: '注册用户', type: 'measure', dataType: 'number' },
  { name: '广告收益', type: 'measure', dataType: 'number' },
  { name: 'ARPU', type: 'measure', dataType: 'number', isCalculated: true },
];

const rows: DataRow[] = [
  { 日期: '2026-06-01', 应用: 'A', 国家: 'US', 注册用户: 100, 广告收益: 20 },
  { 日期: '2026-06-01', 应用: 'A', 国家: 'US', 注册用户: 90, 广告收益: 10 },
  { 日期: '2026-06-02', 应用: 'A', 国家: 'US', 注册用户: 120, 广告收益: 36 },
  { 日期: '2026-06-02', 应用: 'B', 国家: 'JP', 注册用户: 60, 广告收益: 60 },
  { 日期: '2026-06-03', 应用: 'A', 国家: 'US', 注册用户: 160, 广告收益: 64 },
  { 日期: '2026-06-03', 应用: 'B', 国家: 'JP', 注册用户: 70, 广告收益: 70 },
];

describe('algorithmAnalysis', () => {
  it('builds trend series from real dataset rows without forecast points', () => {
    const result = buildTrendAnalysis(rows, dimensions, measures, ['注册用户'], '日期');

    expect(result.series[0].points.map((point) => point.value)).toEqual([100, 180, 230]);
    expect(result.labels).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(result.smoothingFactor).toBe(1);
    expect(result.series[0].growthRate).toBeCloseTo(1.3);
  });

  it('splits trend lines by selected apps under a country filter', () => {
    const result = buildTrendAnalysis(rows, dimensions, measures, ['广告收益'], '日期', {
      appDimension: '应用',
      countryDimension: '国家',
      selectedApps: ['A'],
      includeOverall: false,
      country: 'US',
    });

    expect(result.series).toHaveLength(1);
    expect(result.series[0].label).toBe('A · 广告收益');
    expect(result.series[0].points.map((point) => point.value)).toEqual([30, 36, 64]);
  });

  it('splits trend lines by selected dimension values', () => {
    const result = buildTrendAnalysis(rows, dimensions, measures, ['广告收益'], '日期', {
      filterDimension: '国家',
      filterValues: ['US', 'JP'],
      includeOverall: false,
    });

    expect(result.series.map((series) => series.label)).toEqual(['US · 广告收益', 'JP · 广告收益']);
    expect(result.series[0].points.map((point) => point.value)).toEqual([30, 36, 64]);
    expect(result.series[1].points.map((point) => point.value)).toEqual([0, 60, 70]);
  });

  it('uses semi-additive aggregation for variance analysis', () => {
    const result = buildVarianceAnalysis(rows, dimensions, measures, '应用', '国家', '注册用户');
    const aUs = result.cells.find((cell) => cell.row === 'A' && cell.column === 'US');

    expect(aUs?.value).toBe(380);
  });

  it('scores comparison groups with calculated metric values', () => {
    const result = buildComparisonAnalysis(rows, dimensions, measures, '应用', [
      { metric: '注册用户', weight: 20 },
      { metric: 'ARPU', weight: 80 },
    ]);

    expect(result.items[0].group).toBe('B');
    expect(result.items[0].rawValues.ARPU).toBeCloseTo(130 / 130);
  });

  it('builds period analysis for latest versus historical median', () => {
    const result = buildPeriodAnalysis(rows, dimensions, measures, '日期', '广告收益', 3);

    expect(result.points).toHaveLength(3);
    expect(result.latest?.value).toBe(134);
    expect(result.median).toBe(96);
  });
});
