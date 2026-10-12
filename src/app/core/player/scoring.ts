import type { Outcome, PublicEvent, PublicTeamView } from './public-types';

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

/** Lives left for a team, as computed by the server for its team view (R6, no client scoring). */
export function livesLeft(
  view: Pick<PublicTeamView, 'breakdown'> | null | undefined,
): number | null {
  const breakdown = view?.breakdown;
  return breakdown?.scoring_mode === 'LIVES' ? breakdown.total : null;
}
