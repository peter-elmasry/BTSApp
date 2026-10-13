import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EventStore } from '../../core/player/event.store';
import { costsLife, isLivesMode, lifeEmoji, livesLeft } from '../../core/player/scoring';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { TeamViewState } from './team-view-state';

/** Matches whose life loss this device has already shown for one team in one event. */
export function seenLossesKey(eventId: string, teamCode: string) {
  return `bts.seenLosses.${eventId}.${teamCode}`;
}

/**
 * LIVES mode: when the chosen team's own results gain a new LOSS or FORFEIT, play a
 * short "life lost" animation once per match on this device (D038). The first load
 * on a device only records existing losses, so old results never replay.
 */
@Component({
  selector: 'app-life-lost-overlay',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './life-lost-overlay.html',
  styleUrl: './life-lost-overlay.css',
})
export class LifeLostOverlay {
  private readonly store = inject(EventStore);
  private readonly selection = inject(TeamSelectionStore);
  private readonly teamView = inject(TeamViewState);
  readonly shown = signal<{ emoji: string; left: number | null; change: number } | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    effect(() => {
      const event = this.store.event();
      const view = this.teamView.view();
      const code = this.selection.selectedCode();
      if (!event || !view || !code || view.team.code !== code || !isLivesMode(event)) return;
      // A match that removed hearts (custom gains, D053; older servers: a loss or forfeit).
      const removed = (match: (typeof view.matches)[number]) =>
        match.lives_delta !== undefined && match.lives_delta !== null
          ? match.lives_delta < 0
          : match.participants.some(
              (participant) => participant.team_code === code && costsLife(participant.outcome),
            );
      const lostMatches = view.matches.filter(
        (match) => match.status === 'COMPLETED' && removed(match),
      );
      const lost = lostMatches.map((match) => match.id);
      untracked(() => {
        const key = seenLossesKey(event.id, code);
        const seen = this.read(key);
        const fresh = seen ? lost.filter((id) => !seen.includes(id)) : [];
        this.write(key, [...new Set([...(seen ?? []), ...lost])]);
        if (fresh.length)
          this.show({
            emoji: lifeEmoji(event),
            left: livesLeft(view),
            change: lostMatches
              .filter((match) => fresh.includes(match.id))
              .reduce((sum, match) => sum + (match.lives_delta ?? -1), 0),
          });
      });
    });
  }

  private show(value: { emoji: string; left: number | null; change: number }) {
    clearTimeout(this.timer);
    this.shown.set(value);
    navigator.vibrate?.([60, 40, 60]);
    this.timer = setTimeout(() => this.shown.set(null), 4500);
  }

  dismiss() {
    clearTimeout(this.timer);
    this.shown.set(null);
  }

  private read(key: string): string[] | null {
    try {
      const value = localStorage.getItem(key);
      return value ? (JSON.parse(value) as string[]) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, ids: string[]) {
    try {
      localStorage.setItem(key, JSON.stringify(ids));
    } catch {
      /* Without storage the animation may repeat after reload; results stay correct. */
    }
  }
}
