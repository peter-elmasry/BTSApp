import type { StaffProfile } from '../../core/auth/auth.store';
import type { DsStatus } from '../../shared/ui/status-pill';
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
  // Referees enter results while the round runs, plus the first result of a late match (D041).
  const round = snapshot.rounds.find((item) => item.id === match.round_id);
  const open =
    round?.status === 'ACTIVE' || (round?.status === 'CLOSED' && match.status === 'SCHEDULED');
  return (
    open &&
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

/** Match the server's exact hundredths without accepting a rounded extra decimal. */
export function validAdjustmentAmount(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value !== 0 &&
    value >= -2147483648 &&
    value <= 2147483647 &&
    Number(value.toFixed(2)) === value
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
    .reduce((sum, item) => sum + Math.round(Math.abs(item.points) * 100), 0);
  return Math.max(0, Math.round(cap * 100) - used) / 100;
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
    'NEUTRAL_GAME',
    'INVALID_PARTICIPANTS',
    'INVALID_REASON',
    'INVALID_MINUTES',
    'INVALID_START_OFFSET',
    'START_BEFORE_PREVIOUS_ROUND_END',
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

/** Status of a match for staff tables: late = no result after its round ended (D041). */
export function liveMatchStatus(
  match: Pick<LiveMatch, 'status'>,
  roundStatus: 'DRAFT' | 'ACTIVE' | 'CLOSED' | undefined,
): DsStatus {
  if (match.status === 'COMPLETED') return 'done';
  if (match.status === 'VOID') return 'void';
  if (roundStatus === 'CLOSED') return 'late';
  if (roundStatus === 'ACTIVE') return 'pending';
  return 'scheduled';
}

const ORDER: Record<DsStatus, number> = {
  late: 0,
  pending: 1,
  live: 2,
  scheduled: 3,
  queued: 4,
  done: 5,
  void: 6,
};

/** Pending and late first, then done, then void; stable by game code. */
export function sortForChase<T extends Pick<LiveMatch, 'status'>>(
  matches: readonly T[],
  status: (match: T) => DsStatus,
  code: (match: T) => string,
): T[] {
  return [...matches].sort(
    (a, b) => ORDER[status(a)] - ORDER[status(b)] || code(a).localeCompare(code(b)),
  );
}
