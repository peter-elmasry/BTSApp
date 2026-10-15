import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AuthStore } from '../auth/auth.store';
import { EventStore } from './event.store';
import { RegistrationStore } from './registration.store';

@Injectable({ providedIn: 'root' })
export class TeamSelectionStore {
  private readonly events = inject(EventStore);
  private readonly auth = inject(AuthStore);
  readonly registration = inject(RegistrationStore);
  private readonly choices = signal<ReadonlyMap<string, string | null>>(new Map());
  readonly selectedCode = computed(() => {
    const eventId = this.events.event()?.id;
    if (!eventId) return null;
    const receipt = this.registration.receipt();
    if (receipt)
      return receipt.status === 'ACTIVE' &&
        this.events.teams().some((t) => t.code === receipt.team_code)
        ? receipt.team_code
        : null;
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
  readonly canChange = computed(() => {
    if (this.registration.receipt()) return false;
    if (!this.exempt() && this.guidedTeamCodes().length) return this.guidedTeamCodes().length > 1;
    return !this.locked() || !this.selectedCode();
  });
  /** Codes of the teams the signed-in member guides in the current event (D044). */
  readonly guidedTeamCodes = computed(() => {
    const eventId = this.events.event()?.id;
    const teamIds = new Set(
      (this.auth.profile()?.roles ?? [])
        .filter((role) => role.event_id === eventId && role.role === 'GUIDE' && role.team_id)
        .map((role) => role.team_id),
    );
    return this.events
      .teams()
      .filter((team) => teamIds.has(team.id))
      .map((team) => team.code);
  });
  /**
   * Signed-in staff who guide no team (owners, admins, referees) never pick a team: they
   * work from their own screens (product owner, 2026-10-13).
   */
  readonly staffWithoutTeam = computed(
    () => !!this.auth.session() && !!this.auth.profile() && this.guidedTeamCodes().length === 0,
  );
  /** Signed-in guides may always move among their own teams, even after the lock (D044). */
  readonly canSwitch = computed(() => this.canChange() || this.guidedTeamCodes().length > 1);

  canChoose(code: string): boolean {
    const receipt = this.registration.receipt();
    if (receipt) return receipt.status === 'ACTIVE' && receipt.team_code === code;
    if (!this.exempt() && this.guidedTeamCodes().length)
      return this.guidedTeamCodes().includes(code);
    return (
      this.canChange() || this.selectedCode() === code || this.guidedTeamCodes().includes(code)
    );
  }

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
    effect(() => {
      const eventId = this.events.event()?.id;
      const guided = this.guidedTeamCodes();
      if (!eventId || !guided.length) return;
      const selected = this.selectedCode();
      if (selected && guided.includes(selected)) return;
      untracked(() => this.autoGuide(eventId, guided));
    });
  }

  private autoGuide(eventId: string, guided: readonly string[]) {
    // A guide's device follows their team on sign-in; several teams are picked by the guide.
    const current = this.choices().get(eventId) ?? null;
    if (guided.length !== 1 || current === guided[0]) return;
    this.choices.set(new Map(this.choices()).set(eventId, guided[0]));
    this.persist(eventId, guided[0]);
  }

  choose(code: string): boolean {
    const eventId = this.events.event()?.id;
    if (!eventId || !this.events.teams().some((team) => team.code === code)) return false;
    if (!this.canChoose(code)) return false;
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
