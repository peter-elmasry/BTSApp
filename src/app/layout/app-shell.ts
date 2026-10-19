import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../core/i18n/i18n.service';
import { DsToast } from '../shared/ui/toast';
import { AuthStore } from '../core/auth/auth.store';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { canSeeAllOutcomes, EventStore } from '../core/player/event.store';
import { TeamSelectionStore } from '../core/player/team-selection.store';
import { ServerClockService } from '../core/time/server-clock.service';
import { DsAvatar } from '../shared/ui/avatar';
import { DsBottomSheet } from '../shared/ui/bottom-sheet';
import { RoundBanner } from './round-banner';
import { OpQueueService } from '../core/offline/op-queue.service';
import { ReadCacheService } from '../core/offline/read-cache.service';
import { EventChannelService } from '../core/realtime/event-channel.service';
import { SessionOutlet } from '../core/auth/session-outlet';
import { InstallService } from '../core/pwa/install.service';
import { navigationFor } from './navigation';
import { StaffMenu } from './staff-menu';

import { QuickLook } from '../features/quick-look/quick-look.service';
import { QuickLookSheet } from '../features/quick-look/quick-look-sheet';
import { OpeningAttachmentCard } from '../shared/ui/opening-attachment-card';
import { AudioControls } from '../shared/ui/audio-controls';
import { RpcTransport } from '../core/offline/rpc-transport';
@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    SessionOutlet,
    QuickLookSheet,
    TranslocoDirective,
    DsToast,
    DsAvatar,
    DsBottomSheet,
    RoundBanner,
    StaffMenu,
    OpeningAttachmentCard,
    AudioControls,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.html',
})
export class AppShell {
  private readonly transport = inject(RpcTransport);
  private readonly headerEvent = signal<{
    id: string;
    name_en: string;
    name_ar: string | null;
    event_type?: string;
  } | null>(null);
  readonly viewedEvent = computed(() => {
    const match = this.routeUrl()?.match(/^\/(?:manage|players|join)\/([^/?#]+)/);
    if (!match) return this.events.event();
    return this.headerEvent()?.id === match[1] ? this.headerEvent() : null;
  });
  readonly testEvent = computed(() => this.viewedEvent()?.event_type === 'TEST');
  readonly openingAttachment = computed(
    () => this.events.rounds().find((round) => round.type === 'OPENING')?.attachment,
  );
  private readonly install = inject(InstallService);
  readonly direction = inject(DirectionService);
  readonly auth = inject(AuthStore);
  readonly events = inject(EventStore);
  readonly selection = inject(TeamSelectionStore);
  readonly queue = inject(OpQueueService);
  readonly cache = inject(ReadCacheService);
  private readonly channel = inject(EventChannelService);
  readonly switchSheet = signal(false);
  readonly menuOpen = signal(false);
  readonly quickLook = inject(QuickLook);
  private readonly clock = inject(ServerClockService);
  private readonly i18n = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly routeUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
  );
  readonly displayMode = computed(() => this.routeUrl()?.split(/[?#]/)[0] === '/display');
  readonly recapMode = computed(() => /\/recap(?:[?#]|$)/.test(this.routeUrl() ?? ''));
  readonly eventName = computed(() => {
    const event = this.viewedEvent();
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
    effect((cleanup) => {
      const match = this.routeUrl()?.match(/^\/(?:manage|players|join)\/([^/?#]+)/);
      this.channel.revision();
      let active = true;
      cleanup(() => {
        active = false;
      });
      if (match)
        void this.transport
          .rpc<{ id: string; name_en: string; name_ar: string | null; event_type?: string } | null>(
            'get_event_header',
            { p_event: match[1] },
          )
          .then((event) => {
            if (active) this.headerEvent.set(event);
          })
          .catch(() => undefined);
    });
    void this.auth.initialize().then(() => this.events.initialize());
    void this.clock.synchronize();
    effect(() => this.channel.watch(this.events.event()?.id ?? 'current'));
    let profileFlight = false;
    effect(() => {
      this.channel.revision();
      if (!this.auth.session() || !this.auth.ready() || profileFlight) return;
      profileFlight = true;
      void this.auth
        .loadProfile()
        .catch(() => undefined)
        .finally(() => {
          profileFlight = false;
        });
    });
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
  lastUpdated() {
    const stamp = this.cache.lastUpdated();
    return stamp
      ? new Intl.DateTimeFormat(this.direction.language() === 'ar' ? 'ar-EG' : 'en-GB', {
          timeZone: 'Africa/Cairo',
          hour: '2-digit',
          minute: '2-digit',
          numberingSystem: 'latn',
        }).format(stamp)
      : '';
  }
  queueError(code: string) {
    const key = `errors.${code}`;
    const translated = this.i18n.translate(key);
    return translated === key ? this.i18n.translate('live.uploadFailed') : translated;
  }
  readonly initials = computed(() => {
    const profile = this.auth.profile();
    const name =
      (this.direction.language() === 'ar' ? profile?.full_name_ar : profile?.full_name_en) ||
      profile?.full_name_en ||
      profile?.username ||
      '';
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || '•'
    );
  });
  readonly visibleNavigation = computed(() =>
    navigationFor(
      this.auth.profile(),
      this.routeUrl()?.match(/^\/manage\/([^/?#]+)/)?.[1] ?? this.events.event()?.id ?? null,
      !!this.events.event() && canSeeAllOutcomes(this.events.event(), this.auth.profile()),
    ),
  );
}
