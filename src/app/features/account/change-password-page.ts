import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DsButton } from '../../shared/ui/button';
import { DsInput } from '../../shared/ui/controls';

@Component({
  selector: 'app-change-password-page',
  imports: [ReactiveFormsModule, TranslocoDirective, DsButton, DsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-password-page.html',
})
export class ChangePasswordPage {
  readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
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

  async submit() {
    if (this.busy()) return;
    const { password, confirm } = this.form.getRawValue();
    if (this.form.invalid || password.length < 12) {
      this.form.markAllAsTouched();
      this.error.set('INVALID_PASSWORD');
      return;
    }
    if (password !== confirm) {
      this.error.set('PASSWORD_MISMATCH');
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
    await this.router.navigateByUrl('/home');
  }
}
