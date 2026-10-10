import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { supabase } from '../../core/supabase/client';
import { availableTeamCodes, TEAM_AVATARS, validMatchSelection } from './setup-helpers';

type Row = any;
type SetupData = {
  event: Row;
  teams: Row[];
  games: Row[];
  rounds: Row[];
  roles?: Row[];
  referee_games?: Row[];
  matches?: Row[];
  staff?: Row[];
  eligible_members?: Row[];
};
type SetupTab = 'settings' | 'teams' | 'games' | 'rounds' | 'staff';

@Component({
  selector: 'app-event-setup-page',
  imports: [CommonModule, ReactiveFormsModule, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './setup-page.html',
})
export class EventSetupPage {
  private readonly auth = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  readonly eventId = this.route.snapshot.paramMap.get('eventId') ?? '';
  readonly tabs: SetupTab[] = ['settings', 'teams', 'games', 'rounds', 'staff'];
  readonly TEAM_AVATARS = TEAM_AVATARS;
  readonly tab = signal<SetupTab>('settings');
  readonly setup = signal<SetupData | null>(null);
  readonly teams = computed(() => this.setup()?.teams ?? []);
  readonly games = computed(() => this.setup()?.games ?? []);
  readonly rounds = computed(() => this.setup()?.rounds ?? []);
  readonly matches = computed(() => this.rounds().flatMap((round) => round.matches ?? []));
  readonly staff = computed(() => this.setup()?.staff ?? []);
  readonly members = computed(() => {
    return this.setup()?.eligible_members ?? [];
  });
  readonly notice = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly previewCount = signal(2);
  readonly editingTeam = signal<string | null>(null);
  readonly editingGame = signal<string | null>(null);
  readonly editingRound = signal<string | null>(null);

  readonly settingsForm = new FormGroup({
    name_en: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(120)],
    }),
    name_ar: new FormControl('', { nonNullable: true }),
    points_win: new FormControl(2, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    points_draw: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    points_loss: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    currency_en_one: new FormControl('Point', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    currency_en_other: new FormControl('Points', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    currency_ar_one: new FormControl('نقطة', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    currency_ar_two: new FormControl('نقطتين', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    currency_ar_plural: new FormControl('نقط', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    match_bonus_cap: new FormControl<number | null>(null, [Validators.min(0)]),
    match_penalty_cap: new FormControl<number | null>(null, [Validators.min(0)]),
    event_bonus_cap: new FormControl<number | null>(null, [Validators.min(0)]),
    event_penalty_cap: new FormControl<number | null>(null, [Validators.min(0)]),
    leaderboard_public: new FormControl(false, { nonNullable: true }),
    show_guide_phone: new FormControl(false, { nonNullable: true }),
  });
  readonly teamForm = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[Tt]\d{1,3}$/)],
    }),
    name_en: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    name_ar: new FormControl('', { nonNullable: true }),
    avatar_key: new FormControl('falcon', { nonNullable: true, validators: [Validators.required] }),
    color_hex: new FormControl('#087F8C', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^#[0-9a-fA-F]{6}$/)],
    }),
  });
  readonly gameForm = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[Gg]\d{1,3}$/)],
    }),
    name_en: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    name_ar: new FormControl('', { nonNullable: true }),
    location_en: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(120)],
    }),
    location_ar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(120)],
    }),
  });
  readonly roundForm = new FormGroup({
    number: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0)],
    }),
    type: new FormControl<'REGULAR' | 'OPENING'>('REGULAR', { nonNullable: true }),
    name_en: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
    name_ar: new FormControl('', { nonNullable: true }),
    duration_min: new FormControl(10, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(600)],
    }),
  });
  readonly matchForm = new FormGroup({
    round_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    game_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    team_a: new FormControl('', { nonNullable: true }),
    team_b: new FormControl('', { nonNullable: true }),
  });
  readonly staffForm = new FormGroup({
    member_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    role: new FormControl<'EVENT_ADMIN' | 'REFEREE' | 'GUIDE'>('REFEREE', { nonNullable: true }),
    team_id: new FormControl('', { nonNullable: true }),
  });
  readonly refereeGames = signal<Partial<Record<string, string[]>>>({});
  readonly gameImage = signal<File | null>(null);
  readonly gameImagePath = signal<string | null>(null);
  readonly gameImagePreview = signal<string | null>(null);

  constructor() {
    this.updateStaffValidators();
    void this.reload();
  }

  async reload() {
    if (!this.eventId) return;
    this.loading.set(true);
    const { data, error } = await supabase.rpc('get_event_setup', { p_event: this.eventId });
    this.loading.set(false);
    if (error) {
      this.notice.set(`errors.${error.message}`);
      return;
    }
    const value = data as SetupData;
    const teamCodes = new Map(value.teams.map((team) => [team.id, team.code]));
    const memberById = new Map((value.eligible_members ?? []).map((member) => [member.id, member]));
    const gamesByMember = new Map<string, string[]>();
    for (const assignment of value.referee_games ?? []) {
      const list = gamesByMember.get(assignment.member_id) ?? [];
      list.push(assignment.game_id);
      gamesByMember.set(assignment.member_id, list);
    }
    const roles = (value.roles ?? []).map((role) => {
      const member = memberById.get(role.member_id) ?? role;
      const team = value.teams.find((item) => item.id === role.team_id);
      return {
        ...member,
        ...role,
        team_name: team?.name_en ?? '',
        game_ids: gamesByMember.get(role.member_id) ?? [],
      };
    });
    const rounds = value.rounds.map((round) => ({
      ...round,
      matches: (value.matches ?? [])
        .filter((match) => match.round_id === round.id)
        .map((match) => ({
          ...match,
          team_codes: (match.participants ?? []).map(
            (participant: Row) => teamCodes.get(participant.team_id) ?? participant.team_id,
          ),
        })),
    }));
    this.setup.set({ ...value, rounds, staff: roles });
    this.settingsForm.patchValue(value.event as any);
    if (!this.matchForm.controls.round_id.value && value.rounds[0])
      this.matchForm.controls.round_id.setValue(value.rounds[0].id);
  }

  previewCurrency() {
    const count = this.previewCount();
    const value = this.settingsForm.getRawValue();
    return count === 1
      ? value.currency_ar_one
      : count === 2
        ? value.currency_ar_two
        : value.currency_ar_plural;
  }

  private async mutate(fn: string, args: Record<string, unknown>) {
    if (this.saving()) return false;
    this.saving.set(true);
    const { error } = await supabase.rpc(fn, { p_op_id: crypto.randomUUID(), ...args });
    this.saving.set(false);
    if (error) {
      this.notice.set(`errors.${error.message}`);
      return false;
    }
    this.notice.set('manage.saved');
    await this.reload();
    return true;
  }

  async saveSettings() {
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }
    await this.mutate('upsert_event_settings', {
      p_event: this.eventId,
      p_settings: this.settingsForm.getRawValue(),
    });
  }
  editTeam(row?: Row) {
    this.editingTeam.set(row?.id ?? null);
    this.teamForm.reset(
      row
        ? {
            code: row.code,
            name_en: row.name_en,
            name_ar: row.name_ar ?? '',
            avatar_key: row.avatar_key,
            color_hex: row.color_hex,
          }
        : { code: '', name_en: '', name_ar: '', avatar_key: 'falcon', color_hex: '#087F8C' },
    );
  }
  async saveTeam() {
    if (this.teamForm.invalid) {
      this.teamForm.markAllAsTouched();
      return;
    }
    const saved = await this.mutate('upsert_team', {
      p_event: this.eventId,
      p_team: {
        ...(this.editingTeam() ? { id: this.editingTeam() } : {}),
        ...this.teamForm.getRawValue(),
      },
    });
    if (saved) this.editTeam();
  }
  async deleteTeam(row: Row) {
    await this.mutate('delete_team', { p_team: row.id });
  }
  editGame(row?: Row) {
    const preview = this.gameImagePreview();
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    this.editingGame.set(row?.id ?? null);
    this.gameImage.set(null);
    this.gameImagePath.set(row?.image_path ?? null);
    this.gameImagePreview.set(this.gameImageUrl(row?.image_path ?? null) || null);
    this.gameForm.reset(
      row
        ? {
            code: row.code,
            name_en: row.name_en,
            name_ar: row.name_ar ?? '',
            location_en: row.location_en ?? '',
            location_ar: row.location_ar ?? '',
          }
        : { code: '', name_en: '', name_ar: '', location_en: '', location_ar: '' },
    );
  }
  async saveGame() {
    if (this.gameForm.invalid) {
      this.gameForm.markAllAsTouched();
      return;
    }
    let imagePath = this.gameImagePath();
    const image = this.gameImage();
    if (image) {
      const path = `${this.eventId}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from('game-images').upload(path, image, {
        contentType: 'image/webp',
        upsert: false,
      });
      if (error) {
        this.notice.set('manage.imageUploadFailed');
        return;
      }
      imagePath = path;
    }
    const saved = await this.mutate('upsert_game', {
      p_event: this.eventId,
      p_game: {
        ...(this.editingGame() ? { id: this.editingGame() } : {}),
        ...this.gameForm.getRawValue(),
        image_path: imagePath,
      },
    });
    if (saved) this.editGame();
  }
  async deleteGame(row: Row) {
    await this.mutate('delete_game', { p_game: row.id });
  }
  editRound(row?: Row) {
    this.editingRound.set(row?.id ?? null);
    this.roundForm.reset(
      row
        ? {
            number: row.number,
            type: row.type,
            name_en: row.name_en ?? '',
            name_ar: row.name_ar ?? '',
            duration_min: row.duration_min,
          }
        : { number: 1, type: 'REGULAR', name_en: '', name_ar: '', duration_min: 10 },
    );
  }
  onRoundTypeChange() {
    const number = this.roundForm.controls.number;
    if (this.roundForm.controls.type.value === 'OPENING') number.setValue(0);
    else if (number.value === 0) number.setValue(1);
  }
  async saveRound() {
    if (this.roundForm.invalid) {
      this.roundForm.markAllAsTouched();
      return;
    }
    const value = this.roundForm.getRawValue();
    const saved = await this.mutate('upsert_round', {
      p_event: this.eventId,
      p_round: { ...(this.editingRound() ? { id: this.editingRound() } : {}), ...value },
    });
    if (saved) this.editRound();
  }
  async deleteRound(row: Row) {
    await this.mutate('delete_round', { p_round: row.id });
  }
  matchOptions(roundId: string) {
    return availableTeamCodes(this.teams(), this.matches(), roundId);
  }
  matchGameOptions(roundId: string) {
    const used = new Set(
      this.matches()
        .filter((match) => match.round_id === roundId)
        .map((match) => match.game_id),
    );
    return this.games().filter((game) => !used.has(game.id));
  }
  async saveMatch() {
    const value = this.matchForm.getRawValue();
    const round = this.rounds().find((item) => item.id === value.round_id);
    if (
      !value.round_id ||
      !value.game_id ||
      (round?.type !== 'OPENING' && !validMatchSelection(value.team_a, value.team_b))
    ) {
      this.matchForm.markAllAsTouched();
      return;
    }
    const teams =
      round?.type === 'OPENING'
        ? this.teams().map((team) => team.code)
        : [value.team_a, value.team_b];
    await this.mutate('upsert_match', {
      p_round: value.round_id,
      p_game: value.game_id,
      p_team_codes: teams,
    });
    this.matchForm.controls.team_a.reset('');
    this.matchForm.controls.team_b.reset('');
  }
  async generateOpening(round: Row, gameId: string) {
    await this.mutate('generate_opening_match', { p_round: round.id, p_game: gameId });
  }
  async deleteMatch(row: Row) {
    await this.mutate('delete_match', { p_match: row.id });
  }
  async assignStaff() {
    if (this.staffForm.invalid) {
      this.staffForm.markAllAsTouched();
      return;
    }
    const value = this.staffForm.getRawValue();
    const ok = await this.mutate('set_event_role', {
      p_event: this.eventId,
      p_member: value.member_id,
      p_role: value.role,
      p_team: value.role === 'GUIDE' ? value.team_id || null : null,
    });
    if (ok) {
      this.staffForm.reset({ member_id: '', role: 'REFEREE', team_id: '' });
      this.updateStaffValidators();
    }
  }
  async removeStaff(row: Row) {
    await this.mutate('remove_event_role', {
      p_event: this.eventId,
      p_member: row.member_id,
      p_role: row.role,
    });
  }
  toggleRefereeGame(memberId: string, gameId: string, checked: boolean, assigned: string[] = []) {
    this.refereeGames.update((value) => {
      const current = value[memberId] ?? assigned;
      return {
        ...value,
        [memberId]: checked
          ? [...new Set([...current, gameId])]
          : current.filter((id) => id !== gameId),
      };
    });
  }
  async saveRefereeGames(memberId: string) {
    const row = this.staff().find((item) => item.member_id === memberId);
    await this.mutate('set_referee_games', {
      p_event: this.eventId,
      p_member: memberId,
      p_game_ids: this.refereeGames()[memberId] ?? row?.game_ids ?? [],
    });
  }
  matchTeams(match: Row) {
    return match.team_codes ?? match.teamCodes ?? [];
  }
  roundLabel(type: string) {
    return type === 'OPENING' ? 'manage.opening' : 'manage.regular';
  }
  roundGameName(match: Row) {
    return this.games().find((game) => game.id === match.game_id)?.name_en ?? match.game_id;
  }
  isOpeningSelected() {
    return (
      this.rounds().find((round) => round.id === this.matchForm.controls.round_id.value)?.type ===
      'OPENING'
    );
  }
  isGuide() {
    return this.staffForm.controls.role.value === 'GUIDE';
  }
  onStaffRoleChange() {
    this.updateStaffValidators();
    const memberId = this.staffForm.controls.member_id.value;
    const member = this.members().find((item) => item.id === memberId);
    if (member && !member.has_login && !this.isGuide()) {
      this.staffForm.controls.member_id.reset('');
    }
  }
  private updateStaffValidators() {
    const team = this.staffForm.controls.team_id;
    if (this.staffForm.controls.role.value === 'GUIDE') team.addValidators(Validators.required);
    else {
      team.clearValidators();
      team.reset('');
    }
    team.updateValueAndValidity();
  }
  isOwner() {
    return this.auth.profile()?.system_role === 'OWNER';
  }
  selectGameImage(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;
    if (file.type !== 'image/webp' || file.size > 5 * 1024 * 1024) {
      this.notice.set('manage.invalidImage');
      (event.target as HTMLInputElement).value = '';
      this.gameImage.set(null);
      const preview = this.gameImagePreview();
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
      this.gameImagePreview.set(this.gameImageUrl(this.gameImagePath()) || null);
      return;
    }
    const preview = this.gameImagePreview();
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    this.notice.set('');
    this.gameImage.set(file);
    this.gameImagePreview.set(URL.createObjectURL(file));
  }
  gameImageUrl(path: string | null) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return supabase.storage.from('game-images').getPublicUrl(path).data.publicUrl;
  }
}
