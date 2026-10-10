import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { EventImportService } from './import-api';
import { EventImportPage } from './import-page';
import { ImportPayload, ImportReport, ParsedImport } from './import-types';
import { ImportWorkbookService } from './import-workbook-service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('event import confirmation safety', () => {
  const payload: ImportPayload = {
    event: { name_en: 'Sports day' },
    teams: [{ row: 2, code: 'T01', name_en: 'Falcons' }],
    games: [],
    rounds: [],
    matches: [],
    staff: [],
  };
  const parsed: ParsedImport = { payload, errors: [] };
  const valid: ImportReport = {
    valid: true,
    errors: [],
    counts: { teams: 1, games: 0, rounds: 0, matches: 0, staff: 0 },
    applied: false,
  };
  const api = {
    loadSetup: vi.fn(),
    validate: vi.fn(),
    apply: vi.fn(),
  };
  const workbook = { createImportTemplate: vi.fn(), parseImportWorkbook: vi.fn() };
  let page: EventImportPage;

  beforeEach(async () => {
    vi.clearAllMocks();
    api.loadSetup.mockResolvedValue({ event: {}, teams: [], games: [], rounds: [] });
    api.validate.mockResolvedValue(valid);
    api.apply.mockResolvedValue({ ...valid, applied: true });
    workbook.parseImportWorkbook.mockResolvedValue(parsed);
    TestBed.configureTestingModule({
      providers: [
        { provide: EventImportService, useValue: api },
        { provide: ImportWorkbookService, useValue: workbook },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ eventId: 'event-1' }) } },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new EventImportPage());
    await Promise.resolve();
  });

  it('requires successful server validation and an explicit confirmation before applying', async () => {
    page.parsed.set(parsed);
    page.openConfirmation();
    await page.confirmImport();
    expect(page.confirmationOpen()).toBe(false);
    expect(api.apply).not.toHaveBeenCalled();
    await page.validatePreview();
    expect(page.canConfirm()).toBe(true);
    await page.confirmImport();
    expect(api.apply).not.toHaveBeenCalled();
    page.openConfirmation();
    await page.confirmImport();
    expect(api.apply).toHaveBeenCalledOnce();
    expect(page.canConfirm()).toBe(false);
    expect(page.notice()).toBe('import.success');
  });

  it('merges client and server row errors and blocks confirmation', async () => {
    const issue = { sheet: 'Teams' as const, row: 2, column: 'code', code: 'REQUIRED' };
    page.parsed.set({ payload, errors: [issue] });
    api.validate.mockResolvedValue({
      ...valid,
      valid: false,
      errors: [issue, { ...issue, row: 3 }],
    });
    await page.validatePreview();
    expect(page.issues()).toHaveLength(2);
    expect(page.canConfirm()).toBe(false);
    page.openConfirmation();
    expect(page.confirmationOpen()).toBe(false);
  });

  it('ignores a stale server validation after the import mode changes', async () => {
    const oldValidation = deferred<ImportReport>();
    api.validate.mockReturnValueOnce(oldValidation.promise);
    page.parsed.set(parsed);
    const pending = page.validatePreview();
    page.modeControl.setValue('REPLACE');
    oldValidation.resolve(valid);
    await pending;
    expect(page.report()).toBeNull();
    expect(page.parsed()).toBeNull();
    expect(page.canConfirm()).toBe(false);
  });

  it('ignores an old parse when a different file is selected', async () => {
    const oldParse = deferred<ParsedImport>();
    workbook.parseImportWorkbook.mockReturnValueOnce(oldParse.promise);
    const file = (name: string) =>
      ({ name, size: 100, arrayBuffer: async () => new ArrayBuffer(4) }) as File;
    page.file.set(file('old.xlsx'));
    const pending = page.parseFile();
    await Promise.resolve();
    const input = { files: [file('new.xlsx')], value: 'new.xlsx' };
    page.selectFile({ target: input } as unknown as Event);
    await Promise.resolve();
    await Promise.resolve();
    oldParse.resolve({ payload: { ...payload, teams: [] }, errors: [] });
    await pending;
    expect(page.parsed()?.payload.teams).toHaveLength(1);
    expect(api.validate).toHaveBeenCalledOnce();
  });

  it('uses the same operation ID after a lost apply response and blocks duplicate in-flight apply', async () => {
    page.parsed.set(parsed);
    await page.validatePreview();
    page.openConfirmation();
    const lostResponse = deferred<ImportReport>();
    api.apply.mockReturnValueOnce(lostResponse.promise);
    const first = page.confirmImport();
    await page.confirmImport();
    expect(api.apply).toHaveBeenCalledOnce();
    lostResponse.reject(new Error('network lost'));
    await first;
    expect(page.confirmationOpen()).toBe(true);
    expect(page.notice()).toBe('import.applyFailed');
    await page.confirmImport();
    expect(api.apply.mock.calls[0][3]).toBe(api.apply.mock.calls[1][3]);
    expect(page.report()?.applied).toBe(true);
  });

  it('handles apply-time server rejection without claiming success', async () => {
    page.parsed.set(parsed);
    await page.validatePreview();
    page.openConfirmation();
    api.apply.mockResolvedValue({
      ...valid,
      valid: false,
      errors: [{ sheet: 'Event', row: 0, column: '', code: 'REPLACE_NOT_ALLOWED' }],
    });
    await page.confirmImport();
    expect(page.notice()).toBe('import.applyRejected');
    expect(page.canConfirm()).toBe(false);
    expect(page.issues()[0].code).toBe('REPLACE_NOT_ALLOWED');
  });
});
