import { Injectable } from '@angular/core';
import { isNetworkFailure } from '../offline/rpc-errors';
import type { LocalizedName, PublicTeam } from './public-types';

export interface RegistrationReceipt {
  id: string;
  event_id: string;
  team_id: string;
  team_code: string;
  status: 'ACTIVE' | 'REMOVED';
  version: number;
}
export interface TeamInviteView {
  event_id: string;
  event_name: string;
  event_name_ar: string | null;
  team: PublicTeam;
  guides: LocalizedName[];
}
export interface PlayerRegistration {
  id: string;
  name: string;
  phone: string | null;
  team_id: string;
  invite_id: string | null;
  status: 'ACTIVE' | 'REMOVED';
  version: number;
  removed_batch: string | null;
  created_at: string;
  possible_duplicate: boolean;
}
export interface TeamInvite {
  id: string;
  token: string;
  enabled: boolean;
  expires_at: string;
  created_at: string;
}
export interface TeamRoster {
  registration_open: boolean;
  admin: boolean;
  players: PlayerRegistration[];
  invites: TeamInvite[];
}
export interface RollbackPlayer {
  id: string;
  version: number;
  name: string;
}

/** Private online-only calls: no roster, phone, token or receipt in the read cache/queue. */
@Injectable({ providedIn: 'root' })
export class RegistrationApi {
  async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { supabase } = await import('../supabase/client');
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data as T;
  }
}

export function registrationError(error: unknown): string {
  if (isNetworkFailure(error)) return 'OFFLINE';
  const code = (error as { message?: string })?.message ?? '';
  return new Set([
    'INVITE_UNAVAILABLE',
    'INVALID_PLAYER_NAME',
    'INVALID_PHONE',
    'FORBIDDEN',
    'REGISTRATION_CHANGED',
    'REGISTRATION_RATE_LIMIT',
    'STAFF_USE_ASSIGNED_TEAM',
    'REASON_REQUIRED',
    'STORAGE_REQUIRED',
    'TEAM_ALREADY_SELECTED',
  ]).has(code)
    ? code
    : 'SAVE_FAILED';
}
