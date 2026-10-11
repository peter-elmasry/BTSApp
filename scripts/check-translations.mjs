import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
function flatten(value, prefix = '', result = new Map()) {
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    result.set(name, item);
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, name, result);
    else if (typeof item !== 'string' && !Array.isArray(item))
      throw new Error(`Invalid translation: ${name}`);
  }
  return result;
}
async function sources(directory) {
  const files = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const file of files) {
    const name = path.join(directory, file.name);
    if (file.isDirectory()) result.push(...(await sources(name)));
    else if (/\.(ts|html)$/.test(name) && !name.endsWith('.spec.ts')) result.push(name);
  }
  return result;
}
const catalogs = await Promise.all(
  ['en', 'ar'].map(async (language) => ({
    language,
    entries: flatten(
      JSON.parse(await readFile(path.join(root, 'public/i18n', `${language}.json`), 'utf8')),
    ),
  })),
);
const allKeys = new Set(catalogs.flatMap(({ entries }) => [...entries.keys()]));
const prefixes = new Set([...allKeys].map((key) => key.split('.')[0]));
const problems = new Set();
for (const { language, entries } of catalogs) {
  for (const key of allKeys)
    if (!entries.has(key) || (typeof entries.get(key) === 'string' && !entries.get(key).trim()))
      problems.add(`${language}: missing/empty ${key}`);
}
for (const file of await sources(path.join(root, 'src/app'))) {
  const source = await readFile(file, 'utf8');
  // Literal keys in templates and TS lookup tables. Dynamic families are
  // covered by EN/AR parity and the UI/permission tests that exercise them.
  const pattern = file.endsWith('.html')
    ? /\bt\(\s*(['"])([a-zA-Z][\w-]*(?:\.[\w-]+)+)\1/g
    : /(['"])([a-zA-Z][\w-]*(?:\.[\w-]+)+)\1/g;
  for (const match of source.matchAll(pattern)) {
    const key = match[2];
    if (!file.endsWith('.html') && !prefixes.has(key.split('.')[0])) continue;
    for (const { language, entries } of catalogs)
      if (!entries.has(key))
        problems.add(`${language}: missing ${key} (${path.relative(root, file)})`);
  }
}
if (problems.size) {
  console.error([...problems].sort().join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Translations verified: ${allKeys.size} matching EN/AR keys and literal UI references.`,
  );
