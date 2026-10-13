import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../core/auth/auth.store';
import { OpQueueService } from '../core/offline/op-queue.service';
import { DirectionService } from '../core/i18n/i18n.service';
import { canSeeAllOutcomes, EventStore } from '../core/player/event.store';
import { localizedName } from '../features/public/public-helpers';
import { DsBottomSheet } from '../shared/ui/bottom-sheet';
import { DsPhoneLink } from '../shared/ui/phone-link';
import { LiveApi } from '../core/live/live-api';
import type { StaffContact } from '../core/live/live-types';
import { isEventAdmin } from './navigation';

/** Account and "More" sheet for signed-in members (UX plan §4.1, §4.4). */
@Component({
  selector: 'app-staff-menu',
  imports: [RouterLink, TranslocoDirective, DsBottomSheet, DsPhoneLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './staff-menu.html',
})
export class StaffMenu {
  readonly close = output<void>();
  readonly auth = inject(AuthStore);
  readonly events = inject(EventStore);
  readonly direction = inject(DirectionService);
  private readonly router = inject(Router);
  readonly eventId = computed(() => this.events.event()?.id ?? null);
  readonly admin = computed(() => isEventAdmin(this.auth.profile(), this.eventId()));
  readonly owner = computed(() => this.auth.profile()?.system_role === 'OWNER');
  readonly display = computed(() => canSeeAllOutcomes(this.events.event(), this.auth.profile()));
  readonly name = computed(() =>
    localizedName(
      {
        name_en: this.auth.profile()?.full_name_en,
        name_ar: this.auth.profile()?.full_name_ar,
      },
      this.direction.language(),
    ),
  );
  /** Roles in the current event, plus Owner. Guides show their team name. */
  readonly roles = computed(() => {
    const profile = this.auth.profile();
    if (!profile) return [];
    const teams = this.events.teams();
    const labels: { key: string; team?: string }[] = [];
    if (profile.system_role === 'OWNER') labels.push({ key: 'OWNER' });
    for (const role of profile.roles.filter((item) => item.event_id === this.eventId())) {
      const team = teams.find((item) => item.id === role.team_id);
      labels.push({
        key: role.role,
        team: team ? localizedName(team, this.direction.language()) : undefined,
      });
    }
    return labels;
  });

  /** Guides and referees reach the event administrators from any screen (D043). */
  readonly admins = signal<StaffContact[]>([]);
  private readonly loadAdmins = (() => {
    const id = this.eventId();
    if (!id || this.admin() || !this.auth.profile()) return;
    inject(LiveApi)
      .contacts(id)
      .then((contacts) => this.admins.set(Array.isArray(contacts) ? contacts : []))
      .catch(() => this.admins.set([]));
  })();
  contactName(contact: StaffContact) {
    return localizedName(contact, this.direction.language());
  }

  readonly queue = inject(OpQueueService);
  private readonly document = inject(DOCUMENT);
  readonly confirmLogout = signal(false);
  /** Unsent offline changes would be deleted with the device data, so ask first (D047). */
  async logout(confirmed = false) {
    if (!confirmed && this.queue.pending() > 0) {
      this.confirmLogout.set(true);
      return;
    }
    this.close.emit();
    await this.auth.logout();
    // A full reload drops every in-memory copy of the previous session.
    this.document.location.assign('/home');
  }
}
