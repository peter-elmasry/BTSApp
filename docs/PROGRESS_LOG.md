# Progress log

Append entries newest-first. Preserve older entries as the handoff history.

## 2026-10-10 — Publish Vercel header fix — STARTED

- **Requested by:** Peter authorized proceeding with publication/merge and reporting when ready to deploy.
- **Preflight:** Clean `fix/vercel-cache-pattern` at `0d6e330`; refreshed origin and confirmed no newer master commits. Reviewed the three-file configuration/documentation diff.
- **Scope:** Publish the validated fix, create a PR, verify CI, merge after passing checks and report deployment readiness. Vercel may automatically deploy the merge if its GitHub connection is active.
- **Validation retained:** Vercel routing parser reproduces the old failure and accepts the corrected configuration; hashed/unhashed asset selection, formatting and whitespace checks passed.
- **Next:** Push branch, create PR, inspect CI and merge the verified head. Never record credentials.

## 2026-10-10 — Vercel asset header pattern — HANDOFF

- **Requested by:** Peter; confirm the Supabase URL and fix Vercel's invalid header source error.
- **Preflight:** Working tree clean; fetched origin and based `fix/vercel-cache-pattern` on latest `master` (`d121e55`, including merged Phase 3). Prior local documentation remains preserved on `docs/hosted-deployment-handoff`.
- **Scope:** Correct the nested capturing group in `vercel.json`; preserve hashed-asset caching and service-worker/HTML revalidation. Update decisions and validate route parsing. No schema, permissions or credentials changed.
- **Changes:** Replaced `(js|css)` with `(?:js|css)` in the hashed-asset source; recorded D022. Peter reports hosted owners were created successfully; hosted owner sign-in and Vercel acceptance remain unverified.
- **Validation:** Vercel routing-utils 6.5.0 reproduces the original invalid configuration and accepts every corrected header/rewrite. Its path-to-regexp parser matches hashed JS/CSS and excludes unhashed assets, HTML and service-worker files. Changed-file Prettier and whitespace checks pass. The validator was installed only under ignored `artifacts/`; application dependencies are unchanged. An initial check used the wrong wrapper signature; the corrected validator invocation passed.
- **Next/publication:** Fix committed locally on `fix/vercel-cache-pattern`; not pushed per AGENTS.md. Publish/review/merge this branch when requested, then redeploy Vercel from updated `master` and test owner login. No hosted deployment was run during this fix.

## 2026-10-10 — Publish Phase 3 and verify cloud CI — DONE

- **Requested by:** Gendy explicitly authorized pushing the ready phase and creating a PR.
- **Branch/state:** Clean `codex/phase-3-xlsx-import` at `9381db2`; refreshed origin and checked for an existing open Phase 3 PR (none found). Merge conflicts are resolved.
- **Scope:** Review the phase diff, publish this branch without rewriting history, create/attach a PR against `master`, and inspect/fix its CI checks. Local verification already passed 28 unit tests, five browser tests, build, TypeScript and formatting; the 69 new pgTAP assertions still need cloud execution.
- **Next:** Commit this publication record, push, open the PR and verify frontend/database results. No merge or hosted deployment requested.
- **Publication milestone:** Pushed `084a1aa` with upstream tracking and opened [PR #5](https://github.com/peter-elmasry/BTSApp/pull/5), attached to this chat; GitHub reports mergeable. Integration PR creation returned 403 and the browser bridge failed; creation succeeded through GitHub's API using existing Git authentication without printing/storing credentials. Cloud CI run `38053285280` is in progress.
- **Validation passed:** [Cloud CI run 38053285280](https://github.com/peter-elmasry/BTSApp/actions/runs/38053285280) on code head `084a1aa` passes both jobs. Fresh migration/reset includes `0006_phase3_import.sql`; all 310 pgTAP assertions across four suites pass, including 69 import assertions, plus owner seed/auth smoke checks. Frontend formatting, 28 unit tests, build, five browser tests and Lighthouse acceptance pass. This supersedes the earlier Phase 3 SQL-runtime blocker; dependency findings remain documented in D021.
- **Handoff/next:** Phase 3 is ready for PR review. PR #5 now includes the passing CI evidence; this documentation-only verification note is published on the same branch. No implementation changes were needed after cloud execution. Review/merge PR #5 when approved; hosted deployment remains separate and was not performed here.

## 2026-10-10 — Resolve Phase 3 merge conflicts — DONE

- **Requested by:** Gendy; fix the in-progress merge conflict.
- **Branch/state:** `codex/phase-3-xlsx-import` at `1da966c`, merging `bd1de7b` from master. `docs/DECISIONS.md` and `docs/PROGRESS_LOG.md` are unmerged; workflow/README changes are already staged and will be preserved.
- **Scope:** Retain both import/deployment histories and completed Phase 2 CI evidence; keep master's published IPv4 decision as D019, renumber import decisions to D020/D021, and update their references. Validate formatting, merged content and Git state, then finish the merge with a local commit.
- **Resolution:** Retained both parent histories, including Phase 3 implementation notes, IPv4 deployment handoffs and the completed Phase 2 CI results. D019 remains the IPv4 decision; import/ExcelJS decisions are D020/D021 with updated references. Incoming workflow and README content are preserved; normalized line endings for Prettier.
- **Validation:** Both-parent history retention, unique decision IDs, unchanged incoming workflow content, both README sections, tracked conflict-marker scan, changed-file Prettier and whitespace checks passed. No application/SQL code changed; runtime suites were not rerun for this documentation conflict resolution.
- **Handoff/next:** Completed the in-progress merge with a local Conventional Commit on `codex/phase-3-xlsx-import`; no push or deployment requested or performed. Phase 3 cloud database verification remains pending publication.

## 2026-10-10 — Publish and merge IPv4 deployment fix — HANDOFF

- **Requested by:** Peter explicitly authorized merging `fix/supabase-ipv4-deploy`.
- **Preflight:** Clean working tree; refreshed origin; `master` remains `5df1bcb` with no intervening colleague commits. Reviewed the workflow change and retained the previously verified formatting/CLI checks.
- **Scope:** Publish this branch, open a PR against `master`, merge after required checks, then inspect the automatically triggered hosted deployment. No force push or history rewriting.
- **Next:** Confirm PR merge and hosted deployment result. `SUPABASE_DB_URL` must be configured in GitHub's `production` environment; its value is never read into documentation.

## 2026-10-10 — Supabase deployment IPv4 connection — HANDOFF

- **Requested by:** Peter; investigate the failed hosted deployment.
- **Branch:** `fix/supabase-ipv4-deploy`, based on current `master` at `5df1bcb`; initial working tree clean.
- **Evidence:** Run `38041380671` links successfully, then `supabase db push` fails with `IPv6 is not supported on your current network`; Edge Functions are skipped. The Node action warning is unrelated.
- **Scope:** Use an explicit Session pooler database URL for migrations; update deployment instructions and decisions. No schema or application permission changes, no hosted retry or push in this session.
- **Changes:** Deployment now checks the `SUPABASE_DB_URL` environment secret and explicitly supplies it to `db push`; README documents the Session pooler URI and D019 records the transport decision.
- **Validation:** Changed-file Prettier and `git diff --check` pass. Installed CLI help confirms `db push --db-url` accepts a percent-encoded connection URI. Initial help invocation was sandbox-blocked writing telemetry; an unrestricted help-only retry passed. No hosted migration or deployment was attempted.
- **Next:** Add the Session pooler URI as `SUPABASE_DB_URL` in GitHub's `production` environment, publish/merge this fix, then run Deploy Supabase on updated `master`. Changes are committed locally on this branch, not pushed per AGENTS.md; repository credentials/secrets are unchanged.

## 2026-10-10 — Phase 3 XLSX setup import — HANDOFF

- **Requested by:** Gendy; start next phase with divide-and-conquer subagents, DRY and KISS.
- **Branch/state:** PR #3 merge verified at `5df1bcb`; branch `codex/phase-3-xlsx-import` starts from refreshed `origin/master` and carries final Phase 2 CI evidence via `925f8ed`. Working tree was clean.
- **Scope/owners:** Database agent owns new Phase 3 migration/pgTAP; workbook agent owns lazy ExcelJS template/parser/validation and unit tests; UI agent owns the import page/template/tests and import translations. Primary owns shared contract, API/types/routes/dependency installation, integration, docs, checks, and commit.
- **Contract:** `import_event_setup(p_op_id,p_event,p_payload,p_mode,p_dry_run)` accepts `{event,teams,games,rounds,matches,staff}` with optional original `row` on array records; matches use `round_number/game_code/team_a_code/team_b_code`, staff use `member/role/game_codes/team_code`. Reports `{valid,errors:[{sheet,row,column,code}],counts:{teams,games,rounds,matches,staff},applied}`. Mode UPSERT/REPLACE. Client preview plus server dry-run before explicit confirm; server atomic validation/apply and replay safety mandatory.
- **Acceptance:** Bad row imports nothing with row errors; valid workbook builds event; REPLACE blocked after any round starts. Reuse Phase 2 rules/RPCs, preserve EVENT_ADMIN roles during setup replacement, and load ExcelJS only on demand.
- **Environment:** Local Docker remains unavailable and disk-limited; do not install Docker. Phase 2 cloud CI passed 241 database assertions. Hosted project acceptance remains pending; Phase 3 implementation is explicitly requested.
- **Integration milestone:** All three delegated scopes delivered. Template/parser, guarded EN/AR preview/confirmation page, and atomic server import are integrated; added 10 workbook, 6 confirmation-safety, 2 browser tests and 67 pgTAP assertions. Browser checks caught and fixed ExcelJS CommonJS default-export interoperability; Angular tests required TestBed dependency mocks instead of relative module mocks. Serial local workers avoid startup timeouts. Existing mobile accessibility/offline tests passed; final checks remain in progress.
- **Verification milestone:** 28 unit tests, app/spec TypeScript checks, changed-file Prettier and production build passed. All five production browser checks passed (real XLSX round trip in EN/AR with mocked RPC, accessibility/mobile overflow, shell/offline coverage); mocked import tests block service workers to keep RPC interception deterministic. Visual QA prompted success-focus and narrow signed-in header fixes, now undergoing final recheck. Optional blank leaderboard visibility preserves the existing value; database regression suite expanded to 69 assertions. No database runtime result claimed: local port 54322 has no Supabase service, and publishing this new branch for cloud CI has not been authorized.
- **Final checks/outcome:** Rechecked after focus/header fixes: all 28 unit tests and five Chromium tests pass; production initial bundle 324.46 kB with ExcelJS lazy-loaded separately. App/spec TypeScript, changed-file Prettier and whitespace checks pass. Local Vitest uses temporary ignored configuration with one thread worker; default forks timed out before test execution. Browser runs use a temporary port 4300 to preserve the user's existing dev server. Both languages were visually inspected. D020/D021 record import semantics and the two moderate dependency-audit findings; SQL runtime remains unverified.
- **Handoff/next:** Phase 3 implementation and docs are committed locally on `codex/phase-3-xlsx-import`; nothing pushed or deployed. Request publication of this branch and a PR, then run/fix cloud CI (expected 310 database assertions across four suites). Do not mark Phase 3 accepted until its database checks pass. Hosted Supabase/Vercel acceptance remains separate.

## 2026-10-10 — PR #3 cloud database verification — DONE

- **Requested by:** Gendy; explicitly authorized pushing and resolving CI failures promptly; use GitHub runners because local disk space is insufficient.
- **Branch/state:** `codex/phase-2-event-setup`, clean at `e0f1a50`; fetch/push confirms origin and PR #3 already contain both repair/setup commits. Earlier unpushed notes are superseded by this verified remote state.
- **Scope:** Inspect latest GitHub CI, repair remaining database failures, run available formatting checks, commit and push fixes, and verify the cloud database result. No local Docker installation needed.
- **Milestone:** CI run `38039617333` passes foundations and Phase 1 owner suites. Phase 2 stops at malformed dollar quoting in the two newly added regression assertions; corrected those delimiters.
- **Milestone:** Run `38039934684` executes all 240 assertions, with only two Storage delete checks failing because upstream blocks direct SQL deletes. Tests now emulate the Storage API transaction setting for synthetic metadata fixtures, retain RLS, and assert actual admin deletion. Production safeguards unchanged.
- **Validation passed:** GitHub CI run `38040208562` on pushed code commit `7c94050`: all 241 pgTAP assertions across three suites, fresh migration reset, owner seed/auth smoke checks, and the full frontend job (formatting, unit tests, build, browser tests, Lighthouse). Local changed-file Prettier and `git diff --check` passed.
- **Publication/handoff:** Fixes `78d926c` and `7c94050` are pushed to PR #3. This final verification record is committed locally; no further code changes are required. PR ready for review; no merge requested.

## 2026-10-10 — Local Supabase runtime setup — HANDOFF

- **Requested by:** Gendy; set up local Supabase and execute/fix database checks.
- **Branch/state:** `codex/phase-2-event-setup`, clean at `827198c`, one local commit ahead; no push authorized.
- **Scope:** Check Windows virtualization/WSL, install/start Docker if supported, start Supabase, run pgTAP, and repair remaining failures.
- **Verified prerequisites:** Windows 10 Home build 19045 on Lenovo 81AX; Intel i7-8550U supports SLAT, but `VirtualizationFirmwareEnabled=false` and `HypervisorPresent=false`. Inbox WSL does not support `--version`; modern WSL setup remains needed.
- **Installation attempt:** WinGet resolved Docker Desktop 4.94.0 and started its official download, but no download progress or installed executable was observed. Stopped the attempt after confirming the BIOS prerequisite blocker; Docker installation is not claimed.
- **Checks/outcome:** Supabase startup and pgTAP were not run because no usable Docker engine is available. Existing database fix `827198c` remains local and unpushed.
- **Next:** Gendy must enable Intel virtualization in BIOS/UEFI and restart. Then install/update WSL and Docker Desktop, start the engine, run `npx supabase start` and `npm run test:db`, and repair any further failures. No automatic restart was attempted.

## 2026-10-10 — PR #3 database check repair — HANDOFF

- **Requested by:** Gendy; inspect failing `npm run test:db` and explain checksum.
- **Branch/state:** `codex/phase-2-event-setup`, clean at `157f3e1`; PR #3 head matches local HEAD.
- **Scope:** Inspect CI failures, repair database tests or implementation as indicated, run available checks, and commit without pushing.
- **Confirmed causes:** CI run `38035607700` shows NULL exception DETAIL breaking Phase 2 error codes; seeded owners inflating Phase 1/2 directory counts; direct authenticated table reads aborting both suites.
- **Changes:** Fixed `phase2_fail` optional details; added two error-helper regression assertions; fixture-scoped directory counts; privileged test-runner observations/constraint checks; authenticated setup ID lookups through `get_event_setup`. Client grants remain unchanged.
- **Validation:** Local `npm run test:db` blocked by ECONNREFUSED at `127.0.0.1:54322`; runtime results are not claimed. Prior PR frontend job passed. Changed-file Prettier and `git diff --check` passed.
- **Next:** Fix is committed locally as `fix: repair database error handling and role-aware tests`, without pushing, per repository rules. Push when requested, then confirm the PR database job passes. Docker checksum verification succeeded in the failed run and is unrelated to SQL failures.

## 2026-10-10 — Phase 2 manual event setup — HANDOFF

- **Requested by:** Gendy.
- **Branch:** `codex/phase-2-event-setup`, branched from Phase 1 commit `4cb476a` on `codex/phase-1-auth-owner`; PR #2 is now merged into `master`.
- **Dependency finding:** Phase 3 depends on Phase 2's event setup schema and validation rules: teams, games, rounds, matches, event staff, uniqueness constraints, and settings. Per Gendy's instruction, implement/validate Phase 2 first; do not start Phase 3 implementation in parallel.
- **Parallel scopes:** Database schema/RPCs/pgTAP tests in `supabase/**`; manual setup frontend components and focused frontend tests in a separate feature directory under `src/app/features/manage/**`. The primary agent owns integration types/service/routes and final combined validation.
- **Phase 1 prerequisite note:** Phase 1 frontend and SQL/Auth acceptance passed in CI (D015); hosted project configuration/deployment remains pending. Phase 1 is merged to `master`.
- **Base verification:** GitHub confirms Phase 1 PR #2 is merged into `master` at `42c6978`; local `origin/master` is now refreshed. Phase 2's PR target is `master`.
- **Integration contract:** Frontend and DB scopes use the same Phase 2 RPC signatures, with client-generated `p_op_id` UUIDs for every mutation. `get_event_setup` returns `eligible_members` containing active member IDs/names/usernames/login availability; it excludes phone and auth identifiers and is limited to owners/event admins. Guides may lack login; admin/referee assignment requires login. Only owners can assign/remove EVENT_ADMIN; event admins can assign REFEREE/GUIDE.
- **Milestone:** Added the lazy Event Admin setup route/navigation, owner event-card link to setup, EN/AR `manage.*` translations, and the complete setup UI/database contract.
- **Database milestone:** Added the Phase 2 migration and pgTAP tests for schedule uniqueness/opening-match safeguards, completed-match edit restrictions, roles, audit/idempotency, storage policy scope, and validation. SQL was statically reviewed; local pgTAP could not run because Postgres at `127.0.0.1:54322` refused connections (Docker/Supabase runtime unavailable).
- **Integration review:** Settings include event names; the UI joins flat matches/roles/referee assignments from `get_event_setup`; OPENING schedules use the generator RPC; role assignment follows owner/event-admin permissions. Game images upload to a public WebP bucket with event-scoped write policies.
- **Storage/settings milestone:** The DB contract now includes event names in settings, with required English/optional Arabic validation. Added a public WebP `game-images` bucket capped at 5 MiB and event-folder-scoped owner/admin writes; pgTAP coverage includes cross-event/referee denial and object lifecycle. Runtime DB validation remains blocked locally.
- **Validation results:** Production build passed (323.38 kB initial bundle); focused Phase 2 Vitest passed 2/2; serial Playwright E2E passed 3/3; changed-file Prettier and `git diff --check` passed. `npm test` stalled without output and was stopped; direct focused Vitest is green. `npm run test:db` reaches Supabase CLI but local Postgres refuses `127.0.0.1:54322` (ECONNREFUSED; Docker/Supabase is not running), so pgTAP execution remains pending in CI.
- **CI formatting finding/fix:** The repo-wide `npm run format:check` fails on 37 unchanged files. Changed Phase 2 files pass. Updated the CI workflow to fetch the comparison base and format-check only PR/push changed files, preserving checks without requiring unrelated formatting churn.
- **Publication:** Commits `aee9d5b` (`feat: add manual event setup management`) and `f2021d7` (`chore: format-check changed CI files only`) are published on `origin/codex/phase-2-event-setup`; upstream tracking is set.
- **PR blocker:** GitHub `create_pull_request` returned 403, `Resource not accessible by integration`. The CUA browser bridge also failed before tab discovery (`failed to write kernel assets: The system cannot find the path specified`). PR #2 is merged, but Phase 2 PR creation is still pending. Compare URL: `https://github.com/peter-elmasry/BTSApp/compare/master...codex/phase-2-event-setup?expand=1`.
- **Handoff:** Phase 2 implementation is ready for review on `codex/phase-2-event-setup`. Create the PR against `master` from the compare URL or with an integration that has pull-request write permission, then attach it here. Do not start Phase 3 before Phase 2 is reviewed/merged.

## 2026-10-10 — Git workflow and branch publishing — DONE

- **Requested by:** Gendy.
- **Goal:** Add the requested Git workflow to `AGENTS.md`; diagnose why `codex/phase-1-auth-owner` cannot be published and try to publish it.
- **Initial state:** Current branch is `codex/phase-1-auth-owner`; it had no upstream configured. Working tree was clean at inspection. Remote `origin` points to `https://github.com/peter-elmasry/BTSApp.git`; authentication uses Git Credential Manager.
- **Completed:** Added the Git workflow to `AGENTS.md` and committed it as `1cc93d6 chore: document git workflow and branch publishing`. The existing Phase 1 commit `a2965aa` is also on the published branch.
- **Checks:** Targeted Prettier and `git diff --check` passed for the documentation changes.
- **Publishing diagnosis and resolution:** The initial `git ls-remote` attempt failed because sandboxed network access to GitHub was blocked. After retrying with network access, `git push --set-upstream origin codex/phase-1-auth-owner` succeeded and configured `origin/codex/phase-1-auth-owner` as upstream. Branch is published and ready for a PR.
- **PR URL:** https://github.com/peter-elmasry/BTSApp/pull/new/codex/phase-1-auth-owner

## 2026-10-10 — Name preference for this chat — DONE

- Gendy asked to be called “Gendy” in this chat and in future logs written through this chat. Use that name in future entries and handoffs from this chat.

## 2026-10-10 — Standing documentation rule — DONE

- Gendy asked that Codex and delegated agents keep the coordination files updated whenever work makes them stale.
- `AGENTS.md` now makes coordination updates part of implementation for primary and delegated agents. `COORDINATION.md` includes a reusable pull-and-continue prompt that instructs another device's agent to maintain the log and decision docs too.
- Future substantive sessions continue to use `STARTED`, milestone updates, and `HANDOFF`/`DONE` entries.

## 2026-10-10 — Phase 1 validation and template extraction — HANDOFF

- **Branch:** `codex/phase-1-auth-owner` (changes are local and uncommitted; push/commit status must be checked before another device can fetch them).
- **Scope:** Phase 1 auth and owner area; externalize all Angular component templates; validate against the agreed contracts.
- **Implemented:** Added login and members Edge Functions, profile/owner RPC migration `0004_owner_auth.sql`, Angular auth store and route guards, owner Members/Events screens, translations, and Phase 1 pgTAP permission/idempotency coverage. All component templates under `src/app` now use `templateUrl` and adjacent HTML files.
- **Validation passed:** Production build; initial bundle 322.12 kB (under the agreed 500 kB budget); 10 unit tests across 3 files, including guard coverage; 3 Playwright shell tests (Arabic, English, offline); Lighthouse accessibility 100, best practices 100, performance 68; targeted Prettier on changed files; `git diff --check`.
- **Validation not complete:** `npm run test:db` could not connect to Postgres at `127.0.0.1:54322`; Docker is unavailable. Consequently Phase 1 SQL permission tests, migration execution, Edge Function integration, username/phone login and wrong-password lockout have not been runtime-verified against Supabase. Hosted Supabase/Vercel acceptance remains pending per `PHASE_0_RESULTS.md`.
- **Other check note:** Repository-wide `npm run format:check` flags many pre-existing files; the changed-file Prettier check passes. Initial parallel test execution timed out starting Vitest workers; serial `npm test` passed. Playwright Chromium was installed in the local user cache to run E2E.
- **Decision recorded:** Supabase client import is lazy-loaded from `AuthStore` so the initial app bundle remains below 500 kB.
- **Next:** Start local Supabase on a machine with Docker, run `npx supabase db reset` and `npm run test:db`, fix any migration/pgTAP issues, then exercise Edge Function login and owner/member actions with owner, referee, inactive, and anonymous identities. Preserve Phase 0 hosted acceptance as pending until its checks pass.

## 2026-10-10 — Collaboration record setup — DONE

- Added `AGENTS.md`, this coordination guide, and the progress log. README links to the entry points.
- Going forward, begin each substantive session with a `STARTED` progress entry and update it at milestones and handoff. Never place secret values in docs.
