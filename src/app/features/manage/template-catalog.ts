import { TEAM_AVATARS } from './setup-helpers';

/** Arabic-first event setup workbook (template v6) — fixed layout shared by the generator and parser. */
export const TEMPLATE_VERSION = '6';
/** v3 workbooks lack the scoring rows only; they still import and keep current scoring. */
export const ACCEPTED_TEMPLATE_VERSIONS = ['3', '4', '5', TEMPLATE_VERSION];
export const MAX_TEAMS = 20;
export const MAX_GAMES = 12;
export const MAX_ROUNDS = 20;
export const MAX_STAFF = 150;

export const SHEETS = {
  start: 'ابدأ هنا',
  event: 'الحدث',
  teams: 'الفرق',
  games: 'الألعاب',
  schedule: 'الجدول',
  staff: 'الطاقم',
  members: 'الأعضاء',
  lists: 'الألوان والشعارات',
  meta: '_meta',
} as const;

/** First data row of the table sheets (rows 1–2 banner, row 3 header). */
export const TABLE_ROW = 4;
/** Schedule grid: rows 3–4 headers, rounds from row 5; team pairs from column D. */
export const GRID_ROW = 5;
export const GRID_COL = 4;
export const GRID_LAST_COL = GRID_COL + 2 * MAX_GAMES - 1;

export const ROLE_LABELS = { REFEREE: 'حكم', GUIDE: 'مرشد' } as const;
export const YES = 'نعم';
export const NO = 'لا';
/** Workbook labels for the event scoring mode (D038). */
export const SCORING_LABELS = { POINTS: 'نقط', LIVES: 'قلوب' } as const;

/** 20 distinct team colours; Excel shows the Arabic name, the app stores the hex. */
export const TEAM_PALETTE: readonly { name: string; hex: string }[] = [
  { name: 'أحمر', hex: '#D32F2F' },
  { name: 'أزرق', hex: '#1E88E5' },
  { name: 'أخضر', hex: '#2E7D32' },
  { name: 'برتقالي', hex: '#F57C00' },
  { name: 'بنفسجي', hex: '#8E24AA' },
  { name: 'وردي', hex: '#D81B60' },
  { name: 'سماوي', hex: '#00ACC1' },
  { name: 'كحلي', hex: '#1A237E' },
  { name: 'بني', hex: '#6D4C41' },
  { name: 'زيتي', hex: '#827717' },
  { name: 'تركواز', hex: '#00897B' },
  { name: 'ذهبي', hex: '#C9A227' },
  { name: 'رمادي', hex: '#546E7A' },
  { name: 'نيلي', hex: '#3949AB' },
  { name: 'عنابي', hex: '#880E4F' },
  { name: 'أصفر', hex: '#FDD835' },
  { name: 'ليموني', hex: '#C0CA33' },
  { name: 'مرجاني', hex: '#FF7043' },
  { name: 'لافندر', hex: '#9575CD' },
  { name: 'أسود', hex: '#212121' },
];

const AVATAR_AR: Record<string, string> = {
  falcon: '🦅 صقر',
  lion: '🦁 أسد',
  fox: '🦊 ثعلب',
  owl: '🦉 بومة',
  eagle: '🦅 نسر',
  turtle: '🐢 سلحفاة',
  dolphin: '🐬 دولفين',
  whale: '🐋 حوت',
  butterfly: '🦋 فراشة',
  horse: '🐎 حصان',
  star: '⭐ نجمة',
  shield: '🛡️ درع',
  bolt: '⚡ برق',
  mountain: '⛰️ جبل',
  sun: '☀️ شمس',
  moon: '🌙 قمر',
  flame: '🔥 شعلة',
  wave: '🌊 موجة',
  anchor: '⚓ مرساة',
  crown: '👑 تاج',
  ball: '⚽ كرة',
  racket: '🏓 مضرب',
  trophy: '🏆 كأس',
  compass: '🧭 بوصلة',
};
export const AVATAR_LABELS: readonly { key: string; label: string }[] = TEAM_AVATARS.map((key) => ({
  key,
  label: AVATAR_AR[key] ?? key,
}));

/** Default teams offered in a fresh template; the admin clears the ones not needed. */
export const DEFAULT_TEAM_NAMES = [
  'الصقور',
  'الأسود',
  'الثعالب',
  'البوم',
  'النسور',
  'السلاحف',
  'الدلافين',
  'الحيتان',
  'الفراشات',
  'الأحصنة',
  'النجوم',
  'الدروع',
  'البرق',
  'الجبال',
  'الشموس',
  'الأقمار',
  'الشعلة',
  'الأمواج',
  'المراسي',
  'التيجان',
];

/** Event sheet rows: label shown in Arabic, key stored in hidden column D. */
export const EVENT_FIELDS: readonly {
  key: string;
  label: string;
  required: boolean;
  hint: string;
}[] = [
  {
    key: 'name',
    label: 'اسم الحدث',
    required: true,
    hint: 'اسم واحد بس — بيظهر بالعربي والإنجليزي.',
  },
  {
    key: 'points_win',
    label: 'الفوز (نقط أو قلوب)',
    required: true,
    hint: 'في نظام القلوب: اللي بيتزاد أو بيتشال، مثال 0',
  },
  {
    key: 'points_draw',
    label: 'التعادل (نقط أو قلوب)',
    required: true,
    hint: 'في وضع القلوب ثابت: -0.5؛ النقط عدد صحيح',
  },
  { key: 'points_loss', label: 'الخسارة (نقط أو قلوب)', required: true, hint: 'مثال قلوب: -10' },
  {
    key: 'points_name',
    label: 'اسم النقط',
    required: true,
    hint: 'اسم واحد بيظهر للكل، مثال: نقط أو Coins',
  },
  {
    key: 'match_bonus_cap',
    label: 'أقصى مكافأة في المباراة',
    required: false,
    hint: 'فاضي = بلا حد',
  },
  {
    key: 'match_penalty_cap',
    label: 'أقصى خصم في المباراة',
    required: false,
    hint: 'فاضي = بلا حد',
  },
  {
    key: 'event_bonus_cap',
    label: 'أقصى مكافأة للفريق في الحدث',
    required: false,
    hint: 'فاضي = بلا حد',
  },
  {
    key: 'event_penalty_cap',
    label: 'أقصى خصم للفريق في الحدث',
    required: false,
    hint: 'فاضي = بلا حد',
  },
  {
    key: 'leaderboard_public',
    label: 'الترتيب ظاهر للكل؟',
    required: true,
    hint: 'نعم = اللاعيبة يشوفوا ترتيب كل الفرق',
  },
  {
    key: 'scoring_mode',
    label: 'نظام الحساب',
    required: false,
    hint: 'نقط أو قلوب. بيتقفل بعد أول جولة.',
  },
  {
    key: 'initial_lives',
    label: 'عدد القلوب في البداية',
    required: false,
    hint: 'لنظام القلوب بس: ١ – ٩٩٩٩',
  },
  {
    key: 'life_emoji',
    label: 'رمز القلب',
    required: false,
    hint: 'للتوافق مع النسخ القديمة فقط؛ العرض الجديد SVG أحمر',
  },
  {
    key: 'opening_game',
    label: 'لعبة الافتتاح',
    required: false,
    hint: 'كل الفرق بتلعبها مع بعض. فاضي = مفيش افتتاح.',
  },
  { key: 'opening_duration_min', label: 'مدة الافتتاح (دقيقة)', required: false, hint: '١ – ٦٠٠' },
];
export const eventRow = (key: string) => TABLE_ROW + EVENT_FIELDS.findIndex((f) => f.key === key);

export const TEAM_HEADERS = ['الكود', 'اسم الفريق', 'اللون', 'الشعار', 'المباريات', 'الراحات'];
export const GAME_HEADERS = ['الكود', 'اسم اللعبة', 'المكان'];
export const STAFF_HEADERS = [
  'العضو',
  'الدور',
  'اللعبة (للحكم)',
  'الفريق (للمرشد)',
  'اسم المستخدم',
];
export const SCHEDULE_HEADERS = ['الجولة', 'اسم الجولة', 'المدة\n(دقيقة)'];
