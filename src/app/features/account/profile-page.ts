import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DsButton } from '../../shared/ui/button';
import { DsInput } from '../../shared/ui/controls';
import { ToastService } from '../../shared/ui/toast';

/** "My details" (D052): each signed-in member edits their own username, names and mobile. */
@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, RouterLink, TranslocoDirective, DsButton, DsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile-page.html',
})
export class ProfilePage {
  readonly auth = inject(AuthStore);
  private readonly toast = inject(ToastService);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9_.]{3,30}$/)],
    }),
    full_name_en: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    full_name_ar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(80)],
    }),
    phone: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    // Fill the form once the profile is known, without overwriting what is being typed.
    let filled = '';
    effect(() => {
      const profile = this.auth.profile();
      if (!profile || filled === profile.id) return;
      filled = profile.id;
      this.form.reset({
        username: profile.username,
        full_name_en: profile.full_name_ar || profile.full_name_en,
        full_name_ar: profile.full_name_ar ?? '',
        phone: profile.phone ?? '',
      });
    });
  }

  async save() {
    if (this.busy()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(this.form.controls.username.invalid ? 'INVALID_USERNAME' : 'INVALID_NAME');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    // One name per member (D054): both columns hold the same text.
    const value = this.form.getRawValue();
    const result = await this.auth.updateOwnProfile({ ...value, full_name_ar: value.full_name_en });
    this.busy.set(false);
    if (result) {
      this.error.set(result);
      return;
    }
    const profile = this.auth.profile();
    if (profile)
      this.form.reset({
        username: profile.username,
        full_name_en: profile.full_name_ar || profile.full_name_en,
        full_name_ar: profile.full_name_ar ?? '',
        phone: profile.phone ?? '',
      });
    this.toast.show('profile.saved');
  }
}
