import { Injectable, signal } from '@angular/core';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

export interface StaffProfile {
  id: string;
  username: string;
  phone: string | null;
  full_name_en: string;
  full_name_ar: string | null;
  system_role: 'OWNER' | 'MEMBER';
  roles: { event_id: string; role: 'EVENT_ADMIN' | 'REFEREE' | 'GUIDE'; team_id: string | null }[];
  assigned_games: { event_id: string; game_id: string }[];
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  readonly ready = signal(false);
  readonly session = signal<Session | null>(null);
  readonly profile = signal<StaffProfile | null>(null);
  private initialization?: Promise<void>;
  private clientPromise?: Promise<SupabaseClient>;

  private client(): Promise<SupabaseClient> {
    return (this.clientPromise ??= import('../supabase/client').then((module) => module.supabase));
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = (async () => {
      const supabase = await this.client();
      const { data } = await supabase.auth.getSession();
      this.session.set(data.session);
      if (data.session) await this.loadProfile();
      supabase.auth.onAuthStateChange((_event, session) => {
        this.session.set(session);
        if (!session) {
          this.profile.set(null);
          this.ready.set(true);
        } else queueMicrotask(() => void this.loadProfile());
      });
      this.ready.set(true);
    })();
    return this.initialization;
  }

  async login(identifier: string, password: string): Promise<string | null> {
    const supabase = await this.client();
    const { data, error } = await supabase.functions.invoke('login', {
      body: { identifier, password },
    });
    if (error || !data?.access_token || !data?.refresh_token)
      return await this.errorCode(error, data);
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sessionError) return 'INVALID_CREDENTIALS';
    await this.loadProfile();
    return null;
  }

  async logout() {
    const supabase = await this.client();
    await supabase.auth.signOut();
    this.session.set(null);
    this.profile.set(null);
  }

  async loadProfile() {
    const supabase = await this.client();
    const { data, error } = await supabase.rpc('get_my_profile');
    if (error) {
      this.profile.set(null);
      if (error.code === 'P0001') await supabase.auth.signOut();
    } else this.profile.set(data as StaffProfile);
    this.ready.set(true);
  }

  private async errorCode(error: unknown, data: unknown): Promise<string> {
    const body = (data as { error?: string } | null)?.error;
    if (body) return body;
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } } | null)
      ?.context;
    if (context?.json) {
      try {
        const parsed = await context.json();
        if (parsed.error) return parsed.error;
      } catch {
        /* Keep the generic credential response. */
      }
    }
    return 'INVALID_CREDENTIALS';
  }
}
