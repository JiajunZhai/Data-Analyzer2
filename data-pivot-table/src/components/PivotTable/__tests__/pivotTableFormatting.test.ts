import { describe, expect, it } from 'vitest';
import { formatPivotValue } from '../pivotTableUtils';

describe('readable numeric formatting', () => {
  it('keeps zero distinct from unavailable values', () => {
    expect(formatPivotValue(0, '注册用户')).toEqual({ text: '0', isEmpty: false });
    expect(formatPivotValue(Number.NaN)).toEqual({ text: '—', isEmpty: true });
    expect(formatPivotValue(Number.POSITIVE_INFINITY)).toEqual({ text: '—', isEmpty: true });
  });
  it('keeps zero at the same precision as other values in its metric', () => {
    expect(formatPivotValue(0, '广告收益').text).toBe('0.00');
    expect(formatPivotValue(0, 'CTR').text).toBe('0.00%');
    expect(formatPivotValue(0, 'ARPU').text).toBe('0.0000');
  });
});
