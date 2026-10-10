# Implementation decisions

The agreed implementation plan remains the source of truth. Checked 2026-10-09.

## D001 — Broadcast API verified

[Supabase Broadcast docs](https://supabase.com/docs/guides/realtime/broadcast) confirm `realtime.send(payload jsonb, event text, topic text, is_private boolean)`. Use `false` for `event:<uuid>` public channels. Only identifiers/type are emitted; no outcomes, points, names or row snapshots. Delivery still requires a live Supabase check.

## D002 — Synthetic email: documented, runtime check pending

[Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) supports `email_confirm: true`; [password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) accepts email/password. Preserve `m-<uuid>@members.dst-bts.app`. No SMTP, signup, email confirmation or recovery UI. The exact domain must be tested against GoTrue after project configuration; documentation alone does not prove acceptance.

## D003 — Free limits and capacity assumption

[Pricing](https://supabase.com/pricing) confirms pause after one week, 500 MB database, 1 GB storage, 5 GB egress; [billing](https://supabase.com/docs/guides/platform/billing-on-supabase) lists 200 Realtime peak connections and 2 million messages. The unconfirmed envelope in §7.7 (40 teams, 25 games, 20 rounds, 600 players, 40 staff) remains a capacity assumption, not confirmed attendance. Polling in Phase 5 remains mandatory. A weekly ping is mitigation, not a guarantee against pause.

## D004 — Angular animation and translation

[Angular native animations](https://angular.dev/guide/animations) support `animate.enter`/`animate.leave` since 20.2. No legacy animations package. Use stable Transloco 8 if its npm peer range accepts Angular 21; verify the installed package and production build before claiming compatibility.

## D005 — Hidden results permission conflict

§2.3 and §6.6 explicitly restrict referee access to other teams' hidden outcomes, while §5.2 suggests `can_see_results = public OR is_staff`, which would grant it. Follow the explicit permission matrix: `public OR is_event_admin`. `is_staff` still includes referees for other staff capabilities. No security expansion. Direct domain reads are denied initially; future public reads use visibility-aware RPCs.

## D006 — Environment and hosting

The working repo is `P:/Peter/DST/Badal Talef - Scoring/BTSApp`, branch `phase-0-foundations`; remote scaffold defaults to `master`, not `main`. Workflows cover both branches until the repository default is changed. Pin frontend output explicitly to `dist/btsapp/browser` and confirm it after build. Preview deployments must use a separate Supabase project; no automatic fallback to production. No Supabase/Vercel credentials or Docker executable were present at implementation start. Linking, applying migrations, seeding and hosted acceptance remain pending until those prerequisites exist.

## D007 — Foundation scope

Only migrations 0001–0003 and foundation RPC/helpers are delivered here. Future mutation RPCs must enforce permission, validation, audit, thin broadcast and actor-bound idempotency in the same transaction. Internal `audit`/`emit` are not client-callable. Schema is copied from §5; no standings table or auto-close job. PWA shell setup is included now to permit Phase 0 Lighthouse checks; result flows remain in their assigned phases.

## Verification addendum — 2026-10-09

- **D003 capacity:** Peter confirmed attendance is usually less than the plan's estimates. Retain the envelope for load planning only; no static application limit or schema constraint is based on it.
- **D004 peers:** npm registry `@jsverse/transloco@8.4.0` has `@angular/core >=16.0.0`, `rxjs >=6.0.0`. Installed with Angular runtime 21.2.25, compiled in production and exercised in Arabic/English Chromium tests. CLI/build remain scaffold 21.2.26. Package lock is committed. No fallback translation library needed.
- **D006 output:** production build verified `dist/btsapp/browser/index.html` and `ngsw.json`; initial JS/CSS 314.30 kB. `git ls-remote --symref origin HEAD` confirms `master` is the remote default.
- **D008 PWA acceptance tooling:** [Chrome's Lighthouse documentation](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest) marks PWA auditing deprecated; [the Lighthouse removal issue](https://github.com/GoogleChrome/lighthouse/issues/15535) records category removal in v12. Installed Lighthouse 13.5.0 cannot produce a PWA score. Use manifest/installability, service-worker control and real offline reload checks, retaining accessibility >=90. The literal PWA-score criterion is unavailable; report these equivalent checks separately, never invent a score.
- **D009 measured shell:** Chromium at 360x740 passes EN/AR direction, switching/persistence, no horizontal overflow, >=44px visible controls, modal focus/escape/restoration, zero axe violations and offline navigation. Lighthouse local shell accessibility 100, best practices 100, performance 66 (performance optimization remains Phase 7; hosted results may differ).
- **D010 live verification blockers:** actual `supabase start` returns `DockerLifecycleInspectError`: Docker and Podman absent. No Supabase project ref/credentials, owner passwords or Vercel binding found. SQL files/test suite are written but not yet validated against Supabase; hosted migration, Auth domain, seed, preview separation and Vercel acceptance remain pending.
- **D011 glossary key collision:** agreed keys `team.switch` and `team.switch.confirm` cannot coexist as nested JSON string/object. Keep the glossary's exact dotted keys flat; Transloco resolves them, while new foundation content uses nested objects. Arabic lockout uses Western `10` per section 14.1.

## D012 — Supabase runner verification

[CI run 37869822097](https://github.com/peter-elmasry/BTSApp/actions/runs/37869822097) is green. A real local Supabase stack on GitHub applied/reset migrations 0001–0003 and passed all 155 pgTAP assertions. This supersedes D010's statement that the SQL suite is unexecuted; local Windows Docker and hosted project blockers still apply. A subsequent CI revision adds local owner seed/idempotency and exact synthetic-email domain authentication checks. Hosted configuration/deployment remains separate acceptance.

## D013 — Password provider and mail suppression

The local GoTrue smoke test in CI failed with `Email logins are disabled` when `auth.email.enable_signup=false`. That local flag disables the password provider too. Keep global `auth.enable_signup=false`, enable the email/password provider, and disable confirmation. [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook) replaces built-in mail; a stateless Postgres hook returns `EMAIL_DISABLED` for all delivery requests. Only GoTrue can call the hook (besides backend service/admin roles). CI verifies anonymous signup denied, exact synthetic-domain sign-in succeeds, seed reruns preserve IDs/passwords, and password-recovery email denied. Hosted setup must activate this hook in Authentication > Hooks. This implements the agreed no-signup/no-mail model; no new client capability is granted.

## D014 — Other confidence tags

Calculated WCAG contrast for `#FFB800`: 1.73:1 on white, 1.65:1 on ivory, 8.13:1 on navy. This confirms the plan's gold-only-on-navy rule for text. [ExcelJS official releases](https://github.com/exceljs/exceljs/releases) provide its v4.4.0 release history; [SheetJS's official repository](https://github.com/SheetJS/sheetjs) points to a new upstream home. The broad claim that all SheetJS development is unmaintained is not established by these sources. Retain the explicitly mandated ExcelJS choice; browser/import compatibility and security checks belong to Phase 3, before adding it. No XLSX library is added to the Phase 0 bundle.

## D015 — Auth and mail runtime checks passed

[CI run 37870574137](https://github.com/peter-elmasry/BTSApp/actions/runs/37870574137) successfully applies/resets the schema, authenticates both seeded owners at `m-<uuid>@members.dst-bts.app`, verifies their JWTs with `is_owner()`, preserves IDs/passwords across seed reruns, rejects anonymous signup and denies password-recovery mail through the Postgres hook. The expanded SQL suite passes 159 assertions. This verifies the exact synthetic domain against real local GoTrue; hosted owners/secrets/project linking are still pending. Frontend build, five unit tests, three mobile/PWA browser tests and Lighthouse acceptance also pass in the same run.

## D016 — Phase 1 implementation kickoff

The product owner explicitly requested Phase 1 implementation while Phase 0's hosted Supabase/Vercel acceptance remains pending. This starts implementation only; it does not change the recorded Phase 0 acceptance status or permit hosted deployment. Work is on `codex/phase-1-auth-owner`. Phase 1 adds the login/member Edge Functions, profile and owner RPC migration, frontend session/guards, and owner management screens. Local Docker/Supabase and hosted credentials are not available in this workspace, so runtime acceptance still needs to be completed when those dependencies are available.

## D017 — Database test identities and seeded data

PR #3 CI run `38035607700` exposed tests assuming an empty member directory and reading protected tables as `authenticated`. Keep deny-by-default grants unchanged. Count suite-owned fixtures, invoke RPCs with the intended client role, and use the privileged test runner only to inspect persisted state or exercise raw constraints. Phase 2 errors must emit their intended `P0001` code even when optional JSON details are absent; use an empty DETAIL rather than NULL.

## D018 — Storage deletion policy tests emulate API context

Supabase Storage now rejects direct SQL deletes unless `storage.allow_delete_query=true`; the Storage API sets this transaction context automatically ([upstream explanation](https://supabase.com/blog/supabase-storage-performance-security-reliability-updates)). Phase 2 pgTAP tests set it locally around deletion checks of synthetic metadata-only fixtures, assert referee filtering and actual admin deletion, then turn it off. RLS stays enabled, the suite rolls back, and no production migration or Storage safeguard changes.

## D019 — Explicit IPv4 connection for hosted migrations

[Deployment run 38041380671](https://github.com/peter-elmasry/BTSApp/actions/runs/38041380671) links successfully but `db push` fails with `IPv6 is not supported on your current network`, before applying migrations or deploying Edge Functions. [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres) identifies the shared Session pooler on port 5432 as IPv4-compatible. Keep project linking and use `db push --db-url` with a new production environment secret `SUPABASE_DB_URL` containing that project's completed Session pooler URI. Never commit the URI or password. This corrects the deployment transport only; no schema, RLS, business rules or permission changes. Hosted deployment remains unverified until the secret is configured and the updated workflow succeeds.
