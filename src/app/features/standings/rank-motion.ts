import { isLivesMode } from '../../core/player/scoring';
import type { PublicEvent, PublicMatch, PublicRound } from '../../core/player/public-types';
import { countUpValue } from '../../shared/ui/count-up';
import type { StandingRow } from '../../core/standings/standings-types';

export function rankChanges(previous: readonly StandingRow[], current: readonly StandingRow[]) {
  const ranks = new Map(previous.map((row) => [row.team.id, row.rank]));
  return new Map(
    current.map((row) => [row.team.id, (ranks.get(row.team.id) ?? row.rank) - row.rank]),
  );
}

export function currencyLabel(
  count: number,
  event: Pick<
    PublicEvent,
    | 'currency_en_one'
    | 'currency_en_other'
    | 'currency_ar_one'
    | 'currency_ar_two'
    | 'currency_ar_plural'
  > &
    Partial<Pick<PublicEvent, 'scoring_mode' | 'life_emoji'>>,
  language: 'en' | 'ar',
): string {
  // LIVES mode shows the event's life symbol instead of a currency word (D038).
  if (isLivesMode(event)) return language === 'ar' ? 'قلوب' : 'Hearts';
  const category = new Intl.PluralRules(language).select(Math.abs(count));
  if (language === 'en')
    return category === 'one' ? event.currency_en_one : event.currency_en_other;
  if (category === 'two') return event.currency_ar_two;
  if (category === 'few') return event.currency_ar_plural;
  return event.currency_ar_one;
}

export function latestVisibleResults(
  matches: readonly PublicMatch[],
  rounds: readonly PublicRound[],
) {
  const numbers = new Map(rounds.map((round) => [round.id, round.number]));
  return matches
    .map((match, index) => ({ match, index }))
    .filter(
      ({ match }) =>
        match.status === 'COMPLETED' &&
        match.participants.length > 0 &&
        match.participants.every((item) => item.outcome && item.outcome !== 'PENDING'),
    )
    .sort((a, b) => {
      const aTime = Date.parse(a.match.result_entered_at ?? '');
      const bTime = Date.parse(b.match.result_entered_at ?? '');
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return bTime - aTime;
      if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(bTime) ? 1 : -1;
      return (
        (numbers.get(b.match.round_id) ?? 0) - (numbers.get(a.match.round_id) ?? 0) ||
        b.index - a.index
      );
    })
    .slice(0, 5)
    .map(({ match }) => match);
}

export function interpolateTotal(from: number, to: number, progress: number): number {
  return countUpValue(from, to, progress);
}
