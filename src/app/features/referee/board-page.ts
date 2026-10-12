import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventStore } from '../../core/player/event.store';
import type { LiveMatch } from '../../core/live/live-types';
import { LiveReader } from '../live/live-reader';
import { LiveMatchSummary } from '../live/match-summary';
import { RefereeSchedule } from './referee-schedule';

@Component({
  selector: 'app-referee-board-page',
  imports: [RouterLink, TranslocoDirective, LiveMatchSummary, RefereeSchedule],
  providers: [LiveReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board-page.html',
})
export class RefereeBoardPage {
  readonly events = inject(EventStore);
  readonly reader = inject(LiveReader);
  /** Current and late matches get entry cards; upcoming ones appear in the schedule table (U5). */
  actionable(matches: readonly LiveMatch[]) {
    return matches.filter((match) => match.bucket !== 'upcoming');
  }
  constructor() {
    void this.events.initialize();
    effect(() => {
      const id = this.events.event()?.id;
      this.reader.source.set(id ? { kind: 'board', id } : null);
    });
  }
}
