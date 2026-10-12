/** Pick a display field without changing the underlying bilingual record. */
export function entityLabel(
  row: Record<string, unknown> | null | undefined,
  language: 'ar' | 'en',
  field = 'name',
): string {
  if (!row) return '';
  const text = (key: string) => (typeof row[key] === 'string' ? row[key].trim() : '');
  return text(`${field}_${language}`) || text(`${field}_${language === 'ar' ? 'en' : 'ar'}`);
}
