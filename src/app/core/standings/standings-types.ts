import type { LocalizedName, PublicEvent, PublicTeam } from '../player/public-types';

export interface StandingRow {
  rank: number;
  team: PublicTeam;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  forfeits: number;
  match_points: number;
  adjustment_points: number;
  total: number;
  is_tied: boolean;
  final_tiebreak_pos: number | null;
}
export interface ExportMatch {
  id: string;
  round_number: number;
  round_type: 'REGULAR' | 'OPENING';
  game_code: string;
  game_name_en: string;
  game_name_ar: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'VOID';
  participants: { team_code: string; name_en: string; name_ar: string | null; outcome: string }[];
  entered_by: LocalizedName | null;
  result_entered_at: string | null;
}
export interface ExportAdjustment {
  id: string;
  team_code: string;
  team_name_en: string;
  team_name_ar: string | null;
  scope: 'MATCH' | 'EVENT';
  match_id: string | null;
  points: number;
  reason: string;
  given_by: LocalizedName;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
}
export interface ExportStaff extends LocalizedName {
  member_id: string;
  username: string;
  role: 'EVENT_ADMIN' | 'REFEREE' | 'GUIDE';
  game_codes: string[];
  team_code: string | null;
}
export interface StandingsExport {
  event: PublicEvent;
  generated_at: string;
  standings: StandingRow[];
  matches: ExportMatch[];
  adjustments: ExportAdjustment[];
  staff: ExportStaff[];
}
