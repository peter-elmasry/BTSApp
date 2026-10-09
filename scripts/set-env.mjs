import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_ANON_KEY ?? '';
if ((!url || !key) && !process.argv.includes('--allow-empty')) {
  throw new Error(
    'Set SUPABASE_URL and SUPABASE_ANON_KEY. Use --allow-empty only for shell-only local/CI builds.',
  );
}
if (url && !/^https?:\/\//.test(url)) throw new Error('Invalid SUPABASE_URL');
if (key.startsWith('sb_secret_')) throw new Error('Secret key cannot be embedded in the browser');
if (key.split('.').length === 3) {
  const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (payload.role !== 'anon') throw new Error('Only the public anon key may be embedded');
}
await mkdir('src/environments', { recursive: true });
await writeFile(
  'src/environments/environment.ts',
  `// Generated; do not commit.\nexport const environment = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key }, null, 2)} as const;\n`,
);
