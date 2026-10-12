import type { Outcome, PublicAdjustment, PublicEvent, PublicMatch } from './public-types';

type ScoringEvent = Pick<PublicEvent, 'scoring_mode' | 'initial_lives' | 'life_emoji'>;

/** Ten suggestions for the life symbol; administrators may type any other emoji. */
export const LIFE_EMOJI_SUGGESTIONS = ['❤️', '💛', '💙', '💚', '💜', '🧡', '🔥', '⭐', '🛡️', '⚽'];

export function isLivesMode(event: Partial<ScoringEvent> | null | undefined): boolean {
  return event?.scoring_mode === 'LIVES';
}

export function lifeEmoji(event: Partial<ScoringEvent> | null | undefined): string {
  return event?.life_emoji?.trim() || '❤️';
}

const LOSES_LIFE: readonly Outcome[] = ['LOSS', 'FORFEIT'];

/** True when this outcome costs a life in LIVES mode (wins and draws keep lives). */
export function costsLife(outcome: Outcome | undefined): boolean {
  return !!outcome && LOSES_LIFE.includes(outcome);
}

/**
 * Lives left for one team from its own (always visible) results, mirroring the
 * server's phase6_standings rule: lives from matches and the total both stop at zero.
 */
export function teamLives(
  event: Partial<ScoringEvent> | null | undefined,
  matches: readonly PublicMatch[],
  adjustments: readonly Pick<PublicAdjustment, 'points' | 'match_id'>[],
  teamCode: string,
): number | null {
  if (!isLivesMode(event) || !event?.initial_lives) return null;
  const voided = new Set(matches.filter((match) => match.status === 'VOID').map((m) => m.id));
  const lost = matches.filter(
    (match) =>
      match.status === 'COMPLETED' &&
      match.participants.some(
        (participant) => participant.team_code === teamCode && costsLife(participant.outcome),
      ),
  ).length;
  const bonus = adjustments
    .filter((adjustment) => !adjustment.match_id || !voided.has(adjustment.match_id))
    .reduce((sum, adjustment) => sum + adjustment.points, 0);
  return Math.max(0, Math.max(0, event.initial_lives - lost) + bonus);
}
