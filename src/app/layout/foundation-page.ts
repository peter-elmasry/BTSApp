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
  template: `<div *transloco="let t" class="space-y-5" animate.enter="enter">
    <section class="rounded-card bg-navy p-6 text-white">
      <img
        src="/brand/dst-logo-full-white.webp"
        alt="DST — St. Demiana Sports Team"
        width="1200"
        height="509"
        class="mx-auto mb-5 w-full max-w-xs"
      />
      <h1 class="text-2xl font-extrabold">
        {{ t(page === 'home' ? 'foundation.welcome' : 'nav.' + page) }}
      </h1>
      <p class="mt-3 leading-7">{{ t('foundation.message') }}</p>
    </section>
    @if (page === 'home') {
      <ds-card
        ><h2 class="mb-4 text-lg font-bold">{{ t('foundation.components') }}</h2>
        <form [formGroup]="form" class="space-y-5" (ngSubmit)="preview()">
          <div class="flex items-center gap-3">
            <ds-avatar avatarKey="falcon" [label]="t('foundation.avatar')" />
            <p class="text-sm text-slate">{{ t('foundation.demo') }}</p>
          </div>
          <ds-input
            [label]="t('foundation.name')"
            formControlName="name"
            [error]="
              form.controls.name.touched && form.controls.name.invalid ? 'errors.REQUIRED' : ''
            "
          />
          <ds-select
            [label]="t('foundation.emblem')"
            formControlName="emblem"
            [options]="[
              { value: 'falcon', label: t('foundation.falcon') },
              { value: 'star', label: t('foundation.star') },
            ]"
          />
          <ds-toggle [label]="t('foundation.notifications')" formControlName="notifications" />
          <ds-button type="submit" [fullWidth]="true">{{ t('foundation.preview') }}</ds-button>
        </form></ds-card
      >
    } @else {
      <ds-card
        ><p class="leading-7 text-slate">{{ t('foundation.upcoming') }}</p></ds-card
      >
    }
    @if (sheet()) {
      <ds-bottom-sheet [title]="t('foundation.preview')" (close)="sheet.set(false)"
        ><p class="mb-5">{{ t('foundation.previewMessage') }}</p>
        <ds-button [fullWidth]="true" (click)="confirm()">{{
          t('common.done')
        }}</ds-button></ds-bottom-sheet
      >
    }
  </div>`,
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
