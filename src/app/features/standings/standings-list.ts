import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import { ViewerScope } from '../../core/player/viewer-scope';
import type { PublicEvent } from '../../core/player/public-types';
import type { StandingRow } from '../../core/standings/standings-types';
import { DsAvatar } from '../../shared/ui/avatar';
import { localizedName } from '../public/public-helpers';
import { currencyLabel, rankChanges } from './rank-motion';
import { CountUp } from '../../shared/ui/count-up';
import { matchesSearch, SEARCH_THRESHOLD } from '../../shared/ui/data-table';
import { isLivesMode, lifeEmoji } from '../../core/player/scoring';

@Component({
  selector: 'app-standings-list',
  imports: [TranslocoDirective, RouterLink, DsAvatar, CountUp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './standings-list.html',
  styleUrl: './standings-list.css',
})
export class StandingsList {
  readonly rows = input.required<StandingRow[]>();
  readonly event = input.required<PublicEvent>();
  readonly selectedCode = input<string | null>(null);
  readonly compact = input(false);
  readonly display = input(false);
  /** `table` (leaderboard, U6) or the card list (home preview, venue display). */
  readonly variant = input<'list' | 'table'>('list');
  /** A row the viewer may open was activated (drill-down, D046 scope). */
  readonly teamOpen = output<string>();
  readonly searchThreshold = SEARCH_THRESHOLD;
  readonly query = signal('');
  readonly visibleRows = computed(() => {
    const query = this.query();
    return query
      ? this.rows().filter((row) =>
          matchesSearch([row.team.code, row.team.name_en, row.team.name_ar ?? ''].join(' '), query),
        )
      : this.rows();
  });
  readonly lives = computed(() => isLivesMode(this.event()));
  readonly emoji = computed(() => lifeEmoji(this.event()));
  readonly direction = inject(DirectionService);
  /** Visitors open only their own team and no game pages (D046). */
  readonly scope = inject(ViewerScope);
  readonly name = localizedName;
  readonly currency = currencyLabel;
  readonly changes = signal(new Map<string, number>());
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private previous: StandingRow[] = [];
  private positions = new Map<string, number>();
  private animations: Animation[] = [];
  private clearChips?: ReturnType<typeof setTimeout>;
  private scrolledCode: string | null = null;

  open(code: string) {
    if (this.scope.canOpenTeam(code)) this.teamOpen.emit(code);
  }

  constructor() {
    const destroy = inject(DestroyRef);
    afterRenderEffect(() => {
      const rows = this.rows();
      const selected = this.selectedCode();
      const view = this.document.defaultView;
      if (!view) return;
      const reduced = view.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const elements = Array.from(
        this.host.nativeElement.querySelectorAll<HTMLElement>('[data-team-id]'),
      );
      const nextPositions = new Map(
        elements.map((element) => [
          element.dataset['teamId']!,
          element.getBoundingClientRect().top,
        ]),
      );
      const changed = rows !== this.previous;
      if (changed) {
        this.animations.forEach((animation) => animation.cancel());
        this.animations = [];
        const deltas = rankChanges(this.previous, rows);
        this.changes.set(deltas);
        if (this.clearChips) clearTimeout(this.clearChips);
        this.clearChips = setTimeout(() => this.changes.set(new Map()), 5000);
        if (!reduced) {
          for (const [index, element] of elements.entries()) {
            const id = element.dataset['teamId']!;
            const before = this.positions.get(id);
            const after = nextPositions.get(id)!;
            if (before !== undefined && before !== after) {
              this.animations.push(
                element.animate(
                  [
                    { transform: `translateY(${before - after}px)` },
                    { transform: 'translateY(0)' },
                  ],
                  { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)' },
                ),
              );
            } else if (before === undefined) {
              this.animations.push(
                element.animate(
                  [{ transform: 'translateY(12px)' }, { transform: 'translateY(0)' }],
                  { duration: 350, delay: Math.min(index * 45, 600), fill: 'backwards' },
                ),
              );
            }
          }
        }
        this.previous = rows;
      }
      this.positions = nextPositions;
      if (selected && selected !== this.scrolledCode && !this.compact() && !this.display()) {
        const target = elements.find((element) => element.dataset['teamCode'] === selected);
        if (target) {
          target.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
          this.scrolledCode = selected;
        }
      }
    });
    destroy.onDestroy(() => {
      this.animations.forEach((animation) => animation.cancel());
      if (this.clearChips) clearTimeout(this.clearChips);
    });
  }
}
