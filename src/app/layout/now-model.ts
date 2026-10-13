import type { PublicMatch, PublicRound } from '../core/player/public-types';

type Round = Pick<PublicRound, 'id' | 'number' | 'status'>;
type Match = Pick<PublicMatch, 'id' | 'round_id' | 'game_id' | 'status' | 'participants'>;

export function activeRound<T extends Round>(rounds: readonly T[]): T | null {
  return rounds.find((round) => round.status === 'ACTIVE') ?? null;
}

/** The next round an administrator would start: the lowest-numbered DRAFT round. */
export function nextDraftRound<T extends Round>(rounds: readonly T[]): T | null {
  const active = activeRound(rounds);
  return (
    [...rounds]
      .filter((round) => round.status === 'DRAFT' && (!active || round.number > active.number))
      .sort((a, b) => a.number - b.number)[0] ?? null
  );
}

export function teamMatchIn<T extends Match>(
  matches: readonly T[],
  roundId: string | null | undefined,
  code: string | null | undefined,
): T | null {
  if (!roundId || !code) return null;
  return (
    matches.find(
      (match) =>
        match.round_id === roundId && match.participants.some((item) => item.team_code === code),
    ) ?? null
  );
}

/** First scheduled match of the team in a later, not-yet-closed round. */
export function nextTeamMatch<T extends Match>(
  matches: readonly T[],
  rounds: readonly Round[],
  code: string | null | undefined,
  afterNumber: number,
): T | null {
  if (!code) return null;
  const upcoming = [...rounds]
    .filter((round) => round.status !== 'CLOSED' && round.number > afterNumber)
    .sort((a, b) => a.number - b.number);
  for (const round of upcoming) {
    const match = teamMatchIn(matches, round.id, code);
    if (match && match.status === 'SCHEDULED') return match;
  }
  return null;
}

export function roundProgress(matches: readonly Match[], roundId: string | null | undefined) {
  const inRound = matches.filter((match) => match.round_id === roundId);
  const counted = inRound.filter((match) => match.status !== 'VOID');
  return {
    total: counted.length,
    completed: counted.filter((match) => match.status === 'COMPLETED').length,
    pending: counted.filter((match) => match.status === 'SCHEDULED').length,
    void: inRound.length - counted.length,
  };
}
