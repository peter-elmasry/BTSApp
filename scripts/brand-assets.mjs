import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('public/brand', { recursive: true });
const source = sharp('design/brand/dst-logo-source-white.png');
const trimmed = await source.trim({ background: '#00000000', threshold: 1 }).png().toBuffer();
const meta = await sharp(trimmed).metadata();
// Top 67% is the agreed initial crop; generated mark must be visually reviewed.
const mark = await sharp(trimmed)
  .extract({ left: 0, top: 0, width: meta.width, height: Math.floor(meta.height * 0.67) })
  .trim({ background: '#00000000', threshold: 1 })
  .png()
  .toBuffer();
for (const [name, data, width] of [
  ['dst-logo-full', trimmed, 1200],
  ['dst-mark', mark, 480],
]) {
  for (const [variant, color] of [
    ['white', '#FFFFFF'],
    ['navy', '#172B4D'],
  ]) {
    const { data: rgba, info } = await sharp(data)
      .resize({ width })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgb = color.match(/\w\w/g).map((n) => parseInt(n, 16));
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
    }
    const output = sharp(rgba, { raw: info });
    await output.clone().png().toFile(`public/brand/${name}-${variant}.png`);
    await output.clone().webp({ lossless: true }).toFile(`public/brand/${name}-${variant}.webp`);
  }
}
async function icon(size) {
  const inner = Math.floor(size * 0.76);
  const foreground = await sharp(mark)
    .resize({ width: inner, height: inner, fit: 'inside' })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#172B4D' } })
    .composite([{ input: foreground, gravity: 'centre' }])
    .png()
    .toBuffer();
}
for (const size of [192, 512]) await writeFile(`public/brand/icon-${size}.png`, await icon(size));
// 12% padding on the wide source leaves all artwork inside the circular safe area.
await writeFile('public/brand/maskable-512.png', await icon(512));
const ico = await pngToIco(await Promise.all([16, 32, 48].map(icon)));
await writeFile('public/brand/favicon.ico', ico);
await writeFile('public/favicon.ico', ico);
