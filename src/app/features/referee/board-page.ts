import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { LiveApi } from '../../core/live/live-api';
import type { LiveMatch, LiveSnapshot, StaffContact } from '../../core/live/live-types';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { EventStore } from '../../core/player/event.store';
import { DsAvatar } from '../../shared/ui/avatar';
import {
  DsCellDef,
  DsDataTable,
  type DsColumn,
  type DsRowStatus,
} from '../../shared/ui/data-table';
import { DsOutcome } from '../../shared/ui/outcome';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { DsStatusPill, type DsStatus } from '../../shared/ui/status-pill';
import { DsTimerRing } from '../../shared/ui/timer-ring';
import { ToastService } from '../../shared/ui/toast';
import { liveMatchStatus } from '../live/live-helpers';
import { LiveReader } from '../live/live-reader';
import { localizedLocation, localizedName } from '../public/public-helpers';
import { RefereeSchedule } from './referee-schedule';
import { guidesFor, nextActionable, stationGroups } from './station-model';

/**
 * Referee "My station" (U5): the running round's matches as hero cards with the teams'
 * guides one tap away, late matches as a table, then the round × game schedule and
 * the event administrators' phones.
 */
@Component({
  selector: 'app-referee-board-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    DsAvatar,
    DsCellDef,
    DsDataTable,
    DsOutcome,
    DsPhoneLink,
    DsStatusPill,
    DsTimerRing,
    RefereeSchedule,
  ],
  providers: [LiveReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board-page.html',
})
export class RefereeBoardPage {
  readonly events = inject(EventStore);
  readonly reader = inject(LiveReader);
  readonly direction = inject(DirectionService);
  private readonly api = inject(LiveApi);
  private readonly queue = inject(OpQueueService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  readonly groups = computed(() => {
    const data = this.reader.data();
    return data ? stationGroups(data) : { current: [], late: [] };
  });
  readonly activeRound = computed(
    () => this.reader.data()?.rounds.find((round) => round.status === 'ACTIVE') ?? null,
  );
  readonly admins = signal<StaffContact[]>([]);
  readonly track = (match: LiveMatch) => match.id;
  readonly rowStatus = (match: LiveMatch): DsRowStatus => this.status(match);
  readonly searchText = (match: LiveMatch) =>
    [this.gameName(match), ...match.participants.map((item) => this.teamName(item.team_id))].join(
      ' ',
    );

  constructor() {
    void this.events.initialize();
    effect(() => {
      const id = this.events.event()?.id;
      this.reader.source.set(id ? { kind: 'board', id } : null);
    });
    effect(() => {
      const id = this.events.event()?.id;
      if (!id) return;
      this.api
        .contacts(id)
        .then((contacts) => this.admins.set(Array.isArray(contacts) ? contacts : []))
        .catch(() => this.admins.set([]));
    });
    // Back from a saved result: say so and point at the next match (U5).
    effect(() => {
      const saved = this.query().get('saved');
      const data = this.reader.data();
      if (!saved || !data) return;
      const next = nextActionable(data, saved);
      if (next) this.toast.show('station.savedNext', { game: this.gameName(next) });
      else this.toast.show('station.savedAll');
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { saved: null },
        replaceUrl: true,
      });
    });
  }

  private data(): LiveSnapshot | null {
    return this.reader.data();
  }
  name(value: { name_en?: string | null; name_ar?: string | null } | null | undefined) {
    return localizedName(value, this.direction.language());
  }
  game(match: LiveMatch) {
    return this.data()?.games.find((game) => game.id === match.game_id);
  }
  gameName(match: LiveMatch) {
    return this.name(this.game(match));
  }
  location(match: LiveMatch) {
    return localizedLocation(this.game(match), this.direction.language());
  }
  team(id: string) {
    return this.data()?.teams.find((team) => team.id === id);
  }
  teamName(id: string) {
    return this.name(this.team(id));
  }
  round(match: LiveMatch) {
    return this.data()?.rounds.find((round) => round.id === match.round_id);
  }
  queued(match: LiveMatch) {
    return this.queue
      .operations()
      .some(
        (operation) =>
          operation.name === 'submit_match_result' && operation.args['p_match'] === match.id,
      );
  }
  status(match: LiveMatch): DsStatus {
    return this.queued(match) ? 'queued' : liveMatchStatus(match, this.round(match)?.status);
  }
  guides(match: LiveMatch) {
    const data = this.data();
    return data ? guidesFor(data, match) : [];
  }
  open(match: LiveMatch) {
    void this.router.navigate(['/ref/match', match.id]);
  }
  lateColumns(t: (key: string, params?: Record<string, unknown>) => string): DsColumn<LiveMatch>[] {
    return [
      {
        key: 'round',
        header: t('live.roundColumn'),
        value: (match) => this.round(match)?.number ?? '',
        numeric: true,
      },
      { key: 'game', header: t('now.game'), value: (match) => this.gameName(match) },
      { key: 'teams', header: t('now.teams') },
      { key: 'action', header: t('now.status'), align: 'end' },
    ];
  }
}
