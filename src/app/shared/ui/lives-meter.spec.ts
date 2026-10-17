import { describe, expect, it } from 'vitest';
import { heartState } from './lives-meter';

describe('SVG hearts', () => {
  it('distinguishes quarter, half and three-quarter hearts without rounding other decimals', () => {
    expect(heartState(0.25, 0)).toBe('quarter');
    expect(heartState(3.25, 3)).toBe('quarter');
    expect(heartState(0.75, 0)).toBe('three-quarter');
    expect(heartState(3.75, 3)).toBe('three-quarter');
    expect(heartState(0.1, 0)).toBe(0.1);
    expect(heartState(2.01, 2)).toBe(0.01);
  });
  it('represents each half unit without rounding and marks depleted slots', () => {
    expect([0, 1, 2, 3].map((n) => heartState(2.5, n))).toEqual(['full', 'full', 'half', 'empty']);
    expect(heartState(0.5, 0)).toBe('half');
    expect(heartState(0, 0)).toBe('empty');
    expect(heartState(-0.5, 0)).toBe('empty');
    expect(heartState(9999, 9998)).toBe('full');
  });
});
