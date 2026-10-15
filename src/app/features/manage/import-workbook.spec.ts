import { Workbook } from 'exceljs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createImportTemplate,
  memberDirectory,
  parseImportWorkbook,
  validateImportPayload,
  type ImportValidationContext,
} from './import-workbook';
import type { ImportPayload } from './import-types';
import {
  GRID_COL,
  GRID_ROW,
  SCORING_LABELS,
  SHEETS,
  TABLE_ROW,
  TEAM_PALETTE,
  eventRow,
} from './template-catalog';

const arrayBuffer = (bytes: Uint8Array) => Uint8Array.from(bytes).buffer;
const members = [
  {
    id: 'm1',
    username: 'mina.makram',
    full_name_en: 'مينا مكرم',
    full_name_ar: 'مينا مكرم',
    has_login: true,
  },
  {
    id: 'm2',
    username: 'john.nabil',
    full_name_en: 'جون نبيل',
    full_name_ar: 'جون نبيل',
    has_login: true,
  },
  {
    id: 'm3',
    username: 'mina.makram2',
    full_name_en: 'مينا مكرم',
    full_name_ar: null,
    has_login: false,
  },
];
const live: ImportValidationContext = {
  event: {
    code: 'EVT-1',
    name_en: 'Youth day',
    name_ar: 'يوم الشباب',
    points_win: 3,
    points_draw: 1,
    points_loss: 0,
    leaderboard_public: true,
  },
  teams: [
    {
      id: 't1',
      code: 'T01',
      name_en: 'Falcons',
      name_ar: 'الصقور',
      avatar_key: 'falcon',
      color_hex: '#D32F2F',
    },
    {
      id: 't2',
      code: 'T02',
      name_en: 'Lions',
      name_ar: 'الأسود',
      avatar_key: 'lion',
      color_hex: '#1E88E5',
    },
    {
      id: 't3',
      code: 'T03',
      name_en: 'Foxes',
      name_ar: null,
      avatar_key: 'fox',
      color_hex: '#2E7D32',
    },
    {
      id: 't4',
      code: 'T04',
      name_en: 'Owls',
      name_ar: 'البوم',
      avatar_key: 'owl',
      color_hex: '#F57C00',
    },
  ],
  games: [
    { id: 'g1', code: 'G01', name_en: 'Relay', name_ar: 'التتابع', location_ar: 'الملعب' },
    { id: 'g2', code: 'G02', name_en: 'Tug', name_ar: 'شد الحبل' },
  ],
  rounds: [
    { id: 'r0', number: 0, type: 'OPENING', duration_min: 15 },
    { id: 'r1', number: 1, type: 'REGULAR', name_ar: 'الأولى', duration_min: 20 },
    { id: 'r2', number: 2, type: 'REGULAR', duration_min: 25 },
  ],
  matches: [
    { round_id: 'r0', game_id: 'g2', participants: [] },
    {
      round_id: 'r1',
      game_id: 'g1',
      participants: [
        { team_id: 't1', side: 'A' },
        { team_id: 't2', side: 'B' },
      ],
    },
    {
      round_id: 'r1',
      game_id: 'g2',
      participants: [
        { team_id: 't3', side: 'A' },
        { team_id: 't4', side: 'B' },
      ],
    },
    {
      round_id: 'r2',
      game_id: 'g1',
      participants: [
        { team_id: 't4', side: 'A' },
        { team_id: 't1', side: 'B' },
      ],
    },
  ],
  roles: [
    { member_id: 'm1', role: 'REFEREE', team_id: null, username: 'mina.makram' },
    { member_id: 'm2', role: 'GUIDE', team_id: 't1', username: 'john.nabil' },
  ],
  referee_games: [
    { member_id: 'm1', game_id: 'g1' },
    { member_id: 'm1', game_id: 'g2' },
  ],
  eligible_members: members,
};

async function edit(
  bytes: Uint8Array,
  change: (book: Workbook) => void,
  context?: ImportValidationContext,
) {
  const book = new Workbook();
  await book.xlsx.load(arrayBuffer(bytes));
  change(book);
  return parseImportWorkbook(arrayBuffer(new Uint8Array(await book.xlsx.writeBuffer())), context);
}

describe('XLSX event setup template v4', () => {
  let fresh: Uint8Array;
  let liveBook: Uint8Array;
  beforeAll(async () => {
    fresh = await createImportTemplate({ event: { code: 'NEW', name_en: 'New day' } });
    liveBook = await createImportTemplate(live);
  });

  it('round-trips lives scoring and keeps scoring unchanged when its cells are blank', async () => {
    const livesBook = await createImportTemplate({
      ...live,
      event: { ...live.event, scoring_mode: 'LIVES', initial_lives: 5, life_emoji: '💛' },
    });
    const book = new Workbook();
    await book.xlsx.load(arrayBuffer(livesBook));
    const ev = book.getWorksheet(SHEETS.event)!;
    expect(ev.getCell(eventRow('scoring_mode'), 2).value).toBe(SCORING_LABELS.LIVES);
    const parsed = await parseImportWorkbook(arrayBuffer(livesBook), live);
    expect(parsed.errors).toEqual([]);
    expect(parsed.payload.event).toMatchObject({
      scoring_mode: 'LIVES',
      initial_lives: 5,
      life_emoji: '💛',
    });
    const cleared = await edit(
      livesBook,
      (wb) => {
        const sheet = wb.getWorksheet(SHEETS.event)!;
        for (const key of ['scoring_mode', 'initial_lives', 'life_emoji'])
          sheet.getCell(eventRow(key), 2).value = null;
      },
      { ...live, event: { ...live.event, scoring_mode: 'LIVES' } },
    );
    expect(cleared.errors).toEqual([]);
    expect(Object.keys(cleared.payload.event)).not.toContain('scoring_mode');
    expect(Object.keys(cleared.payload.event)).not.toContain('initial_lives');
    const invalid = await edit(livesBook, (wb) => {
      wb.getWorksheet(SHEETS.event)!.getCell(eventRow('initial_lives'), 2).value = 0;
    });
    expect(invalid.errors.map((error) => error.code)).toContain('INVALID_NUMBER');
  });

  it('still accepts version 3 workbooks without scoring rows', async () => {
    const parsed = await edit(fresh, (book) => {
      book.getWorksheet(SHEETS.meta)!.getCell(1, 2).value = '3';
    });
    expect(parsed.errors).toEqual([]);
  });

  it('builds the Arabic RTL workbook with dropdowns and a hidden version stamp', async () => {
    const book = new Workbook();
    await book.xlsx.load(arrayBuffer(fresh));
    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(Object.values(SHEETS));
    expect(book.getWorksheet(SHEETS.meta)!.state).toBe('veryHidden');
    expect(book.getWorksheet(SHEETS.schedule)!.views[0].rightToLeft).toBe(true);
    expect(
      book.getWorksheet(SHEETS.schedule)!.getCell(GRID_ROW, GRID_COL).dataValidation.formulae,
    ).toEqual(['TeamNames']);
    expect(book.getWorksheet(SHEETS.staff)!.getCell(TABLE_ROW, 1).dataValidation.formulae).toEqual([
      'MemberNames',
    ]);
    expect(book.getWorksheet(SHEETS.teams)!.getCell(TABLE_ROW, 3).dataValidation.formulae).toEqual([
      'ColorNames',
    ]);
  });

  it('offers 20 default teams with distinct colours; cleared rows are removed', async () => {
    const parsed = await parseImportWorkbook(arrayBuffer(fresh));
    expect(parsed.errors).toEqual([]);
    expect(parsed.payload.teams).toHaveLength(20);
    expect(new Set(parsed.payload.teams.map((team) => team['color_hex'])).size).toBe(20);
    expect(parsed.payload.teams[0]).toMatchObject({
      code: 'T01',
      name_en: 'الصقور',
      name_ar: 'الصقور',
      avatar_key: 'falcon',
      color_hex: TEAM_PALETTE[0].hex,
    });
    expect(parsed.payload.event).toMatchObject({
      name_en: 'New day',
      name_ar: 'New day',
      leaderboard_public: false,
    });
    const trimmed = await edit(fresh, (book) => {
      book.getWorksheet(SHEETS.teams)!.getCell(TABLE_ROW + 19, 2).value = null;
    });
    expect(trimmed.payload.teams).toHaveLength(19);
  });

  it('round-trips the live setup: single names, opening, schedule and grouped referees', async () => {
    const parsed = await parseImportWorkbook(arrayBuffer(liveBook), live);
    expect(parsed.errors).toEqual([]);
    const { payload } = parsed;
    expect(payload.event).toMatchObject({
      name_ar: 'يوم الشباب',
      name_en: 'يوم الشباب',
      points_win: 3,
      leaderboard_public: true,
    });
    expect(payload.teams.map((t) => [t['code'], t['name_en']])).toEqual([
      ['T01', 'الصقور'],
      ['T02', 'الأسود'],
      ['T03', 'Foxes'],
      ['T04', 'البوم'],
    ]);
    expect(payload.games[0]).toMatchObject({
      code: 'G01',
      name_en: 'التتابع',
      location_en: 'الملعب',
      location_ar: 'الملعب',
    });
    expect(payload.rounds.map((r) => [r['number'], r['type'], r['duration_min']])).toEqual([
      [0, 'OPENING', 15],
      [1, 'REGULAR', 20],
      [2, 'REGULAR', 25],
    ]);
    expect(
      payload.matches.map((m) => [
        m['round_number'],
        m['game_code'],
        m['team_a_code'],
        m['team_b_code'],
      ]),
    ).toEqual([
      [0, 'G02', null, null],
      [1, 'G01', 'T01', 'T02'],
      [1, 'G02', 'T03', 'T04'],
      [2, 'G01', 'T04', 'T01'],
    ]);
    expect(payload.staff).toEqual([
      {
        row: TABLE_ROW,
        member: 'mina.makram',
        role: 'REFEREE',
        game_codes: 'G01,G02',
        team_code: null,
      },
      {
        row: TABLE_ROW + 2,
        member: 'john.nabil',
        role: 'GUIDE',
        game_codes: null,
        team_code: 'T01',
      },
    ]);
  });

  it('treats an empty game pair as a break and flags half, double and unknown teams on the grid', async () => {
    const parsed = await edit(
      liveBook,
      (book) => {
        const grid = book.getWorksheet(SHEETS.schedule)!;
        grid.getCell(GRID_ROW, GRID_COL + 2).value = 'الصقور'; // round 1 game 2: T01 again
        grid.getCell(GRID_ROW + 1, GRID_COL + 2).value = 'الأسود'; // round 2 game 2: half match
        grid.getCell(GRID_ROW + 2, GRID_COL).value = 'مش موجود';
        grid.getCell(GRID_ROW + 2, GRID_COL + 1).value = 'البوم';
      },
      live,
    );
    const codes = parsed.errors.map((issue) => [issue.sheet, issue.row, issue.column, issue.code]);
    expect(codes).toEqual(
      expect.arrayContaining([
        ['Schedule', GRID_ROW, 'F', 'TEAM_ALREADY_SCHEDULED'],
        ['Schedule', GRID_ROW + 1, 'G', 'HALF_MATCH'],
        ['Schedule', GRID_ROW + 2, 'D', 'UNKNOWN_TEAM'],
      ]),
    );
  });

  it('rejects a removed game that still has matches, duplicate colours and unknown members', async () => {
    const parsed = await edit(
      liveBook,
      (book) => {
        book.getWorksheet(SHEETS.games)!.getCell(TABLE_ROW + 1, 2).value = null;
        book.getWorksheet(SHEETS.teams)!.getCell(TABLE_ROW + 1, 3).value = TEAM_PALETTE[0].name;
        book.getWorksheet(SHEETS.staff)!.getCell(TABLE_ROW + 5, 1).value = 'حد غريب';
        book.getWorksheet(SHEETS.staff)!.getCell(TABLE_ROW + 5, 2).value = 'مرشد';
        book.getWorksheet(SHEETS.staff)!.getCell(TABLE_ROW + 5, 4).value = 'الأسود';
      },
      live,
    );
    const codes = parsed.errors.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining(['UNKNOWN_GAME', 'DUPLICATE_COLOR', 'MEMBER_NOT_FOUND']),
    );
  });

  it('rejects formulas in input cells, old templates and corrupt files', async () => {
    const parsed = await edit(fresh, (book) => {
      book.getWorksheet(SHEETS.teams)!.getCell(TABLE_ROW, 2).value = {
        formula: '"x"',
        result: 'x',
      };
    });
    expect(parsed.errors).toContainEqual({
      sheet: 'Teams',
      row: TABLE_ROW,
      column: 'B',
      code: 'UNSUPPORTED_CELL',
    });
    const old = await edit(fresh, (book) => {
      book.getWorksheet(SHEETS.meta)!.getCell(1, 2).value = '2';
    });
    expect(old.errors).toEqual([{ sheet: 'Workbook', row: 0, column: '', code: 'OLD_TEMPLATE' }]);
    expect(
      (await parseImportWorkbook(new TextEncoder().encode('not a zip').buffer)).errors,
    ).toEqual([{ sheet: 'Workbook', row: 0, column: '', code: 'INVALID_WORKBOOK' }]);
  });

  it('maps event setting errors to the sheet row', async () => {
    const parsed = await edit(fresh, (book) => {
      book.getWorksheet(SHEETS.event)!.getCell(eventRow('points_win'), 2).value = 2.5;
    });
    expect(parsed.errors).toContainEqual({
      sheet: 'Event',
      row: eventRow('points_win'),
      column: 'B',
      code: 'INVALID_NUMBER',
    });
  });

  it('exports usernames with cached values and accepts two guides on one team', async () => {
    const book = new Workbook();
    await book.xlsx.load(arrayBuffer(liveBook));
    const staff = book.getWorksheet(SHEETS.staff)!;
    expect((staff.getCell(TABLE_ROW, 5).value as { result?: unknown }).result).toBe('mina.makram');
    expect((staff.getCell(TABLE_ROW + 2, 5).value as { result?: unknown }).result).toBe(
      'john.nabil',
    );
    const parsed = await edit(
      liveBook,
      (edited) => {
        const sheet = edited.getWorksheet(SHEETS.staff)!;
        sheet.getCell(TABLE_ROW + 3, 1).value = 'مينا مكرم (mina.makram2)';
        sheet.getCell(TABLE_ROW + 3, 2).value = 'مرشد';
        sheet.getCell(TABLE_ROW + 3, 4).value = 'الصقور';
      },
      live,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.payload.staff.filter((row) => row['team_code'] === 'T01')).toHaveLength(2);
  });

  it('disambiguates members that share a display name', () => {
    expect(memberDirectory(members).map((m) => m.name)).toEqual([
      'جون نبيل',
      'مينا مكرم (mina.makram)',
      'مينا مكرم (mina.makram2)',
    ]);
  });
});

describe('server payload validation', () => {
  it('preserves a custom HEX colour through the XLSX round trip', async () => {
    const context = {
      ...live,
      teams: live.teams!.map((team, index) =>
        index === 0 ? { ...team, color_hex: '#ABCDEF' } : team,
      ),
    };
    const bytes = await createImportTemplate(context);
    const parsed = await parseImportWorkbook(arrayBuffer(bytes), context);
    expect(parsed.errors).toEqual([]);
    expect(parsed.payload.teams[0]['color_hex']).toBe('#ABCDEF');
  });
  it('warns and normalises an old hearts draw gain before import', async () => {
    const context = { ...live, event: { ...live.event, scoring_mode: 'LIVES', initial_lives: 3 } };
    const bytes = await createImportTemplate(context);
    const parsed = await edit(
      bytes,
      (book) => {
        book.getWorksheet(SHEETS.meta)!.getCell(1, 2).value = '5';
        book.getWorksheet(SHEETS.event)!.getCell(eventRow('points_draw'), 2).value = -5;
      },
      context,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.payload.event['points_draw']).toBe(-0.5);
    expect(parsed.warnings).toEqual(['import.halfDrawWarning']);
  });
  it('allows only the fixed half-heart draw exception, with integer POINTS rules', () => {
    const value = base();
    value.event['scoring_mode'] = 'LIVES';
    value.event['initial_lives'] = 3;
    value.event['points_draw'] = -0.5;
    expect(validateImportPayload(value)).toEqual([]);
    value.event['scoring_mode'] = 'POINTS';
    expect(validateImportPayload(value)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ column: 'points_draw', code: 'INVALID_NUMBER' }),
      ]),
    );
  });
  const base = (): ImportPayload => ({
    event: {
      name_en: 'Day',
      points_win: 2,
      points_draw: 1,
      points_loss: 0,
      currency_en_one: 'Point',
      currency_en_other: 'Points',
      currency_ar_one: 'نقطة',
      currency_ar_two: 'نقطتين',
      currency_ar_plural: 'نقط',
    },
    teams: [
      { row: 4, code: 'T01', name_en: 'A', avatar_key: 'falcon', color_hex: '#D32F2F' },
      { row: 5, code: 'T02', name_en: 'B', avatar_key: 'lion', color_hex: '#1E88E5' },
    ],
    games: [{ row: 4, code: 'G01', name_en: 'Relay' }],
    rounds: [{ row: 5, number: 1, type: 'REGULAR', duration_min: 20 }],
    matches: [
      { row: 5, round_number: 1, game_code: 'G01', team_a_code: 'T01', team_b_code: 'T02' },
    ],
    staff: [],
  });

  it('accepts a valid payload and checks codes, avatars, colors and references', () => {
    expect(validateImportPayload(base())).toEqual([]);
    const value = base();
    value.teams[1] = { ...value.teams[1], code: 'T01', avatar_key: 'unknown', color_hex: '#FFF' };
    value.matches[0]['game_code'] = 'G99';
    value.matches[0]['team_b_code'] = 'T99';
    expect(validateImportPayload(value).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'DUPLICATE',
        'INVALID_AVATAR',
        'INVALID_COLOR',
        'UNKNOWN_GAME',
        'UNKNOWN_TEAM',
      ]),
    );
  });

  it('allows one opening match with empty team cells', () => {
    const value = base();
    value.rounds = [{ row: 3, number: 0, type: 'OPENING', duration_min: 20 }];
    value.matches = [{ row: 4, round_number: 0, game_code: 'G01' }];
    expect(validateImportPayload(value)).toEqual([]);
    value.matches = [];
    expect(
      validateImportPayload(value).some((issue) => issue.code === 'OPENING_REQUIRES_ONE_MATCH'),
    ).toBe(true);
  });

  it('allows several guides on one team and still checks referee games', () => {
    const value = base();
    value.staff = [
      { row: 4, member: 'ref', role: 'REFEREE', game_codes: 'G01,G99' },
      { row: 5, member: 'guide1', role: 'GUIDE', team_code: 'T01' },
      { row: 6, member: 'guide2', role: 'GUIDE', team_code: 'T01' },
    ];
    const codes = validateImportPayload(value).map((issue) => issue.code);
    expect(codes).toEqual(['UNKNOWN_GAME']);
  });
});
