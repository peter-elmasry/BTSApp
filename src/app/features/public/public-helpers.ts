import { environment } from '../../../environments/environment';
import type { PublicGame } from '../../core/player/public-types';

export function localizedName(
  value: { name_en?: string | null; name_ar?: string | null } | null | undefined,
  language: 'ar' | 'en',
) {
  return language === 'ar'
    ? value?.name_ar || value?.name_en || ''
    : value?.name_en || value?.name_ar || '';
}

export function localizedLocation(game: PublicGame | null | undefined, language: 'ar' | 'en') {
  return language === 'ar'
    ? game?.location_ar || game?.location_en || ''
    : game?.location_en || game?.location_ar || '';
}

export function gameImage(path: string | null | undefined) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${environment.supabaseUrl}/storage/v1/object/public/game-images/${path}`;
}
