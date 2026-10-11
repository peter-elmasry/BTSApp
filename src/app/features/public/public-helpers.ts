import { environment } from '../../../environments/environment';
import type { PublicGame, PublicGuide } from '../../core/player/public-types';

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

/** All guides of a team (several are allowed), falling back to the single `guide` field. */
export function teamGuides(
  team: { guide?: PublicGuide | null; guides?: PublicGuide[] } | null | undefined,
) {
  return team?.guides?.length ? team.guides : team?.guide ? [team.guide] : [];
}

export function guideNames(
  team: { guide?: PublicGuide | null; guides?: PublicGuide[] } | null | undefined,
  language: 'ar' | 'en',
) {
  return teamGuides(team)
    .map((guide) => localizedName(guide, language))
    .join(language === 'ar' ? '، ' : ', ');
}
