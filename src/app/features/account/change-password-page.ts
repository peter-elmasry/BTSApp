import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { PASSWORD_URL } from '../../core/auth/guards';
import { landingFor } from '../../core/auth/landing';
import { EventStore } from '../../core/player/event.store';
import { DsButton } from '../../shared/ui/button';
import { DsInput } from '../../shared/ui/controls';
import { ToastService } from '../../shared/ui/toast';

@Component({
  selector: 'app-change-password-page',
  imports: [ReactiveFormsModule, TranslocoDirective, DsButton, DsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password-page.html',
})
export class ChangePasswordPage {
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly events = inject(EventStore);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly forced = computed(() => this.auth.profile()?.must_change_password === true);
  readonly form = new FormGroup({
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12)],
    }),
    confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });
  passwordValidation() {
    const control = this.form.controls.password;
    if (!control.touched && !control.dirty) return '';
    if (control.invalid) return 'errors.INVALID_PASSWORD';
    const username = this.auth.profile()?.username?.toLowerCase();
    return username && control.value.toLowerCase().includes(username)
      ? 'errors.PASSWORD_TOO_WEAK'
      : '';
  }
  confirmValidation() {
    const control = this.form.controls.confirm;
    return (control.touched || control.dirty) && control.value !== this.form.controls.password.value
      ? 'errors.PASSWORD_MISMATCH'
      : '';
  }

  async submit() {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    const { password, confirm } = this.form.getRawValue();
    if (this.form.controls.password.invalid || password.length < 12) {
      this.form.markAllAsTouched();
      this.error.set('INVALID_PASSWORD');
      return;
    }
    if (password !== confirm) {
      this.form.controls.confirm.markAsTouched();
      this.error.set('PASSWORD_MISMATCH');
      return;
    }
    if (this.passwordValidation()) {
      this.error.set('PASSWORD_TOO_WEAK');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const result = await this.auth.changeOwnPassword(password);
    this.busy.set(false);
    if (result) {
      if (result === 'PASSWORD_CHANGE_NEEDS_REVIEW') this.form.reset();
      this.error.set(result);
      return;
    }
    this.form.reset();
    // Back to the page that asked for the new password (e.g. My station), else the start page.
    this.toast.show('account.passwordSaved');
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (
      returnUrl?.startsWith('/') &&
      !returnUrl.startsWith('//') &&
      !returnUrl.startsWith(PASSWORD_URL)
    )
      await this.router.navigateByUrl(returnUrl);
    else {
      await this.events.refresh().catch(() => undefined);
      await this.router.navigateByUrl(
        landingFor(this.auth.profile(), this.events.event()?.id ?? null),
      );
    }
  }
}
