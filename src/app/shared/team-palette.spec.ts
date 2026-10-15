import { describe, expect, it } from 'vitest';
import { normalizeTeamPalette } from './team-palette';
describe('named team palette', () => {
  it('normalizes names and HEX without changing saved team records', () => {
    expect(normalizeTeamPalette([{ name: '  Rose ', hex: ' #aBcDeF ' }])).toEqual([
      { name: 'Rose', hex: '#ABCDEF' },
    ]);
    expect(normalizeTeamPalette([])).toEqual([]);
  });
  it('rejects duplicate names/colours and malformed configuration', () => {
    for (const value of [
      null,
      {},
      [{ name: '', hex: '#123456' }],
      [{ name: 'x', hex: '#fff' }],
      [{ name: 'x', hex: '#123456', extra: 1 }],
      [
        { name: 'Rose', hex: '#123456' },
        { name: 'rose', hex: '#234567' },
      ],
      [
        { name: 'a', hex: '#abc123' },
        { name: 'b', hex: '#ABC123' },
      ],
      Array.from({ length: 33 }, (_, i) => ({ name: `name${i}`, hex: '#123456' })),
    ])
      expect(normalizeTeamPalette(value)).toBeNull();
  });
});
