import { describe, expect, it } from 'vitest';
import { currentChoice, REGULAR_CHOICES } from './result-entry';

describe('result entry choices', () => {
  it('recognises every regular combination from stored outcomes', () => {
    for (const [choice, outcomes] of Object.entries(REGULAR_CHOICES))
      expect(currentChoice(outcomes)).toBe(choice);
  });
  it('returns null for pending or partial outcomes', () => {
    expect(currentChoice(['PENDING', 'PENDING'])).toBeNull();
    expect(currentChoice([undefined, 'WIN'])).toBeNull();
  });
});
