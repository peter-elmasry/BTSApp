import { ToastService } from '../../shared/ui/toast';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { DirectionService } from '../../core/i18n/i18n.service';
import { EventStore } from '../../core/player/event.store';
import {
  PlayerRegistration,
  RegistrationApi,
  registrationError,
  RollbackPlayer,
  TeamInvite,
  TeamRoster,
} from '../../core/player/registration-api';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { DsPhoneLink } from '../../shared/ui/phone-link';
import { localizedName } from '../public/public-helpers';

type Action =
  | 'CREATE'
  | 'REPLACE'
  | 'DISABLE'
  | 'EDIT'
  | 'REMOVE'
  | 'RESTORE'
  | 'TRANSFER'
  | 'PAUSE'
  | 'RESUME'
  | 'ROLLBACK'
  | 'RESTORE_BATCH';
interface Confirmation {
  action: Action;
  op: string;
  player?: PlayerRegistration;
  invite?: TeamInvite;
  snapshot?: RollbackPlayer[];
  batch?: string;
}

@Component({
  selector: 'app-players-page',
  imports: [ReactiveFormsModule, TranslocoDirective, DsBottomSheet, DsPhoneLink],
  templateUrl: './players-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayersPage {
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthStore);
  readonly events = inject(EventStore);
  readonly direction = inject(DirectionService);
  private readonly api = inject(RegistrationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly eventId = computed(() => this.params().get('eventId') ?? '');
  readonly admin = computed(
    () =>
      this.auth.profile()?.system_role === 'OWNER' ||
      !!this.auth
        .profile()
        ?.roles.some((role) => role.event_id === this.eventId() && role.role === 'EVENT_ADMIN'),
  );
  readonly teams = computed(() =>
    this.events.event()?.id !== this.eventId()
      ? []
      : this.events
          .teams()
          .filter(
            (team) =>
              this.admin() ||
              this.auth
                .profile()
                ?.roles.some(
                  (role) =>
                    role.event_id === this.eventId() &&
                    role.role === 'GUIDE' &&
                    role.team_id === team.id,
                ),
          ),
  );
  readonly team = signal('');
  readonly roster = signal<TeamRoster | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly confirmation = signal<Confirmation | null>(null);
  readonly activeInvite = computed(() =>
    this.roster()?.invites.find(
      (invite) => invite.enabled && Date.parse(invite.expires_at) > Date.now(),
    ),
  );
  readonly batches = computed(() => [
    ...new Set(
      this.roster()?.players.flatMap((player) =>
        player.removed_batch ? [player.removed_batch] : [],
      ) ?? [],
    ),
  ]);
  readonly activeCount = computed(
    () => this.roster()?.players.filter((player) => player.status === 'ACTIVE').length ?? 0,
  );
  readonly name = localizedName;
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] }),
    target: new FormControl('', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(300)] }),
  });
  private generation = 0;

  constructor() {
    void this.events.initialize();
    effect(() => {
      const teams = this.teams();
      if (!teams.some((team) => team.id === this.team())) this.team.set(teams[0]?.id ?? '');
    });
    effect(() => {
      const team = this.team();
      const event = this.events.event();
      if (team && event?.id === this.eventId()) void this.load(team);
      else this.roster.set(null);
    });
  }
  async load(team = this.team()) {
    const generation = ++this.generation;
    this.roster.set(null);
    this.loading.set(true);
    this.error.set('');
    try {
      const roster = await this.api.rpc<TeamRoster>('get_team_players', {
        p_event: this.eventId(),
        p_team: team,
      });
      if (generation === this.generation && this.team() === team) this.roster.set(roster);
    } catch (error) {
      if (generation === this.generation) this.error.set(registrationError(error));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  changeTeam(team: string) {
    this.confirmation.set(null);
    this.notice.set('');
    this.team.set(team);
  }
  inviteUrl(invite: TeamInvite) {
    return `${location.origin}/join/${this.eventId()}#${invite.token}`;
  }
  async share(invite: TeamInvite) {
    this.notice.set('');
    this.error.set('');
    const url = this.inviteUrl(invite);
    try {
      if (navigator.share)
        await navigator.share({
          title: this.name(
            this.teams().find((t) => t.id === this.team()),
            this.direction.language(),
          ),
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        this.notice.set('registration.copied');
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') this.notice.set('registration.copyManually');
    }
  }
  prepare(action: Action, player?: PlayerRegistration, invite?: TeamInvite, batch?: string) {
    this.error.set('');
    this.notice.set('');
    this.form.reset({
      name: player?.name ?? '',
      phone: player?.phone ?? '',
      target: '',
      reason: '',
    });
    this.confirmation.set({ action, op: crypto.randomUUID(), player, invite, batch });
  }
  async preview(invite: TeamInvite) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const team = this.team();
    try {
      const snapshot = await this.api.rpc<RollbackPlayer[]>('preview_invite_rollback', {
        p_event: this.eventId(),
        p_invite: invite.id,
      });
      if (this.team() !== team) return;
      this.prepare('ROLLBACK', undefined, invite);
      this.confirmation.update((confirmation) =>
        confirmation ? { ...confirmation, snapshot } : null,
      );
    } catch (error) {
      this.error.set(registrationError(error));
    } finally {
      this.busy.set(false);
    }
  }
  validConfirmation() {
    const action = this.confirmation()?.action;
    if (!action || this.form.invalid) return false;
    if (
      ['EDIT', 'REMOVE', 'RESTORE', 'TRANSFER', 'ROLLBACK', 'RESTORE_BATCH'].includes(action) &&
      !this.form.controls.reason.value.trim()
    )
      return false;
    if (action === 'EDIT' && !this.form.controls.name.value.trim()) return false;
    if (action === 'TRANSFER' && !this.form.controls.target.value) return false;
    if (action === 'ROLLBACK' && !this.confirmation()?.snapshot?.length) return false;
    return true;
  }
  async apply() {
    const confirmation = this.confirmation();
    if (!confirmation || this.busy() || !this.validConfirmation()) return;
    const team = this.team();
    this.busy.set(true);
    this.error.set('');
    const args = { p_event: this.eventId(), p_op_id: confirmation.op };
    const reason = this.form.controls.reason.value.trim();
    try {
      if (['CREATE', 'REPLACE', 'DISABLE'].includes(confirmation.action)) {
        await this.api.rpc('manage_team_invite', {
          ...args,
          p_team: team,
          p_action: confirmation.action,
        });
      } else if (confirmation.action === 'PAUSE' || confirmation.action === 'RESUME') {
        await this.api.rpc('set_player_registration_open', {
          ...args,
          p_open: confirmation.action === 'RESUME',
        });
      } else if (confirmation.action === 'ROLLBACK') {
        await this.api.rpc('rollback_invite_registrations', {
          ...args,
          p_invite: confirmation.invite!.id,
          p_expected: confirmation.snapshot,
          p_reason: reason,
        });
      } else if (confirmation.action === 'RESTORE_BATCH') {
        await this.api.rpc('restore_registration_batch', {
          ...args,
          p_batch: confirmation.batch,
          p_reason: reason,
        });
      } else {
        await this.api.rpc('correct_player_registration', {
          ...args,
          p_registration: confirmation.player!.id,
          p_version: confirmation.player!.version,
          p_action: confirmation.action,
          p_name: this.form.controls.name.value,
          p_phone: this.form.controls.phone.value || null,
          p_team: this.form.controls.target.value || null,
          p_reason: reason,
        });
      }
      this.confirmation.set(null);
      await this.load(team);
      this.notice.set('registration.saved');
      this.toast.show(this.notice());
    } catch (error) {
      this.error.set(registrationError(error));
    } finally {
      this.busy.set(false);
    }
  }
  close() {
    if (!this.busy()) this.confirmation.set(null);
  }
}
