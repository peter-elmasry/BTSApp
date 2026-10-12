# Implementation and acceptance audit — 2026-10-11

**Verdict: the app is not fully compliant or ready for final acceptance.** Most
implemented player, scoring, import, standings and offline journeys pass. The
audit found a privileged-screen privacy defect, two Edge handler contract
failures, missing required features, admin usability gaps and outstanding
performance/hosted verification.

Audited product commit: `72a4436`, branch `codex/phase-7-readiness`. This audit
adds diagnostics and documentation only; it does not repair product behavior or
change acceptance criteria. No push, deployment, hosted mutation or Docker
installation was performed.

## Scope and interpretation

Reviewed `IMPLEMENTATION_PLAN.md` sections 0–19, every decision D001–D029,
`PHASE_0_RESULTS.md`, `COORDINATION.md`, the progress history, `EVENT_DAY_RUNBOOK.md`,
`README.md`, `AGENTS.md`, routes/components/stores, migrations, Edge Functions,
test suites, assets/PWA/hosting configuration and CI workflows.

The plan is the requirements baseline; explicit decisions/user changes are
applied. In particular, D005 restricts hidden results to owners/event admins,
D008 replaces the removed Lighthouse PWA score, D025 excludes passwords/member
Edge actions and binary uploads from the offline queue, and D028 changes the
shared header to gold/navy. Accepted anonymous team-view reconstruction is not
reported as a security defect. Phase 7 is explicitly unfinished.

“Pass” below means the stated check passed, not that its entire phase is accepted.
Mocked frontend and handler checks do not establish hosted database permissions.

## Executed checks

| Check                                    | Fresh result                                                                                               | Limits                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Production build                         | Pass; 369.49 kB initial, 106.69 kB estimated transfer                                                      | Below the enforced 500 kB error limit; expected ExcelJS CommonJS warning                                                               |
| App and spec TypeScript                  | Both pass                                                                                                  | Setup still uses `any`; compilation is not schema-contract verification                                                                |
| Translation audit                        | Pass; 555 matching EN/AR paths and literal references                                                      | Does not detect hardcoded English or wrong localized entity fields                                                                     |
| Full unit suite, serial local threads    | 115/116 pass in both Node 22 and Node 24 runs                                                              | One XLSX round-trip times out at the unchanged 5-second assertion budget                                                               |
| Focused export unit retry                | 4/4 pass                                                                                                   | All 116 cases have passed across runs, but a fresh full run is not wholly green                                                        |
| Existing production browser suite        | 27/27 pass with Node 24.19.0                                                                               | Serial local config, 60-second test / 15-second assertion limits; backend mocked except shell/SW behavior                              |
| Initial Node 22 browser run              | 25/27 pass                                                                                                 | Both failures are Node-side ExcelJS module linking after browser downloads; Node 24 rerun fixes this environment issue                 |
| Added browser requirement probes         | 2/6 pass; four confirmed requirement failures                                                              | The first synthetic-storage logout probe was inconclusive; the corrected real two-tab logout reproduction confirms the privacy failure |
| Added actual Edge handler probes         | 10/12 pass                                                                                                 | Simulated DB/Auth/clock; two requirement failures, not hosted integration                                                              |
| Lighthouse production shell              | Accessibility 100, best practices 96, performance 68                                                       | Local simulated shell, not every route or hosted 3G acceptance                                                                         |
| Cold local throttled team picker         | EN 8.120 s; AR 7.606 s                                                                                     | Both exceed 4 s under the explicit diagnostic profile below; not production compression/device evidence                                |
| Database rerun                           | Blocked: connection refused at `127.0.0.1:54322`                                                           | CLI first hit sandbox telemetry denial; unrestricted local retry confirms unavailable Postgres                                         |
| Previous cloud database evidence         | Reconfirmed successful database/frontend jobs in run `38139075290`; DB log: 7 files / 704 assertions, PASS | Existing Phase 6 run, not a new database run for this audit; SQL unchanged since that verified code                                    |
| Repository-wide Prettier                 | Fails on 31 existing files                                                                                 | Baseline formatting debt; no unrelated reformat performed                                                                              |
| Audit changed-file formatting/whitespace | Pass                                                                                                       | Does not claim repository-wide formatting is clean                                                                                     |

Fresh `npm audit --json` also confirms the two moderate dependency findings
already recorded in D021, with zero high/critical entries. The advisory-service
lookup succeeded after an unrestricted read-only retry.

Existing browser coverage includes EN/AR choose/switch/persistence, QR suggestion
confirmation, schedule, overtime, regular/opening results, lost acknowledgment
and offline reconnect, lifecycle pending/void/close/reopen, caps/revocation,
import template/preview/confirm, standings/privacy/ties/export, display cycling,
install guidance, manifest/installability and real service-worker offline reload.

The extra 390×844 reduced-motion leaderboard checks pass in both languages with
no running subtree animations and no axe violations. Existing 360×740 journeys
also perform mobile overflow and axe checks on their covered screens. This is
not exhaustive touch-target or accessibility coverage of the whole app.

## Confirmed findings

### A01 — P1: owner member data remains visible after cross-tab logout

Requirement: §2.3 owner-only member directory; D025 says authentication changes
hide prior privileged responses. `OwnerPage` copies private reads into component
signals and does not clear/hide them on an actor change
(`src/app/features/owner/owner-page.ts:44`, `:77`).

Reproduction: open `/owner/members` in two tabs of one browser context, sign out
using the header button in the second tab, then inspect the first. Both headers
show the signed-out login link, but the first tab still renders the synthetic
member phone. The corrected two-tab browser test fails `count=0` with `count=1`.
Route activation guards do not rerun automatically for the already-open screen.

Fix direction: bind privileged page rendering/read completions to the current
actor and authorization context; clear private component state and invalidate
in-flight reads when it changes. Review setup and other privileged pages for the
same pattern. This finding concerns stale browser data; it does not establish a
server authorization bypass.

**Remediation update (2026-10-11):** D030 adds a shared session outlet that destroys
owner/manage/referee routed component trees when access is lost and recreates
them on actor or permission changes. Nine focused lifecycle tests pass, including
late-read suppression, account draft isolation, event-role revocation, token
refresh and public-page preservation. Eight real two-tab browser regressions
cover every privileged route and pass; these are now part of normal frontend CI.
The full browser suite passes 35/35; the focused lifecycle/guard suite passes 15/15.
The original audit observations above remain the historical baseline. Other
findings remain open.

### A02 — P2: lockout can expire before ten minutes after the fifth failure

Requirement: §6.8 / Phase 1, five failed attempts within ten minutes trigger a
ten-minute rejection period. `login/index.ts:45` retrieves only failures still
inside a moving ten-minute window; `:49` requires all five before applying the
latest-failure deadline.

Actual handler reproduction: fail at minutes 0, 1, 2, 3 and 4. At minute 5 the
handler returns 429. At minute 10.5 the first failure has fallen out of the
query, so it attempts password login and returns 401 instead of 429, even though
the fifth failure's ten-minute deadline is minute 14. At minute 14.1, 401 is
expected. Phone/username normalization probes pass.

Fix direction: persist/derive a lockout deadline independently of the moving
threshold count and test spread-out attempts plus concurrent threshold crossing.

**Remediation update (2026-10-12):** Migration `0013` persists lockout deadlines
and reserves concurrent attempt capacity. The actual login handler passes 22
mocked-transport checks, including normalization, inactive accounts, admission
errors and refusal to return tokens after failed/expired persistence. New pgTAP
cases cover the aged-out-history regression, deadlines, expiry, grants and atomic
failure recording. The localhost Auth runner now exercises the handler against
real Auth/database clients plus parallel admission/completion RPCs. These database
and Auth checks are wired into existing CI but remain unexecuted locally because
port 54322 refuses connections; A02 runtime acceptance is pending cloud execution.

**Cloud verification (2026-10-12):** PR #13 run `38227505696` passes all 775 SQL
assertions and real login lockout/concurrent admission/completion integration.
Merged master CI `38228132819` and Supabase deployment `38228132808` pass.

### A03 — P2: member mutation reports success after its audit write fails

Requirement: §7.2, member actions write the audit trail. At
`supabase/functions/members/index.ts:183`, the insertion result is ignored, then
`:190` returns `{ok:true}`. The actual handler probe allows creation but makes the
audit insertion return an error; the handler still returns HTTP 200 success.

Fix direction: establish a reliable mutation/audit write boundary, handle audit
failures explicitly, and cover compensation/retry behavior. Merely returning an
error after an already-applied mutation also needs recovery semantics.

**Remediation update (2026-10-12):** Migration `0014` makes database member writes,
their audit entries and replay receipts atomic. External Auth operations have a
durable intent before execution and an audited completion; uncertain outcomes
remain pending and prevent repeat external actions. HTTP 202 `needs_review`
shows an owner warning/reference rather than success. D032 and the event-day
runbook define reconciliation without automatic password retries. All 29 mocked
member-handler regressions pass. New pgTAP coverage and localhost real Auth/member
integration are wired into CI; their runtime acceptance remains pending because
local Supabase is unavailable.

Frontend verification: three focused owner unit tests and ten browser journeys
pass, including EN/AR review notices and all eight privileged logout routes.
Build, app/spec TypeScript, translation parity (558 keys), changed-file formatting
and whitespace checks pass. This update does not claim the complete frontend
suite or new SQL assertions have run successfully against the changed backend.

**Cloud verification (2026-10-12):** PR #13 run `38227505696` passes real member/Auth
integration and all 775 SQL assertions, including audit rollback and recovery.
Merged master CI and Supabase deployment also pass; no hosted password mutation
was performed merely to test acceptance.

### A04 — P2: required administrator audit-log reader and screen are missing

Requirements: §2.3, §8 `get_audit_log(p_event,p_limit,p_before)`, §10.3 filterable
audit list. Audit rows are written, but there is no `get_audit_log` definition,
client wrapper, route or viewer. Catalogue comparison finds this as the one
missing named RPC among the plan's 40 entries checked. Admins cannot inspect the
promised history through the app.

**Implementation update (2026-10-12):** Migration `0015` adds event-scoped,
owner/admin-only reads, server action/entity filters and precision-safe cursor
pagination. A typed online client and EN/AR `/manage/:eventId/audit` viewer show
actors, Cairo timestamps and before/after changes. New pgTAP permission/pagination
cases are prepared; 23 focused unit and 11 browser checks pass, including EN/AR
filters, pagination, escaped snapshots, axe, mobile width and nine logout routes. Runtime
database acceptance remains pending; implementation does not mark all Phase 7
requirements complete.

### A05 — P2: game-photo conversion and 1024 px resize are missing

Requirement: §7.4. `setup-page.html:306` accepts only WebP, and
`setup-page.ts:489` rejects other formats and retains the original file unchanged.
There is no decode/resize/WebP conversion. A real PNG file-input browser probe
is rejected instead of previewed. Existing WebP dimensions are not bounded;
uploading a large file can waste mobile bandwidth. Storage enforces a 5 MiB
WebP limit, which does not substitute for client resizing.

### A06 — P2: Arabic admin/owner entity names remain English

Requirement: §14.1, entity names follow the language with fallback.
`setup-page.html:235` renders `team.name_en`; game/round/staff selectors and owner
cards similarly use English fields. With both names present, the Arabic setup
browser probe expects `الصقور` and receives `Falcons (T01)`. Translation-key
parity remains green because the error is the chosen entity field.

### A07 — P2: owner remove-admin control is below the minimum touch size

Requirement: §9.3, at least 44×44 px. The button at
`owner-page.html:209` measures approximately **8.91×24 px** at 360×740. The
browser probe fails both dimensions. Existing shell button checks do not cover
this owner screen.

### A08 — P2: password reset uses an untranslated, unmasked native prompt

Requirements: §9.1 Reactive Forms; §14 runtime EN/AR. At
`owner-page.ts:133`, `window.prompt('Set password ...')` is hardcoded English and
uses a plain-text field, whereas member creation correctly uses `type=password`.
Static source finding; no real password was entered during this audit. Replace
with a localized, masked form and appropriate confirmation/error feedback.

### A09 — Incomplete Phase 7: result celebrations and printable QR sheets

Requirements: §13.6 / Phase 7. No once-only `bts.seenResults.<eventId>` tracking,
win/loss/draw result overlay, lazy confetti integration, or owner/admin printable
QR generator exists. QR deep links and their confirmation do work. Existing
referee-to-player tests assert result text; they do not verify the required
result animation. Selection animation and standings motion are present, but
round pulses/haptics/switch motion still need the planned motion review.

### A10 — Performance acceptance is not met by the local diagnostic

Requirement: Phase 7 first load below 4 s. Cold team-picker readiness measured
8.120 s EN / 7.606 s AR; first contentful paint was 5.032 s / 4.924 s.
Profile: 390×844, 400 ms latency, 1.6 Mbps download, 750 kbps upload, 4× CPU
slowdown, disabled HTTP cache, service worker blocked, mocked event backend,
uncompressed local production assets. These are reproducible diagnostic
measurements, not a hosted failure claim or physical Android acceptance.

`ngsw-config.json` also prefetches all root JS and font files, including lazy
feature chunks. Review its background bandwidth cost alongside fonts and
compression. The report does not infer that this prefetch caused the measured
delay because the timing probe explicitly disabled the worker.

### A11 — P2: generated database types/typed setup contract are missing

Requirement: §9.1 generated `core/supabase/database.types.ts` and typed wrappers.
The file is absent; `createClient` has no database generic; setup starts with
`type Row = any`. Public/live/standings contracts are hand-typed, but setup RPC
payload/response drift cannot be checked against the database. Unit tests and
compilation passing do not fulfil this requirement.

### A12 — P2: the stated exhaustive permission matrix is not demonstrated

Requirement: §17 / Phase 7, role-matrix checks for every RPC. The seven SQL suites
contain extensive positive/negative coverage and the previous cloud run passes
704 assertions. However, there are no direct test calls to `delete_team`,
`delete_game`, `delete_round` or `delete_match` anywhere in `supabase/tests`.
Generic table-denial checks and Storage deletion tests do not cover these RPCs.
`server_now` is exercised by keepalive rather than the SQL suite. The Edge
lockout/member mutation failures above are also absent from existing CI:
`test-local-auth.mjs` signs in through GoTrue directly, not through `/login`.

Do not equate the assertion count with every operation/role pair being tested.
Add the missing delete permission/state/replay cases and real local Edge
integration for username/phone, inactive accounts, lockout and member auditing.

### A13 — P3: baseline formatting and documentation inconsistencies remain

`npm run format:check` fails on 31 existing files; CI checks changed files only.
There is no lint command/config beyond formatting and TypeScript. This is
maintenance debt, not evidence that the app cannot run.

The plan still contains superseded wording: §5.2/§6.6 say staff can see hidden
results (D005 restricts it); §13.4/Phase 0 require a white header mark (D028 makes
it navy on gold); §15.1 allows production fallback for previews while §0
architecture/D006/README require separation. Historical progress/Phase 0 records
also describe earlier pending linking/deploy states; later notes report a
successful Vercel preview and owner creation, without full hosted acceptance.
Preserve history and add clear current-status pointers instead of treating old
entries as present-day verification. No acceptance status was upgraded here.

### A14 — Existing dependency advisory remains open

Fresh `npm audit --json` confirms two moderate entries (`exceljs` and its `uuid`
dependency), zero high/critical. This matches D021 and
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
It does not establish exploitability through the app. No dependency change or
automatic major downgrade was performed; retain the documented upstream review
and avoid describing the dependency audit as clean.

## Requirements traceability by area

| Plan area                                 | Implemented evidence                                                                           | Audit disposition                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| §1–2 roles and actor powers               | Auth guards, helpers/RLS, owner/admin/referee paths, SQL suites                                | Broad coverage; A01/A12 and hosted Edge integration remain                                                         |
| §3–5 architecture/schema                  | RPC domain writes, computed standings, server clock, actor-bound queue, explicit search paths  | No direct browser domain-table writes found; every statically inspected definer has explicit `public,pg_temp`; A11 |
| §6.1–6.4 lifecycle/results/caps           | DB suites plus live browser journeys and unit combination/cap checks                           | Covered behavior passes; no fresh local SQL execution                                                              |
| §6.5–6.7 standings/privacy/team selection | Shared ranks, manual ties, live recalculation, export parity, cache redaction, QR confirmation | Existing browser/unit checks pass; accepted D005/D026/D027 interpretation                                          |
| §6.8–7.3 auth/members/seed                | Auth/owner source, SQL owner suite, previous seed/GoTrue smoke                                 | A01–A03/A08; real Edge integration missing                                                                         |
| §7.4–7.7 storage/realtime/capacity        | WebP bucket policies, thin broadcast validators, 10 s fallback / jittered polling tests        | A05; no venue/load/connection-cap rehearsal performed                                                              |
| §8 RPC catalogue                          | Implemented named operations compared with migrations                                          | A04 missing reader; A12 delete coverage                                                                            |
| §9–10 frontend/screens                    | Lazy routes, OnPush/signals/forms, public/live/admin/owner UI                                  | A04–A08/A11; shared branded EN/AR shell passes                                                                     |
| §11 XLSX                                  | Real template/parser/preview/download/readback, atomic import SQL, frozen export snapshot      | Browser passes on required Node 24; unit full-run cold timeout reported separately                                 |
| §12 offline                               | IndexedDB actor scoping/FIFO/leases, cache, retry, SW offline reload                           | Existing tests pass; A01 shows a component-level privacy gap despite cache protections                             |
| §13 assets/design/motion                  | 24 avatars, brand/icons/Cairo/tokens, modal focus, standings motion                            | A07/A09; targeted reduced motion passes, full visual/device review pending                                         |
| §14 i18n/About/currency                   | 555-key audit, EN/AR journeys, Arabic plural-category tests, structured About                  | A06/A08; catalog parity is not a hardcoded-copy audit                                                              |
| §15 deployment                            | Hosting/CI/deploy/keepalive configurations, previous cloud checks                              | Configuration inspected; no new deployment, preview isolation or hosted login verification                         |
| §16–17 phase/test acceptance              | Existing suites plus new negative requirement probes                                           | Phase 7 and final acceptance remain open; fix confirmed defects before release                                     |
| §18–19 risks/out of scope                 | Reconnect/polling/privacy/error behavior reviewed; runbook present                             | No new out-of-scope feature added; venue rehearsal still needed                                                    |

## Reproduction and evidence

See `audit/README.md`. Opt-in browser diagnostics:
`npx playwright test --config=audit/playwright.config.ts`.
Actual handler diagnostics: `node scripts/audit-edge-contracts.mjs`.
Performance: `node scripts/audit-performance.mjs`.
They intentionally exit nonzero for unresolved requirements; they are not wired
into existing CI as though the product had already been repaired.

Ignored local logs: `tmp/audit-{unit,unit-node24,export-retry,browser,browser-node24,
database,format,edge,probes,privacy,performance,lighthouse}.log`.
Lighthouse reports/screenshots and performance JSON are in `artifacts/`;
Playwright retains traces for failed diagnostic cases in `test-results/`.
These generated files are local evidence, not guaranteed cross-device artifacts.
The committed report and diagnostic sources preserve the findings/reproductions.

Previous cloud evidence was read again through GitHub:
[run 38139075290](https://github.com/peter-elmasry/BTSApp/actions/runs/38139075290),
database job `114468981727`, frontend job `114468981853`. Both succeeded; the DB
log confirms 704 assertions. No new cloud run was triggered and no product SQL
changed in this audit.

## Next actions

1. Fix A01 first; test cross-tab logout and actor/role changes on every privileged
   screen, including in-flight responses and cached snapshots.
2. Fix A02/A03 and add real local Edge integration; complete delete RPC matrix
   coverage, then run fresh SQL/Edge checks on a machine or authorized runner
   with Supabase available.
3. Deliver the audit viewer, image processing, Arabic admin names, touch sizes,
   localized password form and generated database types.
4. Finish Phase 7 celebrations/QR/motion, optimize and measure the hosted build
   under an agreed Android/3G profile, then complete the runbook rehearsal.
5. Reconcile current documentation and formatting debt separately. Re-run the
   diagnostics and full suites without relaxing assertion budgets before final
   release acceptance.
