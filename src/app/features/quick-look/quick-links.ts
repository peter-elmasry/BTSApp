import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import { ViewerScope } from '../../core/player/viewer-scope';
import { localizedName } from '../public/public-helpers';
import { QuickLook } from './quick-look.service';

/** A team name that opens its quick look (D055); plain text when the viewer may not open it. */
@Component({
  selector: 'app-team-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (open()) {
      <button
        type="button"
        class="ds-quick-link"
        [attr.data-testid]="'team-link-' + code()"
        (click)="look.team(code()); $event.stopPropagation()"
      >
        {{ label() }}
      </button>
    } @else {
      {{ label() }}
    }`,
})
export class TeamLink {
  readonly code = input.required<string>();
  /** Optional text to show instead of the team name. */
  readonly text = input<string | null>(null);
  readonly look = inject(QuickLook);
  private readonly events = inject(EventStore);
  private readonly direction = inject(DirectionService);
  private readonly scope = inject(ViewerScope);
  readonly open = computed(() => this.scope.canOpenTeam(this.code()));
  readonly label = computed(
    () =>
      this.text() ??
      (localizedName(
        this.events.teams().find((team) => team.code === this.code()),
        this.direction.language(),
      ) ||
        this.code()),
  );
}

/** A game name that opens its quick look (D055). */
@Component({
  selector: 'app-game-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button
    type="button"
    class="ds-quick-link"
    [attr.data-testid]="'game-link-' + gameId()"
    (click)="look.game(gameId()); $event.stopPropagation()"
  >
    {{ label() }}
  </button>`,
})
export class GameLink {
  readonly gameId = input.required<string>();
  readonly text = input<string | null>(null);
  readonly look = inject(QuickLook);
  private readonly events = inject(EventStore);
  private readonly direction = inject(DirectionService);
  readonly label = computed(
    () =>
      this.text() ??
      (localizedName(
        this.events.games().find((game) => game.id === this.gameId()),
        this.direction.language(),
      ) ||
        ''),
  );
}
