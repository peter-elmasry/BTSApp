type TeamRef = { code: string };
type MatchRef = { id: string; round_id: string; team_codes?: string[]; teamCodes?: string[] };

export const TEAM_AVATARS = [
  'falcon',
  'lion',
  'fox',
  'owl',
  'eagle',
  'turtle',
  'dolphin',
  'whale',
  'butterfly',
  'horse',
  'star',
  'shield',
  'bolt',
  'mountain',
  'sun',
  'moon',
  'flame',
  'wave',
  'anchor',
  'crown',
  'ball',
  'racket',
  'trophy',
  'compass',
];

export function availableTeamCodes(
  teams: TeamRef[],
  matches: MatchRef[],
  roundId: string,
  exceptMatchId?: string,
) {
  const used = new Set<string>();
  for (const match of matches) {
    if (match.round_id !== roundId || match.id === exceptMatchId) continue;
    for (const code of match.team_codes ?? match.teamCodes ?? []) used.add(String(code));
  }
  return teams.filter((team) => !used.has(String(team.code))).map((team) => String(team.code));
}

export function validMatchSelection(a: string, b: string) {
  return !!a && !!b && a !== b;
}

/** Twelve distinct team colours used by "Add N teams" and the swatch picker. */
export const TEAM_SWATCHES = [
  '#087F8C',
  '#172B4D',
  '#C53030',
  '#16794B',
  '#9A6700',
  '#2563EB',
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#0F766E',
  '#4B5563',
  '#65A30D',
];

/** Next free codes after the highest existing one, e.g. T03, T04… */
export function nextCodes(existing: readonly string[], prefix: 'T' | 'G', count: number) {
  const max = Math.max(
    0,
    ...existing.map((code) => Number(code.replace(/^\D+/, ''))).filter(Number.isFinite),
  );
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(max + index + 1).padStart(2, '0')}`,
  );
}

/** Generated teams: unused avatars first (round-robin), distinct colours. */
export function newTeams(existing: readonly { code: string; avatar_key: string }[], count: number) {
  const used = new Set(existing.map((team) => team.avatar_key));
  const avatars = [...TEAM_AVATARS.filter((key) => !used.has(key)), ...TEAM_AVATARS];
  return nextCodes(
    existing.map((team) => team.code),
    'T',
    count,
  ).map((code, index) => {
    const number = Number(code.slice(1));
    return {
      code,
      name_en: `Team ${number}`,
      name_ar: `فريق ${number}`,
      avatar_key: avatars[index % avatars.length],
      color_hex: TEAM_SWATCHES[(existing.length + index) % TEAM_SWATCHES.length],
    };
  });
}

type ScheduleMatch = { round_id: string; team_codes?: string[] };
type ScheduleRound = { id: string; number: number; type: string; matches?: unknown[] };

export interface SetupIssue {
  key: string;
  tab: 'settings' | 'teams' | 'games' | 'rounds' | 'staff';
  params?: Record<string, unknown>;
}

/** Readiness checks shown on the Review step (U7). The server still validates everything. */
export function setupIssues(data: {
  name: string;
  teams: readonly unknown[];
  games: readonly { id: string }[];
  rounds: readonly ScheduleRound[];
  matches: readonly (ScheduleMatch & { game_id: string })[];
  refereeGameIds: ReadonlySet<string>;
}): SetupIssue[] {
  const issues: SetupIssue[] = [];
  if (!data.name.trim()) issues.push({ key: 'review.noName', tab: 'settings' });
  if (data.teams.length < 2) issues.push({ key: 'review.fewTeams', tab: 'teams' });
  if (!data.games.length) issues.push({ key: 'review.noGames', tab: 'games' });
  if (!data.rounds.length) issues.push({ key: 'review.noRounds', tab: 'rounds' });
  if (data.rounds.filter((round) => round.type === 'OPENING').length > 1)
    issues.push({ key: 'review.manyOpening', tab: 'rounds' });
  for (const round of data.rounds) {
    const matches = data.matches.filter((match) => match.round_id === round.id);
    if (!matches.length)
      issues.push({ key: 'review.emptyRound', tab: 'rounds', params: { n: round.number } });
    if (round.type === 'REGULAR') {
      if (matches.some((match) => (match.team_codes ?? []).length !== 2))
        issues.push({ key: 'review.incompleteMatch', tab: 'rounds', params: { n: round.number } });
      const codes = matches.flatMap((match) => match.team_codes ?? []);
      if (new Set(codes).size !== codes.length)
        issues.push({ key: 'review.teamTwice', tab: 'rounds', params: { n: round.number } });
    }
  }
  const usedGames = new Set(data.matches.map((match) => match.game_id));
  const unrefereed = data.games.filter(
    (game) => usedGames.has(game.id) && !data.refereeGameIds.has(game.id),
  ).length;
  if (unrefereed) issues.push({ key: 'review.noReferee', tab: 'staff', params: { n: unrefereed } });
  return issues;
}

/** Pairs already played in an earlier round (rematch warning in the schedule grid). */
export function repeatedPair(
  matches: readonly ScheduleMatch[],
  rounds: readonly { id: string; number: number }[],
  roundId: string,
  codes: readonly string[],
) {
  if (codes.length !== 2) return false;
  const number = rounds.find((round) => round.id === roundId)?.number ?? 0;
  const key = [...codes].sort().join('|');
  return matches.some(
    (match) =>
      match.round_id !== roundId &&
      (rounds.find((round) => round.id === match.round_id)?.number ?? 0) < number &&
      [...(match.team_codes ?? [])].sort().join('|') === key,
  );
}
