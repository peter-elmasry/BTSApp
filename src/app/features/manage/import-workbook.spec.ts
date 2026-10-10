import { Workbook } from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createImportTemplate,
  parseImportWorkbook,
  validateImportPayload,
} from './import-workbook';
import type { ImportPayload } from './import-types';

let template: Uint8Array;
const arrayBuffer = (bytes: Uint8Array) => Uint8Array.from(bytes).buffer;
async function edited(change: (book: Workbook) => void) {
  const book = new Workbook();
  await book.xlsx.load(arrayBuffer(template));
  change(book);
  return parseImportWorkbook(arrayBuffer(new Uint8Array(await book.xlsx.writeBuffer())));
}
async function payload(): Promise<ImportPayload> {
  return (await parseImportWorkbook(arrayBuffer(template))).payload;
}

describe('XLSX event import', () => {
  beforeAll(async () => {
    template = await createImportTemplate({ name_en: 'Youth day' });
  });

  it('round-trips the valid bilingual template, required headers, frozen rows and dropdowns', async () => {
    const book = new Workbook();
    await book.xlsx.load(arrayBuffer(template));
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual([
      'README',
      'Event',
      'Teams',
      'Games',
      'Rounds',
      'Matches',
      'Staff',
      'Avatars',
    ]);
    expect(
      book.worksheets.every((sheet) => {
        const view = sheet.views[0];
        return view?.state === 'frozen' && view.ySplit === 1;
      }),
    ).toBe(true);
    expect(book.getWorksheet('Teams')!.getCell('A1').value).toBe('code*');
    expect(book.getWorksheet('Teams')!.getCell('D2').dataValidation.type).toBe('list');
    expect(book.getWorksheet('Rounds')!.getCell('B2').dataValidation.formulae).toEqual([
      '"REGULAR,OPENING"',
    ]);
    expect(book.getWorksheet('Staff')!.getCell('B2').dataValidation.formulae).toEqual([
      '"REFEREE,GUIDE"',
    ]);
    expect(book.getWorksheet('README')!.getCell('B2').value).toMatch(/استبدل/);
    const parsed = await parseImportWorkbook(arrayBuffer(template));
    expect(parsed.errors).toEqual([]);
    expect(parsed.payload.event['name_en']).toBe('Youth day');
    expect(parsed.payload.teams).toHaveLength(2);
    expect(parsed.payload.staff).toEqual([]);
    expect(parsed.payload.matches[0].row).toBe(2);
  });

  it('reports missing sheets and exact header errors before trusting rows', async () => {
    const parsed = await edited((book) => {
      book.removeWorksheet(book.getWorksheet('Staff')!.id);
      book.getWorksheet('Teams')!.getCell('A1').value = 'team_code';
    });
    expect(parsed.errors).toContainEqual({
      sheet: 'Workbook',
      row: 0,
      column: 'Staff',
      code: 'MISSING_SHEET',
    });
    expect(parsed.errors).toContainEqual({
      sheet: 'Teams',
      row: 1,
      column: 'code',
      code: 'INVALID_HEADER',
    });
    expect(parsed.payload.teams).toEqual([]);
  });

  it('rejects cached formulas, rich text, dates and unknown settings with source row numbers', async () => {
    const parsed = await edited((book) => {
      book.getWorksheet('Teams')!.getCell('B2').value = {
        formula: '"Injected"',
        result: 'Injected',
      };
      book.getWorksheet('Games')!.getCell('B2').value = { richText: [{ text: 'Relay' }] };
      book.getWorksheet('Rounds')!.getCell('E2').value = new Date('2026-10-10T00:00:00Z');
      book.getWorksheet('Event')!.addRow(['__proto__', 'bad']);
    });
    expect(
      parsed.errors
        .filter((issue) => issue.code === 'UNSUPPORTED_CELL')
        .map((issue) => [issue.sheet, issue.row, issue.column]),
    ).toEqual([
      ['Teams', 2, 'name_en'],
      ['Games', 2, 'name_en'],
      ['Rounds', 2, 'duration_min'],
    ]);
    expect(parsed.errors.some((issue) => issue.code === 'UNKNOWN_KEY')).toBe(true);
    expect(parsed.payload.teams[0]['name_en']).toBeNull();
  });

  it('keeps actual event rows, rejects fractional numbers and checks booleans', async () => {
    const parsed = await edited((book) => {
      const sheet = book.getWorksheet('Event')!;
      sheet.getCell('A3').value = 'points_win*';
      sheet.getCell('B3').value = -1;
      sheet.getCell('A4').value = 'name_ar';
      sheet.getCell('B4').value = '';
      sheet.getCell('B16').value = 'yes';
      book.getWorksheet('Rounds')!.getCell('E2').value = 2.5;
    });
    expect(parsed.errors).toContainEqual({
      sheet: 'Event',
      row: 3,
      column: 'points_win',
      code: 'INVALID_NUMBER',
    });
    expect(parsed.errors).toContainEqual({
      sheet: 'Event',
      row: 16,
      column: 'leaderboard_public',
      code: 'INVALID_BOOLEAN',
    });
    expect(parsed.errors).toContainEqual({
      sheet: 'Rounds',
      row: 2,
      column: 'duration_min',
      code: 'INVALID_DURATION',
    });
  });

  it('checks unique codes, avatars, colors and cross-sheet references', async () => {
    const value = await payload();
    value.teams[1] = { ...value.teams[1], code: 'T01', avatar_key: 'unknown', color_hex: '#FFF' };
    value.matches[0]['game_code'] = 'G99';
    value.matches[0]['team_b_code'] = 'T99';
    const issues = validateImportPayload(value);
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'DUPLICATE',
        'INVALID_AVATAR',
        'INVALID_COLOR',
        'UNKNOWN_GAME',
        'UNKNOWN_TEAM',
      ]),
    );
  });

  it('requires two different regular teams and prevents double-booking', async () => {
    const value = await payload();
    value.games.push({ code: 'G02', name_en: 'Game two' });
    value.matches.push({
      row: 5,
      round_number: 1,
      game_code: 'G02',
      team_a_code: 'T01',
      team_b_code: 'T01',
    });
    expect(validateImportPayload(value)).toEqual(
      expect.arrayContaining([
        { sheet: 'Matches', row: 5, column: 'team_b_code', code: 'SAME_TEAM' },
        { sheet: 'Matches', row: 5, column: 'team_a_code', code: 'TEAM_ALREADY_SCHEDULED' },
      ]),
    );
    value.matches[0]['team_b_code'] = null;
    expect(validateImportPayload(value)).toContainEqual({
      sheet: 'Matches',
      row: 2,
      column: 'team_b_code',
      code: 'REQUIRED',
    });
  });

  it('allows one opening match with empty team cells, and rejects absent/multiple matches', async () => {
    const value = await payload();
    value.rounds = [{ row: 3, number: 0, type: 'OPENING', duration_min: 20 }];
    value.matches = [{ row: 4, round_number: 0, game_code: 'G01' }];
    expect(validateImportPayload(value)).toEqual([]);
    value.matches[0]['team_a_code'] = 'T01';
    expect(
      validateImportPayload(value).some((issue) => issue.code === 'OPENING_TEAMS_MUST_BE_EMPTY'),
    ).toBe(true);
    value.matches = [];
    expect(
      validateImportPayload(value).some((issue) => issue.code === 'OPENING_REQUIRES_ONE_MATCH'),
    ).toBe(true);
    value.matches = [
      { round_number: 0, game_code: 'G01' },
      { round_number: 0, game_code: 'G02' },
    ];
    expect(
      validateImportPayload(value).some((issue) => issue.code === 'OPENING_REQUIRES_ONE_MATCH'),
    ).toBe(true);
  });

  it('checks guide uniqueness and referee assignments while deferring member existence to server', async () => {
    const value = await payload();
    value.staff = [{ row: 2, member: '+201001234567', role: 'REFEREE', game_codes: 'G01' }];
    expect(validateImportPayload(value)).toEqual([]);
    value.staff.push(
      { row: 3, member: 'guide1', role: 'GUIDE', team_code: 'T01' },
      { row: 4, member: 'guide2', role: 'GUIDE', team_code: 'T01' },
    );
    value.staff[0]['game_codes'] = 'G01,G99';
    expect(validateImportPayload(value).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['UNKNOWN_GAME', 'DUPLICATE_GUIDE']),
    );
  });

  it('resolves UPSERT references and schedule collisions against existing setup, freeing edited match participants', async () => {
    const value = await payload();
    const context = {
      teams: value.teams.map((team, index) => ({ ...team, id: `t${index}` })),
      games: [
        { id: 'g1', code: 'G01' },
        { id: 'g2', code: 'G02' },
      ],
      rounds: [{ id: 'r1', number: 1, type: 'REGULAR' }],
      matches: [
        {
          round_id: 'r1',
          game_id: 'g1',
          participants: [
            { team_id: 't0', side: 'A' },
            { team_id: 't1', side: 'B' },
          ],
        },
      ],
    };
    value.teams = [];
    value.games = [];
    value.rounds = [];
    expect(validateImportPayload(value, context)).toEqual([]);
    value.matches[0]['game_code'] = 'G02';
    expect(
      validateImportPayload(value, context).some(
        (issue) => issue.code === 'TEAM_ALREADY_SCHEDULED',
      ),
    ).toBe(true);
    expect(validateImportPayload(value).some((issue) => issue.code === 'UNKNOWN_ROUND')).toBe(true);
  });

  it('returns a useful error for a corrupt workbook', async () => {
    expect(
      (await parseImportWorkbook(new TextEncoder().encode('not a zip').buffer)).errors,
    ).toEqual([{ sheet: 'Workbook', row: 0, column: '', code: 'INVALID_WORKBOOK' }]);
  });
});
