import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { DsButton } from '../shared/ui/button';
import { DsCard } from '../shared/ui/card';
import { DsAvatar } from '../shared/ui/avatar';
import { DsInput, DsSelect, DsToggle } from '../shared/ui/controls';
import { DsBottomSheet } from '../shared/ui/bottom-sheet';
import { ToastService } from '../shared/ui/toast';

@Component({
  selector: 'app-foundation-page',
  imports: [
    TranslocoDirective,
    ReactiveFormsModule,
    DsButton,
    DsCard,
    DsAvatar,
    DsInput,
    DsSelect,
    DsToggle,
    DsBottomSheet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './foundation-page.html',
})
export class FoundationPage {
  readonly page = inject(ActivatedRoute).snapshot.routeConfig?.path ?? 'home';
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslocoService);
  readonly sheet = signal(false);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    emblem: new FormControl('falcon', { nonNullable: true }),
    notifications: new FormControl(false, { nonNullable: true }),
  });
  preview() {
    this.form.markAllAsTouched();
    if (this.form.valid) this.sheet.set(true);
  }
  confirm() {
    this.sheet.set(false);
    this.toast.show(this.i18n.translate('foundation.saved'));
  }
}
