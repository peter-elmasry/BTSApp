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
