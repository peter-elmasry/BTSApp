import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import {
  RegistrationApi,
  registrationError,
  TeamInviteView,
} from '../../core/player/registration-api';
import { RegistrationStore } from '../../core/player/registration.store';
import { TeamSelectionStore } from '../../core/player/team-selection.store';
import { localizedName } from '../public/public-helpers';
import { DsAvatar } from '../../shared/ui/avatar';

@Component({
  selector: 'app-join-page',
  imports: [ReactiveFormsModule, RouterLink, TranslocoDirective, DsAvatar],
  templateUrl: './join-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinPage {
  readonly auth = inject(AuthStore);
  readonly registration = inject(RegistrationStore);
  readonly direction = inject(DirectionService);
  readonly selection = inject(TeamSelectionStore);
  private readonly api = inject(RegistrationApi);
  private readonly events = inject(EventStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly fragment = toSignal(this.route.fragment, {
    initialValue: this.route.snapshot.fragment,
  });
  readonly invite = signal<TeamInviteView | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly name = localizedName;
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)],
    }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] }),
  });
  private generation = 0;
  private opId = crypto.randomUUID();

  constructor() {
    effect(() => {
      const event = this.params().get('eventId');
      const token = this.fragment() ?? '';
      if (event) void this.load(event, token);
    });
  }
  async retry() {
    await this.load(this.params().get('eventId')!, this.fragment() ?? '');
  }
  private async load(event: string, token: string) {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    this.invite.set(null);
    this.opId = crypto.randomUUID();
    try {
      await this.auth.initialize();
      await this.events.initialize();
      await this.registration.refresh(event);
      if (generation !== this.generation) return;
      if (this.auth.session() || this.registration.receipt()) return;
      if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('INVITE_UNAVAILABLE');
      const invite = await this.api.rpc<TeamInviteView>('get_team_invite', {
        p_event: event,
        p_token: token,
      });
      if (generation === this.generation) this.invite.set(invite);
    } catch (error) {
      if (generation === this.generation) this.error.set(registrationError(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  async join() {
    if (this.busy() || this.form.invalid || !this.invite()) {
      this.form.markAllAsTouched();
      return;
    }
    const invite = this.invite()!;
    const generation = this.generation;
    this.busy.set(true);
    this.error.set('');
    try {
      // A previous ordinary choice is respected after the existing round lock.
      if (!this.selection.canChoose(invite.team.code)) throw new Error('TEAM_ALREADY_SELECTED');
      const receipt = await this.registration.join(
        invite.event_id,
        this.fragment() ?? '',
        this.form.controls.name.value,
        this.form.controls.phone.value,
        this.opId,
      );
      if (generation !== this.generation || this.auth.session()) return;
      if (receipt.status === 'ACTIVE') await this.router.navigateByUrl('/home');
    } catch (error) {
      if (generation === this.generation) this.error.set(registrationError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
