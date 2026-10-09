import { mkdir, writeFile } from 'node:fs/promises';
const entries = [
  ['falcon', 'Falcon', 'صقر', 'M8 30 4 12 24 22 44 12 40 30 28 38 24 48 20 38Z'],
  [
    'lion',
    'Lion',
    'أسد',
    'M24 4 38 10 46 24 38 40 24 46 10 40 2 24 10 10Z M16 20 20 20 M28 20 32 20 M18 30 24 34 30 30',
  ],
  ['fox', 'Fox', 'ثعلب', 'M8 6 22 16 26 16 40 6 36 32 24 44 12 32Z M16 24 18 24 M30 24 32 24'],
  [
    'owl',
    'Owl',
    'بومة',
    'M8 8 18 14 30 14 40 8 40 32 24 44 8 32Z M12 22a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M24 22a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M20 32 24 36 28 32',
  ],
  ['eagle', 'Eagle', 'نسر', 'M4 16 20 24 24 10 28 24 44 16 36 32 28 34 24 44 20 34 12 32Z'],
  [
    'turtle',
    'Turtle',
    'سلحفاة',
    'M14 12 24 8 34 12 40 24 34 36 24 40 14 36 8 24Z M40 24h6 M8 24H2 M14 12 8 6 M34 36 40 42 M34 12 40 6 M14 36 8 42 M14 18 24 14 34 18 34 30 24 34 14 30Z',
  ],
  [
    'dolphin',
    'Dolphin',
    'دولفين',
    'M4 34Q8 10 32 14L40 8 38 20 46 24 34 28 30 40 24 30Q12 28 4 34Z',
  ],
  [
    'whale',
    'Whale',
    'حوت',
    'M6 24Q10 12 24 20L34 26 44 16 42 32Q34 44 14 38Q4 36 6 24Z M18 14V6 M14 8 18 6 22 8',
  ],
  [
    'butterfly',
    'Butterfly',
    'فراشة',
    'M24 12V40 M24 22Q4 0 4 22Q4 34 24 28Q8 46 12 46Q24 46 24 32 M24 22Q44 0 44 22Q44 34 24 28Q40 46 36 46Q24 46 24 32',
  ],
  ['horse', 'Horse', 'حصان', 'M12 42 16 26 8 22 20 8 28 10 30 4 34 16 40 42Z M22 18h2'],
  ['star', 'Star', 'نجمة', 'M24 4 30 18 46 20 34 30 38 46 24 38 10 46 14 30 2 20 18 18Z'],
  ['shield', 'Shield', 'درع', 'M8 8 24 4 40 8V26Q38 38 24 46Q10 38 8 26Z M16 24 22 30 34 16'],
  ['bolt', 'Bolt', 'برق', 'M28 2 8 28H22L18 46 40 18H26Z'],
  ['mountain', 'Mountain', 'جبل', 'M2 42 20 8 32 28 38 18 46 42Z M14 20 20 24 26 20'],
  [
    'sun',
    'Sun',
    'شمس',
    'M14 24a10 10 0 1 0 20 0a10 10 0 1 0-20 0 M24 2v6 M24 40v6 M2 24h6 M40 24h6 M8 8l4 4 M36 36l4 4 M8 40l4-4 M36 12l4-4',
  ],
  ['moon', 'Moon', 'قمر', 'M32 4A20 20 0 1 0 44 34A22 22 0 0 1 32 4Z'],
  [
    'flame',
    'Flame',
    'شعلة',
    'M24 2Q28 18 38 24Q48 40 24 46Q2 40 10 26L20 14Q16 32 24 34Q32 26 24 2Z',
  ],
  [
    'wave',
    'Wave',
    'موجة',
    'M4 34Q20 2 40 14Q28 12 26 24Q32 38 46 34 M4 42Q12 36 20 42Q28 48 36 42Q42 38 46 42',
  ],
  [
    'anchor',
    'Anchor',
    'مرساة',
    'M18 10a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M24 16V44 M10 24h28 M4 28Q4 44 24 44Q44 44 44 28 M4 28l8 4 M44 28l-8 4',
  ],
  ['crown', 'Crown', 'تاج', 'M6 12 16 24 24 8 32 24 42 12 38 38H10Z M10 44h28'],
  [
    'ball',
    'Ball',
    'كرة',
    'M4 24a20 20 0 1 0 40 0a20 20 0 1 0-40 0 M24 14 34 22 30 34H18L14 22Z M24 14V4 M34 22 44 18 M30 34 36 42 M18 34 12 42 M14 22 4 18',
  ],
  [
    'racket',
    'Racket',
    'مضرب',
    'M10 18a14 16 0 1 0 28 0a14 16 0 1 0-28 0 M24 34V46 M14 12h20 M12 20h24 M16 28h16 M20 4v28 M28 4v28',
  ],
  [
    'trophy',
    'Trophy',
    'كأس',
    'M14 6H34V22Q34 32 24 32Q14 32 14 22Z M14 10H4V18Q4 26 16 26 M34 10H44V18Q44 26 32 26 M24 32V42 M14 44h20',
  ],
  [
    'compass',
    'Compass',
    'بوصلة',
    'M4 24a20 20 0 1 0 40 0a20 20 0 1 0-40 0 M32 12 28 28 16 36 20 20Z',
  ],
];
await mkdir('public/avatars', { recursive: true });
for (const [key, , , path] of entries)
  await writeFile(
    `public/avatars/${key}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="${path}" fill="none" stroke="#172B4D" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>\n`,
  );
await writeFile(
  'public/avatars/avatars.json',
  JSON.stringify(
    entries.map(([key, label_en, label_ar]) => ({ key, label_en, label_ar, file: `${key}.svg` })),
    null,
    2,
  ) + '\n',
);
