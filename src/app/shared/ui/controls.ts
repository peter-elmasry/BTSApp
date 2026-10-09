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
  template: `<label [for]="id" class="mb-2 block font-semibold">{{ label() }}</label>
    <div class="flex items-center gap-2">
      <ng-content select="[prefix]" /><input
        class="ds-control min-w-0 flex-1"
        [id]="id"
        [type]="type()"
        [value]="value()"
        [disabled]="disabled()"
        [attr.autocomplete]="autocomplete()"
        [attr.aria-invalid]="!!error()"
        [attr.aria-describedby]="hint() || error() ? id + '-help' : null"
        (input)="update($any($event.target).value)"
        (blur)="touched()"
      /><ng-content select="[suffix]" />
    </div>
    @if (hint() || error()) {
      <p [id]="id + '-help'" class="mt-1 text-sm" [class.text-error]="!!error()">
        {{ error() ? (error() | transloco) : hint() }}
      </p>
    }`,
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
  template: `<label [for]="id" class="mb-2 block font-semibold">{{ label() }}</label
    ><select
      class="ds-control w-full"
      [id]="id"
      [value]="value()"
      [disabled]="disabled()"
      [attr.aria-invalid]="!!error()"
      [attr.aria-describedby]="hint() || error() ? id + '-help' : null"
      (change)="update($any($event.target).value)"
      (blur)="touched()"
    >
      @for (option of options(); track option.value) {
        <option [value]="option.value">{{ option.label }}</option>
      }
    </select>
    @if (hint() || error()) {
      <p [id]="id + '-help'" class="mt-1 text-sm" [class.text-error]="!!error()">
        {{ error() ? (error() | transloco) : hint() }}
      </p>
    }`,
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
  template: `<label
      class="flex min-h-11 cursor-pointer items-center justify-between gap-4"
      [for]="id"
      ><span>{{ label() }}</span
      ><input
        class="h-11 w-11 accent-teal"
        type="checkbox"
        role="switch"
        [id]="id"
        [checked]="value()"
        [disabled]="disabled()"
        [attr.aria-invalid]="!!error()"
        [attr.aria-describedby]="hint() || error() ? id + '-help' : null"
        (change)="update($any($event.target).checked)"
        (blur)="touched()"
    /></label>
    @if (hint() || error()) {
      <p [id]="id + '-help'" class="mt-1 text-sm" [class.text-error]="!!error()">
        {{ error() ? (error() | transloco) : hint() }}
      </p>
    }`,
})
export class DsToggle extends ValueControl<boolean> {
  readonly value = signal(false);
}
