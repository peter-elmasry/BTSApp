import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventStore } from '../../core/player/event.store';
import { LiveReader } from '../live/live-reader';
import { LiveMatchSummary } from '../live/match-summary';

@Component({
  selector: 'app-referee-board-page',
  imports: [RouterLink, TranslocoDirective, LiveMatchSummary],
  providers: [LiveReader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board-page.html',
})
export class RefereeBoardPage {
  readonly events = inject(EventStore);
  readonly reader = inject(LiveReader);
  constructor() {
    void this.events.initialize();
    effect(() => {
      const id = this.events.event()?.id;
      this.reader.source.set(id ? { kind: 'board', id } : null);
    });
  }
}
