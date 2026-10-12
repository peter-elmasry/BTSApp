# Implementation prompt — BTSApp UX enhancement (U0–U8)

> Agreed scope v3.2 (2026-10-13; Schedule Cards switch kept; privacy & search added as phase P1). Every decision is final **except D-3 (auto-fill pairings)**. Phase U7b is **not authorised**. Do not build it.
>
> v3 reconciles this plan with **Phase 8** (`feat/phase-8-extensions`, D035–D040). **Where existing Phase 8 behaviour conflicts with this prompt, this prompt wins** (product-owner rule A9). The conflicts and their binding resolutions are R1–R10 in `Claude outputs/BTSApp_UX_Assessment.md` §12 (R5 resolved: Cards switch kept).

---

## Role and goal

You are the implementing engineer for BTSApp (Angular 21 + Tailwind 4 + Supabase). Implement the agreed UX plan:

- role landing pages and role-aware navigation;
- tables instead of cards for comparable data;
- a team drill-down breakdown;
- a simpler setup flow;
- clear Import/Export;
- a new round lifecycle: backdated start, End round, End & start next, late results with **no automatic void or forfeit**;
- one-tap phone contacts;
- purposeful animation.

Business rules live in Postgres. Angular is a client.

## Read first (in this order)

1. `AGENTS.md`. Follow it exactly: progress log, Conventional Commits, one logical change per commit. Pushing a branch and opening a PR after checks pass is allowed; **merging needs explicit approval**.
2. `Claude outputs/BTSApp_UX_Assessment.md`: the agreed assessment, including **§12 Reconciliation with Phase 8**. Source of truth (it stays in that folder).
3. `docs/IMPLEMENTATION_PLAN.md` §2, §6, §9, §13 and **§20 (Phase 8)**.
4. `docs/DECISIONS.md` (latest **D040**; read D035–D040 closely), `docs/FUTURE_PLANS.md` (out of scope) and the newest `docs/PROGRESS_LOG.md` entry.
5. Code:
   - `src/app/app.routes.ts`, `src/app/layout/*`, `src/app/features/**`;
   - `features/manage/manage-nav.*`, `features/referee/referee-schedule.*`, `features/public/schedule-model.ts`, `core/player/scoring.ts`, `core/player/team-selection.store.ts`;
   - `supabase/migrations/0007`, `0008`, `0009`, `0016_game_referees.sql`, `0017_lives_scoring.sql`.

## Preconditions (stop and report if not met)

- `feat/phase-8-extensions` is merged (`master` @ `a827d45`, PR #18, verified identical to the reviewed branch). Start from `a827d45` or later, with `git status` is clean on an up-to-date `master`. Never stash, commit, discard or rebase someone else's work.
- Re-read `PROGRESS_LOG.md` after pulling. If newer merged work touches files below, adapt to it. Where it conflicts with this prompt, **this prompt wins**; record the override in `DECISIONS.md`. Never silently revert unrelated work.
- If the highest decision number is no longer D040, or the highest migration is no longer `0017`, renumber everything below to the next free numbers.

## Non-negotiable rules

- **Angular:** standalone components, signals, `OnPush`, `@if/@for`, `inject()`, Reactive Forms, `templateUrl`. No `@angular/animations`. Use `animate.enter` / `animate.leave` + CSS.
- **RTL:** logical utilities only. Verify every screen in `ar` and `en`.
- **i18n:** every string goes in `public/i18n/en.json` and `ar.json` (Egyptian colloquial). `npm run test:i18n` passes.
- **Design rules:** color rules from plan §13.2. Never color-only meaning. Touch targets ≥ 44 px. No horizontal page scroll at 360 px.
- **Bundle:** initial bundle < 500 kB. Keep ExcelJS lazy.
- **Motion:** `prefers-reduced-motion` makes all motion instant.
- **Server owns the rules:** the server enforces every permission. No client-side scoring: points **and lives** shown anywhere come from RPCs (this replaces Phase 8's client `teamLives`, R6).
- **Both scoring modes:** every table, KPI, drill-down and count-up must work in `POINTS` and `LIVES` mode (D038). Test both.
- **Breaks (D037):** every schedule-like table shows break rows ("☕ Break") where a game has no match in a regular round.
- **Phone privacy:**
  - Phone numbers come only from the staff RPCs defined in U3, scoped by role.
  - Never add phones to public RPCs, exports or the audit UI.
  - Guide phones to players stay governed by `show_guide_phone`.
- **Round rules:** **never** auto-void or auto-forfeit matches. Ending a round leaves pending matches `SCHEDULED`.
- **Commits:** the repo's configured identity, **no AI co-author or session trailers**.

---

## U0 — Decisions (branch `codex/ux-u0-decisions`)

- Keep both files in `Claude outputs/` (the product owner's choice). Reference the assessment from `IMPLEMENTATION_PLAN.md` §21 (new, short: "UX enhancement — see `Claude outputs/BTSApp_UX_Assessment.md`").
- `docs/DECISIONS.md` (newest first):
  - **D041 — Ending a round keeps late results.** "End round no longer requires every result. Matches still `SCHEDULED` stay `SCHEDULED` as late results and score 0 (or cost no life) until entered. Nothing is voided or forfeited automatically. The assigned referee may enter the first result of a late match; corrections in an ended round are event-admin only. 'End & start next round' is two operations: end, then start."
  - **D042 — Backdated round start.** "An admin may start a round 'X minutes ago' (0–180). `started_at` may not precede the previous round's `closed_at`. The team lock (D035) and scoring lock (D038) key off `started_at` unchanged."
  - **D043 — Staff contacts.** "Admins/owners see referee and guide phones; referees see guides of teams at their station and event admins; guides see event admins. Delivered only through role-scoped staff RPCs with one-tap `tel:` links. Public referee names (D036) are unchanged and never carry phones."
  - **D044 — Logged-in guides and the team lock (amends D035).** "A signed-in member with GUIDE in the current event is set to their guided team on login, even after the lock, and may switch only among the teams they guide. Anonymous devices remain locked as in D035."
  - **D045 — Manage navigation and Import/Export (amends D040).** "The section bar is Control · Results · Adjustments · Standings · Setup · Audit, rendered once by `ManageLayout`. Import and Export are permanent labelled toolbar buttons, not sections."
- `IMPLEMENTATION_PLAN.md`:
  - §6.1: update the `start_round` row (backdating) and the `close_round` row (UI label "End round", no pending block).
  - Phase 5 acceptance: replace "close blocked while a match is pending" with "ending a round with pending matches keeps them as late results; nothing is auto-voided".
  - §20: note the D035 amendment (D044) and the D040 amendment (D045).

---

## U1 — Shared UI foundations (`codex/ux-u1-foundations`)

Create in `src/app/shared/ui/`:

### `ds-data-table`

- **Inputs:**
  - `rows`, `columns: DsColumn<T>[]`, `trackBy`, `caption` (sr-only), `loading`, `emptyText`;
  - `rowStatus?(row): 'live'|'pending'|'late'|'done'|'void'|'queued'|null`;
  - `highlight?(row)`;
  - `sort?`.
- **`DsColumn<T>`:** `{ key, header (i18n key), cell: TemplateRef|((row)=>string), priority: 1|2|3, align, numeric?, sortable?, width? }`.
- **Structure:** real `<table>` + `<caption>` + `<th scope="col">`, sticky header, inside `role="region" tabindex="0" aria-label`.
- **Column priority:** p1 always, p2 ≥ `sm`, p3 ≥ `lg`. Below `sm`, if columns are hidden, add a per-row disclosure button that inserts an expand row with label/value pairs.
- **Row styling:** status = 4 px inline-start accent bar. Highlight = `bg-gold-soft`.
- **Outputs:** `(rowClick)` and `(cellAction)` (for in-cell buttons such as a team name or a phone). Keyboard: Enter/Space on a focused row.
- **States:** skeleton (3 rows). Empty state uses a full-width cell. Numeric cells are `tabular` and aligned to the end.

### Other components

- `ds-tabs` component: segmented, `items {id,labelKey,badge?}`, `active` model, sliding indicator (RTL-aware), `role="tablist"`, arrow keys.
  - It **must render the existing D040 classes** `.ds-tabs` / `.ds-tab` (and the `.sub` teal variant for second-level tabs) and only add the indicator element + its CSS.
  - Don't create parallel tab styles. Reuse `ds-card`, `ds-actions`, `ds-page-header` and `ghost-danger` wherever they fit.
- `ds-status-pill`: Scheduled · Live · Pending · Late · Done · Void · Queued (icon + text + token color). 200 ms pop on change.
- `ds-outcome`: ✓ Win / = Draw / ✗ Loss / ⊘ Forfeit, always icon + word.
- `ds-phone-link`: `{name, phone}` → `<a href="tel:…">` with 📞, name and `dir="ltr"` number. ≥ 44 px. Renders nothing when the phone is null.
- Move `features/standings/count-up.ts` → `shared/ui/count-up.ts` (keep the selector `app-count-up`, add a `duration` input, default 600) and update imports.
- `ds-timer-ring`: SVG ring from `ServerClockService` + round `started_at`/`duration_min`/`extension_min`. Red slow pulse in overtime. Text `dir="ltr"`.
- `ds-bottom-sheet`: slide-up/fade enter/leave. Add a `size: 'auto'|'full'` input (full = drill-down).
- **Route transitions:** `provideRouter(routes, withComponentInputBinding(), withViewTransitions())`. In `styles.css`, 180 ms fade + 8 px slide, mirrored under `[dir=rtl]`, disabled under reduced motion.

**Acceptance:** unit tests for column priority, row expand, keyboard activation, empty/loading, tab keyboard nav, phone link null case. `npm test`, `build`, `test:i18n`, `format:check` (changed files).

---

## U2 — Landing, navigation, Import/Export placement, Now sheet (`codex/ux-u2-navigation`)

### Landing resolver

`core/auth/landing.ts`, `landingFor(profile, currentEventId)`:

1. OWNER + current event → `/manage/{id}/live`; OWNER without one → `/owner/events`.
2. EVENT_ADMIN of the current event → `/manage/{id}/live`.
3. REFEREE in the current event → `/ref`.
4. GUIDE in the current event → `/home`, and auto-select the guided team in `TeamSelectionStore` when none is selected or the selected team isn't theirs. If they guide several teams, open the picker filtered to their teams.
   - **D044 / R2:** extend `TeamSelectionStore` with `guidedTeamCodes` (from the profile's GUIDE roles in the current event).
   - `canChange` is true for a signed-in guide **only for codes in `guidedTeamCodes`**, even when `locked()` is true.
   - Auto-selecting the guided team bypasses the lock.
   - Anonymous behaviour (D035) is unchanged.
   - Unit-test: lock + guide with 1 team, lock + guide with 2 teams, lock + anonymous, guide trying a non-guided team (refused).
5. Otherwise → `/home`.

Use it after login when there's no valid `returnUrl`, and in a new `landingGuard` on `''` that runs before `teamChosenGuard` for staff sessions. Unit-test every branch.

### Bottom nav

`navigationFor(profile, event, canSeeStandings)` (pure, unit-tested):

- Player/Guide: Home · Schedule · Standings* · About.
- Referee: My station · Schedule · Standings* · More.
- Admin/Owner: Control · Results · Standings · Setup · More.

The **More** sheet holds:

- About and player Home.
- Display.
- Audit (admin).
- **Import from Excel** and **Export to Excel** (admin).
- Members & events (owner).
- Language.
- Change password.
- Logout.

### Header

Remove 🔑 and Logout. Staff get an initials button that opens an account sheet: name, roles in the current event, Members & events (owner), change password, logout. Keep the logo, event name, team chip (with a "Guide" label for guides) and the language toggle.

### `ManageLayout`

`/manage/:eventId` renders `features/manage/manage-layout.ts`:

- An event name line.
- A sticky `ds-tabs` sub-nav: Control · Results · Adjustments · Standings · Setup · Audit.
- A **toolbar with two permanent labelled buttons**: **⬆ Import (Excel)** → `/manage/:id/import`, and **⬇ Export (Excel)** → opens the export sheet (U4). On < 640 px they show icon + short label ("Import", "Export"), never icon-only.
- A `<router-outlet>`.

Add the child routes `results` and `adjustments`.

**Reuse Phase 8's `app-manage-nav`** (D040), rendered **once** inside `ManageLayout`, and remove the per-page `<app-manage-nav>` includes from `live-page`, `setup-page`, `manage-standings-page`, `audit-page` and `import-page`.

- Change `MANAGE_SECTIONS` to `live` (label **Control**), `results`, `adjustments`, `standings`, `setup`, `audit`.
- **Remove `import`** from the sections; it moves to the toolbar (D045 / R3).
- Keep the route path `live` so existing links and tests stay valid.
- Import keeps "Back to setup".
- Update `e2e/admin-layout.spec.ts` to the new sections.

### Now sheet

The round banner becomes a button for all roles and opens `features/live/now-sheet.ts`:

- **Player/Guide:** current match (game, location large, opponent, outcome) + next match. Guides also see an event-admin contacts list (`ds-phone-link`, U3 B6).
- **Referee:** assigned matches in the active round with status pills, the guides of those teams with `ds-phone-link`, and an "Open My station" button.
- **Admin:**
  - Completed x/y, Pending, Late (count-up).
  - Pending table (Game · Referee `ds-phone-link` · Teams).
  - Buttons: **+5**, **End round**, **End & start next round** (U3 flows).

With no active round, staff see "Next: Round N" + **Start round**.

**Acceptance:** Playwright 390×844, `ar`+`en`, mocked RPCs. Owner, admin, referee and guide each land correctly and see the right nav. The Import/Export buttons are visible on every manage page. No manage page renders its own cross-links.

---

## U3 — Backend: round lifecycle, contacts, breakdown (`codex/ux-u3-backend`)

Migration **`supabase/migrations/0018_ux_round_contacts_breakdown.sql`** (0016/0017 belong to Phase 8). Keep every old RPC signature working as a wrapper, so queued offline ops from older clients still replay.

`get_bootstrap` was last redefined in `0016_game_referees.sql` and `phase6_standings` / `phase4_event_json` in `0017_lives_scoring.sql`. Build on **those** definitions; don't copy older ones from 0007–0009.

### B1 — End round

Change the `close_round` branch of `phase5_round_mutation`:

- Remove the `PENDING_MATCHES` failure.
- Collect `v_late` = ids of `SCHEDULED` matches in the round.
- Set the round `CLOSED`. **Do not modify any match.**
- Audit `after` includes `late_match_ids`. Return `round json || {late_match_ids}`.
- Emit `round_changed`.

### B2 — Late first submission

In `phase5_match_mutation`, after the event lock, the non-admin round check becomes: allowed if `v_round.status='ACTIVE'` **or** (`v_round.status='CLOSED'` and match status `'SCHEDULED'` and `p_action='submit_match_result'`). Otherwise `ROUND_NOT_ACTIVE`. Referee match adjustments and revocations stay `ACTIVE`-only.

### B3 — Backdated start

`start_round(p_op_id uuid, p_round uuid, p_started_minutes_ago int)`:

- `p_started_minutes_ago` must be 0–180, else `INVALID_START_OFFSET`.
- `v_start := now() - make_interval(mins => p_started_minutes_ago)`.
- If the event's max `closed_at` (other rounds) > `v_start`, fail `START_BEFORE_PREVIOUS_ROUND_END`.
- All existing start preconditions still apply. `started_at = v_start`.
- Include the offset in the op-name payload and the audit `after`.
- The 2-arg `start_round` stays as a wrapper with offset 0.

### B4 — `get_referee_board`

- For referees, return their assigned matches in rounds `DRAFT`/`ACTIVE` plus `SCHEDULED` matches in `CLOSED` rounds. Admins get all such matches.
- Per match, add `bucket` (`current`|`upcoming`|`late`) and `editable` (`ACTIVE` or late `SCHEDULED`).
- Add `team_guides: [{team_id, member_id, name_en, name_ar, phone}]` for teams in the returned matches, active members only.

### B5 — `get_live_event` (admin/owner only)

Add `game_referee_contacts: [{game_id, member_id, name_en, name_ar, phone}]` and `team_guides` (same shape as B4). This name avoids confusion with the public `games[].referees` names from D036, which `get_live_event` inherits through `get_bootstrap` and must keep returning unchanged.

### B6 — `get_event_contacts(p_event uuid)`

- Returns event admins `[{member_id, name_en, name_ar, phone}]` (active, phone not null).
- Allowed for owners or members holding EVENT_ADMIN/REFEREE/GUIDE in `p_event`, else `FORBIDDEN`.
- `security definer`, `search_path=public,pg_temp`. Grant to `authenticated` only.

### B7 — `get_standings`

Add top-level `pending_results int`: count of `SCHEDULED` matches in `CLOSED` rounds of the event. It's visible to whoever can see standings.

### B8 — `get_team_view` (mode-aware, D038)

- Add top-level `scoring_mode`.
- **POINTS:** per match `points` (the team's outcome points), plus subtotals `match_points`, `adjustment_points`, `total`.
- **LIVES:** per match `lives_delta` (−1 for LOSS/FORFEIT on a COMPLETED match, else 0), plus `initial_lives`, `lives_lost`, `match_points` (lives from matches, floored at 0), `adjustment_points` and `lives_left` (= `greatest(0, match_points + adjustment_points)`).
- Compute both from the **same expressions as `phase6_standings` in 0017**; extract a shared SQL helper if needed, so they can't drift.
- Keep every existing visibility rule. As today, a team's own outcomes are always returned; other values only appear where outcomes are already returned to that caller.

### pgTAP

New **`supabase/tests/0012_ux_round_contacts.test.sql`** (0011 is Phase 8). Update the existing Phase 5 tests that assert `PENDING_MATCHES`. Also run `0011_phase8.test.sql` to check team-lock, lives and referee-name behaviour still pass.

- **End round:** ending with pending → `CLOSED`, matches unchanged (`SCHEDULED`, outcomes `PENDING`), `late_match_ids` returned, **no VOID/FORFEIT written**.
- **Late submission:**
  - Assigned referee's first submit on a late match → ok.
  - Referee correcting a late `COMPLETED` match → `ROUND_NOT_ACTIVE`.
  - Unassigned referee → `FORBIDDEN`.
  - Anon → denied.
  - Referee adjustment in an ended round → `ROUND_NOT_ACTIVE`.
- **Backdated start:** offset 0 / 30 / 181 (fails); start earlier than the previous `closed_at` fails; the old 2-arg start still works.
- **Idempotency:** same op_id twice → applied once (start and end).
- **Board:** buckets/editable correct; `team_guides` present for the referee's matches only.
- **Phones:** `game_referee_contacts`/`team_guides` absent for non-admins in `get_live_event` (FORBIDDEN). `get_event_contacts`: guide/referee/admin allowed; anon and non-staff denied. **No phone field appears in** `get_bootstrap`, `get_schedule`, `get_standings` or the export data (except the existing guide-phone rule).
- **Totals, POINTS event:** for every team, Σ `get_team_view.points` + `adjustment_points` = `get_standings.total`.
- **Totals, LIVES event:** `lives_left` = `get_standings.total`, including the floor at 0 (one team driven below zero by penalties).
- `pending_results` correct in both modes. A late match in a LIVES event costs no life until entered.
- **Backdated start with D035/D038:** a backdated start counts as "a round started" for the team lock and the scoring lock.
- **Phone privacy:** `get_bootstrap.games[].referees` still contains names only (no phone, no id) after this migration.

**Acceptance:** `npm run test:db` passes locally and in CI. Update the RPC wrappers/types in `core/live/live-api.ts`, `core/standings/*` and `core/player/public-api.ts`.

**Remove client lives math (R6):** switch Home, Schedule, Team page and the life-lost overlay data source to the B8 values. Delete `teamLives` from `core/player/scoring.ts` and its spec cases. Keep `isLivesMode`, `lifeEmoji`, `costsLife` and `LIFE_EMOJI_SUGGESTIONS`. The overlay trigger still uses newly completed own-team matches with `costsLife(outcome)` and `bts.seenLosses.*` (D038 unchanged).

---

## U4 — Admin Control, Results, Adjustments, Export, drill-down (`codex/ux-u4-admin`)

### Control (`live-page`)

- **Sticky header:** round selector (`ds-tabs`, scrollable), `ds-timer-ring`, status pill, KPI chips with `app-count-up`: Completed x/y · Pending · **Late** · Adjustments. Show a tie banner linking to Standings when unresolved ties exist.
- **Action bar** above the bottom nav:
  - DRAFT: **Start round**.
  - ACTIVE: **+5 · +10 · ⋯ (custom minutes)** plus **End round** and **End & start next round** (the latter only if a next `DRAFT` round exists, by lowest number greater than the current one).
  - CLOSED: ⋯ Reopen (existing, reason required).
- Overtime turns the bar red with "Overtime +mm:ss". Remove the duplicate overtime block.
- **Start round sheet:** radio "● Now ○ [__] minutes ago" (number 1–180), live "Ends at HH:mm (Cairo)", warning when already past the end ("Starts in overtime"). Confirm → `start_round(op, round, offset)`.
- **End round sheet** (R1: replaces Phase 8's sheet that hides Confirm while matches are pending, and the old `live.closeBlocked` copy):
  - No pending: "End Round N?" + Confirm.
  - Pending: "n matches have no result. They stay open as **late results**: the referee or an admin can still enter them. Nothing is cancelled." List the pending matches (Game · Referee `ds-phone-link`), then Confirm.
- **End & start next sheet:** the same pending notice + the next round's "● Now ○ [__] min ago" + Confirm.
  - Queue `close_round` then `start_round` with separate op ids.
  - If start fails, show the error with **Retry start** (new op id).
  - Toast on success: "Round N ended · Round N+1 started".

### Results (new `features/manage/results-page.ts`)

- `ds-data-table` per selected round, sorted late → pending → done → void.
- Columns: Game (+location) p1 · Matchup p1 (team names are cell actions → drill-down) · Result/Status p1 · Referee `ds-phone-link` p2 · Entered by/at p3 · ⋯ p1.
- Tapping the row (outside a team name) opens the **result sheet**. Extract the entry UI from `match-entry-page` into `features/live/result-entry.ts` and reuse it in both places. Admins never navigate to `/ref/match/:id`.
- ⋯ menu: Correct · Reset · Void (manual, reason required, existing RPC) · View in audit.

### Team drill-down (A7)

New `features/standings/team-breakdown-sheet.ts` (`ds-bottom-sheet size="full"`). Input: team code. Data: `get_team_view` (B8).

- **Header:** avatar, name, rank/total when visible, guide(s) via `ds-phone-link` (staff: always; public: only when `show_guide_phone`).
- **Matches table:** Round · Game · Opponent(s) · `ds-outcome` · **Pts** (POINTS) or **Lives −1 / 0** with the event emoji (LIVES) · Entered by/at (staff, p3).
- **Lives events:** the header shows `ds-lives-meter` (Phase 8). The footer reads "Starting N − lost X + adjustments Y = lives left Z".
- **Adjustments table:** Points · Scope · Reason · By · Time. Revoked rows shown struck through to staff only.
- **Footer:** "Match points X + Adjustments Y = Total Z" with count-up.
- **"Open full page"** → `/teams/:code`.

Open it from: the Results team cells, admin Standings rows, Leaderboard rows, Home top-5 rows and the Display "results" view (not the display standings).

### Adjustments (new page)

- Table: Team (drill-down) · Scope · Points · Reason · By · Time · Status · ⋯ (Revoke).
- Filters: scope, team, show revoked.
- "Add" sheet reusing the `adjustments-panel` logic, with current total → projected total via count-up.
- Remove the event-adjustments panel from Control.

### Export (A8)

Replace the two-step "Prepare export / Download" with an **Export sheet** opened from the toolbar, the More sheet and the Standings primary button "⬇ Export standings (Excel)".

- The sheet lists the included sheets (Standings, Matches, Adjustments, Staff), notes "phone numbers are not included", and shows the Cairo timestamp.
- **Download .xlsx**: fetch one fresh snapshot → generate → download immediately, using the existing `export-workbook-service`. The file must equal that snapshot.
- Secondary link "Preview first" keeps the current preview behaviour.

### Standings

- Keep the table. Rows open the drill-down.
- Visibility toggle only here: remove `leaderboard_public` from the Setup form; the server and import are unchanged.
- Footnote when `pending_results > 0`.

**Acceptance (E2E):** backdated start (10 min ago) → enter 3 results inline → correct 1 → manually void 1 → End & start next with 1 pending → the pending match shows as Late → drill-down totals equal the standings total → export downloads in one tap. The admin never leaves `/manage/:id/*`.

---

## U5 — Referee "My station" (`codex/ux-u5-referee`)

- **Now:** a hero card per `current` match: game, location, both teams (avatar + name), each team's guides via `ds-phone-link`, status pill, timer ring, and a large Enter/Correct result button.
- **Late:** `ds-data-table` (Round · Game · Teams · ⋯). Tap → result sheet (first entry only; the server enforces it).
- **Upcoming:** reuse Phase 8's `referee-schedule` (round × game table with breaks, D037) as this section (R8). Keep its active-round highlight. It stays read-only and keeps reading the public schedule, so hidden outcomes stay hidden. Late/editable state comes from B4, not from this table.
- **Event admins** contacts collapsible at the bottom (B6).
- Queued-offline pill per row from `OpQueueService`.
- **Match entry page:**
  - Use `result-entry`.
  - Adjustments behind "+ Bonus / − Penalty" (sheet).
  - After confirm or queue → navigate to `/ref` with toast "Saved · Next: {game} – Round {n}".
  - Back link → `/ref`.

**Acceptance:** before round 1 starts, the referee sees Upcoming. After Start, Now appears via realtime or polling. After End round, an unentered match moves to Late and can be submitted once, and a second submit is refused.

---

## U6 — Player & guide screens (`codex/ux-u6-public`)

- **Home:**
  - Now hero: game, **location `text-xl`**, opponent avatar + name, timer ring, `ds-outcome` when done, "Next station" when the current one is done.
  - Next matches table (Round p1 · Game+location p1 · Opponent p1 · Status p2).
  - Top-5 table (# · Team · Total; W-D-L p2) → drill-down.
  - Keep pull-to-refresh.
- **Schedule (D039 kept, A10):** keep the Table/Cards switch and `bts.schedule.view` exactly as Phase 8 built them. Rebuild **only the Table view** on `ds-data-table` per group: Game+location p1 · Matchup p1 · Result p1 · Status p2.
  - Keep break rows and active-round highlighting from `schedule-model.ts` (D037). Highlight my team's row. When my team has no match in a round, show "Resting this round".
  - The Cards view stays unchanged. Existing `view-cards` tests must keep passing.
  - No images in table rows.
- **Lives events (D038):**
  - The Now hero and team header show `ds-lives-meter` from server values (B8).
  - Standings and drill-down tables label the total column **Lives** with the event emoji.
  - The life-lost overlay keeps playing on Home/Schedule.
- **Team page (`/teams/:code`):** same content as the drill-down, full page.
- **Game detail:** image header + one table per round.
- **Leaderboard:**
  - Table variant of `standings-list`: # p1 · Team (avatar, name, tie/my-team badges) p1 · W-D-L p1 · **Total** p1 · P p2 · F p2 · Adj p2.
  - Keep FLIP (`rank-motion.ts`) applied to `<tr>`, count-up and auto-scroll to my team. Rows → drill-down.
  - Footnote for `pending_results`.
  - `display` mode keeps its large layout.
- **Guide:** "Guide" chip in the header. Event-admin contacts in the Now sheet and the account sheet.

**Acceptance:** Playwright screenshots at 360×740 and 390×844, AR+EN, for Home / Schedule / Leaderboard / Team page / drill-down. Assert `document.documentElement.scrollWidth <= innerWidth`.

---

## U7 — Setup checklist, manual schedule grid (`codex/ux-u7-setup`)

`setup-page` becomes a `ds-tabs` stepper with completion ticks derived from data.

1. **Basics:**
   - Name EN/AR, date, and **Scoring mode** (Phase 8 D038 control, moved here): Points → preset radio (2/1/0 default · 3/1/0 · Custom → 3 number fields); Lives → starting lives (1–99) + emoji (10 suggestions + free text).
   - Mode and starting lives are disabled with an explanation once any round has started (`SCORING_LOCKED`). The emoji stays editable.
   - **Advanced** `<details>`: event code (owner), the 5 currency forms + the existing live preview, the 4 caps, `show_guide_phone`.
   - **Remove the `leaderboard_public` checkbox** that still exists in Phase 8's settings form (D-5 / R4).
   - Top card: "Have the event in Excel? **⬆ Import from Excel**" + "**Download blank template**" (existing template generator).
2. **Teams:** editable table (Avatar · Name EN · Name AR · Color · Guides with `ds-phone-link` · ⋯).
   - **Add N teams** sheet (1–40): codes `T01…` continue from the max existing code, avatars round-robin over unused `avatars.json` keys, colors from a 12-swatch palette in `setup-helpers.ts`, names "Team n" / "فريق n".
   - Avatar = visual grid sheet with labels. Color = swatches + custom.
3. **Games:** editable table (Image · Name · Location · Referees chips with `ds-phone-link` · ⋯). **Add N games** (`G01…`). Assign referees from here via `set_referee_games`.
4. **Schedule (manual grid):**
   - Rows = rounds (number, type, duration, status), columns = games. A cell shows "Team A vs Team B" by **name** and opens a 2-select sheet that excludes teams already used in that round.
   - In-cell conflict icon + text for a repeated pair or a duplicate team (the server still validates).
   - **Add N rounds × M minutes**. Opening toggle "Round 0 = opening game (all teams)" + game select → `generate_opening_match`.
   - Cells of started rounds are read-only.
   - Empty cells in regular rounds show "☕ Break" (D037, replacing Phase 8's break chips under the old match builder). The old one-match-at-a-time builder with team **codes** is removed (R7).
   - **Do not build auto-fill (U7b, D-3 open).**
5. **Staff:** table (Member · Role · Assignment · Phone `ds-phone-link` · ⋯) + "Add" sheet with member search. Event-admin role options for owners only (unchanged).
6. **Review:**
   - Checks: each team at most once per round; every regular match has 2 teams; every game used in a round has ≥ 1 referee; ≤ 1 opening round; ≥ 1 round.
   - Each failure gets a "Fix" link that switches step and highlights the item.
   - Buttons: **Go to Control**, **⬇ Download setup as Excel** (existing live-data workbook export used by the import template).

Bulk adds call the existing RPCs sequentially through the op queue with a count-up progress ("12/40"). No new server rules.

**Acceptance (E2E):** from an empty event, build 8 teams, 8 games and 7 rounds × 15 min, fill the grid and pass Review. Existing setup/import tests still pass.

---

## U8 — Owner (`codex/ux-u8-owner`)

- **Members table:** Name · Username · Phone `ds-phone-link` p2 · Login · Status · Event roles p3 · ⋯, with search.
  - Create/Edit in sheets. The create sheet explains the temporary-password convention (D030).
  - ⋯ menu: Set password (**reuse Phase 8's masked password sheet**, D040/A08; don't rebuild it) · Deactivate/Reactivate.
- **Events table:** Event · Date · Status · Current · Admins · ⋯.
  - "New event" sheet: Name EN/AR + Date. Code auto `BTS-YYYY` (suffix `-2`, `-3` if taken), editable under Advanced.
  - Row actions: Open Control · Open Setup · Set current · Manage admins (sheet).

---

## Animation checklist (verify across phases)

- Route fade/slide (view transitions), mirrored in RTL.
- Tab sliding indicator + content fade.
- **Count-up:** Control KPIs, referee counts, standings totals, home rank/total, drill-down reconciliation, setup/bulk progress, import counts, adjustment projected total.
- Timer ring depletion. Overtime red pulse. Banner slide-in on start.
- Status-pill pop. Teal row flash on result save. Realtime rows fade in (30 ms stagger, max 10).
- Sheets slide up.
- **Reduced motion:** Playwright with `reducedMotion: 'reduce'` asserts `document.getAnimations().length === 0` after settle on Control and Leaderboard.

## Definition of done (every phase)

`format:check` (changed files) · `test:i18n` · `npm test` · `npm run build` (initial < 500 kB) · `test:e2e` · `test:db` when SQL changed. Update `PROGRESS_LOG.md` (STARTED → HANDOFF/DONE), README sections whose behaviour changed (Live operations, Player experience, Standings and export, Event setup import) and `EVENT_DAY_RUNBOOK.md` (End round / late results / backdated start). Stop after each phase and report: changes, checks and results, blockers, next step.

## Do not

- Do not auto-void or auto-forfeit anything, in SQL or UI.
- Do not build auto-fill pairings (U7b) until D-3 is decided.
- Do not expose phones outside the role-scoped staff RPCs (B4–B6) and the existing guide-phone rule.
- Do not compute points client-side, change the import workbook contract, or remove the import flow.
- Do not touch others' uncommitted work. Push + PR per `AGENTS.md`; never merge without explicit approval.
- Do not keep a Phase 8 behaviour that §12 R1–R10 overrides "for compatibility". Override it, update its tests, and record the decision.
- Do not change unrelated Phase 8 behaviour: team lock for anonymous devices, breaks derivation, public referee names, lives rules, life-lost animation, import v4.

---

## P1 — Privacy and search (agreed 2026-10-13, branch `codex/ux-p1-privacy`, after U4)

- **D046 visitor scope:** `core/player/viewer-scope.ts` (`ViewerScope`, `teamPageGuard`, `memberOnlyGuard`). Visitors: schedule "My team" only; other teams' pages and all game pages redirect to Home; names are plain text in match cards, break cards, schedule tables and standings rows. Members unchanged. Every later screen (U5–U8, drill-downs) must use `ViewerScope` before linking to a team or game.
- **D048 phones:** never render a phone for visitors except their own team guide's (server already gates it with `show_guide_phone`).
- **D049 search:** `ds-data-table` searches automatically above ten rows (pass `searchText` when cells are templates); use `ds-search-select` for any dropdown that can exceed ten options.
- **D047 logout:** `AuthStore.logout()` calls `clearDeviceData` (local/session storage except `bts.lang`, `OfflineDb.destroy()`, Cache Storage); the menu warns about unsent operations and reloads the app. Forced password change returns to `returnUrl` or the landing page.
- **Delivery:** at the end, create `codex/ux-enhancement` at the final commit; the product owner raises one PR from it into `master`.
