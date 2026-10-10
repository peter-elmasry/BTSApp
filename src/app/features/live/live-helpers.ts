import type { StaffProfile } from '../../core/auth/auth.store';
import type {
  LiveAdjustment,
  LiveMatch,
  LiveSnapshot,
  MatchOutcome,
} from '../../core/live/live-types';

export function isLiveAdmin(profile: StaffProfile | null, eventId: string) {
  return (
    profile?.system_role === 'OWNER' ||
    !!profile?.roles.some((role) => role.event_id === eventId && role.role === 'EVENT_ADMIN')
  );
}

export function canEditLiveMatch(
  snapshot: LiveSnapshot | null,
  match: LiveMatch | null | undefined,
  profile: StaffProfile | null,
) {
  if (!snapshot || !match || match.status === 'VOID') return false;
  if (isLiveAdmin(profile, snapshot.event.id)) return true;
  return (
    snapshot.rounds.some((round) => round.id === match.round_id && round.status === 'ACTIVE') &&
    !!profile?.roles.some(
      (role) => role.event_id === snapshot.event.id && role.role === 'REFEREE',
    ) &&
    !!profile.assigned_games.some(
      (assignment) =>
        assignment.event_id === snapshot.event.id && assignment.game_id === match.game_id,
    )
  );
}

export function validOutcomes(
  type: 'REGULAR' | 'OPENING',
  teamIds: string[],
  outcomes: MatchOutcome[],
) {
  if (
    outcomes.length !== teamIds.length ||
    new Set(outcomes.map((item) => item.team_id)).size !== teamIds.length ||
    outcomes.some((item) => !teamIds.includes(item.team_id))
  )
    return false;
  const values = outcomes.map((item) => item.outcome);
  if (type === 'REGULAR')
    return (
      teamIds.length === 2 &&
      [
        'WIN/LOSS',
        'LOSS/WIN',
        'DRAW/DRAW',
        'FORFEIT/WIN',
        'WIN/FORFEIT',
        'FORFEIT/FORFEIT',
      ].includes(values.join('/'))
    );
  return (
    teamIds.length > 0 &&
    values.every((outcome) => ['WIN', 'LOSS', 'FORFEIT'].includes(outcome)) &&
    (values.includes('WIN') || values.every((outcome) => outcome === 'FORFEIT'))
  );
}

export function remainingAllowance(
  cap: number | null,
  adjustments: LiveAdjustment[],
  teamId: string,
  scope: 'MATCH' | 'EVENT',
  matchId: string | null,
  positive: boolean,
) {
  if (cap === null) return null;
  const used = adjustments
    .filter(
      (item) =>
        !item.revoked_at &&
        item.team_id === teamId &&
        item.scope === scope &&
        (scope === 'EVENT' || item.match_id === matchId) &&
        (positive ? item.points > 0 : item.points < 0),
    )
    .reduce((sum, item) => sum + Math.abs(item.points), 0);
  return Math.max(0, cap - used);
}

export function liveErrorKey(error: unknown) {
  const code =
    typeof error === 'object' && error
      ? String(
          ('message' in error ? error.message : undefined) ?? ('code' in error ? error.code : ''),
        )
      : '';
  if (code === 'CAP_EXCEEDED') return 'live.capReached';
  const known = [
    'FORBIDDEN',
    'NOT_FOUND',
    'ROUND_NOT_ACTIVE',
    'ROUND_NOT_DRAFT',
    'ROUND_NOT_CLOSED',
    'ACTIVE_ROUND_EXISTS',
    'PENDING_MATCHES',
    'INVALID_OUTCOMES',
    'INVALID_PARTICIPANTS',
    'INVALID_REASON',
    'INVALID_MINUTES',
    'MATCH_VOID',
    'ADJUSTMENT_REVOKED',
    'INVALID_POINTS',
    'INVALID_ADJUSTMENT',
    'INVALID_ROUND_MATCHES',
    'OP_ID_CONFLICT',
    'INVALID_OP_ID',
    'OFFLINE_STORAGE_UNAVAILABLE',
    'UNAUTHENTICATED',
  ];
  return known.includes(code) ? `errors.${code}` : 'live.requestFailed';
}
