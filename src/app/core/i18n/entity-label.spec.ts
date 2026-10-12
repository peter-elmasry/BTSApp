import { entityLabel } from './entity-label';

describe('entity labels', () => {
  it('uses the active language for names, member names and locations', () => {
    expect(entityLabel({ name_en: 'Falcons', name_ar: 'الصقور' }, 'ar')).toBe('الصقور');
    expect(entityLabel({ name_en: 'Falcons', name_ar: 'الصقور' }, 'en')).toBe('Falcons');
    expect(entityLabel({ full_name_en: 'Mina', full_name_ar: 'مينا' }, 'ar', 'full_name')).toBe(
      'مينا',
    );
    expect(entityLabel({ location_en: 'Hall', location_ar: 'القاعة' }, 'ar', 'location')).toBe(
      'القاعة',
    );
  });
  it('falls back both ways for missing and whitespace-only fields', () => {
    expect(entityLabel({ name_en: 'Falcons', name_ar: '   ' }, 'ar')).toBe('Falcons');
    expect(entityLabel({ name_en: null, name_ar: 'الصقور' }, 'en')).toBe('الصقور');
    expect(entityLabel(undefined, 'ar')).toBe('');
  });
});
