import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { DsBottomSheet } from '../../shared/ui/bottom-sheet';
import { EventImportService } from './import-api';
import { ImportIssue, ImportMode, ImportReport, ParsedImport } from './import-types';
import { ImportValidationContext } from './import-workbook';
import { ImportWorkbookService } from './import-workbook-service';

@Component({
  selector: 'app-event-import-page',
  imports: [ReactiveFormsModule, RouterLink, TranslocoDirective, DsBottomSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import-page.html',
})
export class EventImportPage {
  private readonly api = inject(EventImportService);
  private readonly workbook = inject(ImportWorkbookService);
  private readonly injector = inject(Injector);
  private readonly reviewSetupLink = viewChild<ElementRef<HTMLAnchorElement>>('reviewSetupLink');
  readonly eventId = inject(ActivatedRoute).snapshot.paramMap.get('eventId') ?? '';
  readonly modeControl = new FormControl<ImportMode>('UPSERT', { nonNullable: true });
  readonly mode = signal<ImportMode>('UPSERT');
  readonly setup = signal<Record<string, unknown> | null>(null);
  readonly loading = signal(true);
  readonly parsing = signal(false);
  readonly validating = signal(false);
  readonly applying = signal(false);
  readonly downloading = signal(false);
  readonly file = signal<File | null>(null);
  readonly parsed = signal<ParsedImport | null>(null);
  readonly report = signal<ImportReport | null>(null);
  readonly notice = signal('');
  readonly confirmationOpen = signal(false);
  readonly busy = computed(
    () => this.loading() || this.parsing() || this.validating() || this.applying(),
  );
  readonly issues = computed(() => {
    const unique = new Map<string, ImportIssue>();
    for (const issue of [...(this.parsed()?.errors ?? []), ...(this.report()?.errors ?? [])]) {
      unique.set(JSON.stringify([issue.sheet, issue.row, issue.column, issue.code]), issue);
    }
    return [...unique.values()];
  });
  readonly canConfirm = computed(
    () =>
      !!this.parsed() &&
      this.report()?.valid === true &&
      !this.report()?.applied &&
      !this.report()?.queued &&
      this.issues().length === 0 &&
      !this.busy(),
  );
  readonly preview = computed(() => {
    const payload = this.parsed()?.payload;
    if (!payload) return [];
    return (['teams', 'games', 'rounds', 'matches', 'staff'] as const).map((key) => ({
      key,
      count: payload[key].length,
      rows: payload[key].slice(0, 100).map((row) => ({
        row: row.row ?? 0,
        values: Object.entries(row)
          .filter(([key]) => key !== 'row')
          .map(([key, value]) => ({
            key,
            value: Array.isArray(value) ? value.join(', ') : String(value ?? ''),
          })),
      })),
    }));
  });
  readonly eventPreview = computed(() =>
    Object.entries(this.parsed()?.payload.event ?? {}).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    })),
  );
  private revision = 0;
  private operationId: string | null = null;

  constructor() {
    this.modeControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((mode) => {
      this.mode.set(mode);
      this.invalidate();
      if (this.file()) void this.parseFile();
    });
    void this.loadSetup();
  }

  async loadSetup() {
    this.loading.set(true);
    this.notice.set('');
    try {
      this.setup.set(await this.api.loadSetup(this.eventId));
    } catch {
      this.notice.set('import.loadFailed');
    } finally {
      this.loading.set(false);
    }
  }

  private invalidate() {
    this.revision++;
    this.parsed.set(null);
    this.report.set(null);
    this.operationId = null;
    this.confirmationOpen.set(false);
    this.parsing.set(false);
    this.validating.set(false);
    this.notice.set('');
  }

  selectFile(event: Event) {
    if (this.applying()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.invalidate();
    this.file.set(null);
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024 || file.size === 0) {
      this.notice.set('import.invalidFile');
      input.value = '';
      return;
    }
    this.file.set(file);
    void this.parseFile();
  }

  async parseFile() {
    const file = this.file();
    if (!file || this.loading() || !this.setup() || this.applying()) return;
    const revision = this.revision;
    this.parsing.set(true);
    try {
      const parsed = await this.workbook.parseImportWorkbook(
        await file.arrayBuffer(),
        this.mode() === 'UPSERT' ? (this.setup() as ImportValidationContext) : undefined,
      );
      if (revision !== this.revision) return;
      this.parsed.set(parsed);
      this.parsing.set(false);
      await this.validatePreview();
    } catch {
      if (revision === this.revision) this.notice.set('import.parseFailed');
    } finally {
      if (revision === this.revision) this.parsing.set(false);
    }
  }

  async validatePreview() {
    const parsed = this.parsed();
    if (!parsed || this.validating() || this.applying()) return;
    const revision = this.revision;
    const mode = this.mode();
    this.report.set(null);
    this.confirmationOpen.set(false);
    this.validating.set(true);
    this.notice.set('');
    try {
      const report = await this.api.validate(this.eventId, parsed.payload, mode);
      if (revision !== this.revision) return;
      this.report.set(report);
    } catch {
      if (revision === this.revision) this.notice.set('import.validationFailed');
    } finally {
      if (revision === this.revision) this.validating.set(false);
    }
  }

  openConfirmation() {
    if (this.canConfirm()) this.confirmationOpen.set(true);
  }

  closeConfirmation() {
    if (!this.applying()) this.confirmationOpen.set(false);
  }

  async confirmImport() {
    if (!this.confirmationOpen() || !this.canConfirm()) return;
    const parsed = this.parsed()!;
    this.operationId ??= crypto.randomUUID();
    this.applying.set(true);
    this.modeControl.disable({ emitEvent: false });
    this.notice.set('');
    try {
      const report = await this.api.apply(
        this.eventId,
        parsed.payload,
        this.mode(),
        this.operationId,
      );
      this.report.set(report);
      this.confirmationOpen.set(false);
      this.notice.set(
        report.queued ? 'live.queued' : report.applied ? 'import.success' : 'import.applyRejected',
      );
      if (report.applied) {
        afterNextRender(() => this.reviewSetupLink()?.nativeElement.focus(), {
          injector: this.injector,
        });
      }
    } catch {
      this.notice.set('import.applyFailed');
    } finally {
      this.applying.set(false);
      this.modeControl.enable({ emitEvent: false });
    }
  }

  async downloadTemplate() {
    if (!this.setup() || this.downloading()) return;
    this.downloading.set(true);
    try {
      const event = this.setup()?.['event'] as Record<string, unknown> | undefined;
      const bytes = await this.workbook.createImportTemplate(event);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'DST-event-setup-template.xlsx';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.notice.set('import.downloadFailed');
    } finally {
      this.downloading.set(false);
    }
  }

  issueKey(code: string) {
    const aliases: Record<string, string> = {
      REQUIRED_FIELD: 'REQUIRED',
      MEMBER_NOT_ELIGIBLE: 'INVALID_MEMBER',
      TEAM_HAS_GUIDE: 'GUIDE_ALREADY_ASSIGNED',
      ROUND_NOT_DRAFT: 'ROUND_STARTED',
      INVALID_PARTICIPANTS: 'INVALID_FIELD',
      INVALID_MODE: 'INVALID_FIELD',
      INVALID_ROW: 'INVALID_FIELD',
      DUPLICATE: 'DUPLICATE_CODE',
      DUPLICATE_KEY: 'DUPLICATE_CODE',
      UNKNOWN_TEAM: 'UNKNOWN_REFERENCE',
      UNKNOWN_GAME: 'UNKNOWN_REFERENCE',
      UNKNOWN_ROUND: 'UNKNOWN_REFERENCE',
      OPENING_REQUIRES_ONE_MATCH: 'OPENING_MATCH_REQUIRED',
      OPENING_TEAMS_MUST_BE_EMPTY: 'OPENING_MATCH_REQUIRED',
      DUPLICATE_GUIDE: 'GUIDE_ALREADY_ASSIGNED',
      UNSUPPORTED_CELL: 'FORMULA_NOT_ALLOWED',
      UNEXPECTED_COLUMN: 'INVALID_HEADER',
      UNKNOWN_KEY: 'INVALID_HEADER',
      INVALID_WORKBOOK: 'INVALID_PAYLOAD',
    };
    code = aliases[code] ?? code;
    const known = [
      'REQUIRED',
      'INVALID_FIELD',
      'INVALID_PAYLOAD',
      'DUPLICATE_CODE',
      'DUPLICATE_MATCH',
      'DUPLICATE_STAFF',
      'UNKNOWN_REFERENCE',
      'REPLACE_NOT_ALLOWED',
      'OPENING_MATCH_REQUIRED',
      'INVALID_COLOR',
      'INVALID_AVATAR',
      'INVALID_NUMBER',
      'INVALID_ROLE',
      'INVALID_MEMBER',
      'MEMBER_NOT_FOUND',
      'MEMBER_INACTIVE',
      'LOGIN_REQUIRED',
      'TEAM_ALREADY_SCHEDULED',
      'SAME_TEAM',
      'GUIDE_ALREADY_ASSIGNED',
      'ROUND_STARTED',
      'FORBIDDEN',
      'MISSING_SHEET',
      'INVALID_HEADER',
      'FORMULA_NOT_ALLOWED',
      'INVALID_TEXT',
      'INVALID_BOOLEAN',
      'INVALID_CODE',
      'INVALID_DURATION',
      'INVALID_ROUND_TYPE',
      'INVALID_ROUND_NUMBER',
      'MULTIPLE_OPENING_ROUNDS',
      'GUIDE_HAS_GAMES',
      'REFEREE_HAS_TEAM',
      'SHEET_TOO_LARGE',
    ];
    return `import.issue.${known.includes(code) ? code : 'OTHER'}`;
  }
}
