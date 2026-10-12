import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';

export interface DsTabItem {
  id: string;
  /** Already-translated label. */
  label: string;
  badge?: number | string | null;
}

/** Arrow-key target index; in RTL the left arrow moves forward. */
export function nextTabIndex(current: number, key: string, count: number, rtl: boolean): number {
  if (count <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const backward = rtl ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward) return (current + 1) % count;
  if (key === backward) return (current - 1 + count) % count;
  return current;
}

/**
 * Segmented tabs rendered with the shared D040 `.ds-tabs` / `.ds-tab` classes, plus a
 * sliding indicator behind the active tab.
 */
@Component({
  selector: 'ds-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tabs.html',
  host: { class: 'block min-w-0' },
})
export class DsTabs {
  readonly items = input.required<readonly DsTabItem[]>();
  readonly label = input.required<string>();
  /** `sub` = teal second-level tabs inside a page. */
  readonly variant = input<'section' | 'sub'>('sub');
  readonly active = model.required<string>();
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tab');
  readonly indicator = signal<{ x: number; width: number } | null>(null);

  constructor() {
    afterRenderEffect(() => {
      const index = this.items().findIndex((item) => item.id === this.active());
      const button = this.buttons()[index]?.nativeElement;
      if (!button) {
        this.indicator.set(null);
        return;
      }
      const next = { x: button.offsetLeft, width: button.offsetWidth };
      const current = this.indicator();
      if (current?.x !== next.x || current.width !== next.width) this.indicator.set(next);
    });
  }

  select(id: string) {
    this.active.set(id);
  }

  keydown(event: KeyboardEvent, index: number) {
    const rtl = getComputedStyle(this.list().nativeElement).direction === 'rtl';
    const next = nextTabIndex(index, event.key, this.items().length, rtl);
    if (next === index || next < 0) return;
    event.preventDefault();
    this.select(this.items()[next].id);
    this.buttons()[next]?.nativeElement.focus();
  }
}
