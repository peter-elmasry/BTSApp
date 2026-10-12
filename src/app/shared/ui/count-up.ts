import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';

/** Ease-out cubic interpolation, rounded to whole numbers. */
export function countUpValue(from: number, to: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.round(from + (to - from) * (1 - Math.pow(1 - clamped, 3)));
}

/** Animates a number from its previous value; instant under reduced motion. */
@Component({
  selector: 'app-count-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<span aria-hidden="true">{{ displayed() }}</span><span class="sr-only">{{ value() }}</span>',
})
export class CountUp {
  readonly value = input.required<number>();
  /** Animation length in ms. */
  readonly duration = input(600);
  /** Count from 0 on first render instead of showing the value immediately. */
  readonly fromZero = input(false);
  readonly displayed = signal(0);
  private readonly document = inject(DOCUMENT);
  constructor() {
    let previous: number | undefined;
    effect((cleanup) => {
      const to = this.value();
      const from = previous ?? (this.fromZero() ? 0 : to);
      previous = to;
      const view = this.document.defaultView;
      const duration = this.duration();
      if (
        !view ||
        view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        from === to ||
        duration <= 0
      ) {
        this.displayed.set(to);
        return;
      }
      const started = view.performance.now();
      let frame = 0;
      const update = (time: number) => {
        const progress = Math.min((time - started) / duration, 1);
        this.displayed.set(countUpValue(from, to, progress));
        if (progress < 1) frame = view.requestAnimationFrame(update);
      };
      update(started);
      cleanup(() => view.cancelAnimationFrame(frame));
    });
  }
}
