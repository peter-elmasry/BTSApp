import { inject, Injectable, signal } from '@angular/core';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { OfflineDb } from '../offline/offline-db';
import { isNetworkFailure } from '../offline/rpc-errors';
import { environment } from '../../../environments/environment';

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
  private readonly db = inject(OfflineDb);
  readonly ready = signal(false);
  readonly session = signal<Session | null>(null);
  readonly profile = signal<StaffProfile | null>(null);
  private initialization?: Promise<void>;
  private clientPromise?: Promise<SupabaseClient>;
  private profileGeneration = 0;

  private profileKey(userId: string) {
    return `${environment.supabaseUrl}:profile:${userId}`;
  }

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
        if (session?.user.id !== this.session()?.user.id) {
          this.profileGeneration++;
          this.profile.set(null);
        }
        this.session.set(session);
        if (!session) {
          this.profileGeneration++;
          const oldUser = this.profileUser;
          if (oldUser) void this.db.removeCache(this.profileKey(oldUser)).catch(() => {});
          this.profileUser = null;
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
    const userId = this.session()?.user.id;
    await supabase.auth.signOut();
    this.profileGeneration++;
    this.session.set(null);
    this.profile.set(null);
    if (userId) await this.db.removeCache(this.profileKey(userId)).catch(() => {});
  }

  private profileUser: string | null = null;
  async loadProfile() {
    const userId = this.session()?.user.id;
    if (!userId) return;
    const generation = ++this.profileGeneration;
    const current = () =>
      generation === this.profileGeneration && this.session()?.user.id === userId;
    const supabase = await this.client();
    const { data, error } = await supabase.rpc('get_my_profile');
    if (!current()) return;
    if (error) {
      if (isNetworkFailure(error)) {
        // Keep the same actor's profile while loading its offline copy. Clearing it
        // temporarily would change the cache scope and erase usable staff reads.
        if (this.profileUser !== userId) this.profile.set(null);
        try {
          const cached = await this.db.cached(this.profileKey(userId));
          if (current() && cached) {
            this.profile.set(cached.data as StaffProfile);
            this.profileUser = userId;
          }
        } catch {
          // Without a prior profile, staff routes remain unavailable offline.
        }
      } else {
        this.profile.set(null);
        await this.db.removeCache(this.profileKey(userId)).catch(() => {});
      }
      if (error.code === 'P0001') await supabase.auth.signOut();
    } else {
      this.profile.set(data as StaffProfile);
      this.profileUser = userId;
      const key = this.profileKey(userId);
      await this.db
        .cache({
          key,
          scope: key,
          private: true,
          data: { ...(data as StaffProfile), phone: null },
          updatedAt: Date.now(),
        })
        .catch(() => {});
      if (!current()) await this.db.removeCache(key).catch(() => {});
    }
    if (current()) this.ready.set(true);
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
