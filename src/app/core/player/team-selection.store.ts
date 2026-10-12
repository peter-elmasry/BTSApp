import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { EventStore } from './event.store';

@Injectable({ providedIn: 'root' })
export class TeamSelectionStore {
  private readonly events = inject(EventStore);
  private readonly auth = inject(AuthStore);
  private readonly choices = signal<ReadonlyMap<string, string | null>>(new Map());
  readonly selectedCode = computed(() => {
    const eventId = this.events.event()?.id;
    if (!eventId) return null;
    const choices = this.choices();
    const code = choices.has(eventId) ? choices.get(eventId) : this.restore(eventId);
    return this.events.teams().some((team) => team.code === code) ? (code ?? null) : null;
  });
  readonly selectedTeam = computed(
    () => this.events.teams().find((team) => team.code === this.selectedCode()) ?? null,
  );

  /** Signed-in owners, event admins and referees may still switch for operational checks. */
  readonly exempt = computed(() => {
    const profile = this.auth.profile();
    const eventId = this.events.event()?.id;
    return (
      profile?.system_role === 'OWNER' ||
      !!profile?.roles.some(
        (role) =>
          role.event_id === eventId && (role.role === 'EVENT_ADMIN' || role.role === 'REFEREE'),
      )
    );
  });
  /** Players and guides keep their team once the first round of the event has started (D035). */
  readonly locked = computed(
    () => !this.exempt() && this.events.rounds().some((round) => !!round.started_at),
  );
  /** A player who never picked a team may still pick once after the lock. */
  readonly canChange = computed(() => !this.locked() || !this.selectedCode());

  constructor() {
    effect(() => {
      const eventId = this.events.event()?.id;
      if (!eventId) return;
      const choices = this.choices();
      const code = choices.has(eventId) ? choices.get(eventId) : this.restore(eventId);
      const valid = code && this.events.teams().some((team) => team.code === code) ? code : null;
      if (!choices.has(eventId) || code !== valid) {
        this.choices.set(new Map(choices).set(eventId, valid));
        if (code && !valid) this.persist(eventId, null);
      }
    });
  }

  choose(code: string): boolean {
    const eventId = this.events.event()?.id;
    if (!eventId || !this.events.teams().some((team) => team.code === code)) return false;
    if (!this.canChange() && this.selectedCode() !== code) return false;
    this.choices.set(new Map(this.choices()).set(eventId, code));
    this.persist(eventId, code);
    return true;
  }

  private restore(eventId: string): string | null {
    try {
      return localStorage.getItem(`bts.team.${eventId}`);
    } catch {
      return null;
    }
  }

  private persist(eventId: string, code: string | null) {
    try {
      if (code) localStorage.setItem(`bts.team.${eventId}`, code);
      else localStorage.removeItem(`bts.team.${eventId}`);
    } catch {
      /* Team choice remains usable in memory when browser storage is unavailable. */
    }
  }
}
