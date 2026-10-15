import { environment } from '../../../environments/environment';

/** Only event-scoped application assets may replace a catalog avatar. */
export function teamImageUrl(path: string | null | undefined): string {
  if (
    !path ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.webp$/i.test(
      path,
    )
  )
    return '';
  return `${(environment.supabaseUrl || 'http://127.0.0.1:54321').replace(/\/$/, '')}/storage/v1/object/public/team-images/${path}`;
}
