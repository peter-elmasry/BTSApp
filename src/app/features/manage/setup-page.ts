import { ToastService } from '../../shared/ui/toast';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { supabase } from '../../core/supabase/client';
import { OpQueueService } from '../../core/offline/op-queue.service';
import { ReadCacheService, stableJson } from '../../core/offline/read-cache.service';
import {
  availableTeamCodes,
  newTeams,
  nextCodes,
  repeatedPair,
  setupIssues,
  TEAM_AVATARS,
  TEAM_SWATCHES,
  validMatchSelection,
} from './setup-helpers';
import { RouterLink } from '@angular/router';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { DsCellDef, DsDataTable, type DsColumn } from '../../shared/ui/data-table';
import { DsSearchSelect } from '../../shared/ui/search-select';
import { currencyLabel } from '../standings/rank-motion';
import { preparePublicImage } from '../../shared/media/prepare-public-image';
import { DirectionService } from '../../core/i18n/i18n.service';
import { entityLabel } from '../../core/i18n/entity-label';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { LIFE_EMOJI_SUGGESTIONS } from '../../core/player/scoring';
import { DsLivesMeter } from '../../shared/ui/lives-meter';
import { ManageContext } from './manage-context';
import { EventChannelService } from '../../core/realtime/event-channel.service';
import { DsAvatar } from '../../shared/ui/avatar';
import { teamImageUrl } from '../../shared/ui/team-image';
import { OpeningAttachmentEditor } from './opening-attachment-editor';
import { TeamPaletteEditor } from './team-palette-editor';
import { AudioSettings } from './audio-settings';
import { normalizeTeamPalette } from '../../shared/team-palette';
import { NeutralGameControl } from './neutral-game-control';

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
type SetupTab = 'settings' | 'teams' | 'games' | 'rounds' | 'staff' | 'review';

/**
 * One name per item (D054): the screens show a single Name / Location / Points name and
 * the database keeps both language columns filled with the same text.
 */
export function singleNames(args: Record<string, unknown>): Record<string, unknown> {
  const fill = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = { ...(value as Record<string, unknown>) };
    if ('name_en' in record) record['name_ar'] = record['name_en'];
    if ('location_en' in record) record['location_ar'] = record['location_en'];
    if ('currency_ar_plural' in record)
      for (const key of [
        'currency_en_one',
        'currency_en_other',
        'currency_ar_one',
        'currency_ar_two',
      ])
        record[key] = record['currency_ar_plural'];
    return record;
  };
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, fill(value)]));
}

@Component({
  selector: 'app-event-setup-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    TranslocoDirective,
    DsLivesMeter,
    DsAvatar,
    OpeningAttachmentEditor,
    TeamPaletteEditor,
    AudioSettings,
    NeutralGameControl,
    DsBottomSheet,
    DsDataTable,
    DsCellDef,
    DsSearchSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './setup-page.html',
})
export class EventSetupPage {
  private readonly toast = inject(ToastService);
  readonly customPalette = computed(
    () => normalizeTeamPalette(this.setup()?.event?.team_palette) ?? [],
  );
  readonly teamSwatches = computed(() => [
    ...new Set([...TEAM_SWATCHES, ...this.customPalette().map((entry) => entry.hex)]),
  ]);
  swatchLabel(hex: string) {
    const name = this.customPalette().find((entry) => entry.hex === hex)?.name;
    return name ? `${name} (${hex})` : hex;
  }
  private readonly direction = inject(DirectionService);
  label(row: Row, field = 'name') {
    return entityLabel(row, this.direction.language(), field);
  }
  private readonly auth = inject(AuthStore);
  private readonly queue = inject(OpQueueService);
  private readonly cache = inject(ReadCacheService);
  private readonly route = inject(ActivatedRoute);
  readonly eventId = this.route.snapshot.paramMap.get('eventId') ?? '';
  /** Setup checklist steps (U7); the last one reviews readiness. */
  readonly tabs: SetupTab[] = ['settings', 'teams', 'games', 'rounds', 'staff', 'review'];
  readonly TEAM_SWATCHES = TEAM_SWATCHES;
  readonly advancedOpen = signal(false);
  /** Bulk "Add N …" sheet and its progress (sequential queued operations). */
  readonly bulk = signal<'teams' | 'games' | 'rounds' | null>(null);
  readonly bulkCount = new FormControl(8, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(1), Validators.max(40)],
  });
  readonly bulkMinutes = new FormControl(15, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(1), Validators.max(600)],
  });
  readonly bulkDone = signal(0);
  readonly bulkTotal = signal(0);
  /** Schedule-grid cell being edited. */
  readonly cell = signal<{ round: Row; game: Row; match: Row | null } | null>(null);
  /** Referee whose games are being assigned. */
  readonly refereeSheet = signal<Row | null>(null);
  readonly TEAM_AVATARS = TEAM_AVATARS;
  readonly tab = signal<SetupTab>('settings');
  readonly setup = signal<SetupData | null>(null);
  readonly teams = computed(() => this.setup()?.teams ?? []);
  readonly games = computed(() => this.setup()?.games ?? []);
  readonly rounds = computed(() => this.setup()?.rounds ?? []);
  readonly matches = computed(() => this.rounds().flatMap((round) => round.matches ?? []));
  readonly staff = computed(() => this.setup()?.staff ?? []);
  readonly refereeGameIds = computed(
    () => new Set((this.setup()?.referee_games ?? []).map((item) => item.game_id as string)),
  );
  readonly issues = computed(() =>
    setupIssues({
      name: this.setup()?.event?.name_en ?? '',
      teams: this.teams(),
      games: this.games(),
      rounds: this.rounds(),
      matches: this.matches(),
      refereeGameIds: this.refereeGameIds(),
    }),
  );
  /** A step is done when it has no open readiness issue (and has content). */
  readonly done = computed(() => {
    const open = new Set(this.issues().map((issue) => issue.tab));
    return {
      settings: !open.has('settings'),
      teams: !open.has('teams'),
      games: !open.has('games'),
      rounds: !open.has('rounds'),
      staff: !open.has('staff') && this.staff().length > 0,
      review: this.issues().length === 0,
    } as Record<SetupTab, boolean>;
  });
  readonly sortedRounds = computed(() =>
    [...this.rounds()].sort((a, b) => Number(a.number) - Number(b.number)),
  );
  readonly members = computed(() => {
    return this.setup()?.eligible_members ?? [];
  });
  readonly notice = signal('');
  readonly changesAvailable = signal(false);
  private serverSignature = '';
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
      validators: [Validators.required, Validators.min(-999999), Validators.max(999999)],
    }),
    points_draw: new FormControl(1, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(-999999), Validators.max(999999)],
    }),
    points_loss: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(-999999), Validators.max(999999)],
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
    scoring_mode: new FormControl<'POINTS' | 'LIVES'>('POINTS', { nonNullable: true }),
    initial_lives: new FormControl<number | null>(null, [Validators.min(1), Validators.max(9999)]),
    life_emoji: new FormControl('❤️', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(16)],
    }),
  });
  readonly LIFE_EMOJI_SUGGESTIONS = LIFE_EMOJI_SUGGESTIONS;
  readonly scoringMode = toSignal(
    this.settingsForm.controls.scoring_mode.valueChanges.pipe(
      startWith(this.settingsForm.controls.scoring_mode.value),
    ),
    { initialValue: 'POINTS' as const },
  );
  readonly lifeEmojiValue = toSignal(
    this.settingsForm.controls.life_emoji.valueChanges.pipe(
      startWith(this.settingsForm.controls.life_emoji.value),
    ),
    { initialValue: '❤️' },
  );
  readonly initialLivesValue = toSignal(
    this.settingsForm.controls.initial_lives.valueChanges.pipe(
      startWith(this.settingsForm.controls.initial_lives.value),
    ),
    { initialValue: null },
  );
  /** Scoring rules are fixed once any round has started (D038); the server enforces it too. */
  readonly scoringLocked = computed(() => this.rounds().some((round) => !!round.started_at));
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
  readonly imageProcessing = signal(false);
  private imageRequest = 0;
  readonly teamImage = signal<File | null>(null);
  readonly teamImagePath = signal<string | null>(null);
  readonly teamImagePreview = signal<string | null>(null);
  readonly teamImageProcessing = signal(false);
  readonly teamUploading = signal(false);
  private teamImageRequest = 0;

  constructor() {
    const context = inject(ManageContext);
    const channel = inject(EventChannelService);
    const release = this.eventId ? channel.acquire(this.eventId) : () => {};
    inject(DestroyRef).onDestroy(release);
    effect(() => {
      channel.revision();
      untracked(() => {
        if (!this.setup() || this.loading() || this.saving()) return;
        void this.reload(true);
      });
    });
    // D057 fixes every hearts draw at -0.5; POINTS remains editable.
    const modeChanges = this.settingsForm.controls.scoring_mode.valueChanges.subscribe((mode) => {
      const value = this.settingsForm.getRawValue();
      this.settingsForm.controls.points_draw.setValue(mode === 'LIVES' ? -0.5 : 1, {
        emitEvent: false,
      });
      if (
        mode === 'LIVES' &&
        value.points_loss >= 0 &&
        this.settingsForm.controls.scoring_mode.dirty
      )
        this.setHeartsPreset(0, -0.5, -1);
    });
    inject(DestroyRef).onDestroy(() => modeChanges.unsubscribe());
    // The layout shows the name of the event this screen loaded (it may not be the current one).
    effect(() => {
      const event = this.setup()?.event;
      context.eventLabel.set(event ? `${this.label(event)} · ${event.code}` : '');
    });
    inject(DestroyRef).onDestroy(() => {
      context.eventLabel.set('');
      this.imageRequest++;
      this.releaseImagePreview();
      this.teamImageRequest++;
      this.releaseTeamPreview();
    });
    this.updateStaffValidators();
    void this.reload();
  }

  async reload(background = false) {
    if (!this.eventId || this.loading()) return;
    this.loading.set(true);
    let data: SetupData;
    try {
      data = await this.cache.read<SetupData>('get_event_setup', { p_event: this.eventId }, true);
    } catch (error) {
      this.notice.set(`errors.${(error as { message?: string }).message || 'LOAD_FAILED'}`);
      this.loading.set(false);
      return;
    }
    this.loading.set(false);
    const value = data as SetupData;
    const signature = stableJson(value);
    if (background) {
      if (signature === this.serverSignature) return;
      // Nested settings editors and open sheets own drafts too. Never remount
      // or patch them underneath the operator.
      if (
        this.tab() === 'settings' ||
        this.saving() ||
        this.settingsForm.dirty ||
        this.teamForm.dirty ||
        this.gameForm.dirty ||
        this.roundForm.dirty ||
        this.matchForm.dirty ||
        this.staffForm.dirty ||
        this.bulk() ||
        this.cell() ||
        this.refereeSheet()
      ) {
        this.changesAvailable.set(true);
        return;
      }
    }
    this.serverSignature = signature;
    this.changesAvailable.set(false);
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
        team_name_en: team?.name_en ?? '',
        team_name_ar: team?.name_ar ?? '',
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
    this.settingsForm.patchValue({
      ...(value.event as any),
      scoring_mode: value.event.scoring_mode ?? 'POINTS',
      life_emoji: value.event.life_emoji ?? '❤️',
      points_draw: value.event.scoring_mode === 'LIVES' ? -0.5 : value.event.points_draw,
    });
    // A mode-change callback can run after points_draw while patching the event.
    // Restore the server's POINTS value rather than silently replacing it with 1.
    this.settingsForm.controls.points_draw.setValue(
      value.event.scoring_mode === 'LIVES' ? -0.5 : value.event.points_draw,
    );
    this.settingsForm.markAsPristine();
    for (const name of ['scoring_mode', 'initial_lives'] as const) {
      const control = this.settingsForm.controls[name];
      if (rounds.some((round) => !!round.started_at)) control.disable({ emitEvent: false });
      else control.enable({ emitEvent: false });
    }
    if (!this.matchForm.controls.round_id.value && value.rounds[0])
      this.matchForm.controls.round_id.setValue(value.rounds[0].id);
  }

  previewCurrency() {
    return currencyLabel(this.previewCount(), this.settingsForm.getRawValue(), 'ar');
  }

  private async mutate(fn: string, args: Record<string, unknown>) {
    if (this.saving()) return false;
    args = singleNames(args);
    this.saving.set(true);
    try {
      const receipt = await this.queue.execute(fn, args);
      this.notice.set(receipt.status === 'queued' ? 'live.queued' : 'manage.saved');
      this.toast.show(this.notice());
      if (receipt.status === 'sent') await this.reload();
      return true;
    } catch (error) {
      const failure = error as { message?: string; code?: string };
      // Only known error codes are translated; raw database text never reaches the screen.
      const code = [failure.message, failure.code].find((value) =>
        /^[A-Z][A-Z_]+$/.test(value ?? ''),
      );
      this.notice.set(`errors.${code ?? 'SAVE_FAILED'}`);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  /** Hearts presets: what Win / Draw / Loss add or remove (D053). */
  setHeartsPreset(win: number, draw: number, loss: number) {
    this.settingsForm.patchValue({ points_win: win, points_draw: -0.5, points_loss: loss });
    this.settingsForm.markAsDirty();
  }
  chooseLifeEmoji(emoji: string) {
    this.settingsForm.controls.life_emoji.setValue(emoji);
    this.settingsForm.controls.life_emoji.markAsDirty();
  }
  async saveSettings() {
    const value = this.settingsForm.getRawValue();
    if (value.scoring_mode === 'LIVES' && !value.initial_lives) {
      this.settingsForm.controls.initial_lives.setErrors({ required: true });
    }
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }
    await this.mutate('upsert_event_settings', {
      p_event: this.eventId,
      p_settings: {
        ...this.settingsForm.getRawValue(),
        life_emoji: this.settingsForm.controls.life_emoji.value.trim(),
        points_draw: value.scoring_mode === 'LIVES' ? -0.5 : value.points_draw,
      },
    });
  }
  editTeam(row?: Row) {
    if (this.teamUploading()) return;
    this.teamImageRequest++;
    this.teamImageProcessing.set(false);
    this.releaseTeamPreview();
    this.teamImage.set(null);
    this.teamImagePath.set(row?.image_path ?? null);
    this.teamImagePreview.set(teamImageUrl(row?.image_path) || null);
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
    if (this.saving() || this.teamUploading() || this.teamImageProcessing()) return;
    const hex = this.teamForm.controls.color_hex;
    hex.setValue(hex.value.trim().toUpperCase());
    if (this.teamForm.invalid) {
      this.teamForm.markAllAsTouched();
      return;
    }
    const request = this.teamImageRequest;
    const team = {
      ...(this.editingTeam() ? { id: this.editingTeam() } : {}),
      ...this.teamForm.getRawValue(),
    };
    let imagePath = this.teamImagePath();
    const image = this.teamImage();
    if (image) {
      this.teamUploading.set(true);
      try {
        const path = `${this.eventId}/${crypto.randomUUID()}.webp`;
        const { error } = await supabase.storage.from('team-images').upload(path, image, {
          contentType: 'image/webp',
          upsert: false,
        });
        if (error) throw error;
        if (request !== this.teamImageRequest) return;
        imagePath = path;
        // Keep this successful upload for retry if the metadata acknowledgement is lost.
        this.teamImagePath.set(path);
        this.teamImage.set(null);
      } catch {
        this.notice.set('manage.teamImageUploadFailed');
        return;
      } finally {
        this.teamUploading.set(false);
      }
    }
    if (request !== this.teamImageRequest) return;
    const saved = await this.mutate('upsert_team', {
      p_event: this.eventId,
      p_team: {
        ...team,
        image_path: imagePath,
      },
    });
    if (saved && request === this.teamImageRequest) this.editTeam();
  }
  async selectTeamImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.teamUploading() || this.saving()) return;
    const request = ++this.teamImageRequest;
    this.releaseTeamPreview();
    this.teamImage.set(null);
    this.teamImagePreview.set(teamImageUrl(this.teamImagePath()) || null);
    this.teamImageProcessing.set(true);
    this.notice.set('');
    try {
      const image = await preparePublicImage(file);
      if (request !== this.teamImageRequest) return;
      this.teamImage.set(image);
      this.teamImagePreview.set(URL.createObjectURL(image));
    } catch {
      if (request === this.teamImageRequest) this.notice.set('manage.invalidImage');
    } finally {
      if (request === this.teamImageRequest) this.teamImageProcessing.set(false);
    }
  }
  removeTeamImage() {
    if (this.teamUploading() || this.saving()) return;
    this.teamImageRequest++;
    this.releaseTeamPreview();
    this.teamImage.set(null);
    this.teamImagePath.set(null);
    this.teamImagePreview.set(null);
    this.teamImageProcessing.set(false);
  }
  private releaseTeamPreview() {
    const preview = this.teamImagePreview();
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
  }
  async deleteTeam(row: Row) {
    await this.mutate('delete_team', { p_team: row.id });
  }
  editGame(row?: Row) {
    this.imageRequest++;
    this.imageProcessing.set(false);
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
    if (this.imageProcessing() || this.saving()) return;
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
        : {
            number: this.nextRoundNumber(),
            type: 'REGULAR',
            name_en: '',
            name_ar: '',
            duration_min: 10,
          },
    );
  }
  /** First regular round number not used yet, so "add round" never collides with an existing one. */
  nextRoundNumber() {
    const used = this.rounds()
      .filter((round) => round.id !== this.editingRound())
      .map((round) => Number(round.number));
    return Math.max(0, ...used) + 1;
  }
  onRoundTypeChange() {
    const number = this.roundForm.controls.number;
    if (this.roundForm.controls.type.value === 'OPENING') number.setValue(0);
    else if (number.value === 0) number.setValue(this.nextRoundNumber());
  }
  async saveRound() {
    if (this.roundForm.invalid) {
      this.roundForm.markAllAsTouched();
      return;
    }
    const value = this.roundForm.getRawValue();
    const taken = this.rounds().some(
      (round) => Number(round.number) === Number(value.number) && round.id !== this.editingRound(),
    );
    if (taken) {
      this.notice.set('errors.DUPLICATE_ROUND_NUMBER');
      return;
    }
    const saved = await this.mutate('upsert_round', {
      p_event: this.eventId,
      p_round: { ...(this.editingRound() ? { id: this.editingRound() } : {}), ...value },
    });
    if (saved) this.editRound();
  }
  /** Deleting a round removes its whole schedule, so it takes a second tap. */
  readonly confirmRound = signal<string | null>(null);
  async deleteRound(row: Row) {
    if (this.confirmRound() !== row.id) {
      this.confirmRound.set(String(row.id));
      return;
    }
    this.confirmRound.set(null);
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
  /** Games with no match in a regular round are on a break there (D037). */
  breakGames(round: Row) {
    return round.type === 'OPENING' ? [] : this.matchGameOptions(round.id);
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
    return this.label(this.games().find((game) => game.id === match.game_id)) || match.game_id;
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
  /** Points presets on the Basics step; Custom leaves the fields as they are. */
  setPreset(win: number, draw: number, loss: number) {
    this.settingsForm.patchValue({ points_win: win, points_draw: draw, points_loss: loss });
    this.settingsForm.markAsDirty();
  }
  presetActive(win: number, draw: number, loss: number) {
    const value = this.settingsForm.getRawValue();
    return value.points_win === win && value.points_draw === draw && value.points_loss === loss;
  }
  chooseAvatar(key: string) {
    this.teamForm.controls.avatar_key.setValue(key);
  }
  chooseColor(hex: string) {
    this.teamForm.controls.color_hex.setValue(hex);
  }
  openBulk(kind: 'teams' | 'games' | 'rounds') {
    this.bulkCount.reset(kind === 'teams' ? 8 : kind === 'games' ? 4 : 6);
    this.bulkMinutes.reset(15);
    this.bulkDone.set(0);
    this.bulkTotal.set(0);
    this.bulk.set(kind);
  }
  /** Runs the generated rows one by one through the offline queue, then reloads once. */
  async runBulk() {
    const kind = this.bulk();
    if (!kind || this.saving() || this.bulkCount.invalid || this.bulkMinutes.invalid) return;
    const count = this.bulkCount.value;
    const calls: [string, Record<string, unknown>][] =
      kind === 'teams'
        ? newTeams(this.teams(), count, this.teamSwatches()).map((team) => [
            'upsert_team',
            { p_event: this.eventId, p_team: team },
          ])
        : kind === 'games'
          ? nextCodes(
              this.games().map((game) => game.code),
              'G',
              count,
            ).map((code) => [
              'upsert_game',
              {
                p_event: this.eventId,
                p_game: {
                  code,
                  name_en: `Game ${Number(code.slice(1))}`,
                  name_ar: `لعبة ${Number(code.slice(1))}`,
                  location_en: '',
                  location_ar: '',
                  image_path: null,
                },
              },
            ])
          : Array.from({ length: count }, (_, index) => [
              'upsert_round',
              {
                p_event: this.eventId,
                p_round: {
                  number: this.nextRoundNumber() + index,
                  type: 'REGULAR',
                  name_en: '',
                  name_ar: '',
                  duration_min: this.bulkMinutes.value,
                },
              },
            ]);
    this.saving.set(true);
    this.bulkTotal.set(calls.length);
    this.bulkDone.set(0);
    let queued = false;
    try {
      for (const [fn, args] of calls) {
        const receipt = await this.queue.execute(fn, args);
        queued ||= receipt.status === 'queued';
        this.bulkDone.update((value) => value + 1);
      }
      this.notice.set(queued ? 'live.queued' : 'setup.bulkDone');
      this.toast.show(this.notice());
      this.bulk.set(null);
    } catch (error) {
      const code = (error as { message?: string }).message;
      this.notice.set(`errors.${/^[A-Z][A-Z_]+$/.test(code ?? '') ? code : 'SAVE_FAILED'}`);
    } finally {
      this.saving.set(false);
      await this.reload();
    }
  }
  /** Match on a game in a round, or null for a break (D037). */
  cellMatch(round: Row, game: Row) {
    return (round.matches ?? []).find((match: Row) => match.game_id === game.id) ?? null;
  }
  teamName(code: string) {
    return this.label(this.teams().find((team) => team.code === code)) || code;
  }
  cellTeams(match: Row) {
    return this.matchTeams(match).map((code: string) => this.teamName(code));
  }
  rematch(round: Row, match: Row) {
    return repeatedPair(this.matches(), this.rounds(), round.id, this.matchTeams(match));
  }
  openCell(round: Row, game: Row) {
    if (round.started_at) return;
    const match = this.cellMatch(round, game);
    const codes = match ? this.matchTeams(match) : [];
    this.matchForm.reset({
      round_id: round.id,
      game_id: game.id,
      team_a: codes[0] ?? '',
      team_b: codes[1] ?? '',
    });
    this.cell.set({ round, game, match });
  }
  cellOptions() {
    const cell = this.cell();
    if (!cell) return [];
    return availableTeamCodes(this.teams(), this.matches(), cell.round.id, cell.match?.id).map(
      (code) => ({ value: code, label: this.teamName(code) }),
    );
  }
  async saveCell() {
    const cell = this.cell();
    if (!cell) return;
    const value = this.matchForm.getRawValue();
    if (!validMatchSelection(value.team_a, value.team_b)) {
      this.matchForm.markAllAsTouched();
      this.notice.set('setup.pickTwoTeams');
      return;
    }
    if (cell.match) {
      const removed = await this.mutate('delete_match', { p_match: cell.match.id });
      if (!removed) return;
    }
    const saved = await this.mutate('upsert_match', {
      p_round: cell.round.id,
      p_game: cell.game.id,
      p_team_codes: [value.team_a, value.team_b],
    });
    if (saved) this.cell.set(null);
  }
  async clearCell() {
    const cell = this.cell();
    if (!cell?.match) return;
    if (await this.mutate('delete_match', { p_match: cell.match.id })) this.cell.set(null);
  }
  refereeNames(gameId: string) {
    return this.staff()
      .filter((person) => person.role === 'REFEREE' && (person.game_ids ?? []).includes(gameId))
      .map((person) => this.label(person, 'full_name') || person.username)
      .join(this.direction.language() === 'ar' ? '، ' : ', ');
  }
  guideNames(teamId: string) {
    return this.staff()
      .filter((person) => person.role === 'GUIDE' && person.team_id === teamId)
      .map((person) => this.label(person, 'full_name') || person.username)
      .join(this.direction.language() === 'ar' ? '، ' : ', ');
  }
  roleLabel(role: string) {
    return role === 'EVENT_ADMIN'
      ? 'manage.eventAdmin'
      : role === 'REFEREE'
        ? 'manage.referee'
        : 'manage.guide';
  }
  assignment(person: Row) {
    if (person.role === 'GUIDE') return this.label(person, 'team_name');
    if (person.role === 'REFEREE')
      return (person.game_ids ?? [])
        .map((id: string) => this.label(this.games().find((game) => game.id === id)))
        .filter(Boolean)
        .join(this.direction.language() === 'ar' ? '، ' : ', ');
    return '';
  }
  memberOptions() {
    return this.members().map((member) => ({
      value: member.id,
      label: `${this.label(member, 'full_name') || member.username} (@${member.username})${
        member.has_login ? '' : ' · —'
      }`,
    }));
  }
  teamOptions() {
    return this.teams().map((team) => ({ value: team.id, label: this.label(team) }));
  }
  readonly trackRow = (row: Row) => String(row.id ?? `${row.member_id}:${row.role}`);
  teamColumns(t: (key: string) => string): DsColumn<Row>[] {
    return [
      {
        key: 'team',
        header: t('setup.team'),
        rowHeader: true,
        value: (row) => `${this.label(row)} ${row.code}`,
      },
      {
        key: 'guides',
        header: t('team.guide'),
        priority: 2,
        value: (row) => this.guideNames(row.id),
      },
      { key: 'actions', header: t('results.actions'), align: 'end' },
    ];
  }
  gameColumns(t: (key: string) => string): DsColumn<Row>[] {
    return [
      {
        key: 'game',
        header: t('setup.game'),
        rowHeader: true,
        value: (row) => `${this.label(row)} ${row.code} ${this.label(row, 'location')}`,
      },
      {
        key: 'referees',
        header: t('results.referee'),
        priority: 2,
        value: (row) => this.refereeNames(row.id),
      },
      { key: 'actions', header: t('results.actions'), align: 'end' },
    ];
  }
  staffColumns(t: (key: string) => string): DsColumn<Row>[] {
    return [
      {
        key: 'member',
        header: t('manage.member'),
        rowHeader: true,
        value: (row) => this.label(row, 'full_name') || row.username,
      },
      {
        key: 'role',
        header: t('manage.role'),
        priority: 2,
        value: (row) => t(this.roleLabel(row.role)),
      },
      {
        key: 'assignment',
        header: t('setup.assignment'),
        value: (row) => this.assignment(row),
      },
      { key: 'actions', header: t('results.actions'), align: 'end' },
    ];
  }
  async selectGameImage(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    input.value = '';
    const request = ++this.imageRequest;
    this.releaseImagePreview();
    this.gameImage.set(null);
    this.gameImagePreview.set(this.gameImageUrl(this.gameImagePath()) || null);
    this.notice.set('');
    this.imageProcessing.set(true);
    try {
      const image = await preparePublicImage(file);
      if (request !== this.imageRequest) return;
      this.gameImage.set(image);
      this.gameImagePreview.set(URL.createObjectURL(image));
    } catch {
      if (request === this.imageRequest) this.notice.set('manage.invalidImage');
    } finally {
      if (request === this.imageRequest) this.imageProcessing.set(false);
    }
  }
  private releaseImagePreview() {
    const preview = this.gameImagePreview();
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
  }
  gameImageUrl(path: string | null) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return supabase.storage.from('game-images').getPublicUrl(path).data.publicUrl;
  }
}
