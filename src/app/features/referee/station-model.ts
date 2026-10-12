import type { LiveMatch, LiveSnapshot, StaffContact } from '../../core/live/live-types';

export interface StationGroups {
  /** Matches of the running round at this station; ones without a result first. */
  current: LiveMatch[];
  /** Matches of ended rounds still without a result (D041). */
  late: LiveMatch[];
}

type Snapshot = Pick<LiveSnapshot, 'matches' | 'rounds' | 'games'>;
const open = (match: LiveMatch) => match.status === 'SCHEDULED';

/** Round number, then game code: the order referees see on paper. */
function orderBy(snapshot: Snapshot) {
  const round = (match: LiveMatch) =>
    snapshot.rounds.find((item) => item.id === match.round_id)?.number ?? 0;
  const game = (match: LiveMatch) =>
    snapshot.games.find((item) => item.id === match.game_id)?.code ?? '';
  return (a: LiveMatch, b: LiveMatch) => round(a) - round(b) || game(a).localeCompare(game(b));
}

export function stationGroups(snapshot: Snapshot): StationGroups {
  const order = orderBy(snapshot);
  const current = snapshot.matches
    .filter((match) => match.bucket === 'current')
    .sort((a, b) => Number(open(b)) - Number(open(a)) || order(a, b));
  const late = snapshot.matches.filter((match) => match.bucket === 'late').sort(order);
  return { current, late };
}

/** The next match that still needs this referee's result, skipping `savedId`. */
export function nextActionable(snapshot: Snapshot, savedId: string | null): LiveMatch | null {
  const { current, late } = stationGroups(snapshot);
  return (
    [...current, ...late].find(
      (match) => match.id !== savedId && open(match) && match.editable !== false,
    ) ?? null
  );
}

/** Guides of the teams in a match, with phones (D043/D048: referees are members). */
export function guidesFor(
  snapshot: Pick<LiveSnapshot, 'team_guides'>,
  match: Pick<LiveMatch, 'participants'>,
): (StaffContact & { team_id: string })[] {
  const teams = new Set(match.participants.map((participant) => participant.team_id));
  return (snapshot.team_guides ?? []).filter((guide) => teams.has(guide.team_id));
}
