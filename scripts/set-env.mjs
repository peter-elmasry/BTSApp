import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { releaseInfo } from './release-info.mjs';

function git(...args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}
const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git('rev-parse', 'HEAD');
const release = releaseInfo({
  sha,
  message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? git('show', '-s', '--format=%s', sha),
  environment: process.env.VERCEL_ENV,
  pullRequest: process.env.VERCEL_GIT_PULL_REQUEST_ID,
});

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
  `// Generated; do not commit.\nexport const environment = ${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key, release }, null, 2)} as const;\n`,
);
