import type { PublicGame, PublicMatch, PublicRound } from '../../core/player/public-types';

/**
 * One schedule slot. `match: null` is a break (D037): no match was scheduled for that
 * game (or, in a team view, for that team) in that round. Breaks are derived, never stored.
 */
export interface ScheduleRow {
  key: string;
  round: PublicRound;
  game: PublicGame | null;
  match: PublicMatch | null;
}
export interface ScheduleGroup {
  id: string;
  /** Round heading when grouped by round, game heading when grouped by game. */
  round: PublicRound | null;
  game: PublicGame | null;
  rows: ScheduleRow[];
}

export function sortedRounds(rounds: readonly PublicRound[]) {
  return [...rounds].sort((a, b) => a.number - b.number);
}

function matchFor(matches: readonly PublicMatch[], roundId: string, gameId: string) {
  return matches.find((match) => match.round_id === roundId && match.game_id === gameId) ?? null;
}

/**
 * Every game in every regular round: the scheduled match or a break. The opening round
 * only lists its (all-teams) match, because unused stations are not breaks there.
 */
export function roundRows(
  round: PublicRound,
  games: readonly PublicGame[],
  matches: readonly PublicMatch[],
): ScheduleRow[] {
  if (round.type === 'OPENING')
    return matches
      .filter((match) => match.round_id === round.id)
      .map((match) => ({
        key: match.id,
        round,
        game: games.find((game) => game.id === match.game_id) ?? null,
        match,
      }));
  return games.map((game) => ({
    key: `${round.id}:${game.id}`,
    round,
    game,
    match: matchFor(matches, round.id, game.id),
  }));
}

export function groupByRound(
  rounds: readonly PublicRound[],
  games: readonly PublicGame[],
  matches: readonly PublicMatch[],
): ScheduleGroup[] {
  return sortedRounds(rounds)
    .map((round) => ({ id: round.id, round, game: null, rows: roundRows(round, games, matches) }))
    .filter((group) => group.rows.length);
}

/** One row per round for a game: its match, or a break. Unused opening stations are skipped. */
export function gameRows(
  rounds: readonly PublicRound[],
  game: PublicGame,
  matches: readonly PublicMatch[],
): ScheduleRow[] {
  return sortedRounds(rounds)
    .map((round) => ({
      key: `${round.id}:${game.id}`,
      round,
      game,
      match: matchFor(matches, round.id, game.id),
    }))
    .filter((row) => row.match || row.round.type !== 'OPENING');
}

export function groupByGame(
  rounds: readonly PublicRound[],
  games: readonly PublicGame[],
  matches: readonly PublicMatch[],
): ScheduleGroup[] {
  return games
    .map((game) => ({ id: game.id, round: null, game, rows: gameRows(rounds, game, matches) }))
    .filter((group) => group.rows.some((row) => row.match));
}

/** One row per round for a team: its match(es) in that round, or a break when it has none. */
export function teamRows(
  rounds: readonly PublicRound[],
  games: readonly PublicGame[],
  matches: readonly PublicMatch[],
  teamCode: string | null,
): ScheduleRow[] {
  if (!teamCode) return [];
  return sortedRounds(rounds).flatMap((round): ScheduleRow[] => {
    const own = matches.filter(
      (match) =>
        match.round_id === round.id &&
        match.participants.some((participant) => participant.team_code === teamCode),
    );
    if (!own.length)
      return round.type === 'OPENING'
        ? []
        : [{ key: `${round.id}:break`, round, game: null, match: null }];
    return own.map((match) => ({
      key: match.id,
      round,
      game: games.find((game) => game.id === match.game_id) ?? null,
      match,
    }));
  });
}
