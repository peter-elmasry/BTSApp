import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';

let nextId = 0;
@Directive()
abstract class ValueControl<T> implements ControlValueAccessor {
  readonly id = `ds-field-${++nextId}`;
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly error = input('');
  readonly disabled = signal(false);
  abstract readonly value: ReturnType<typeof signal<T>>;
  protected changed: (value: T) => void = () => {};
  protected touched: () => void = () => {};
  writeValue(value: T) {
    this.value.set(value);
  }
  registerOnChange(fn: (value: T) => void) {
    this.changed = fn;
  }
  registerOnTouched(fn: () => void) {
    this.touched = fn;
  }
  setDisabledState(value: boolean) {
    this.disabled.set(value);
  }
  protected update(value: T) {
    this.value.set(value);
    this.changed(value);
  }
}

@Component({
  selector: 'ds-input',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DsInput), multi: true }],
  templateUrl: './controls-input.html',
  host: { class: 'block' },
})
export class DsInput extends ValueControl<string> {
  readonly value = signal('');
  readonly type = input('text');
  readonly autocomplete = input('off');
}

@Component({
  selector: 'ds-select',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DsSelect), multi: true }],
  templateUrl: './controls-select.html',
  host: { class: 'block' },
})
export class DsSelect extends ValueControl<string> {
  readonly value = signal('');
  readonly options = input.required<readonly { value: string; label: string }[]>();
}

@Component({
  selector: 'ds-toggle',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DsToggle), multi: true }],
  templateUrl: './controls-toggle.html',
})
export class DsToggle extends ValueControl<boolean> {
  readonly value = signal(false);
}
