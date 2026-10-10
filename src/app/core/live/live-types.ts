import type {
  Outcome,
  PublicEvent,
  PublicGame,
  PublicMatch,
  PublicRound,
  PublicTeam,
} from '../player/public-types';

export type ResultOutcome = Exclude<Outcome, 'PENDING'>;
export interface MatchOutcome {
  team_id: string;
  outcome: ResultOutcome;
}
export interface LiveEvent extends PublicEvent {
  match_bonus_cap: number | null;
  match_penalty_cap: number | null;
  event_bonus_cap: number | null;
  event_penalty_cap: number | null;
}
export interface LiveMatch extends PublicMatch {
  result_entered_by: string | null;
  result_entered_at: string | null;
}
export interface LiveAdjustment {
  id: string;
  scope: 'MATCH' | 'EVENT';
  match_id: string | null;
  team_id: string;
  points: number;
  reason: string;
  given_by: { id: string; name_en: string; name_ar: string | null };
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}
export interface LiveSnapshot {
  event: LiveEvent;
  teams: PublicTeam[];
  games: PublicGame[];
  rounds: PublicRound[];
  matches: LiveMatch[];
  adjustments: LiveAdjustment[];
}
export type LiveMutation =
  | 'start_round'
  | 'extend_round'
  | 'close_round'
  | 'reopen_round'
  | 'submit_match_result'
  | 'reset_match_result'
  | 'void_match'
  | 'add_adjustment'
  | 'revoke_adjustment';

export interface MutationReceipt<T = unknown> {
  status: 'sent' | 'queued';
  opId: string;
  data?: T;
}
