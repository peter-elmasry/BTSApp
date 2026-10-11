import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { interpolateTotal } from './rank-motion';

@Component({
  selector: 'app-count-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    '<span aria-hidden="true">{{ displayed() }}</span><span class="sr-only">{{ value() }}</span>',
})
export class CountUp {
  readonly value = input.required<number>();
  readonly displayed = signal(0);
  private readonly document = inject(DOCUMENT);
  constructor() {
    let previous: number | undefined;
    effect((cleanup) => {
      const to = this.value();
      const from = previous ?? to;
      previous = to;
      const view = this.document.defaultView;
      if (!view || view.matchMedia('(prefers-reduced-motion: reduce)').matches || from === to) {
        this.displayed.set(to);
        return;
      }
      const started = view.performance.now();
      let frame = 0;
      const update = (time: number) => {
        const progress = Math.min((time - started) / 600, 1);
        this.displayed.set(interpolateTotal(from, to, progress));
        if (progress < 1) frame = view.requestAnimationFrame(update);
      };
      update(started);
      cleanup(() => view.cancelAnimationFrame(frame));
    });
  }
}
