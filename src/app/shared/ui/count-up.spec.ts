import { describe, expect, it } from 'vitest';
import { countUpValue } from './count-up';

describe('count-up interpolation', () => {
  it('starts at the old value and ends at the new one', () => {
    expect(countUpValue(2, 12, 0)).toBe(2);
    expect(countUpValue(2, 12, 1)).toBe(12);
    expect(countUpValue(12, 2, 1)).toBe(2);
  });
  it('eases out and clamps progress', () => {
    expect(countUpValue(0, 100, 0.5)).toBe(88);
    expect(countUpValue(0, 10, 2)).toBe(10);
    expect(countUpValue(0, 10, -1)).toBe(0);
  });
});
