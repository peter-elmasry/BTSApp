# BTSApp

Mobile-first DST event scoring. Follow [the agreed implementation plan](docs/IMPLEMENTATION_PLAN.md); implementation findings are in [DECISIONS.md](docs/DECISIONS.md). Phase 0 delivery status and outstanding acceptance checks are in [PHASE_0_RESULTS.md](docs/PHASE_0_RESULTS.md).

## Local development

Requires Node 24, npm, and Docker Desktop for local Supabase. Angular stays at the repository root.

```sh
npm ci
npx supabase start
npx supabase db reset
```

Export `SUPABASE_URL` and `SUPABASE_ANON_KEY` from your local Supabase status (do not commit them), then run `npm start`. A shell-only preview works without these values. `set-env.mjs` refuses secret/service-role keys; only the public anon/publishable key is allowed in browser configuration. The generated environment file is ignored.

## Owner bootstrap

Export `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_MASRY_PASSWORD`, and `OWNER_GENDUI_PASSWORD` in a private shell/session, then run:

```sh
npm run seed:owners
```

Passwords must have at least 12 characters. The script creates `masry` and `gendui`, leaves phones null, recovers interrupted Auth linking, and preserves passwords on rerun. It refuses to promote an existing ordinary member. Never paste passwords or service keys into source, logs, command arguments or PRs. The script is an administrative bootstrap; browser clients never write tables directly.

## Checks

```sh
node scripts/set-env.mjs --allow-empty
npm run format:check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:db
```

`--allow-empty` is for shell-only CI/local builds. Production generation fails without public configuration. The SQL suite requires running local Supabase. Phase 0 tests cover foundation permissions; later phase RPCs must add their own role-matrix tests before that phase can pass.

Run `npm run serve:dist` in one terminal and `npm run test:lighthouse` in another. Reports/screenshots are written to ignored `artifacts/`. Lighthouse 12+ removed the PWA category; browser tests check offline shell navigation and manifest/SW behavior instead. Accessibility must score at least 90. These local results do not prove hosted deployment acceptance.

## Assets and design system

`npm run brand` regenerates PNG/WebP logo variants, favicon and install icons from the committed white source, plus 24 original SVG avatars. Visually check the mark-only crop after changing the source. Cairo Arabic/Latin weights 400/600/700/800 are self-hosted through Fontsource. Use only the plan's Tailwind tokens; gold text requires navy, and layout uses logical directions.

The home page currently provides a foundation control preview. Schedule and About are placeholders for Phase 4. There is no live event, team selection, staff authentication or result entry UI yet; do not interpret the preview as saved event data.

## Hosting and deployment

Import `peter-elmasry/BTSApp` into Vercel with the Angular preset. `vercel.json` sets the build and `dist/btsapp/browser` output. Configure `SUPABASE_URL`/`SUPABASE_ANON_KEY` for Production and Preview; Preview must point to a separate Supabase project. No production fallback is configured.

GitHub CI builds/tests the frontend and runs the SQL suite on local Supabase. Workflows target the existing default `master` and future `main`. The production environment needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF` for deploy, and repository secrets `SUPABASE_URL`/`SUPABASE_ANON_KEY` for keepalive. Deploy migrations via the main/default branch only; Edge Functions are deployed once implemented in Phase 1. Use GitHub production environment protections for deployment control.

No Supabase project is linked or Vercel deployment verified until credentials are configured and their real checks pass. Never start Phase 1 while Phase 0's external acceptance is pending.

Hosted Auth setup must keep global public signup disabled, enable the email/password provider for synthetic-email password login, disable email confirmation, and select the Postgres Send Email hook `public.block_auth_email` in Authentication > Hooks. The hook blocks mail delivery, including recovery/magic links. CI tests this configuration against local GoTrue before it can pass. Setting the local `auth.email.enable_signup` flag to false also blocks password login; use the global signup flag instead.
