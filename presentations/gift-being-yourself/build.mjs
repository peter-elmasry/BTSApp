import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { slides } from './content.mjs';
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const runtime =
  process.env.CODEX_RUNTIME_ROOT ??
  path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies');
const { Presentation, PresentationFile } = await import(
  pathToFileURL(path.join(runtime, 'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs'))
);
const build = path.resolve(root, '../../tmp/gift-build');
await fs.mkdir(build, { recursive: true });
const out = path.join(root, 'output');
await fs.mkdir(out, { recursive: true });
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
p.theme.defaultFont = 'Arial';
const C = { cream: '#F4F0E8', ink: '#242424', clay: '#B66D50', olive: '#78816A', beige: '#DCD2C3' };
const placements = [];
function text(
  s,
  name,
  value,
  x,
  y,
  w,
  h,
  size = 40,
  color = C.ink,
  bold = false,
  ar = false,
  align,
) {
  const sh = s.shapes.add({
    geometry: 'textbox',
    name,
    position: { left: x, top: y, width: w, height: h },
    fill: 'none',
    line: { fill: 'none', width: 0 },
  });
  sh.text = value;
  sh.text.style = {
    fontSize: size,
    typeface: 'Arial',
    color,
    bold,
    alignment: align ?? (ar ? 'right' : 'left'),
    verticalAlignment: 'top',
    autoFit: 'none',
    insets: 0,
    wrap: 'square',
  };
  placements.push({ slide: p.slides.items.length, name, x, y, w, h, size, ar });
  return sh;
}
function img(s, key, x, y, w, h, fit = 'cover') {
  const ext = key === 'phineas-gage' ? 'jpg' : key === 'dst-logo' ? 'jpeg' : 'png';
  return s.images.add({
    blob: new Uint8Array(readFileSync(path.join(root, 'assets', key + '.' + ext))),
    contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
    alt:
      key === 'phineas-gage'
        ? 'Historical daguerreotype of Phineas Gage, Warren Anatomical Museum'
        : key + ' illustration',
    fit,
    position: { left: x, top: y, width: w, height: h },
  });
}
function shape(s, name, geom, x, y, w, h, fill, lineFill = C.clay) {
  return s.shapes.add({
    name,
    geometry: geom,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { fill: lineFill, width: 2 },
  });
}
for (const [i, d] of slides.entries()) {
  const s = p.slides.add();
  const dark = d.dark || d.kind === 'gage';
  s.background.fill = dark ? C.ink : C.cream;
  const fg = dark ? C.cream : C.ink;
  const accent = dark ? '#D9A58C' : C.clay;
  const note = [
    'الوقت المقترح: ' + d.time + ' ثانية',
    d.notes,
    'الانتقال: ' + d.transition,
    d.sources?.length ? 'References:\n' + d.sources.join('\n') : '',
    'Visuals: Character scenes are artistic interpretations. Historical Gage portrait is identified separately.',
  ]
    .filter(Boolean)
    .join('\n\n');
  s.speakerNotes.text =
    note +
    (d.kind === 'gage'
      ? ' Portrait: Jack and Beverly Wilgus, Warren Anatomical Museum. CC BY-SA 3.0 https://creativecommons.org/licenses/by-sa/3.0/ . Fitted without alteration. Schematic: AI-generated educational approximation.'
      : '');
  if (d.kind === 'cover') {
    img(s, d.image, 760, 0, 520, 720);
    text(s, 'Title', d.title, 72, 150, 650, 225, 72, fg, true);
    text(s, 'Subtitle', d.sub, 72, 415, 620, 95, 29, fg);
    text(s, 'Arabic title', d.ar, 72, 555, 620, 65, 38, accent, false, true);
  } else if (d.kind === 'story') {
    img(s, d.image, 760, 0, 520, 720);
    text(s, 'Title', d.title, 72, 62, 645, 90, 54, fg, true);
    text(s, 'Statement', d.quote, 72, 195, 630, 215, 46, fg, true);
    text(
      s,
      'Arabic explanation',
      d.ar,
      72,
      450,
      630,
      140,
      d.title === 'Self-Awareness' ? 30 : 34,
      accent,
      false,
      true,
    );
    if (d.ref) text(s, 'Reference', d.ref, 72, 634, 630, 35, 21, dark ? C.beige : C.olive);
  } else if (d.kind === 'question') {
    text(s, 'Question title', d.title, 72, 70, 1100, 70, 32, accent);
    text(s, 'Main question', d.quote, 72, 220, 1110, 225, 62, fg, true);
    text(s, 'Reflection', d.ar, 72, 525, 1110, 90, 36, accent, false, true);
  } else if (d.kind === 'self') {
    text(s, 'Title', d.title, 72, 65, 1100, 85, 54, fg, true);
    const words = ['Memories', 'Values', 'Beliefs', 'Experiences', 'Identity'];
    words.forEach((w, j) =>
      text(
        s,
        w,
        w,
        72 + (j % 3) * 390,
        195 + Math.floor(j / 3) * 100,
        350,
        65,
        42,
        j % 2 ? C.olive : C.clay,
        true,
      ),
    );
    text(s, 'Statement', d.quote, 72, 430, 1100, 130, 48, fg, true);
    text(s, 'Arabic', d.ar, 72, 600, 1100, 65, 34, C.clay, false, true);
  } else if (d.kind === 'personality') {
    text(s, 'Title', d.title, 72, 62, 1100, 80, 54, fg, true);
    shape(s, 'Self diagram', 'ellipse', 95, 185, 600, 430, C.beige, C.olive);
    text(s, 'Self label', 'SELF', 190, 222, 300, 65, 42, fg, true);
    text(s, 'Self question', 'Who am I?', 185, 290, 310, 55, 32);
    shape(s, 'Personality diagram', 'ellipse', 320, 365, 340, 190, C.cream, C.clay);
    text(s, 'Personality label', 'PERSONALITY', 353, 399, 280, 55, 32, C.clay, true);
    text(
      s,
      'Personality explanation',
      'Patterns of thought,\nfeeling and behavior',
      355,
      459,
      275,
      75,
      25,
    );
    text(
      s,
      'Other aspects',
      'Memories\nValues\nExperiences\nRoles',
      820,
      220,
      350,
      250,
      36,
      C.olive,
    );
    text(s, 'Arabic', d.ar, 760, 535, 440, 100, 38, C.clay, false, true);
  } else if (d.kind === 'regions') {
    text(s, 'Title', d.title, 72, 62, 1100, 90, 54, fg, true);
    text(s, 'Statement', d.quote, 72, 180, 1100, 150, 48, fg, true);
    [
      ['Prefrontal cortex', 'Evaluation and regulation'],
      ['Hippocampus', 'Remembering experiences'],
      ['Amygdala', 'Emotional significance'],
    ].forEach(([a, b], j) => {
      text(s, 'Region ' + j, a, 72 + j * 395, 380, 360, 75, 32, C.clay, true);
      text(s, 'Function ' + j, b, 72 + j * 395, 460, 355, 85, 27, fg);
    });
    text(s, 'Arabic', d.ar, 72, 593, 1100, 65, 35, C.olive, false, true);
  } else if (d.kind === 'dmn') {
    text(s, 'Title', d.title, 72, 50, 1100, 80, 54, fg, true);
    img(s, 'brain', 72, 165, 700, 395, 'contain');
    text(s, 'Functions', d.quote, 825, 210, 355, 150, 36, fg, true);
    text(s, 'Arabic', d.ar, 825, 400, 355, 105, 32, C.clay, false, true);
    text(
      s,
      'Medial label',
      'Medial prefrontal cortex\nPosterior cingulate / precuneus',
      72,
      565,
      630,
      70,
      24,
      C.clay,
    );
    text(
      s,
      'Lateral label',
      'Angular gyrus\nSimplified regional illustration',
      750,
      565,
      440,
      70,
      24,
      C.olive,
    );
  } else if (d.kind === 'gage') {
    text(s, 'Title', d.title, 72, 55, 610, 80, 54, fg, true);
    text(s, 'Year', '1848', 72, 165, 450, 90, 70, '#D9A58C', true);
    text(s, 'Statement', d.quote, 72, 285, 585, 165, 44, fg, true);
    text(s, 'Arabic', d.ar, 72, 475, 585, 90, 32, '#D9A58C', false, true);
    img(s, 'phineas-gage', 705, 160, 270, 340, 'contain');
    img(s, 'gage-trajectory', 985, 170, 245, 315, 'contain');
    text(
      s,
      'Photo credit',
      'Historical portrait\nWarren Anatomical Museum',
      705,
      520,
      280,
      65,
      20,
      C.beige,
    );
    text(
      s,
      'Schematic label',
      'Approximate path\nNot a reconstruction',
      995,
      520,
      235,
      65,
      20,
      C.beige,
    );
    text(
      s,
      'Evidence limit',
      'Historical reports are limited. Later adaptation matters.',
      72,
      635,
      1120,
      40,
      24,
      C.beige,
    );
  } else if (d.kind === 'restoration') {
    text(s, 'Title', d.title, 72, 45, 1100, 75, 54, fg, true);
    img(s, d.image, 72, 155, 630, 475, 'cover');
    text(s, 'Statement', d.quote, 750, 195, 455, 185, 42, fg, true);
    text(s, 'Arabic', d.ar, 750, 435, 455, 100, 34, C.clay, false, true);
    text(s, 'Reference', d.ref, 750, 600, 440, 35, 21, C.olive);
  } else if (d.kind === 'comparison') {
    text(s, 'Title', d.title, 72, 55, 1100, 80, 54, fg, true);
    const table = s.tables.add({
      rows: 3,
      columns: 2,
      left: 72,
      top: 170,
      width: 1136,
      height: 220,
      values: [
        ['DAVID', 'PETER'],
        ['Know your strengths', 'Accept your imperfections'],
        ['Use your own tools', 'Take responsibility and grow'],
      ],
    });
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 2; c++) {
        const cell = table.getCell(r, c);
        cell.fill = C.cream;
        cell.text.style = {
          fontSize: r === 0 ? 32 : 29,
          typeface: 'Arial',
          color: r === 0 ? C.clay : fg,
          bold: r === 0,
          insets: 16,
        };
      }
    text(s, 'Statement', d.quote, 72, 435, 1100, 140, 46, fg, true);
    text(
      s,
      'Distinctions',
      'Authenticity ≠ Stubbornness     Self-Acceptance ≠ Self-Justification',
      72,
      605,
      1110,
      45,
      25,
      C.olive,
    );
  } else if (d.kind === 'creativity') {
    img(s, 'creativity', 0, 0, 1280, 720, 'cover');
    text(s, 'Title', d.title, 150, 65, 980, 80, 60, C.ink, true);
    text(s, 'Statement', d.quote, 150, 160, 980, 120, 44, C.ink, true);
    text(s, 'Arabic', d.ar, 150, 290, 980, 70, 30, C.ink, false, true);
    img(s, 'dst-logo', 230, 390, 250, 260, 'contain');
    img(s, 'sheen-logo', 780, 390, 250, 260, 'contain');
    text(s, 'DST label', 'DST', 230, 658, 250, 30, 22, C.ink, true, false, 'center');
    text(s, 'SHEEN label', 'SHEEN', 780, 658, 250, 30, 22, C.ink, true, false, 'center');
  } else if (d.kind === 'closing') {
    text(s, 'Title', d.title, 72, 58, 1100, 160, 60, fg, true);
    text(s, 'Closing thought', d.quote, 72, 290, 1110, 155, 62, C.clay, true);
    text(s, 'Arabic', d.ar, 72, 520, 1110, 130, 34, fg, false, true);
  }
  if (d.kind !== 'creativity')
    text(
      s,
      'Slide number',
      String(i + 1).padStart(2, '0'),
      1198,
      670,
      40,
      30,
      18,
      dark ? C.beige : C.olive,
    );
}
await fs.writeFile(path.join(build, 'placements.json'), JSON.stringify(placements, null, 2));
await fs.writeFile(
  path.join(root, 'speaker-notes.txt'),
  slides
    .map((d, i) =>
      [
        String(i + 1).padStart(2, '0') + ' ' + d.title.replaceAll('\n', ' '),
        'Duration: ' + d.time + ' seconds',
        d.notes,
        'Transition: ' + d.transition,
        ...(d.sources ?? []),
      ].join('\n\n'),
    )
    .join('\n\n------------------------------\n\n'),
);
await (await PresentationFile.exportPptx(p)).save(path.join(build, 'draft.pptx'));
await fs.writeFile(path.join(build, 'presentation.json'), JSON.stringify(p.toProto()));
if (!process.env.SKIP_RENDER)
  for (const [i, s] of p.slides.items.entries()) {
    const png = await p.export({ slide: s, format: 'png', scale: 1 });
    await fs.writeFile(
      path.join(build, 'slide-' + String(i + 1).padStart(2, '0') + '.png'),
      new Uint8Array(await png.arrayBuffer()),
    );
    console.log('Rendered', i + 1);
  }
console.log(
  'Draft saved',
  build,
  'Duration',
  slides.reduce((n, s) => n + s.time, 0),
);
