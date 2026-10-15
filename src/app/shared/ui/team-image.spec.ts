import { describe, expect, it } from 'vitest';
import { teamImageUrl } from './team-image';

describe('public team image URL', () => {
  const path = '44000000-0000-0000-0000-000000000001/55000000-0000-0000-0000-000000000001.webp';
  it('resolves only an event-scoped WebP asset', () => {
    expect(teamImageUrl(path)).toContain(`/storage/v1/object/public/team-images/${path}`);
    for (const value of [
      null,
      undefined,
      '',
      'https://example.com/image.webp',
      '../image.webp',
      `${path}?x=1`,
      path.replace('.webp', '.svg'),
    ]) {
      expect(teamImageUrl(value)).toBe('');
    }
  });
});
