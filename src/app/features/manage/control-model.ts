import type { PublicRound } from '../../core/player/public-types';

type Round = Pick<PublicRound, 'id' | 'number' | 'status' | 'duration_min' | 'extension_min'>;

/** The round "End & start next" would start: the lowest-numbered DRAFT round after it. */
export function nextRoundAfter<T extends Round>(rounds: readonly T[], current: T | undefined) {
  if (!current) return null;
  return (
    [...rounds]
      .filter((round) => round.status === 'DRAFT' && round.number > current.number)
      .sort((a, b) => a.number - b.number)[0] ?? null
  );
}

/** Planned end of a round started `minutesAgo` before `nowMs` (D042 preview). */
export function plannedEnd(
  round: Pick<Round, 'duration_min' | 'extension_min'>,
  nowMs: number,
  minutesAgo: number,
) {
  const start = nowMs - Math.max(0, minutesAgo) * 60_000;
  return start + (round.duration_min + round.extension_min) * 60_000;
}

export function validOffset(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 180;
}
