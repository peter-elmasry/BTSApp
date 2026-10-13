import { describe, expect, it } from 'vitest';
import { telHref } from './phone-link';

describe('phone link', () => {
  it('normalises formatting characters into a tel: target', () => {
    expect(telHref('+20 100 123-4567')).toBe('tel:+201001234567');
    expect(telHref('(010) 0123 4567')).toBe('tel:01001234567');
  });
  it('returns null for missing or invalid numbers', () => {
    expect(telHref(null)).toBeNull();
    expect(telHref('')).toBeNull();
    expect(telHref('call me')).toBeNull();
  });
});
