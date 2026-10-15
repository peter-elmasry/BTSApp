import { describe, expect, it } from 'vitest';
import { heartState } from './lives-meter';

describe('SVG hearts', () => {
  it('represents each half unit without rounding and marks depleted slots', () => {
    expect([0, 1, 2, 3].map((n) => heartState(2.5, n))).toEqual(['full', 'full', 'half', 'empty']);
    expect(heartState(0.5, 0)).toBe('half');
    expect(heartState(0, 0)).toBe('empty');
    expect(heartState(-0.5, 0)).toBe('empty');
    expect(heartState(9999, 9998)).toBe('full');
  });
});
