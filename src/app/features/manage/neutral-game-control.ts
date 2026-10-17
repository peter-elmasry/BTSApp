import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { DirectionService } from '../../core/i18n/i18n.service';
import type { PublicGame } from '../../core/player/public-types';
import { supabase } from '../../core/supabase/client';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { localizedName } from '../public/public-helpers';

/** Online-only confirmation: never queue a retroactive scoring change. */
@Component({
  selector: 'app-neutral-game-control',
  imports: [TranslocoDirective, DsBottomSheet],
  templateUrl: './neutral-game-control.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NeutralGameControl {
  readonly eventId = input.required<string>();
  readonly game = input.required<PublicGame>();
  readonly disabled = input(false);
  readonly changed = output<void>();
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly preview = signal<{ neutral: boolean; count: number; name: string; id: string } | null>(
    null,
  );
  private readonly direction = inject(DirectionService);
  private opId = '';

  async open() {
    if (this.busy() || this.disabled()) return;
    if (!navigator.onLine) {
      this.notice.set('neutral.online');
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    try {
      // Fresh authenticated read rather than a possibly stale/offline setup cache.
      const { data, error } = await supabase.rpc('get_event_setup', { p_event: this.eventId() });
      if (error) throw error;
      const game = (data.games as PublicGame[]).find((item) => item.id === this.game().id);
      if (!game) throw new Error('NOT_FOUND');
      const count = (data.matches as { game_id: string; status: string }[]).filter(
        (match) => match.game_id === game.id && match.status !== 'VOID',
      ).length;
      this.opId = crypto.randomUUID();
      this.preview.set({
        id: game.id,
        neutral: !!game.is_neutral,
        count,
        name: localizedName(game, this.direction.language()),
      });
    } catch {
      this.notice.set('neutral.failed');
    } finally {
      this.busy.set(false);
    }
  }

  async confirm() {
    const preview = this.preview();
    if (!preview || this.busy()) return;
    if (!navigator.onLine) {
      this.notice.set('neutral.online');
      return;
    }
    this.busy.set(true);
    this.notice.set('');
    try {
      const { error } = await supabase.rpc('set_game_neutral', {
        p_op_id: this.opId,
        p_game: preview.id,
        p_neutral: !preview.neutral,
        p_expected_neutral: preview.neutral,
        p_expected_matches: preview.count,
      });
      if (error) throw error;
      this.preview.set(null);
      this.changed.emit();
    } catch (error) {
      this.notice.set(
        (error as { message?: string }).message === 'NEUTRAL_GAME_CHANGED'
          ? 'neutral.changed'
          : 'neutral.failed',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
