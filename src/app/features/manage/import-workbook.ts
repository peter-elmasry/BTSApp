import type { CellValue, Worksheet } from 'exceljs';
import type {
  ImportIssue,
  ImportPayload,
  ImportRecord,
  ImportSheet,
  ParsedImport,
} from './import-types';
import { TEAM_AVATARS } from './setup-helpers';

export interface ImportValidationContext {
  teams?: ImportRecord[];
  games?: ImportRecord[];
  rounds?: ImportRecord[];
  matches?: ImportRecord[];
  roles?: ImportRecord[];
}

const columns = {
  Teams: ['code*', 'name_en*', 'name_ar', 'avatar_key*', 'color_hex*'],
  Games: ['code*', 'name_en*', 'name_ar', 'location_en', 'location_ar'],
  Rounds: ['number*', 'type*', 'name_en', 'name_ar', 'duration_min*'],
  Matches: ['round_number*', 'game_code*', 'team_a_code', 'team_b_code'],
  Staff: ['member*', 'role*', 'game_codes', 'team_code'],
} as const;
const eventDefaults: Record<string, unknown> = {
  name_en: 'DST event',
  name_ar: 'يوم DST',
  points_win: 2,
  points_draw: 1,
  points_loss: 0,
  currency_en_one: 'Point',
  currency_en_other: 'Points',
  currency_ar_one: 'نقطة',
  currency_ar_two: 'نقطتين',
  currency_ar_plural: 'نقط',
  match_bonus_cap: null,
  match_penalty_cap: null,
  event_bonus_cap: null,
  event_penalty_cap: null,
  leaderboard_public: false,
};
const requiredEventKeys = Object.keys(eventDefaults).filter(
  (key) => !key.endsWith('_cap') && key !== 'name_ar' && key !== 'leaderboard_public',
);
const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .trim()
    .replace(/\*$/, '');
const text = (value: unknown) => String(value ?? '').trim();
const blank = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const integer = (value: unknown, min = 0, max = 999999) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const numericColumns = new Set([
  'number',
  'round_number',
  'duration_min',
  'points_win',
  'points_draw',
  'points_loss',
  'match_bonus_cap',
  'match_penalty_cap',
  'event_bonus_cap',
  'event_penalty_cap',
]);

function styleSheet(sheet: Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172B4D' } };
  sheet.columns.forEach((column) => {
    column.width = 24;
  });
}

/** ExcelJS stays in a separate lazy chunk, loaded only when the user imports/downloads. */
export async function createImportTemplate(
  event: Record<string, unknown> = {},
): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  const readme = book.addWorksheet('README');
  readme.addRows([
    ['English', 'العربية'],
    [
      'Replace the example rows with your setup. * marks required fields. Keep all sheets and headers.',
      'استبدل صفوف المثال ببيانات الحدث. النجمة * تعني حقل مطلوب. احتفظ بكل الأوراق والعناوين.',
    ],
    [
      'Event uses key/value rows. Do not change key names. Blank optional caps mean unlimited.',
      'ورقة Event تستخدم مفتاح وقيمة. لا تغيّر أسماء المفاتيح. الحدود الاختيارية الفارغة تعني بلا حد.',
    ],
    [
      'Team codes: T1–T999; game codes: G1–G999. Colors: #RRGGBB. Avatars: see Avatars.',
      'أكواد الفرق T1–T999 والألعاب G1–G999. الألوان #RRGGBB والصور من Avatars.',
    ],
    [
      'Rounds: REGULAR (number > 0), OPENING (number 0), duration 1–600 minutes.',
      'الجولات REGULAR برقم أكبر من صفر أو OPENING برقم صفر؛ المدة من 1 إلى 600 دقيقة.',
    ],
    [
      'OPENING has exactly one match with both team cells blank (all teams). Regular matches need two different teams.',
      'للجولة الافتتاحية مباراة واحدة مع ترك الفريقين فارغين لمشاركة الجميع. المباراة العادية تحتاج فريقين مختلفين.',
    ],
    [
      'Staff: REFEREE with comma-separated game_codes, or GUIDE with one team_code. Member is an existing active username or phone.',
      'الطاقم REFEREE مع أكواد ألعاب مفصولة بفواصل أو GUIDE مع كود فريق واحد. العضو باسم مستخدم أو هاتف لعضو موجود ونشط.',
    ],
    [
      'leaderboard_public: TRUE/FALSE. Integers only for points, caps and round numbers. Formulas are rejected.',
      'ظهور الترتيب TRUE/FALSE. النقاط والحدود وأرقام الجولات أعداد صحيحة. المعادلات غير مسموحة.',
    ],
    [
      'UPSERT updates by code/number and never deletes. REPLACE removes the old setup, only before the event starts. Review and confirm before saving.',
      'UPSERT يحدّث بالكود أو الرقم بلا حذف. REPLACE يستبدل الإعداد قبل بدء الحدث فقط. راجع وأكّد قبل الحفظ.',
    ],
    [
      'Staff is blank in this example; no member accounts are created by an import. Game images are uploaded in the setup page.',
      'ورقة الطاقم فارغة في المثال؛ الاستيراد لا ينشئ حسابات. صور الألعاب تُرفع من صفحة الإعداد.',
    ],
  ]);
  readme.columns = [{ width: 95 }, { width: 95 }];
  readme.eachRow((row) => {
    row.alignment = { wrapText: true, vertical: 'top' };
    row.height = 45;
  });
  const settings = book.addWorksheet('Event');
  settings.addRow(['key', 'value']);
  Object.entries(eventDefaults).forEach(([key, fallback]) => {
    settings.addRow([
      `${key}${requiredEventKeys.includes(key) ? '*' : ''}`,
      event[key] ?? fallback,
    ]);
  });
  const samples: Record<keyof typeof columns, unknown[][]> = {
    Teams: [
      ['T01', 'Falcons', 'الصقور', 'falcon', '#172B4D'],
      ['T02', 'Lions', 'الأسود', 'lion', '#B34B24'],
    ],
    Games: [['G01', 'Relay', 'سباق التتابع', 'Main field', 'الملعب الرئيسي']],
    Rounds: [[1, 'REGULAR', 'Round 1', 'الجولة الأولى', 20]],
    Matches: [[1, 'G01', 'T01', 'T02']],
    Staff: [],
  };
  for (const name of Object.keys(columns) as (keyof typeof columns)[]) {
    const sheet = book.addWorksheet(name);
    sheet.addRow([...columns[name]]);
    sheet.addRows(samples[name]);
  }
  const avatars = book.addWorksheet('Avatars');
  avatars.addRow(['avatar_key']);
  TEAM_AVATARS.forEach((key) => avatars.addRow([key]));
  book.definedNames.add(`Avatars!$A$2:$A$${TEAM_AVATARS.length + 1}`, 'TeamAvatars');
  await avatars.protect('avatar-catalog', { selectLockedCells: true, spinCount: 1000 });
  book.worksheets.forEach(styleSheet);
  readme.columns = [{ width: 95 }, { width: 95 }];
  settings.getColumn(1).width = 30;
  for (let row = 2; row <= 1001; row++) {
    book.getWorksheet('Teams')!.getCell(row, 4).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['TeamAvatars'],
      showErrorMessage: true,
    };
    book.getWorksheet('Rounds')!.getCell(row, 2).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"REGULAR,OPENING"'],
      showErrorMessage: true,
    };
    book.getWorksheet('Staff')!.getCell(row, 2).dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"REFEREE,GUIDE"'],
      showErrorMessage: true,
    };
  }
  settings.getCell(Object.keys(eventDefaults).indexOf('leaderboard_public') + 2, 2).dataValidation =
    { type: 'list', allowBlank: true, formulae: ['"TRUE,FALSE"'], showErrorMessage: true };
  return new Uint8Array(await book.xlsx.writeBuffer());
}

function cellScalar(
  value: CellValue,
  sheet: ImportSheet,
  row: number,
  column: string,
  errors: ImportIssue[],
): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  errors.push({ sheet, row, column, code: 'UNSUPPORTED_CELL' });
  return null;
}

function coerce(value: unknown, key: string): unknown {
  if (blank(value)) return null;
  if (numericColumns.has(key) && typeof value === 'string' && /^\d+$/.test(value))
    return Number(value);
  if (key === 'leaderboard_public' && typeof value === 'string' && /^(TRUE|FALSE)$/i.test(value))
    return value.toUpperCase() === 'TRUE';
  if (
    ['code', 'game_code', 'team_a_code', 'team_b_code', 'team_code', 'type', 'role'].includes(key)
  )
    return text(value).toUpperCase();
  return value;
}

export async function parseImportWorkbook(
  buffer: ArrayBuffer,
  context?: ImportValidationContext,
): Promise<ParsedImport> {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  const payload: ImportPayload = {
    event: {},
    teams: [],
    games: [],
    rounds: [],
    matches: [],
    staff: [],
  };
  const errors: ImportIssue[] = [];
  const eventRows = new Map<string, number>();
  try {
    await book.xlsx.load(buffer);
  } catch {
    return {
      payload,
      errors: [{ sheet: 'Workbook', row: 0, column: '', code: 'INVALID_WORKBOOK' }],
    };
  }
  for (const name of ['README', 'Event', ...Object.keys(columns), 'Avatars']) {
    if (!book.getWorksheet(name))
      errors.push({ sheet: 'Workbook', row: 0, column: name, code: 'MISSING_SHEET' });
  }
  for (const name of ['Event', ...Object.keys(columns)] as ('Event' | keyof typeof columns)[]) {
    const sheet = book.getWorksheet(name);
    if (!sheet) continue;
    if (sheet.rowCount > 10000 || sheet.columnCount > 50) {
      errors.push({ sheet: name, row: 0, column: '', code: 'SHEET_TOO_LARGE' });
      continue;
    }
    const headers = name === 'Event' ? ['key', 'value'] : columns[name].map(normalizeHeader);
    let validHeaders = true;
    for (let col = 1; col <= Math.max(headers.length, sheet.getRow(1).cellCount); col++) {
      const actual = cellScalar(sheet.getCell(1, col).value, name, 1, String(col), errors);
      if (normalizeHeader(actual) !== (headers[col - 1] ?? '')) {
        errors.push({
          sheet: name,
          row: 1,
          column: headers[col - 1] ?? String(col),
          code: 'INVALID_HEADER',
        });
        validHeaders = false;
      }
    }
    if (!validHeaders) continue;
    const eventKeys = new Set<string>();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = headers.map((header, index) =>
        cellScalar(row.getCell(index + 1).value, name, rowNumber, header, errors),
      );
      for (let col = headers.length + 1; col <= row.cellCount; col++) {
        if (!blank(row.getCell(col).value))
          errors.push({
            sheet: name,
            row: rowNumber,
            column: String(col),
            code: 'UNEXPECTED_COLUMN',
          });
      }
      if (values.every(blank)) return;
      if (name === 'Event') {
        const key = normalizeHeader(values[0]);
        if (!Object.hasOwn(eventDefaults, key)) {
          errors.push({ sheet: name, row: rowNumber, column: 'key', code: 'UNKNOWN_KEY' });
          return;
        }
        if (eventKeys.has(key))
          errors.push({ sheet: name, row: rowNumber, column: key, code: 'DUPLICATE_KEY' });
        eventKeys.add(key);
        eventRows.set(key, rowNumber);
        payload.event[key] = coerce(values[1], key);
      } else {
        const record: ImportRecord = { row: rowNumber };
        headers.forEach((key, index) => {
          record[key] = coerce(values[index], key);
        });
        payload[name.toLowerCase() as 'teams' | 'games' | 'rounds' | 'matches' | 'staff'].push(
          record,
        );
      }
    });
  }
  const validation = validateImportPayload(payload, context).map((issue) =>
    issue.sheet === 'Event' ? { ...issue, row: eventRows.get(issue.column) ?? 0 } : issue,
  );
  return { payload, errors: [...errors, ...validation] };
}

export function validateImportPayload(
  payload: ImportPayload,
  context: ImportValidationContext = {},
): ImportIssue[] {
  const errors: ImportIssue[] = [];
  const add = (sheet: ImportSheet, record: ImportRecord, column: string, code: string) =>
    errors.push({ sheet, row: record.row ?? 0, column, code });
  for (const key of requiredEventKeys) {
    if (blank(payload.event[key]))
      add('Event', { row: Object.keys(eventDefaults).indexOf(key) + 2 }, key, 'REQUIRED');
  }
  for (const [key, value] of Object.entries(payload.event)) {
    const record = { row: Object.keys(eventDefaults).indexOf(key) + 2 };
    if (numericColumns.has(key) && !(key.endsWith('_cap') && blank(value)) && !integer(value))
      add('Event', record, key, 'INVALID_NUMBER');
    if (
      (key.startsWith('currency_') || key.startsWith('name_')) &&
      !blank(value) &&
      (typeof value !== 'string' || text(value).length > (key.startsWith('name_') ? 120 : 40))
    )
      add('Event', record, key, 'INVALID_TEXT');
    if (key === 'leaderboard_public' && !blank(value) && typeof value !== 'boolean')
      add('Event', record, key, 'INVALID_BOOLEAN');
  }
  for (const name of Object.keys(columns) as (keyof typeof columns)[]) {
    const records =
      payload[name.toLowerCase() as 'teams' | 'games' | 'rounds' | 'matches' | 'staff'];
    for (const record of records) {
      for (const header of columns[name]) {
        const key = normalizeHeader(header);
        if (header.endsWith('*') && blank(record[key])) add(name, record, key, 'REQUIRED');
        if (!blank(record[key]) && !numericColumns.has(key) && typeof record[key] !== 'string')
          add(name, record, key, 'INVALID_TEXT');
      }
    }
  }
  function indexed(
    records: ImportRecord[],
    previous: ImportRecord[],
    key: string,
    sheet: ImportSheet,
  ) {
    const result = new Map(previous.map((record) => [text(record[key]), record]));
    const seen = new Set<string>();
    records.forEach((record) => {
      const value = text(record[key]);
      if (seen.has(value)) add(sheet, record, key, 'DUPLICATE');
      seen.add(value);
      result.set(value, record);
    });
    return result;
  }
  const teams = indexed(payload.teams, context.teams ?? [], 'code', 'Teams');
  const games = indexed(payload.games, context.games ?? [], 'code', 'Games');
  const rounds = indexed(payload.rounds, context.rounds ?? [], 'number', 'Rounds');
  for (const team of payload.teams) {
    if (!/^T\d{1,3}$/.test(text(team['code']))) add('Teams', team, 'code', 'INVALID_CODE');
    if (text(team['name_en']).length > 80) add('Teams', team, 'name_en', 'INVALID_TEXT');
    if (!TEAM_AVATARS.includes(text(team['avatar_key'])))
      add('Teams', team, 'avatar_key', 'INVALID_AVATAR');
    if (!/^#[0-9a-f]{6}$/i.test(text(team['color_hex'])))
      add('Teams', team, 'color_hex', 'INVALID_COLOR');
  }
  for (const game of payload.games) {
    if (!/^G\d{1,3}$/.test(text(game['code']))) add('Games', game, 'code', 'INVALID_CODE');
    if (text(game['name_en']).length > 100) add('Games', game, 'name_en', 'INVALID_TEXT');
    for (const key of ['location_en', 'location_ar']) {
      if (text(game[key]).length > 120) add('Games', game, key, 'INVALID_TEXT');
    }
  }
  for (const round of payload.rounds) {
    if (!integer(round['number'])) add('Rounds', round, 'number', 'INVALID_NUMBER');
    if (!integer(round['duration_min'], 1, 600))
      add('Rounds', round, 'duration_min', 'INVALID_DURATION');
    if (text(round['name_en']).length > 100) add('Rounds', round, 'name_en', 'INVALID_TEXT');
    if (!['REGULAR', 'OPENING'].includes(text(round['type'])))
      add('Rounds', round, 'type', 'INVALID_ROUND_TYPE');
    if (
      (round['type'] === 'OPENING' && round['number'] !== 0) ||
      (round['type'] === 'REGULAR' && !integer(round['number'], 1))
    )
      add('Rounds', round, 'number', 'INVALID_ROUND_NUMBER');
  }
  const openings = [...rounds.values()].filter((round) => round['type'] === 'OPENING');
  if (openings.length > 1)
    openings.forEach((round) => add('Rounds', round, 'type', 'MULTIPLE_OPENING_ROUNDS'));
  const roundIds = new Map(
    (context.rounds ?? []).map((round) => [text(round['id']), round['number']]),
  );
  const gameIds = new Map((context.games ?? []).map((game) => [text(game['id']), game['code']]));
  const teamIds = new Map((context.teams ?? []).map((team) => [text(team['id']), team['code']]));
  const matchKey = (match: ImportRecord) =>
    `${text(match['round_number'])}:${text(match['game_code'])}`;
  const matches = new Map<string, ImportRecord>();
  for (const match of context.matches ?? []) {
    const participants = (match['participants'] ?? []) as ImportRecord[];
    const mapped: ImportRecord = {
      round_number: match['round_number'] ?? roundIds.get(text(match['round_id'])),
      game_code: match['game_code'] ?? gameIds.get(text(match['game_id'])),
      team_a_code: teamIds.get(text(participants.find((p) => p['side'] === 'A')?.['team_id'])),
      team_b_code: teamIds.get(text(participants.find((p) => p['side'] === 'B')?.['team_id'])),
    };
    matches.set(matchKey(mapped), mapped);
  }
  const seenMatches = new Set<string>();
  for (const match of payload.matches) {
    const key = matchKey(match);
    if (seenMatches.has(key)) add('Matches', match, 'game_code', 'DUPLICATE_MATCH');
    seenMatches.add(key);
    matches.set(key, match);
    if (!integer(match['round_number'])) add('Matches', match, 'round_number', 'INVALID_NUMBER');
    const round = rounds.get(text(match['round_number']));
    if (!round) add('Matches', match, 'round_number', 'UNKNOWN_ROUND');
    if (!games.has(text(match['game_code']))) add('Matches', match, 'game_code', 'UNKNOWN_GAME');
    if (round?.['type'] === 'OPENING') {
      if (!blank(match['team_a_code']) || !blank(match['team_b_code']))
        add('Matches', match, 'team_a_code', 'OPENING_TEAMS_MUST_BE_EMPTY');
    } else if (round?.['type'] === 'REGULAR') {
      for (const key of ['team_a_code', 'team_b_code']) {
        if (blank(match[key])) add('Matches', match, key, 'REQUIRED');
        else if (!teams.has(text(match[key]))) add('Matches', match, key, 'UNKNOWN_TEAM');
      }
      if (!blank(match['team_a_code']) && match['team_a_code'] === match['team_b_code'])
        add('Matches', match, 'team_b_code', 'SAME_TEAM');
    }
  }
  const usedTeams = new Map<string, ImportRecord>();
  // Imported rows go last so conflicts with existing matches point at the uploaded row.
  for (const match of [...matches.values()].sort((a, b) => Number(!!a.row) - Number(!!b.row))) {
    if (rounds.get(text(match['round_number']))?.['type'] !== 'REGULAR') continue;
    for (const key of ['team_a_code', 'team_b_code']) {
      if (blank(match[key])) continue;
      const scheduleKey = `${text(match['round_number'])}:${text(match[key])}`;
      if (usedTeams.has(scheduleKey) && usedTeams.get(scheduleKey) !== match)
        add('Matches', match, key, 'TEAM_ALREADY_SCHEDULED');
      usedTeams.set(scheduleKey, match);
    }
  }
  for (const opening of openings) {
    if (
      [...matches.values()].filter((match) => match['round_number'] === opening['number'])
        .length !== 1
    )
      add('Rounds', opening, 'number', 'OPENING_REQUIRES_ONE_MATCH');
  }
  const guides = new Set<string>();
  const reassignedGuides = new Set(
    payload.staff
      .filter((staff) => staff['role'] === 'GUIDE')
      .map((staff) => text(staff['member']).toLowerCase()),
  );
  const existingGuides = new Map(
    (context.roles ?? [])
      .filter(
        (role) =>
          role['role'] === 'GUIDE' && !reassignedGuides.has(text(role['username']).toLowerCase()),
      )
      .map((role) => [text(teamIds.get(text(role['team_id']))), role]),
  );
  const staffKeys = new Set<string>();
  for (const staff of payload.staff) {
    const role = text(staff['role']);
    const memberKey = `${text(staff['member']).toLowerCase()}:${role}`;
    if (staffKeys.has(memberKey)) add('Staff', staff, 'member', 'DUPLICATE');
    staffKeys.add(memberKey);
    if (!['REFEREE', 'GUIDE'].includes(role)) add('Staff', staff, 'role', 'INVALID_ROLE');
    if (role === 'GUIDE') {
      const code = text(staff['team_code']);
      if (!code) add('Staff', staff, 'team_code', 'REQUIRED');
      else if (!teams.has(code)) add('Staff', staff, 'team_code', 'UNKNOWN_TEAM');
      if (guides.has(code)) add('Staff', staff, 'team_code', 'DUPLICATE_GUIDE');
      // Phones are intentionally absent from the directory; the server resolves phone identities.
      if (!/^(?:\+|00|01)\d/.test(text(staff['member'])) && existingGuides.has(code))
        add('Staff', staff, 'team_code', 'DUPLICATE_GUIDE');
      guides.add(code);
      if (!blank(staff['game_codes'])) add('Staff', staff, 'game_codes', 'GUIDE_HAS_GAMES');
    }
    if (role === 'REFEREE') {
      const codes = text(staff['game_codes'])
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean);
      if (!codes.length) add('Staff', staff, 'game_codes', 'REQUIRED');
      if (new Set(codes).size !== codes.length) add('Staff', staff, 'game_codes', 'DUPLICATE');
      if (codes.some((code) => !games.has(code))) add('Staff', staff, 'game_codes', 'UNKNOWN_GAME');
      if (!blank(staff['team_code'])) add('Staff', staff, 'team_code', 'REFEREE_HAS_TEAM');
    }
  }
  return errors;
}
