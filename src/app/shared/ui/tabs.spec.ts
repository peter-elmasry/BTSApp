import { describe, expect, it } from 'vitest';
import { nextTabIndex } from './tabs';

describe('tab keyboard navigation', () => {
  it('moves forward and backward with wrap-around in LTR', () => {
    expect(nextTabIndex(0, 'ArrowRight', 3, false)).toBe(1);
    expect(nextTabIndex(2, 'ArrowRight', 3, false)).toBe(0);
    expect(nextTabIndex(0, 'ArrowLeft', 3, false)).toBe(2);
  });
  it('mirrors arrows in RTL and supports Home/End', () => {
    expect(nextTabIndex(0, 'ArrowLeft', 3, true)).toBe(1);
    expect(nextTabIndex(0, 'ArrowRight', 3, true)).toBe(2);
    expect(nextTabIndex(1, 'Home', 3, true)).toBe(0);
    expect(nextTabIndex(0, 'End', 3, false)).toBe(2);
  });
  it('ignores other keys and empty lists', () => {
    expect(nextTabIndex(1, 'a', 3, false)).toBe(1);
    expect(nextTabIndex(0, 'ArrowRight', 0, false)).toBe(-1);
  });
});
