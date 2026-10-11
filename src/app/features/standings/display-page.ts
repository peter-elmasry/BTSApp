import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { StandingsReader } from '../../core/standings/standings-reader';
import { ServerClockService } from '../../core/time/server-clock.service';
import { RoundBanner } from '../../layout/round-banner';
import { PublicMatchCard } from '../public/match-card';
import { localizedName } from '../public/public-helpers';
import { latestVisibleResults } from './rank-motion';
import { StandingsList } from './standings-list';

export function nextDisplayView(
  view: 'standings' | 'results',
  hasResults: boolean,
): 'standings' | 'results' {
  return view === 'standings' && hasResults ? 'results' : 'standings';
}

@Component({
  selector: 'app-display-page',
  imports: [RouterLink, TranslocoDirective, StandingsList, RoundBanner, PublicMatchCard],
  providers: [StandingsReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './display-page.html',
  styleUrl: './display-page.css',
})
export class DisplayPage {
  readonly events = inject(EventStore);
  readonly standings = inject(StandingsReader);
  readonly direction = inject(DirectionService);
  readonly view = signal<'standings' | 'results'>('standings');
  readonly cycling = signal(true);
  readonly name = localizedName;
  teamName(id: string): string {
    return localizedName(
      this.events.teams().find((team) => team.id === id),
      this.direction.language(),
    );
  }
  toggleCycle() {
    this.cycling.update((cycling) => !cycling);
  }
  readonly results = computed(() =>
    this.standings.allowed()
      ? latestVisibleResults(this.events.schedule(), this.events.rounds())
      : [],
  );
  private readonly document = inject(DOCUMENT);

  constructor() {
    const clock = inject(ServerClockService);
    void clock.synchronize();
    void this.events.initialize();
    effect(() => this.standings.eventId.set(this.events.event()?.id ?? null));
    const timer = setInterval(() => {
      if (
        this.cycling() &&
        this.document.visibilityState === 'visible' &&
        this.standings.allowed()
      ) {
        this.view.update((view) => nextDisplayView(view, this.results().length > 0));
      }
    }, 20000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  refresh() {
    void this.events.refresh();
    void this.standings.refresh();
  }
}
