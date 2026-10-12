import type { StandingRow } from '../standings/standings-types';

export interface LocalizedName {
  name_en: string;
  name_ar: string | null;
}
export interface PublicEvent extends LocalizedName {
  id: string;
  code: string;
  status: 'DRAFT' | 'LIVE' | 'FINISHED' | 'ARCHIVED';
  starts_on: string | null;
  leaderboard_public: boolean;
  show_guide_phone: boolean;
  points_win: number;
  points_draw: number;
  points_loss: number;
  currency_en_one: string;
  currency_en_other: string;
  currency_ar_one: string;
  currency_ar_two: string;
  currency_ar_plural: string;
  /** Scoring mode (D038); optional so snapshots cached before Phase 8 still load. */
  scoring_mode?: 'POINTS' | 'LIVES';
  initial_lives?: number | null;
  life_emoji?: string;
}
export interface PublicGuide {
  name_en: string;
  name_ar: string | null;
  phone?: string | null;
}
export interface PublicTeam extends LocalizedName {
  id: string;
  code: string;
  avatar_key: string;
  color_hex: string;
  sort_order: number;
  guide: PublicGuide | null;
  guides?: PublicGuide[];
}
export interface PublicGame extends LocalizedName {
  id: string;
  code: string;
  location_en: string | null;
  location_ar: string | null;
  image_path: string | null;
  /** Names of the active referees assigned to this game (names only). */
  referees?: LocalizedName[];
}
export interface PublicRound {
  id: string;
  number: number;
  type: 'REGULAR' | 'OPENING';
  name_en: string | null;
  name_ar: string | null;
  duration_min: number;
  extension_min: number;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  started_at: string | null;
  closed_at: string | null;
  ends_at: string | null;
  is_overtime: boolean;
  /** Matches still without a result after the round ended (D041). */
  late_count?: number;
}
export type Outcome = 'PENDING' | 'WIN' | 'LOSS' | 'DRAW' | 'FORFEIT';
export interface PublicParticipant {
  team_id: string;
  team_code: string;
  side: 'A' | 'B' | null;
  outcome?: Outcome;
}
export interface PublicMatch {
  id: string;
  round_id: string;
  game_id: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'VOID';
  participants: PublicParticipant[];
  result_entered_at?: string | null;
  /** Team view only: points this match earned the team (POINTS events). */
  points?: number;
  /** Team view only: lives this match cost the team, 0 or -1 (LIVES events). */
  lives_delta?: number;
}
export interface PublicBootstrap {
  teams: PublicTeam[];
  games: PublicGame[];
  rounds: PublicRound[];
}
export interface PublicAdjustment {
  id: string;
  scope: 'MATCH' | 'EVENT';
  match_id: string | null;
  points: number;
  reason: string;
  given_by: { name_en: string; name_ar: string | null };
  created_at: string;
}
/** Server-computed reconciliation of a team's total (same SQL as the standings). */
export interface TeamBreakdown {
  scoring_mode: 'POINTS' | 'LIVES';
  initial_lives: number | null;
  match_points: number;
  adjustment_points: number;
  total: number;
  lives_lost: number | null;
}
export interface PublicTeamView {
  team: PublicTeam;
  matches: PublicMatch[];
  adjustments: PublicAdjustment[];
  standing?: StandingRow;
  breakdown?: TeamBreakdown;
}
