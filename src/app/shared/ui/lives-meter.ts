import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { DsHeartIcon, type HeartState } from './heart-icon';

export function heartState(total: number, index: number): HeartState {
  const remaining = Math.round((Math.max(0, total) - index) * 100) / 100;
  return remaining >= 1
    ? 'full'
    : remaining <= 0
      ? 'empty'
      : remaining === 0.25
        ? 'quarter'
        : remaining === 0.5
          ? 'half'
          : remaining === 0.75
            ? 'three-quarter'
            : remaining;
}

/** Bounded single row with a window of SVGs, even for 9999 hearts. */
@Component({
  selector: 'ds-lives-meter',
  imports: [TranslocoDirective, DsHeartIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lives-meter.html',
  host: { class: 'inline-flex min-w-0 max-w-full items-center gap-2', style: 'width: 20rem' },
})
export class DsLivesMeter {
  readonly lives = input.required<number>();
  readonly initial = input.required<number>();
  readonly emoji = input(''); // Compatibility only; artwork is always SVG.
  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly offset = signal(0);
  private readonly width = signal(320);
  readonly count = computed(() =>
    Math.max(1, Math.ceil(Math.max(0, this.lives(), this.initial()))),
  );
  readonly start = computed(() =>
    Math.min(Math.max(0, this.count() - 1), Math.max(0, Math.floor(this.offset() / 24) - 3)),
  );
  readonly icons = computed(() =>
    Array.from(
      { length: Math.min(this.count() - this.start(), Math.ceil(this.width() / 24) + 8) },
      (_, n) => ({ index: n + this.start(), state: heartState(this.lives(), n + this.start()) }),
    ),
  );
  constructor() {
    afterRenderEffect((cleanup) => {
      const el = this.viewport()?.nativeElement;
      if (!el) return;
      const measure = () => this.width.set(el.clientWidth || 320);
      measure();
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
      observer?.observe(el);
      cleanup(() => observer?.disconnect());
    });
  }
  scroll(event: Event) {
    const el = event.target as HTMLElement;
    this.offset.set(el.scrollLeft);
    this.width.set(el.clientWidth || 320);
  }
}
