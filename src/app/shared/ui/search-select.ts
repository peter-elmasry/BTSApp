import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  model,
  signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { matchesSearch, SEARCH_THRESHOLD } from './data-table';

export interface DsOption {
  value: string;
  label: string;
}

/**
 * A native select that gains a search box when it has more than ten options.
 * Works with reactive forms (ControlValueAccessor) or `[(value)]`.
 */
@Component({
  selector: 'ds-search-select',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DsSearchSelect), multi: true },
  ],
  template: `<span *transloco="let t" class="block space-y-1">
    <span class="block text-sm font-semibold">{{ label() }}</span>
    @if (searchable()) {
      <input
        type="search"
        class="ds-control w-full"
        autocomplete="off"
        data-testid="select-search"
        [attr.aria-label]="t('ui.searchIn', { name: label() })"
        [placeholder]="'🔍 ' + t('ui.search')"
        [value]="query()"
        (input)="query.set($any($event.target).value)"
      />
    }
    <select
      class="ds-control w-full"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      [value]="value()"
      (change)="choose($any($event.target).value)"
      (blur)="touched()"
    >
      @if (placeholder()) {
        <option value="">{{ placeholder() }}</option>
      }
      @for (option of filtered(); track option.value) {
        <option [value]="option.value" [selected]="option.value === value()">
          {{ option.label }}
        </option>
      }
    </select>
  </span>`,
})
export class DsSearchSelect implements ControlValueAccessor {
  readonly options = input.required<readonly DsOption[]>();
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly value = model('');
  readonly disabled = signal(false);
  readonly query = signal('');
  readonly searchable = computed(() => this.options().length > SEARCH_THRESHOLD);
  /** The chosen option stays listed even when the search hides it. */
  readonly filtered = computed(() => {
    const query = this.query().trim();
    if (!query) return this.options();
    return this.options().filter(
      (option) => option.value === this.value() || matchesSearch(option.label, query),
    );
  });
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  choose(value: string) {
    this.value.set(value);
    this.onChange(value);
  }
  touched() {
    this.onTouched();
  }
  writeValue(value: string | null) {
    this.value.set(value ?? '');
  }
  registerOnChange(fn: (value: string) => void) {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean) {
    this.disabled.set(disabled);
  }
}
