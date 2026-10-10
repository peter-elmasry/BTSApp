import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../core/i18n/i18n.service';
import { DsToast } from '../shared/ui/toast';
import { AuthStore } from '../core/auth/auth.store';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { EventStore } from '../core/player/event.store';
import { TeamSelectionStore } from '../core/player/team-selection.store';
import { ServerClockService } from '../core/time/server-clock.service';
import { DsAvatar } from '../shared/ui/avatar';
import { DsBottomSheet } from '../shared/ui/bottom-sheet';
import { RoundBanner } from './round-banner';

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslocoDirective,
    DsToast,
    DsAvatar,
    DsBottomSheet,
    RoundBanner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.html',
})
export class AppShell {
  readonly direction = inject(DirectionService);
  readonly auth = inject(AuthStore);
  readonly events = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly switchSheet = signal(false);
  private readonly clock = inject(ServerClockService);
  private readonly i18n = inject(TranslocoService);
  private readonly router = inject(Router);
  readonly eventName = computed(() => {
    const event = this.events.event();
    const language = this.direction.language();
    return event
      ? language === 'ar'
        ? event.name_ar || event.name_en
        : event.name_en || event.name_ar
      : this.i18n.translate('app.title');
  });
  readonly teamName = computed(() => {
    const team = this.selection.selectedTeam();
    return team
      ? this.direction.language() === 'ar'
        ? team.name_ar || team.name_en
        : team.name_en || team.name_ar || ''
      : '';
  });
  constructor() {
    void this.auth.initialize().then(() => this.events.initialize());
    void this.clock.synchronize();
    let previousIdentity: string | undefined;
    effect(() => {
      if (!this.auth.ready()) return;
      const identity = JSON.stringify(this.auth.profile());
      if (previousIdentity !== undefined && previousIdentity !== identity)
        void this.events.refresh();
      previousIdentity = identity;
    });
  }
  async switchTeam() {
    this.switchSheet.set(false);
    await this.router.navigate(['/choose-team'], { queryParams: { switch: '1' } });
  }
  async logout() {
    await this.auth.logout();
    await this.router.navigateByUrl('/home');
  }
  readonly navigation = [
    { path: '/home', key: 'nav.home', icon: '⌂' },
    { path: '/schedule', key: 'nav.schedule', icon: '▦' },
    { path: '/about', key: 'nav.about', icon: '◉' },
  ];
  readonly visibleNavigation = computed(() => {
    const items = [...this.navigation];
    const profile = this.auth.profile();
    if (profile?.system_role === 'OWNER') {
      items.push({ path: '/owner/members', key: 'owner.title', icon: '♙' });
    }
    const adminRole = profile?.roles.find((role) => role.role === 'EVENT_ADMIN');
    if (adminRole) {
      items.push({
        path: `/manage/${adminRole.event_id}/setup`,
        key: 'manage.title',
        icon: '⚙',
      });
    }
    return items;
  });
}
