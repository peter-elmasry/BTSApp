import { inject, Injectable } from '@angular/core';
import { RpcTransport } from '../offline/rpc-transport';
import type { PublicEvent } from '../player/public-types';
import type { StandingsExport } from '../standings/standings-types';

export interface HistoryEvent extends PublicEvent {
  roles: {
    role: string;
    team_code: string | null;
    team_name: string | null;
    game_codes: string[];
  }[];
  can_recap: boolean;
}
export interface EventHistory {
  history: HistoryEvent[];
  managed: PublicEvent[];
}
export interface RecapPlayer {
  id: string;
  name: string;
  phone: string | null;
  team_code: string;
  status: 'ACTIVE' | 'REMOVED';
  created_at: string;
  invite_id: string | null;
  invite_team_code: string | null;
  invite_created_at: string | null;
  invite_created_by: string | null;
  possible_duplicate: boolean;
}
export interface EventRecap extends StandingsExport {
  settings?: {
    registration_open: boolean;
    leaderboard_public: boolean;
    match_bonus_cap: number | null;
    match_penalty_cap: number | null;
    event_bonus_cap: number | null;
    event_penalty_cap: number | null;
    created_at: string;
    finished_by: string | null;
  };
  players: RecapPlayer[];
  blockers: { round_ids: string[]; match_ids: string[] };
  rounds: {
    id: string;
    number: number;
    type: string;
    name_en: string | null;
    status: string;
    duration_min: number;
    extension_min: number;
    started_at: string | null;
    closed_at: string | null;
  }[];
  teams: { id: string; code: string; name_en: string }[];
  games: {
    id: string;
    code: string;
    name_en: string;
    location_en: string | null;
    is_neutral: boolean;
  }[];
}

/** Private report snapshots never enter the offline read cache or operation queue. */
@Injectable({ providedIn: 'root' })
export class EventReportApi {
  private readonly transport = inject(RpcTransport);
  history(): Promise<EventHistory> {
    return this.transport.rpc('get_my_event_history', {});
  }
  recap(eventId: string): Promise<EventRecap> {
    return this.transport.rpc('get_event_recap', { p_event: eventId });
  }
  finish(eventId: string, opId: string): Promise<PublicEvent> {
    return this.transport.rpc('finish_event', { p_event: eventId, p_op_id: opId });
  }
}

export function completionReady(report: EventRecap): boolean {
  return (
    ['DRAFT', 'LIVE'].includes(report.event.status) &&
    report.blockers.round_ids.length === 0 &&
    report.blockers.match_ids.length === 0
  );
}
