# BTSApp

Mobile-first DST event scoring. Follow [the agreed implementation plan](docs/IMPLEMENTATION_PLAN.md); implementation findings are in [DECISIONS.md](docs/DECISIONS.md). Phase 0 delivery status and outstanding acceptance checks are in [PHASE_0_RESULTS.md](docs/PHASE_0_RESULTS.md). Cross-device handoffs follow [COORDINATION.md](docs/COORDINATION.md), with chronological work in [PROGRESS_LOG.md](docs/PROGRESS_LOG.md); repository agents must also follow [AGENTS.md](AGENTS.md).

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

The [2026-10-11 requirements audit](docs/IMPLEMENTATION_AUDIT.md) maps the app to
the agreed plan and records passing checks, confirmed defects and blocked
acceptance. [Opt-in audit diagnostics](audit/README.md) reproduce the remaining
contract failures separately from the normal test suite.

```sh
node scripts/set-env.mjs --allow-empty
npm run format:check
npm run test:i18n
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:db
```

`--allow-empty` is for shell-only CI/local builds. Production generation fails without public configuration. The SQL suite requires running local Supabase. Phase 0 tests cover foundation permissions; later phase RPCs must add their own role-matrix tests before that phase can pass.

`test:i18n` compares English/Arabic catalog paths and literal UI translation references to catch missing labels before CI passes. Narrative content arrays retain their language-specific layout; dynamic key families are exercised by unit and browser checks.

Run `npm run serve:dist` in one terminal and `npm run test:lighthouse` in another. Reports/screenshots are written to ignored `artifacts/`. Lighthouse 12+ removed the PWA category; browser tests check offline shell navigation and manifest/SW behavior instead. Accessibility must score at least 90. These local results do not prove hosted deployment acceptance.

## Assets and design system

`npm run brand` regenerates PNG/WebP logo variants, favicon and install icons from the committed white source, plus 24 original SVG avatars. Visually check the mark-only crop after changing the source. Cairo Arabic/Latin weights 400/600/700/800 are self-hosted through Fontsource. Use only the plan's Tailwind tokens; gold text requires navy, and layout uses logical directions.

The public app uses the current event selected by an owner. Players pick a team without signing in; staff sign in for owner, event setup and live operation screens.

## Player experience (Phase 4)

Open `/` or `/home` to choose a team, then see its current and upcoming matches. Team choice is stored per event on the device. Printed links such as `/?team=T01` suggest a team and still require confirmation. The header avatar opens the switch-team confirmation. `/schedule` supports my-team, round and game views; `/teams/:code` and `/games/:code` show details; `/about` contains the agreed bilingual DST story.

Migration `0007_phase4_public.sql` adds allowlisted public read RPCs. Hidden schedules omit outcomes; team detail returns the requested team's own outcomes, with opponent outcomes withheld unless the leaderboard is public or the caller is an owner/event administrator. Guide phone numbers appear only when enabled for the event. Domain tables remain private. The server-synchronized clock shows countdown/overtime without closing a round. Phase 6 adds standings and ranks as described below.

Player browser checks use mocked RPCs for repeatable EN/AR mobile journeys. The new pgTAP suite independently checks actual database read permissions and privacy; run it through `npm run test:db` with Supabase running, or through GitHub CI. A missing current event displays an empty state; unavailable RPCs display a retry action.

## Live operations (Phase 5)

Referees open `/ref` for assigned matches in the active round, then confirm results at `/ref/match/:id`. Regular matches support win/draw and all forfeit combinations; opening matches allow any number of winners or all teams forfeiting. Owners/event administrators use `/manage/:eventId/live` to start, extend, close and reopen rounds, correct results, cancel/reset matches, and add or revoke adjustments. Closing a round is blocked until pending matches are completed or cancelled. Overtime keeps the round active until an administrator closes it.

Migration `0008_phase5_live.sql` enforces assignments, round state, outcome combinations, caps, audit records and operation replay. Referee operational reads expose only assigned match outcomes; hidden public schedules stay hidden. Adjustment lists include giver, reason, Cairo time and revoked history for staff.

Read snapshots and pending domain RPCs are stored in IndexedDB. A queued message means the change is saved on the device, not yet accepted by the server. Keep using the same staff account to sync its pending work; other accounts cannot upload it. Network failures retry automatically with the original operation ID. Permission/validation failures are shown for review and are not retried. If browser storage is unavailable, submissions fail visibly. Password/member Edge Function actions and image uploads require a connection and are never queued. Identifier-only realtime broadcasts refresh relevant views; jittered polling takes over if realtime is unavailable.

## Standings and export (Phase 6)

Open `/leaderboard` for computed standings, selected-team highlighting, shared ranks for unresolved ties, current points and active adjustments. Home shows the chosen team's rank/total and a top-five preview; team detail includes its standing when visible. Changing scoring settings recalculates totals. Owners/event administrators use `/manage/:eventId/standings` to confirm publishing/hiding the leaderboard, order a complete tied group, or prepare an export. Scoring, result, adjustment or roster changes clear manual tie orders so they can be reviewed again. Hidden standings remain available only to owners and that event's administrators.

Preparing an export fetches one fresh online snapshot and freezes its preview. Download writes that exact snapshot to an XLSX workbook containing Standings, Matches, Adjustments and Staff. Totals remain numeric; names/reasons remain literal text; phone numbers and authentication/member IDs are excluded. The filename and generated stamp use Africa/Cairo time. Return to live standings to refresh after export. Queued tie/visibility changes use the existing actor-bound offline operation queue and remain pending until accepted by the server.

`/display` removes app navigation and cycles every 20 seconds between standings and the latest five visible match results, with the current round timer, a results ticker and a pause control. Rank movement/count animations respect reduced-motion settings. Migration `0009_phase6_standings.sql` and its pgTAP suite cover computation, permissions, tie validation/invalidation, idempotency and export parity; frontend browser tests mock RPCs and exercise the actual workbook download.

## Event setup import (Phase 3)

Owners and event administrators can open **Import event setup** from the event setup page. Download the bilingual template, replace its sample rows, and upload a `.xlsx` file (up to 5 MiB). ExcelJS loads on demand in the browser. The preview combines local row errors with a server dry-run; saving requires explicit confirmation and revalidates the whole workbook atomically.

`UPSERT` matches teams/games by code and rounds by number, retains existing rows and referee assignments, and preserves UI-managed game images/team ordering. `REPLACE` removes the event setup and imports it again, retaining event administrators; it requires a draft event with no round ever started. Imports assign existing active members as referees/guides and never create accounts. Standings export is available through the Phase 6 screen.

Migration `0006_phase3_import.sql` adds the import RPC; its pgTAP suite runs through `npm run test:db` and GitHub CI. Frontend browser tests mock the RPC boundary and exercise actual workbook generation/parsing; they do not replace database tests.

## Phase 8 extensions

- **Team lock:** after the first round starts, players and guides keep their team; a device that never chose may still pick once. Staff are exempt (D035).
- **Breaks:** a game with no match in a regular round is on a break. Breaks show on the schedule, game details and setup match builder; `/ref` adds a round × game table of the referee's games (D037).
- **Referees on games:** game details and match cards list referee names (D036).
- **Lives scoring:** Setup → Settings → Scoring mode offers Points (default) or Lives with a starting count and any emoji (ten suggested). Loss/forfeit costs one life, lives stop at zero and teams keep playing. Mode and starting lives lock once a round starts. Players see their lives and a once-only life-lost animation (D038). Migration `0017_lives_scoring.sql`; workbook template v4 adds the fields (v3 still imports).
- **Schedule views:** `/schedule` defaults to a table, with cards available and remembered per device (D039).
- **Staff layout:** one section bar across event administration screens, shared spacing classes and a masked password sheet for owners (D040).

Ideas not yet agreed are kept in [FUTURE_PLANS.md](docs/FUTURE_PLANS.md).

## Readiness (Phase 7 in progress)

About includes bilingual installation guidance and a browser install button when
an install prompt is available. Installation always starts from a user action;
only the browser's installation event confirms success. Open needed pages online
before relying on cached data. Production builds enforce a 500 kB initial bundle
limit. Follow [the event-day runbook](docs/EVENT_DAY_RUNBOOK.md) for rehearsal,
offline recovery, final exports and the remaining hosted/device acceptance checks.
Celebrations, printable QR sheets and measured 3G timing remain in progress.

## Hosting and deployment

Import `peter-elmasry/BTSApp` into Vercel with the Angular preset. `vercel.json` sets the build and `dist/btsapp/browser` output. Configure `SUPABASE_URL`/`SUPABASE_ANON_KEY` for Production and Preview; Preview must point to a separate Supabase project. No production fallback is configured.

GitHub CI builds/tests the frontend and runs the SQL suite on local Supabase. Workflows target the existing default `master` and future `main`. The production environment needs `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_URL` for deploy, and repository secrets `SUPABASE_URL`/`SUPABASE_ANON_KEY` for keepalive. Deploy migrations via the main/default branch only; Edge Functions are deployed once implemented in Phase 1. Use GitHub production environment protections for deployment control.

For `SUPABASE_DB_URL`, open the Supabase project's **Connect** dialog and copy the **Session pooler** URI (port **5432**, hostname ending in `.pooler.supabase.com`). Replace its password placeholder with the project's database password; percent-encode special characters in the password for a URI. Store the completed URI only in GitHub **Settings > Environments > production > Environment secrets**. Its username is `postgres.<project-ref>`; copy the exact hostname from the dashboard rather than guessing the region or cluster. The direct `db.<project-ref>.supabase.co` endpoint requires IPv6 without an IPv4 add-on and failed on our GitHub runner. Do not use the transaction pooler on port 6543. The workflow keeps `supabase link` for project/Edge Function association but supplies this explicit connection to `db push`. See [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres).

No Supabase project is linked or Vercel deployment verified until credentials are configured and their real checks pass. Phase 1 implementation began at the product owner's explicit direction while those Phase 0 external checks remain pending; this does not authorize hosted deployment or mark Phase 0 accepted.

Hosted Auth setup must keep global public signup disabled, enable the email/password provider for synthetic-email password login, disable email confirmation, and select the Postgres Send Email hook `public.block_auth_email` in Authentication > Hooks. The hook blocks mail delivery, including recovery/magic links. CI tests this configuration against local GoTrue before it can pass. Setting the local `auth.email.enable_signup` flag to false also blocks password login; use the global signup flag instead.
