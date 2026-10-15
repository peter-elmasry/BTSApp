import type { CellValue, Workbook, Worksheet } from 'exceljs';
import type {
  ImportIssue,
  ImportPayload,
  ImportRecord,
  ImportSheet,
  ParsedImport,
} from './import-types';
import { TEAM_AVATARS } from './setup-helpers';
import {
  AVATAR_LABELS,
  DEFAULT_TEAM_NAMES,
  EVENT_FIELDS,
  GAME_HEADERS,
  GRID_COL,
  GRID_LAST_COL,
  GRID_ROW,
  MAX_GAMES,
  MAX_ROUNDS,
  MAX_STAFF,
  MAX_TEAMS,
  NO,
  ROLE_LABELS,
  SCHEDULE_HEADERS,
  SHEETS,
  STAFF_HEADERS,
  TABLE_ROW,
  TEAM_HEADERS,
  TEAM_PALETTE,
  TEMPLATE_VERSION,
  ACCEPTED_TEMPLATE_VERSIONS,
  SCORING_LABELS,
  YES,
  eventRow,
} from './template-catalog';

export interface ImportValidationContext {
  teams?: ImportRecord[];
  games?: ImportRecord[];
  rounds?: ImportRecord[];
  matches?: ImportRecord[];
  roles?: ImportRecord[];
  referee_games?: ImportRecord[];
  eligible_members?: ImportRecord[];
  event?: Record<string, unknown>;
}

// ------------------------------------------------------------------ server payload contract (unchanged)
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
  scoring_mode: 'POINTS',
  initial_lives: null,
  life_emoji: '❤️',
};
const optionalEventKeys = new Set([
  'name_ar',
  'leaderboard_public',
  'scoring_mode',
  'initial_lives',
  'life_emoji',
]);
const requiredEventKeys = Object.keys(eventDefaults).filter(
  (key) => !key.endsWith('_cap') && !optionalEventKeys.has(key),
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
const CURRENCY_KEYS = [
  'currency_en_one',
  'currency_en_other',
  'currency_ar_one',
  'currency_ar_two',
  'currency_ar_plural',
] as const;
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
  'initial_lives',
]);

// ------------------------------------------------------------------ styling helpers
const FONT = 'Arial';
const NAVY = '172B4D';
const GOLD = 'C9A227';
const INK = '1B1F24';
const MUTED = '6B778C';
const ERROR = 'C62828';
const OK = '2E7D32';
const BREAK = 'E0E0E0';
const READONLY = 'EEF1F5';
const NOTE = 'FFF6D6';
const GAME_TINTS = [
  'E3F2FD',
  'FCE4EC',
  'F3E5F5',
  'FFF3E0',
  'E0F2F1',
  'F1F8E9',
  'FFFDE7',
  'E8EAF6',
  'EFEBE9',
  'E0F7FA',
  'FBE9E7',
  'ECEFF1',
];
const GAME_INKS = [
  '1565C0',
  'AD1457',
  '6A1B9A',
  'E65100',
  '00695C',
  '558B2F',
  'F9A825',
  '283593',
  '4E342E',
  '00838F',
  'D84315',
  '37474F',
];
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const solid = (hex: string) => ({
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: argb(hex) },
});
const cfFill = (hex: string) => ({
  type: 'pattern' as const,
  pattern: 'solid' as const,
  bgColor: { argb: argb(hex) },
});
const thin = { style: 'thin' as const, color: { argb: 'FFD5DAE1' } };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };
const CENTER = {
  horizontal: 'center' as const,
  vertical: 'middle' as const,
  wrapText: true,
  readingOrder: 'rtl' as const,
};
const RIGHT = {
  horizontal: 'right' as const,
  vertical: 'middle' as const,
  wrapText: true,
  readingOrder: 'rtl' as const,
};
const col = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};
const q = (sheet: string) => `'${sheet}'`;

/** Picks black or white text for readable contrast on a team colour. */
export function textOn(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.05 ? 'FFFFFF' : INK;
}

function addSheet(book: Workbook, name: string, tab: string, frozenRows = 3) {
  return book.addWorksheet(name, {
    properties: { tabColor: { argb: argb(tab) } },
    views: [
      { rightToLeft: true, showGridLines: false, state: 'frozen', ySplit: frozenRows, xSplit: 0 },
    ],
  });
}

function banner(sheet: Worksheet, cols: number, title: string, subtitle: string, color: string) {
  sheet.mergeCells(1, 1, 1, cols);
  const head = sheet.getCell(1, 1);
  head.value = title;
  head.font = { name: FONT, size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = solid(color);
  head.alignment = CENTER;
  sheet.getRow(1).height = 38;
  sheet.mergeCells(2, 1, 2, cols);
  const sub = sheet.getCell(2, 1);
  sub.value = subtitle;
  sub.font = { name: FONT, size: 10, italic: true, color: { argb: argb(NAVY) } };
  sub.fill = solid(NOTE);
  sub.alignment = CENTER;
  sheet.getRow(2).height = 30;
}

function header(sheet: Worksheet, row: number, labels: string[], color: string) {
  labels.forEach((label, index) => {
    const cell = sheet.getCell(row, index + 1);
    cell.value = label;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(color);
    cell.alignment = CENTER;
    cell.border = BOX;
  });
  sheet.getRow(row).height = 28;
}

function list(sheet: Worksheet, r1: number, r2: number, c: number, source: string, prompt: string) {
  for (let r = r1; r <= r2; r++)
    sheet.getCell(r, c).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [source],
      showErrorMessage: true,
      errorTitle: 'قيمة غير موجودة',
      error: 'اختار من القائمة لو سمحت.',
      showInputMessage: true,
      promptTitle: 'اختار',
      prompt,
    };
}

function whole(sheet: Worksheet, r1: number, r2: number, c: number, min: number, max: number) {
  for (let r = r1; r <= r2; r++)
    sheet.getCell(r, c).dataValidation = {
      type: 'whole',
      operator: 'between',
      allowBlank: true,
      formulae: [min, max],
      showErrorMessage: true,
      error: `رقم صحيح من ${min} لـ ${max}`,
    };
}

let priority = 1;
function rule(
  sheet: Worksheet,
  ref: string,
  formula: string,
  bg: string,
  fg = 'FFFFFF',
  bold = true,
) {
  sheet.addConditionalFormatting({
    ref,
    rules: [
      {
        type: 'expression',
        priority: priority++,
        formulae: [formula],
        style: { fill: cfFill(bg), font: { color: { argb: argb(fg) }, bold } },
      },
    ],
  });
}

function input(sheet: Worksheet, r1: number, r2: number, c1: number, c2: number, align = CENTER) {
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = { name: FONT, size: 11, color: { argb: argb(INK) } };
      cell.alignment = align;
      cell.border = BOX;
      cell.protection = { locked: false };
    }
}

function computed(sheet: Worksheet, r: number, c: number, formula: string, result?: CellValue) {
  const cell = sheet.getCell(r, c);
  // A cached result keeps values visible in viewers that do not recalculate (phone previews).
  cell.value = (result === undefined ? { formula } : { formula, result }) as CellValue;
  cell.fill = solid(READONLY);
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: argb(NAVY) } };
  cell.alignment = CENTER;
  cell.border = BOX;
}

// ------------------------------------------------------------------ prefill from the live event
const pickName = (record: Record<string, unknown> | undefined, base = 'name') =>
  text(record?.[`${base}_ar`]) || text(record?.[`${base}_en`]);
const colorName = (hex: unknown) =>
  TEAM_PALETTE.find((entry) => entry.hex.toLowerCase() === text(hex).toLowerCase())?.name ??
  (text(hex) || '');
const avatarLabel = (key: unknown) =>
  AVATAR_LABELS.find((entry) => entry.key === text(key))?.label ?? '';

interface Prefill {
  event: Record<string, unknown>;
  teams: { code: string; name: string; color: string; avatar: string }[];
  games: { code: string; name: string; location: string }[];
  rounds: { number: number; name: string; duration: number | null; cells: string[] }[];
  staff: { member: string; role: string; game: string; team: string }[];
  members: { name: string; username: string; login: boolean }[];
}

/** Display names in the members dropdown must be unique; duplicates carry the username. */
export function memberDirectory(members: ImportRecord[] = []) {
  const rows = members.map((member) => ({
    name: pickName(member, 'full_name') || text(member['username']),
    username: text(member['username']),
    login: member['has_login'] === true,
  }));
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.name, (counts.get(row.name) ?? 0) + 1));
  return rows
    .map((row) =>
      counts.get(row.name)! > 1 ? { ...row, name: `${row.name} (${row.username})` } : row,
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

function prefill(setup: ImportValidationContext): Prefill {
  const event = setup.event ?? {};
  const byCode = (a: ImportRecord, b: ImportRecord) =>
    text(a['code']).localeCompare(text(b['code']));
  const dbTeams = [...(setup.teams ?? [])].sort(byCode).slice(0, MAX_TEAMS);
  const teams = dbTeams.length
    ? dbTeams.map((team) => ({
        code: text(team['code']),
        name: pickName(team),
        color: colorName(team['color_hex']),
        avatar: avatarLabel(team['avatar_key']),
      }))
    : DEFAULT_TEAM_NAMES.slice(0, MAX_TEAMS).map((name, index) => ({
        code: `T${String(index + 1).padStart(2, '0')}`,
        name,
        color: TEAM_PALETTE[index].name,
        avatar: AVATAR_LABELS[index % AVATAR_LABELS.length].label,
      }));
  const dbGames = [...(setup.games ?? [])].sort(byCode).slice(0, MAX_GAMES);
  const games = dbGames.map((game) => ({
    code: text(game['code']),
    name: pickName(game),
    location: pickName(game, 'location'),
  }));
  const teamName = new Map(dbTeams.map((team) => [text(team['id']), pickName(team)]));
  const gameIndex = new Map(dbGames.map((game, index) => [text(game['id']), index]));
  const gameName = new Map(dbGames.map((game) => [text(game['id']), pickName(game)]));
  const dbRounds = [...(setup.rounds ?? [])].sort(
    (a, b) => Number(a['number']) - Number(b['number']),
  );
  const opening = dbRounds.find((round) => round['type'] === 'OPENING');
  const openingMatch = (setup.matches ?? []).find((match) => match['round_id'] === opening?.['id']);
  const rounds = dbRounds
    .filter((round) => round['type'] === 'REGULAR')
    .slice(0, MAX_ROUNDS)
    .map((round) => {
      const cells: string[] = Array(2 * MAX_GAMES).fill('');
      for (const match of setup.matches ?? []) {
        if (match['round_id'] !== round['id']) continue;
        const index = gameIndex.get(text(match['game_id']));
        if (index === undefined) continue;
        const participants = (match['participants'] ?? []) as ImportRecord[];
        const side = (s: string) =>
          teamName.get(text(participants.find((p) => p['side'] === s)?.['team_id'])) ?? '';
        cells[2 * index] = side('A');
        cells[2 * index + 1] = side('B');
      }
      return {
        number: Number(round['number']),
        name: pickName(round),
        duration: round['duration_min'] === undefined ? null : Number(round['duration_min']),
        cells,
      };
    });
  const directory = memberDirectory(setup.eligible_members);
  const memberName = new Map(
    (setup.eligible_members ?? []).map((member, index) => [
      text(member['id']),
      directory.find((d) => d.username === text(member['username']))?.name ??
        text(member['username'] ?? index),
    ]),
  );
  const staff: Prefill['staff'] = [];
  for (const role of setup.roles ?? []) {
    const member = memberName.get(text(role['member_id'])) ?? pickName(role, 'full_name');
    if (role['role'] === 'GUIDE')
      staff.push({
        member,
        role: ROLE_LABELS.GUIDE,
        game: '',
        team: teamName.get(text(role['team_id'])) ?? '',
      });
    if (role['role'] === 'REFEREE')
      for (const assignment of setup.referee_games ?? [])
        if (assignment['member_id'] === role['member_id'])
          staff.push({
            member,
            role: ROLE_LABELS.REFEREE,
            game: gameName.get(text(assignment['game_id'])) ?? '',
            team: '',
          });
  }
  staff.sort((a, b) => (a.role === b.role ? 0 : a.role === ROLE_LABELS.REFEREE ? -1 : 1));
  return {
    event: {
      name: pickName(event) || 'يوم DST',
      points_win: event['points_win'] ?? 2,
      points_draw: event['scoring_mode'] === 'LIVES' ? -0.5 : (event['points_draw'] ?? 1),
      points_loss: event['points_loss'] ?? 0,
      points_name: event['currency_ar_plural'] ?? event['currency_en_other'] ?? 'نقط',
      match_bonus_cap: event['match_bonus_cap'] ?? null,
      match_penalty_cap: event['match_penalty_cap'] ?? null,
      event_bonus_cap: event['event_bonus_cap'] ?? null,
      event_penalty_cap: event['event_penalty_cap'] ?? null,
      leaderboard_public: event['leaderboard_public'] === true ? YES : NO,
      scoring_mode:
        event['scoring_mode'] === 'LIVES' ? SCORING_LABELS.LIVES : SCORING_LABELS.POINTS,
      initial_lives: event['initial_lives'] ?? null,
      life_emoji: event['life_emoji'] ?? '❤️',
      opening_game: openingMatch ? (gameName.get(text(openingMatch['game_id'])) ?? '') : '',
      opening_duration_min: opening?.['duration_min'] ?? null,
    },
    teams,
    games,
    rounds,
    staff: staff.slice(0, MAX_STAFF),
    members: directory,
  };
}

// ------------------------------------------------------------------ template generator
/** Builds the Arabic RTL setup workbook, prefilled with the event's live setup. ExcelJS stays lazy-loaded. */
export async function createImportTemplate(
  setup: ImportValidationContext = {},
  generatedAt = new Date(),
): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = 'BTSApp';
  // ExcelJS writes no cached formula values; make Excel recalculate everything when opened.
  book.calcProperties.fullCalcOnLoad = true;
  priority = 1;
  const data = prefill(setup);
  const stamp = new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Cairo',
  }).format(generatedAt);
  const teamEnd = TABLE_ROW + MAX_TEAMS - 1;
  const gameEnd = TABLE_ROW + MAX_GAMES - 1;
  const staffEnd = TABLE_ROW + MAX_STAFF - 1;
  const gridEnd = GRID_ROW + MAX_ROUNDS - 1;
  const memberEnd = TABLE_ROW + Math.max(data.members.length, 1) - 1;
  const sumM = GRID_LAST_COL + 1;
  const sumR = GRID_LAST_COL + 2;
  const sumC = GRID_LAST_COL + 3;
  const S = { ...Object.fromEntries(Object.entries(SHEETS).map(([k, v]) => [k, q(v)])) } as Record<
    keyof typeof SHEETS,
    string
  >;

  // ---------------- dashboard
  const start = addSheet(book, SHEETS.start, GOLD, 0);
  for (let c = 1; c <= 8; c++) start.getColumn(c).width = 17;
  banner(
    start,
    8,
    '🏆  BTSApp — إعداد الحدث',
    `${data.event['name']} · تم التصدير ${stamp} (القاهرة) · الملف فيه الإعداد الحالي — عدّل وارفعه تاني`,
    NAVY,
  );
  start.mergeCells(4, 1, 4, 8);
  Object.assign(start.getCell(4, 1), { value: 'لوحة الجاهزية — بتتحدث وانت بتكتب' });
  start.getCell(4, 1).font = { name: FONT, size: 13, bold: true, color: { argb: argb(NAVY) } };
  start.getCell(4, 1).alignment = RIGHT;
  const tiles: [string, string, string, boolean][] = [
    ['الفرق', 'COUNTIF(TeamNames,"?*")', '1E88E5', false],
    ['الألعاب', 'COUNTIF(GameNames,"?*")', '8E24AA', false],
    [
      'الجولات',
      `COUNTIF(${S.schedule}!$${col(sumM)}$${GRID_ROW}:$${col(sumM)}$${gridEnd},">0")`,
      '00897B',
      false,
    ],
    [
      'المباريات',
      `SUM(${S.schedule}!$${col(sumM)}$${GRID_ROW}:$${col(sumM)}$${gridEnd})+IF(${S.event}!$B$${eventRow('opening_game')}<>"",1,0)`,
      'F57C00',
      false,
    ],
    [
      'تعارضات في الجدول',
      `SUM(${S.schedule}!$${col(sumC)}$${GRID_ROW}:$${col(sumC)}$${gridEnd})`,
      OK,
      true,
    ],
    [
      'ألعاب بدون حكم',
      `SUMPRODUCT((${S.games}!$B$${TABLE_ROW}:$B$${gameEnd}<>"")*(COUNTIFS(${S.staff}!$B$${TABLE_ROW}:$B$${staffEnd},"${ROLE_LABELS.REFEREE}",${S.staff}!$C$${TABLE_ROW}:$C$${staffEnd},${S.games}!$B$${TABLE_ROW}:$B$${gameEnd})=0))`,
      OK,
      true,
    ],
    [
      'فرق بدون مرشد',
      `SUMPRODUCT((${S.teams}!$B$${TABLE_ROW}:$B$${teamEnd}<>"")*(COUNTIFS(${S.staff}!$B$${TABLE_ROW}:$B$${staffEnd},"${ROLE_LABELS.GUIDE}",${S.staff}!$D$${TABLE_ROW}:$D$${staffEnd},${S.teams}!$B$${TABLE_ROW}:$B$${teamEnd})=0))`,
      OK,
      true,
    ],
    [
      'فرق بدون مباريات',
      `SUMPRODUCT((${S.teams}!$B$${TABLE_ROW}:$B$${teamEnd}<>"")*(${S.teams}!$E$${TABLE_ROW}:$E$${teamEnd}=0))`,
      OK,
      true,
    ],
  ];
  tiles.forEach(([label, formula, color, warn], index) => {
    const c = index + 1;
    const value = start.getCell(5, c);
    value.value = { formula };
    value.font = { name: FONT, size: 26, bold: true, color: { argb: 'FFFFFFFF' } };
    value.fill = solid(color);
    value.alignment = CENTER;
    const name = start.getCell(6, c);
    name.value = (warn ? '⚠️ ' : '') + label;
    name.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    name.fill = solid(color);
    name.alignment = CENTER;
    if (warn) rule(start, `${col(c)}5:${col(c)}6`, `$${col(c)}$5>0`, ERROR);
  });
  start.getRow(5).height = 52;
  start.getRow(6).height = 30;
  start.mergeCells(8, 1, 8, 8);
  start.getCell(8, 1).value = 'خطوات سريعة';
  start.getCell(8, 1).font = { name: FONT, size: 13, bold: true, color: { argb: argb(NAVY) } };
  start.getCell(8, 1).alignment = RIGHT;
  const steps: [string, string, string][] = [
    [SHEETS.event, 'اكتب اسم الحدث والنقط والعملة ولعبة الافتتاح.', '1E88E5'],
    [
      SHEETS.teams,
      'فيه لحد ٢٠ فريق بألوان مختلفة — امسح اسم الفريق اللي مش محتاجه (متحذفش الصف).',
      'D81B60',
    ],
    [SHEETS.games, 'اكتب اسم اللعبة ومكانها. لإلغاء لعبة امسح اسمها.', '8E24AA'],
    [
      SHEETS.schedule,
      'كل صف جولة وكل لعبة ليها خانتين. اختار الفريقين. الخانتين الفاضيين = استراحة للعبة.',
      'F57C00',
    ],
    [
      SHEETS.staff,
      'اختار العضو والدور: حكم ← اللعبة، مرشد ← الفريق. ممكن أكتر من مرشد لنفس الفريق.',
      '00897B',
    ],
    [
      'ارفع الملف',
      'من التطبيق: إدارة الحدث ← استيراد ← راجع المعاينة ← تأكيد. مفيش حاجة بتتحفظ قبل التأكيد.',
      OK,
    ],
  ];
  steps.forEach(([title, desc, color], index) => {
    const r = 9 + index;
    const n = start.getCell(r, 1);
    n.value = index + 1;
    n.font = { name: FONT, size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    n.fill = solid(color);
    n.alignment = CENTER;
    const t = start.getCell(r, 2);
    t.value = title;
    t.font = { name: FONT, size: 12, bold: true, color: { argb: argb(color) } };
    t.alignment = CENTER;
    start.mergeCells(r, 3, r, 8);
    const d = start.getCell(r, 3);
    d.value = desc;
    d.font = { name: FONT, size: 11 };
    d.alignment = RIGHT;
    start.getRow(r).height = 30;
  });
  const legend: [string, string, string][] = [
    ['خانة مطلوبة', NAVY, 'FFFFFF'],
    ['خانة اختيارية', '5E6C84', 'FFFFFF'],
    ['تلقائي — متكتبش فيها', READONLY, MUTED],
    ['تعارض / غلط', ERROR, 'FFFFFF'],
    ['استراحة للعبة', BREAK, MUTED],
    ['جاهز', OK, 'FFFFFF'],
  ];
  start.mergeCells(16, 1, 16, 8);
  start.getCell(16, 1).value = 'دليل الألوان';
  start.getCell(16, 1).font = { name: FONT, size: 13, bold: true, color: { argb: argb(NAVY) } };
  start.getCell(16, 1).alignment = RIGHT;
  legend.forEach(([label, bg, fg], index) => {
    const cell = start.getCell(17, index + 1);
    cell.value = label;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: argb(fg) } };
    cell.fill = solid(bg);
    cell.alignment = CENTER;
  });
  start.getRow(17).height = 28;

  // ---------------- event
  const ev = addSheet(book, SHEETS.event, '1E88E5');
  [28, 30, 44, 4].forEach((w, i) => (ev.getColumn(i + 1).width = w));
  banner(
    ev,
    3,
    '⚙️  بيانات الحدث',
    'عدّل العمود الأبيض بس. الخانات الفاضية في الحدود = بلا حد.',
    '1E88E5',
  );
  header(ev, 3, ['البند', 'القيمة', 'ملاحظة'], '1E88E5');
  EVENT_FIELDS.forEach((field, index) => {
    const r = TABLE_ROW + index;
    const label = ev.getCell(r, 1);
    label.value = field.label;
    label.font = {
      name: FONT,
      size: 11,
      bold: true,
      color: { argb: field.required ? 'FFFFFFFF' : argb(INK) },
    };
    label.fill = solid(field.required ? NAVY : 'DDE3EC');
    label.alignment = RIGHT;
    label.border = BOX;
    const value = ev.getCell(r, 2);
    value.value = (data.event[field.key] ?? null) as CellValue;
    value.font = { name: FONT, size: 12, bold: true };
    value.alignment = CENTER;
    value.border = BOX;
    value.protection = { locked: false };
    const hint = ev.getCell(r, 3);
    hint.value = field.hint;
    hint.font = { name: FONT, size: 10, italic: true, color: { argb: argb(MUTED) } };
    hint.alignment = RIGHT;
    hint.border = BOX;
    ev.getCell(r, 4).value = field.key;
    ev.getRow(r).height = 24;
  });
  ev.getColumn(4).hidden = true;
  ev.getRow(eventRow('life_emoji')).hidden = true; // Legacy field, fixed SVG presentation.
  // Win/Draw/Loss may be negative: hearts mode removes hearts (D053).
  for (const key of ['points_win', 'points_loss'])
    whole(ev, eventRow(key), eventRow(key), 2, -999999, 999999);
  ev.getCell(eventRow('points_draw'), 2).dataValidation = {
    type: 'custom',
    allowBlank: false,
    showErrorMessage: true,
    error: 'التعادل في القلوب ثابت -0.5؛ النقط عدد صحيح',
    formulae: [
      `IF(B${eventRow('scoring_mode')}="${SCORING_LABELS.LIVES}",B${eventRow('points_draw')}=-0.5,AND(ISNUMBER(B${eventRow('points_draw')}),MOD(B${eventRow('points_draw')},1)=0,ABS(B${eventRow('points_draw')})<=999999))`,
    ],
  };
  for (const key of [
    'match_bonus_cap',
    'match_penalty_cap',
    'event_bonus_cap',
    'event_penalty_cap',
  ])
    whole(ev, eventRow(key), eventRow(key), 2, 0, 999);
  whole(ev, eventRow('opening_duration_min'), eventRow('opening_duration_min'), 2, 1, 600);
  whole(ev, eventRow('initial_lives'), eventRow('initial_lives'), 2, 1, 9999);
  list(
    ev,
    eventRow('scoring_mode'),
    eventRow('scoring_mode'),
    2,
    `"${SCORING_LABELS.POINTS},${SCORING_LABELS.LIVES}"`,
    'نقط / قلوب',
  );
  list(
    ev,
    eventRow('leaderboard_public'),
    eventRow('leaderboard_public'),
    2,
    `"${YES},${NO}"`,
    'نعم / لا',
  );
  list(
    ev,
    eventRow('opening_game'),
    eventRow('opening_game'),
    2,
    'GameNames',
    'اختار لعبة الافتتاح',
  );
  const previewRow = TABLE_ROW + EVENT_FIELDS.length + 1;
  ev.mergeCells(previewRow, 1, previewRow, 3);
  const [pointsName, win] = ['points_name', 'points_win'].map((k) => `B${eventRow(k)}`);
  const preview = ev.getCell(previewRow, 1);
  preview.value = {
    formula: `"مثال:  فوز = "&${win}&" "&${pointsName}`,
  };
  preview.font = { name: FONT, size: 12, bold: true, color: { argb: 'FF7A5B00' } };
  preview.fill = solid(NOTE);
  preview.alignment = CENTER;
  ev.getRow(previewRow).height = 30;

  // ---------------- teams
  const tm = addSheet(book, SHEETS.teams, 'D81B60');
  [9, 22, 14, 16, 12, 12].forEach((w, i) => (tm.getColumn(i + 1).width = w));
  banner(
    tm,
    6,
    `👥  الفرق (لحد ${MAX_TEAMS})`,
    'امسح اسم الفريق اللي مش محتاجه (متحذفش الصف). كل فريق لون مختلف. الكود ثابت متغيروش.',
    'D81B60',
  );
  header(tm, 3, TEAM_HEADERS, 'D81B60');
  input(tm, TABLE_ROW, teamEnd, 2, 4);
  for (let i = 0; i < MAX_TEAMS; i++) {
    const r = TABLE_ROW + i;
    const team = data.teams[i];
    const code = tm.getCell(r, 1);
    code.value = team?.code ?? `T${String(i + 1).padStart(2, '0')}`;
    code.font = { name: FONT, size: 10, bold: true, color: { argb: argb(MUTED) } };
    code.fill = solid(READONLY);
    code.alignment = CENTER;
    code.border = BOX;
    tm.getCell(r, 2).value = team?.name ?? null;
    tm.getCell(r, 2).font = { name: FONT, size: 13, bold: true };
    tm.getCell(r, 3).value = team?.color ?? null;
    tm.getCell(r, 4).value = team?.avatar ?? null;
    computed(
      tm,
      r,
      5,
      `IF(B${r}="","",COUNTIF(${S.schedule}!$${col(GRID_COL)}$${GRID_ROW}:$${col(GRID_LAST_COL)}$${gridEnd},B${r}))`,
    );
    computed(
      tm,
      r,
      6,
      `IF(B${r}="","",COUNTIF(${S.schedule}!$${col(sumM)}$${GRID_ROW}:$${col(sumM)}$${gridEnd},">0")-E${r})`,
    );
    tm.getRow(r).height = 26;
  }
  const tRange = `$B$${TABLE_ROW}:$B$${teamEnd}`;
  const tFirst = `B${TABLE_ROW}`;
  rule(tm, `B${TABLE_ROW}:B${teamEnd}`, `AND(${tFirst}<>"",COUNTIF(${tRange},${tFirst})>1)`, ERROR);
  rule(
    tm,
    `C${TABLE_ROW}:C${teamEnd}`,
    `AND($B${TABLE_ROW}<>"",COUNTIFS($C$${TABLE_ROW}:$C$${teamEnd},C${TABLE_ROW},${tRange},"?*")>1)`,
    ERROR,
  );
  rule(tm, `A${TABLE_ROW}:F${teamEnd}`, `$B${TABLE_ROW}=""`, 'F2F2F2', 'BDBDBD', false);
  rule(tm, `E${TABLE_ROW}:E${teamEnd}`, `AND($B${TABLE_ROW}<>"",E${TABLE_ROW}=0)`, 'F57C00');
  for (const entry of TEAM_PALETTE)
    rule(
      tm,
      `B${TABLE_ROW}:C${teamEnd}`,
      `$C${TABLE_ROW}="${entry.name}"`,
      entry.hex,
      textOn(entry.hex),
    );
  list(tm, TABLE_ROW, teamEnd, 3, 'ColorNames', 'اختار لون مختلف لكل فريق');
  list(tm, TABLE_ROW, teamEnd, 4, 'AvatarLabels', 'اختار شعار');

  // ---------------- games
  const gm = addSheet(book, SHEETS.games, '8E24AA');
  [9, 26, 24].forEach((w, i) => (gm.getColumn(i + 1).width = w));
  banner(
    gm,
    3,
    `🎯  الألعاب (لحد ${MAX_GAMES})`,
    'اسم واحد ومكان واحد. لإلغاء لعبة امسح اسمها (متحذفش الصف). الصور بتترفع من التطبيق.',
    '8E24AA',
  );
  header(gm, 3, GAME_HEADERS, '8E24AA');
  input(gm, TABLE_ROW, gameEnd, 2, 3);
  const usedCodes = new Set(data.games.map((g) => g.code));
  const freeCodes = Array.from(
    { length: 999 },
    (_, i) => `G${String(i + 1).padStart(2, '0')}`,
  ).filter((c) => !usedCodes.has(c));
  for (let i = 0; i < MAX_GAMES; i++) {
    const r = TABLE_ROW + i;
    const game = data.games[i];
    const code = gm.getCell(r, 1);
    code.value = game?.code ?? freeCodes.shift()!;
    code.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    code.fill = solid(GAME_INKS[i]);
    code.alignment = CENTER;
    code.border = BOX;
    gm.getCell(r, 2).value = game?.name ?? null;
    gm.getCell(r, 2).font = {
      name: FONT,
      size: 13,
      bold: true,
      color: { argb: argb(GAME_INKS[i]) },
    };
    gm.getCell(r, 2).fill = solid(GAME_TINTS[i]);
    gm.getCell(r, 3).value = game?.location ?? null;
    gm.getCell(r, 3).fill = solid(GAME_TINTS[i]);
    gm.getRow(r).height = 26;
  }
  rule(
    gm,
    `B${TABLE_ROW}:B${gameEnd}`,
    `AND(B${TABLE_ROW}<>"",COUNTIF($B$${TABLE_ROW}:$B$${gameEnd},B${TABLE_ROW})>1)`,
    ERROR,
  );

  // ---------------- schedule grid
  const sc = addSheet(book, SHEETS.schedule, 'F57C00', 4);
  sc.views = [
    { rightToLeft: true, showGridLines: false, state: 'frozen', ySplit: 4, xSplit: GRID_COL - 1 },
  ];
  [8, 16, 9].forEach((w, i) => (sc.getColumn(i + 1).width = w));
  for (let c = GRID_COL; c <= GRID_LAST_COL; c++) sc.getColumn(c).width = 12;
  for (const c of [sumM, sumR, sumC]) sc.getColumn(c).width = 10;
  banner(
    sc,
    sumC,
    '📅  جدول المباريات',
    'كل صف = جولة · كل لعبة ليها خانتين (فريق ١ vs فريق ٢) · الخانتين الفاضيين = استراحة للعبة دي مش مباراة · الأحمر = غلط',
    'F57C00',
  );
  const fixedHead = (c: number, label: string, color: string) => {
    sc.mergeCells(3, c, 4, c);
    const cell = sc.getCell(3, c);
    cell.value = label;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solid(color);
    cell.alignment = CENTER;
  };
  SCHEDULE_HEADERS.forEach((label, i) => fixedHead(i + 1, label, NAVY));
  for (let i = 0; i < MAX_GAMES; i++) {
    const c = GRID_COL + 2 * i;
    sc.mergeCells(3, c, 3, c + 1);
    const head = sc.getCell(3, c);
    head.value = {
      formula: `IF(INDEX(GameNames,${i + 1})="","—",INDEX(GameNames,${i + 1}))`,
      result: data.games[i]?.name || '—',
    };
    head.font = { name: FONT, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = solid(GAME_INKS[i]);
    head.alignment = CENTER;
    ['فريق ١', 'فريق ٢'].forEach((label, k) => {
      const sub = sc.getCell(4, c + k);
      sub.value = label;
      sub.font = { name: FONT, size: 9, bold: true, color: { argb: argb(GAME_INKS[i]) } };
      sub.fill = solid(GAME_TINTS[i]);
      sub.alignment = CENTER;
    });
  }
  fixedHead(sumM, 'مباريات', '5E6C84');
  fixedHead(sumR, 'مستريحين', '5E6C84');
  fixedHead(sumC, 'تعارضات', '5E6C84');
  sc.getRow(3).height = 34;
  sc.getRow(4).height = 20;
  input(sc, GRID_ROW, gridEnd, 1, GRID_LAST_COL);
  const D = col(GRID_COL);
  const LAST = col(GRID_LAST_COL);
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const r = GRID_ROW + i;
    const round = data.rounds[i];
    const n = sc.getCell(r, 1);
    n.value =
      round?.number ??
      (data.rounds.length
        ? Math.max(...data.rounds.map((x) => x.number)) + i - data.rounds.length + 1
        : i + 1);
    n.font = { name: FONT, size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    n.fill = solid(NAVY);
    sc.getCell(r, 2).value = round?.name || null;
    sc.getCell(r, 2).font = { name: FONT, size: 10, bold: true, color: { argb: argb(NAVY) } };
    sc.getCell(r, 3).value = round?.duration ?? null;
    round?.cells.forEach((team, k) => {
      if (team) sc.getCell(r, GRID_COL + k).value = team;
    });
    for (let c = GRID_COL; c <= GRID_LAST_COL; c++)
      sc.getCell(r, c).font = { name: FONT, size: 10, bold: true };
    const row = `$${D}${r}:$${LAST}${r}`;
    const firsts = `$${D}${r}:$${col(GRID_LAST_COL - 1)}${r}`;
    const seconds = `$${col(GRID_COL + 1)}${r}:$${LAST}${r}`;
    computed(sc, r, sumM, `IF(COUNTA(${row})=0,"",INT(COUNTA(${row})/2))`);
    computed(
      sc,
      r,
      sumR,
      `IF(${col(sumM)}${r}="","",MAX(0,COUNTIF(TeamNames,"?*")-COUNTA(${row})))`,
    );
    computed(
      sc,
      r,
      sumC,
      `IF(${col(sumM)}${r}="","",SUMPRODUCT((${row}<>"")*(COUNTIF(${row},${row})>1))+SUMPRODUCT((MOD(COLUMN(${firsts}),2)=0)*((${firsts}<>"")<>(${seconds}<>"")))+SUMPRODUCT((${row}<>"")*(COUNTIF(TeamNames,${row})=0))+IF($C${r}="",1,0))`,
    );
    sc.getRow(r).height = 26;
  }
  const grid = `${D}${GRID_ROW}:${LAST}${gridEnd}`;
  const firstCols = Array.from(
    { length: MAX_GAMES },
    (_, i) => `${col(GRID_COL + 2 * i)}${GRID_ROW}:${col(GRID_COL + 2 * i)}${gridEnd}`,
  ).join(' ');
  const secondCols = Array.from(
    { length: MAX_GAMES },
    (_, i) => `${col(GRID_COL + 2 * i + 1)}${GRID_ROW}:${col(GRID_COL + 2 * i + 1)}${gridEnd}`,
  ).join(' ');
  const E = col(GRID_COL + 1);
  const g0 = `${D}${GRID_ROW}`;
  rule(sc, grid, `AND(${g0}<>"",COUNTIF($${D}${GRID_ROW}:$${LAST}${GRID_ROW},${g0})>1)`, ERROR);
  rule(sc, grid, `AND(${g0}<>"",COUNTIF(TeamNames,${g0})=0)`, ERROR);
  rule(sc, firstCols, `AND(${g0}="",${E}${GRID_ROW}<>"")`, ERROR);
  rule(sc, secondCols, `AND(${E}${GRID_ROW}="",${g0}<>"")`, ERROR);
  rule(
    sc,
    firstCols,
    `AND(${g0}="",${E}${GRID_ROW}="",COUNTA($${D}${GRID_ROW}:$${LAST}${GRID_ROW})>0,${D}$3<>"—")`,
    BREAK,
    MUTED,
  );
  rule(
    sc,
    secondCols,
    `AND(${E}${GRID_ROW}="",${g0}="",COUNTA($${D}${GRID_ROW}:$${LAST}${GRID_ROW})>0,${E}$3<>"—")`,
    BREAK,
    MUTED,
  );
  for (const entry of TEAM_PALETTE)
    rule(
      sc,
      grid,
      `INDEX(TeamColors,MATCH(${g0},TeamNames,0))="${entry.name}"`,
      entry.hex,
      textOn(entry.hex),
    );
  rule(sc, `${col(sumC)}${GRID_ROW}:${col(sumC)}${gridEnd}`, `N(${col(sumC)}${GRID_ROW})>0`, ERROR);
  rule(
    sc,
    `${col(sumC)}${GRID_ROW}:${col(sumC)}${gridEnd}`,
    `AND(${col(sumC)}${GRID_ROW}=0,N(${col(sumM)}${GRID_ROW})>0)`,
    OK,
  );
  rule(sc, `C${GRID_ROW}:C${gridEnd}`, `AND(N(${col(sumM)}${GRID_ROW})>0,C${GRID_ROW}="")`, ERROR);
  for (let c = GRID_COL; c <= GRID_LAST_COL; c++)
    list(sc, GRID_ROW, gridEnd, c, 'TeamNames', 'اختار فريق — أو سيب الخانتين فاضيين للاستراحة');
  whole(sc, GRID_ROW, gridEnd, 3, 1, 600);
  whole(sc, GRID_ROW, gridEnd, 1, 1, 999);

  // ---------------- staff
  const st = addSheet(book, SHEETS.staff, '00897B');
  [26, 12, 22, 18, 20].forEach((w, i) => (st.getColumn(i + 1).width = w));
  banner(
    st,
    5,
    '⚖️  الطاقم',
    'حكم ← اختار اللعبة (صف لكل لعبة) · مرشد ← اختار الفريق (ممكن أكتر من مرشد للفريق، صف لكل مرشد)',
    '00897B',
  );
  header(st, 3, STAFF_HEADERS, '00897B');
  input(st, TABLE_ROW, staffEnd, 1, 4);
  data.staff.forEach((row, index) => {
    const r = TABLE_ROW + index;
    st.getCell(r, 1).value = row.member || null;
    st.getCell(r, 2).value = row.role;
    st.getCell(r, 3).value = row.game || null;
    st.getCell(r, 4).value = row.team || null;
  });
  const usernameOf = new Map(data.members.map((member) => [member.name, member.username]));
  for (let r = TABLE_ROW; r <= staffEnd; r++) {
    const member = data.staff[r - TABLE_ROW]?.member;
    computed(
      st,
      r,
      5,
      `IF(A${r}="","",IFERROR(INDEX(MemberUsernames,MATCH(A${r},MemberNames,0)),"⚠️ مش موجود"))`,
      member ? (usernameOf.get(member) ?? '⚠️ مش موجود') : '',
    );
    st.getCell(r, 5).font = { name: FONT, size: 10, color: { argb: argb(MUTED) } };
  }
  const s0 = TABLE_ROW;
  rule(
    st,
    `C${s0}:D${staffEnd}`,
    `OR(AND($B${s0}="${ROLE_LABELS.REFEREE}",OR($C${s0}="",$D${s0}<>"")),AND($B${s0}="${ROLE_LABELS.GUIDE}",OR($D${s0}="",$C${s0}<>"")))`,
    ERROR,
  );
  rule(st, `A${s0}:A${staffEnd}`, `AND(A${s0}<>"",COUNTIF(MemberNames,A${s0})=0)`, ERROR);
  rule(st, `A${s0}:D${staffEnd}`, `$B${s0}="${ROLE_LABELS.REFEREE}"`, 'E3F2FD', '1565C0', false);
  rule(st, `A${s0}:D${staffEnd}`, `$B${s0}="${ROLE_LABELS.GUIDE}"`, NOTE, '7A5B00', false);
  list(st, s0, staffEnd, 1, 'MemberNames', 'اختار عضو');
  list(st, s0, staffEnd, 2, `"${ROLE_LABELS.REFEREE},${ROLE_LABELS.GUIDE}"`, 'حكم / مرشد');
  list(st, s0, staffEnd, 3, 'GameNames', 'للحكم بس');
  list(st, s0, staffEnd, 4, 'TeamNames', 'للمرشد بس');

  // ---------------- members (read-only)
  const mb = addSheet(book, SHEETS.members, '5E6C84');
  [6, 28, 22, 12].forEach((w, i) => (mb.getColumn(i + 1).width = w));
  banner(
    mb,
    4,
    '📇  أعضاء DST',
    `${data.members.length} عضو نشط · للقراءة بس · من غير أرقام موبايل · إضافة أعضاء من صفحة المالك`,
    '5E6C84',
  );
  header(mb, 3, ['#', 'الاسم', 'اسم المستخدم', 'له دخول؟'], '5E6C84');
  data.members.forEach((member, index) => {
    const r = TABLE_ROW + index;
    mb.getRow(r).values = [index + 1, member.name, member.username, member.login ? YES : NO];
    for (let c = 1; c <= 4; c++) {
      const cell = mb.getCell(r, c);
      cell.font = { name: FONT, size: 11 };
      cell.alignment = c === 2 ? RIGHT : CENTER;
      cell.border = BOX;
      if (r % 2 === 0) cell.fill = solid('F7F9FC');
    }
  });
  rule(mb, `D${TABLE_ROW}:D${memberEnd}`, `D${TABLE_ROW}="${YES}"`, OK);

  // ---------------- colours & avatars (read-only dropdown sources)
  const ls = addSheet(book, SHEETS.lists, GOLD);
  [14, 12, 4, 16, 14].forEach((w, i) => (ls.getColumn(i + 1).width = w));
  banner(
    ls,
    5,
    '🎨  الألوان والشعارات',
    'دي القوائم اللي بتظهر في الاختيارات — للقراءة بس',
    '7A5B00',
  );
  header(ls, 3, ['اللون', 'الكود', '', 'الشعار', 'المفتاح'], '7A5B00');
  TEAM_PALETTE.forEach((entry, index) => {
    const name = ls.getCell(TABLE_ROW + index, 1);
    name.value = entry.name;
    name.fill = solid(entry.hex);
    name.font = { name: FONT, size: 12, bold: true, color: { argb: argb(textOn(entry.hex)) } };
    name.alignment = CENTER;
    const hex = ls.getCell(TABLE_ROW + index, 2);
    hex.value = entry.hex;
    hex.font = { name: FONT, size: 9, color: { argb: argb(MUTED) } };
    hex.alignment = CENTER;
  });
  AVATAR_LABELS.forEach((entry, index) => {
    const label = ls.getCell(TABLE_ROW + index, 4);
    label.value = entry.label;
    label.font = { name: FONT, size: 13, bold: true };
    label.alignment = CENTER;
    label.border = BOX;
    const key = ls.getCell(TABLE_ROW + index, 5);
    key.value = entry.key;
    key.font = { name: FONT, size: 9, color: { argb: argb(MUTED) } };
    key.alignment = CENTER;
    key.border = BOX;
  });

  // ---------------- meta (very hidden — read back by the parser)
  const meta = book.addWorksheet(SHEETS.meta);
  meta.addRows([
    ['template_version', TEMPLATE_VERSION],
    ['event_code', text(setup.event?.['code'])],
    ['generated_at', generatedAt.toISOString()],
  ]);
  meta.state = 'veryHidden';

  book.definedNames.add(`${S.teams}!$B$${TABLE_ROW}:$B$${teamEnd}`, 'TeamNames');
  book.definedNames.add(`${S.teams}!$C$${TABLE_ROW}:$C$${teamEnd}`, 'TeamColors');
  book.definedNames.add(`${S.games}!$B$${TABLE_ROW}:$B$${gameEnd}`, 'GameNames');
  book.definedNames.add(`${S.members}!$B$${TABLE_ROW}:$B$${memberEnd}`, 'MemberNames');
  book.definedNames.add(`${S.members}!$C$${TABLE_ROW}:$C$${memberEnd}`, 'MemberUsernames');
  book.definedNames.add(
    `${S.lists}!$A$${TABLE_ROW}:$A$${TABLE_ROW + TEAM_PALETTE.length - 1}`,
    'ColorNames',
  );
  book.definedNames.add(
    `${S.lists}!$D$${TABLE_ROW}:$D$${TABLE_ROW + AVATAR_LABELS.length - 1}`,
    'AvatarLabels',
  );

  const protect = {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatRows: true,
  };
  for (const sheet of [start, ev, mb, ls]) await sheet.protect('', protect);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

// ------------------------------------------------------------------ parser
function scalar(
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

function checkHeaders(
  sheet: Worksheet,
  row: number,
  labels: string[],
  name: ImportSheet,
  errors: ImportIssue[],
) {
  let ok = true;
  labels.forEach((label, index) => {
    if (text(sheet.getCell(row, index + 1).value) !== label) {
      errors.push({ sheet: name, row, column: col(index + 1), code: 'INVALID_HEADER' });
      ok = false;
    }
  });
  return ok;
}

const roleKey = (value: unknown) =>
  (Object.entries(ROLE_LABELS).find(([, label]) => label === text(value))?.[0] ??
    text(value).toUpperCase()) as string;

/** Parses the v3 workbook into the unchanged server payload (codes, both name columns, comma game_codes). */
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
  try {
    await book.xlsx.load(buffer);
  } catch {
    return {
      payload,
      errors: [{ sheet: 'Workbook', row: 0, column: '', code: 'INVALID_WORKBOOK' }],
    };
  }
  const meta = book.getWorksheet(SHEETS.meta);
  if (!meta || !ACCEPTED_TEMPLATE_VERSIONS.includes(text(meta.getCell(1, 2).value)))
    return { payload, errors: [{ sheet: 'Workbook', row: 0, column: '', code: 'OLD_TEMPLATE' }] };
  const sheets = {
    event: book.getWorksheet(SHEETS.event),
    teams: book.getWorksheet(SHEETS.teams),
    games: book.getWorksheet(SHEETS.games),
    schedule: book.getWorksheet(SHEETS.schedule),
    staff: book.getWorksheet(SHEETS.staff),
  };
  for (const [key, sheet] of Object.entries(sheets))
    if (!sheet)
      errors.push({
        sheet: 'Workbook',
        row: 0,
        column: SHEETS[key as keyof typeof SHEETS],
        code: 'MISSING_SHEET',
      });
  if (errors.length) return { payload, errors };
  for (const sheet of Object.values(sheets))
    if (sheet!.rowCount > 10000 || sheet!.columnCount > 60)
      errors.push({ sheet: 'Workbook', row: 0, column: sheet!.name, code: 'SHEET_TOO_LARGE' });
  if (errors.length) return { payload, errors };

  // event
  const eventRows = new Map<string, number>();
  let openingGame = '';
  let openingDuration: unknown = null;
  const ev = sheets.event!;
  // Older templates (v3/v4) list five currency rows instead of one points name.
  for (let r = TABLE_ROW; r < TABLE_ROW + EVENT_FIELDS.length + 8; r++) {
    const key = text(ev.getCell(r, 4).value);
    const field =
      EVENT_FIELDS.find((f) => f.key === key) ??
      ((CURRENCY_KEYS as readonly string[]).includes(key) ? { key } : undefined);
    if (!field) continue;
    const raw = scalar(ev.getCell(r, 2).value, 'Event', r, 'B', errors);
    let value: unknown = blank(raw) ? null : raw;
    if (
      typeof value === 'string' &&
      /^-?\d+(?:\.5)?$/.test(value) &&
      key !== 'name' &&
      key !== 'points_name' &&
      key !== 'life_emoji' &&
      !key.startsWith('currency')
    )
      value = Number(value);
    // One points name fills every currency form the server keeps (D054).
    if (key === 'points_name') {
      for (const currency of CURRENCY_KEYS) {
        payload.event[currency] = value;
        eventRows.set(currency, r);
      }
      continue;
    }
    if (key === 'name') {
      payload.event['name_en'] = value;
      payload.event['name_ar'] = value;
      eventRows.set('name_en', r).set('name_ar', r);
      continue;
    }
    if (key === 'leaderboard_public') value = value === YES ? true : value === NO ? false : value;
    // Blank scoring cells keep the event's current scoring settings.
    if (['scoring_mode', 'initial_lives', 'life_emoji'].includes(key) && value === null) continue;
    if (key === 'scoring_mode')
      value =
        value === SCORING_LABELS.LIVES
          ? 'LIVES'
          : value === SCORING_LABELS.POINTS
            ? 'POINTS'
            : text(value).toUpperCase();
    if (key === 'life_emoji') value = text(value);
    if (key === 'opening_game') {
      openingGame = text(value);
      continue;
    }
    if (key === 'opening_duration_min') {
      openingDuration = value;
      eventRows.set(key, r);
      continue;
    }
    payload.event[key] = value;
    eventRows.set(key, r);
  }

  // Old templates normalise the hearts draw rule with a visible preview warning.
  const warnings: string[] = [];
  if ((payload.event['scoring_mode'] ?? context?.event?.['scoring_mode']) === 'LIVES') {
    const draw = payload.event['points_draw'];
    if (integer(draw, -999999) || draw === -0.5) {
      if (draw !== -0.5) warnings.push('import.halfDrawWarning');
      payload.event['points_draw'] = -0.5;
    }
  }

  // teams
  const teamCodeByName = new Map<string, string>();
  const tm = sheets.teams!;
  if (checkHeaders(tm, 3, TEAM_HEADERS, 'Teams', errors)) {
    const usedColors = new Map<string, number>();
    for (let r = TABLE_ROW; r < TABLE_ROW + MAX_TEAMS; r++) {
      const name = text(scalar(tm.getCell(r, 2).value, 'Teams', r, 'B', errors));
      if (!name) continue;
      const code = text(tm.getCell(r, 1).value).toUpperCase();
      const colorText = text(scalar(tm.getCell(r, 3).value, 'Teams', r, 'C', errors));
      const color =
        TEAM_PALETTE.find((entry) => entry.name === colorText)?.hex ??
        (/^#[0-9a-f]{6}$/i.test(colorText) ? colorText.toUpperCase() : '');
      const avatarText = text(scalar(tm.getCell(r, 4).value, 'Teams', r, 'D', errors));
      const avatar =
        AVATAR_LABELS.find((entry) => entry.label === avatarText)?.key ??
        (TEAM_AVATARS.includes(avatarText) ? avatarText : '');
      if (color && usedColors.has(color))
        errors.push({ sheet: 'Teams', row: r, column: 'C', code: 'DUPLICATE_COLOR' });
      if (color) usedColors.set(color, r);
      if (teamCodeByName.has(name))
        errors.push({ sheet: 'Teams', row: r, column: 'B', code: 'DUPLICATE' });
      teamCodeByName.set(name, code);
      payload.teams.push({
        row: r,
        code,
        name_en: name,
        name_ar: name,
        avatar_key: avatar || avatarText || null,
        color_hex: color || colorText || null,
      });
    }
  }

  // games — schedule columns follow game rows by position
  const gameCodeByName = new Map<string, string>();
  const gameAt: (string | null)[] = [];
  const gm = sheets.games!;
  if (checkHeaders(gm, 3, GAME_HEADERS, 'Games', errors))
    for (let r = TABLE_ROW; r < TABLE_ROW + MAX_GAMES; r++) {
      const name = text(scalar(gm.getCell(r, 2).value, 'Games', r, 'B', errors));
      const code = text(gm.getCell(r, 1).value).toUpperCase();
      gameAt.push(name ? code : null);
      if (!name) continue;
      const location = text(scalar(gm.getCell(r, 3).value, 'Games', r, 'C', errors)) || null;
      if (gameCodeByName.has(name))
        errors.push({ sheet: 'Games', row: r, column: 'B', code: 'DUPLICATE' });
      gameCodeByName.set(name, code);
      payload.games.push({
        row: r,
        code,
        name_en: name,
        name_ar: name,
        location_en: location,
        location_ar: location,
      });
    }

  // opening round from the event sheet
  if (openingGame) {
    const code = gameCodeByName.get(openingGame);
    const r = eventRow('opening_game');
    if (!code) errors.push({ sheet: 'Event', row: r, column: 'B', code: 'UNKNOWN_GAME' });
    payload.rounds.push({
      row: eventRow('opening_duration_min'),
      number: 0,
      type: 'OPENING',
      name_en: null,
      name_ar: null,
      duration_min: openingDuration,
    });
    if (code)
      payload.matches.push({
        row: r,
        round_number: 0,
        game_code: code,
        team_a_code: null,
        team_b_code: null,
      });
  }

  // schedule grid
  const sc = sheets.schedule!;
  if (checkHeaders(sc, 3, SCHEDULE_HEADERS, 'Schedule', errors)) {
    const numbers = new Set<number>();
    for (let r = GRID_ROW; r < GRID_ROW + MAX_ROUNDS; r++) {
      const cells = Array.from({ length: 2 * MAX_GAMES }, (_, k) =>
        text(scalar(sc.getCell(r, GRID_COL + k).value, 'Schedule', r, col(GRID_COL + k), errors)),
      );
      if (cells.every((cell) => !cell)) continue;
      const number = scalar(sc.getCell(r, 1).value, 'Schedule', r, 'A', errors);
      const name = text(scalar(sc.getCell(r, 2).value, 'Schedule', r, 'B', errors)) || null;
      const duration = scalar(sc.getCell(r, 3).value, 'Schedule', r, 'C', errors);
      if (typeof number === 'number' && numbers.has(number))
        errors.push({ sheet: 'Schedule', row: r, column: 'A', code: 'DUPLICATE' });
      if (typeof number === 'number') numbers.add(number);
      payload.rounds.push({
        row: r,
        number,
        type: 'REGULAR',
        name_en: name,
        name_ar: name,
        duration_min: duration,
      });
      const seen = new Set<string>();
      for (let g = 0; g < MAX_GAMES; g++) {
        const [a, b] = [cells[2 * g], cells[2 * g + 1]];
        const [ca, cb] = [col(GRID_COL + 2 * g), col(GRID_COL + 2 * g + 1)];
        if (!a && !b) continue; // استراحة للعبة
        if (!a || !b) {
          errors.push({ sheet: 'Schedule', row: r, column: a ? cb : ca, code: 'HALF_MATCH' });
          continue;
        }
        if (!gameAt[g]) {
          errors.push({ sheet: 'Schedule', row: r, column: ca, code: 'UNKNOWN_GAME' });
          continue;
        }
        for (const [team, column] of [
          [a, ca],
          [b, cb],
        ] as const) {
          if (!teamCodeByName.has(team))
            errors.push({ sheet: 'Schedule', row: r, column, code: 'UNKNOWN_TEAM' });
          else if (seen.has(team))
            errors.push({ sheet: 'Schedule', row: r, column, code: 'TEAM_ALREADY_SCHEDULED' });
          seen.add(team);
        }
        payload.matches.push({
          row: r,
          round_number: number,
          game_code: gameAt[g],
          team_a_code: teamCodeByName.get(a) ?? a,
          team_b_code: teamCodeByName.get(b) ?? b,
        });
      }
    }
  }

  // staff — one referee row per game, grouped back to comma game_codes for the server
  const directory = memberDirectory(context?.eligible_members);
  const usernameByName = new Map(directory.map((m) => [m.name, m.username]));
  const st = sheets.staff!;
  if (checkHeaders(st, 3, STAFF_HEADERS.slice(0, 4), 'Staff', errors)) {
    const referees = new Map<string, ImportRecord>();
    for (let r = TABLE_ROW; r < TABLE_ROW + MAX_STAFF; r++) {
      const member = text(scalar(st.getCell(r, 1).value, 'Staff', r, 'A', errors));
      const roleText = text(scalar(st.getCell(r, 2).value, 'Staff', r, 'B', errors));
      const game = text(scalar(st.getCell(r, 3).value, 'Staff', r, 'C', errors));
      const team = text(scalar(st.getCell(r, 4).value, 'Staff', r, 'D', errors));
      if (!member && !roleText && !game && !team) continue;
      const username = usernameByName.get(member) ?? (context?.eligible_members ? '' : member);
      if (member && !username)
        errors.push({ sheet: 'Staff', row: r, column: 'A', code: 'MEMBER_NOT_FOUND' });
      const role = roleKey(roleText);
      const gameCode = game ? gameCodeByName.get(game) : '';
      if (game && !gameCode)
        errors.push({ sheet: 'Staff', row: r, column: 'C', code: 'UNKNOWN_GAME' });
      const teamCode = team ? teamCodeByName.get(team) : '';
      if (team && !teamCode)
        errors.push({ sheet: 'Staff', row: r, column: 'D', code: 'UNKNOWN_TEAM' });
      if (role === 'REFEREE' && username && !team) {
        const existing = referees.get(username);
        if (existing) {
          if (gameCode)
            existing['game_codes'] = [text(existing['game_codes']), gameCode]
              .filter(Boolean)
              .join(',');
          continue;
        }
        const record: ImportRecord = {
          row: r,
          member: username,
          role,
          game_codes: gameCode || game || null,
          team_code: null,
        };
        referees.set(username, record);
        payload.staff.push(record);
        continue;
      }
      payload.staff.push({
        row: r,
        member: username || member || null,
        role: role || null,
        game_codes: gameCode || game || null,
        team_code: teamCode || team || null,
      });
    }
  }

  const validation = validateImportPayload(payload, context).map((issue) => {
    if (issue.sheet === 'Event')
      return { ...issue, row: eventRows.get(issue.column) ?? issue.row, column: 'B' };
    if (issue.sheet === 'Rounds' || issue.sheet === 'Matches')
      return {
        ...issue,
        sheet: 'Schedule' as const,
        column: SCHEDULE_COLUMN[issue.column] ?? issue.column,
      };
    return { ...issue, column: TABLE_COLUMN[issue.sheet]?.[issue.column] ?? issue.column };
  });
  const seen = new Set(errors.map((issue) => `${issue.sheet}:${issue.row}:${issue.column}`));
  return {
    payload,
    warnings,
    errors: [
      ...errors,
      ...validation.filter((issue) => !seen.has(`${issue.sheet}:${issue.row}:${issue.column}`)),
    ],
  };
}

const SCHEDULE_COLUMN: Record<string, string> = {
  number: 'A',
  round_number: 'A',
  name_en: 'B',
  duration_min: 'C',
  type: 'A',
  game_code: col(GRID_COL),
  team_a_code: col(GRID_COL),
  team_b_code: col(GRID_COL + 1),
};
const TABLE_COLUMN: Partial<Record<ImportSheet, Record<string, string>>> = {
  Teams: { code: 'A', name_en: 'B', name_ar: 'B', color_hex: 'C', avatar_key: 'D' },
  Games: { code: 'A', name_en: 'B', name_ar: 'B', location_en: 'C', location_ar: 'C' },
  Staff: { member: 'A', role: 'B', game_codes: 'C', team_code: 'D' },
};

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
    const signed = key === 'points_win' || key === 'points_draw' || key === 'points_loss';
    if (
      numericColumns.has(key) &&
      !(key.endsWith('_cap') && blank(value)) &&
      !(
        key === 'points_draw' &&
        (payload.event['scoring_mode'] ?? context?.event?.['scoring_mode']) === 'LIVES' &&
        value === -0.5
      ) &&
      !integer(value, signed ? -999999 : 0)
    )
      add('Event', record, key, 'INVALID_NUMBER');
    if (
      (key.startsWith('currency_') || key.startsWith('name_')) &&
      !blank(value) &&
      (typeof value !== 'string' || text(value).length > (key.startsWith('name_') ? 120 : 40))
    )
      add('Event', record, key, 'INVALID_TEXT');
    if (key === 'leaderboard_public' && !blank(value) && typeof value !== 'boolean')
      add('Event', record, key, 'INVALID_BOOLEAN');
    if (key === 'scoring_mode' && value !== 'POINTS' && value !== 'LIVES')
      add('Event', record, key, 'INVALID_TEXT');
    if (key === 'initial_lives' && !integer(value, 1, 9999))
      add('Event', record, key, 'INVALID_NUMBER');
    if (key === 'life_emoji' && (typeof value !== 'string' || !value || value.length > 16))
      add('Event', record, key, 'INVALID_TEXT');
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
