# BTSApp — UX Assessment & Enhancement Plan

| | |
|---|---|
| **Status** | AGREED v2 (2026-10-12), except **D-3 auto-fill pairings (open)**. No code changes until the in-flight `master` work is merged. |
| **Basis** | Code review of `master` @ `df28e10` (routes, all feature templates, `0008_phase5_live.sql`, `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_AUDIT.md`). Screen-level claims are from templates, not a device session. |
| **Confidence tags** | **[Confirmed]** seen in code · **[Likely]** strong inference · **[Guess]** assumption to verify |

---

## 0. Agreed decisions log

| # | Decision | Status |
|---|---|---|
| A1 | The round has two end actions: **End round** and **End & start next round** | Agreed |
| A2 | Ending a round with missing results keeps them as **late results**. **No automatic cancellation (void) or forfeit, ever.** Manual void of a single match stays an existing admin action | Agreed |
| A3 | Tables replace cards where data is compared (§4). Cards stay only where listed | Agreed (initial; review after U6 screenshots) |
| A4 | When starting a round, the admin can say it **started X minutes ago** (backdated start) | Agreed |
| A5 | Guide and referee phone numbers are shown to the roles in §1.1, with **one-tap call** | Agreed |
| A6 | Uncommitted work on `master` will be merged first. UX work starts from the updated `master` | Agreed |
| D-1 | Logged-in guides get their team auto-selected | Yes |
| D-2 | Contacts: admins see referee + guide phones. Guides see event-admin phones. Referees see the guides of teams at their station | Yes (all) |
| D-3 | Automatic round-robin "Auto-fill pairings" in setup | **Open**: see §2.5 |
| D-4 | Round-close rule | Answered by A1 + A2 |
| D-5 | Remove the leaderboard-visibility checkbox from Settings (keep only the confirmed toggle on Standings) | Yes |
| D-6 | Owner area moves from the bottom nav into the account menu | Yes |
| A7 | Pressing a team in any results/standings table **drills down** to that team's match-by-match breakdown | Agreed |
| A8 | Import and Export become clearly labelled, always-findable buttons | Agreed |

---

## 1. Key findings (unchanged facts)

1. **Ending a round is blocked by design.** [Confirmed] `close_round` raises `PENDING_MATCHES` while any match is `SCHEDULED`. Only one round can be `ACTIVE`, so one missing result stops the event. Fixed by A1 + A2.
2. **No role has a landing page.** [Confirmed] After login everyone goes to `/home`.
3. **The manage area has no navigation of its own.** [Confirmed] Each page hard-codes a different set of text links. "Results" and "Adjustments" screens don't exist.
4. **Admins leave the admin area to enter a result.** [Confirmed] They go to `/ref/match/:id`, whose back link goes to `/ref`.
5. **Referees see nothing between rounds.** [Confirmed] `get_referee_board` returns only matches in the `ACTIVE` round.
6. **Setup is one record at a time, and uses codes.** [Confirmed] The match builder shows team codes, the avatar picker shows raw keys, and each match is one form submit.
7. **Everything is a card.** [Confirmed] Only the admin standings page uses a table.
8. **Leaderboard visibility can be changed in two places**, one of them without confirmation. [Confirmed]
9. **Import and export are hard to find.** [Confirmed]
   - Import is reached only by a text link in the Setup header.
   - Export lives on the Standings page and takes two steps ("Prepare export", then "Download"), with no file-type cue.
   - Neither appears in Control, the nav or the account menu.

---

## 2. Roles, permissions, info needs and landing pages

### 2.1 Role matrix

| Role | Event-day responsibilities | Can do (server) | Must see in ≤ 1 tap | Contacts shown (A5) | Landing page |
|---|---|---|---|---|---|
| **Player** (anonymous) | Find the next game, get there, follow results | Pick/switch team; read schedule/team/game; standings when public | My next match: game, **location**, opponent, time left · my results · rank (if public) | Guide phone only if the event's `show_guide_phone` is on (existing rule) | No team → `/choose-team`; else `/home` |
| **Guide** | Lead one team between stations | Same as player | Same as player + "Next station" + team schedule table | **Event admins' phones** | `/home` with their team **auto-selected** (D-1). Several teams → picker limited to theirs |
| **Referee** | Run 1..n stations, record results, match bonuses/penalties | Results for assigned games while round `ACTIVE`; **first result of a late match** (A2); match adjustments in `ACTIVE` | My station(s) now/next/late · teams · status · time left · pending uploads | **Guides of the teams at their station**; event admins | `/ref` "My station" |
| **Event Admin** | Clock, chasing results, corrections, adjustments, standings reveal, import/export | Full event control | Round state + timer · completed/pending/late · who refs each pending station · standings · adjustments | **Referees and guides** (all) | `/manage/:eventId/live` "Control" |
| **Owner** | Members, events, admins; usually runs the event too | Everything | Same as admin + members/events | Same as admin | Current event → Control; none → `/owner/events` |
| **Big screen** | Venue display | Read-only | — | None | `/display` |

### 2.2 Phone-number exposure (A5): privacy boundary
- Phone numbers come **only from staff RPCs**, scoped to the viewer's role in that event. Public RPCs never return referee or admin phones.
- Guide phones to players remain controlled by the existing `show_guide_phone` flag.
- Every phone shows as a `tel:` button with a 📞 icon + name. Long-press/copy isn't required.
- Inactive members' phones are never returned.

---

## 3. Walkthroughs by POV

### 3.1 Player
| Step | Today | Target |
|---|---|---|
| Choose team | Card grid | **Keep cards**. Add the planned confirm burst (plan §13.6) |
| Home | Hero + match cards | **Now hero**: game, **location (large)**, opponent, timer ring, outcome when done. **Next matches table**. **Top-5 table** (if visible) |
| Schedule | Card per match, images repeated | **Table per round / per game** (Game+location · Matchup · Result). My team's row highlighted. No images in rows |
| Team detail | Cards | **Breakdown view** (§3.7): results table + adjustments table + points reconciliation |
| Standings | Card per team | **Table** (# · Team · W-D-L · Total). Tap a team → breakdown (A7) |

### 3.2 Guide
- Auto-selected team, "Guide · {team}" chip in the header.
- Home Now hero adds "Next station" with location as soon as the current match is done.
- The Now sheet and account menu show **Event admins** with one-tap call.

### 3.3 Referee
| Step | Today | Target |
|---|---|---|
| Login | `/home` | `/ref` |
| My station | Active-round cards only | **Now**: hero card per current match (keep cards; 1–2 items, one action). Shows the **guides of both teams with call buttons**. **Late**: table of late matches assigned to me, tap to enter the first result. **Upcoming**: read-only table of my next matches |
| Enter result | Separate page, adjustments always expanded | Same segmented control. Adjustments behind "+ Bonus / − Penalty". After confirming → back to `/ref` with toast "Saved · Next: {game} – Round {n}" |

### 3.4 Event Admin: event day
| Need | Target |
|---|---|
| Round state | Sticky **Control header**: round selector, timer ring, status pill, KPI chips with count-up: Completed x/y · Pending · Late · Adjustments |
| Start a round | **Start round** sheet with "Started: ● Now ○ __ minutes ago" (A4). Shows the computed end time live; warns if it's already in overtime |
| End a round | **End round** and **End & start next round** (A1). Pending matches are listed and kept as late (A2). "End & start next" includes the same "started X minutes ago" option for the next round |
| Results | **Results table** (Game · Referee 📞 · Team A · Team B · Result · Status · ⋯). Pending and late first. Row → inline result sheet, no navigation away. **Tap a team name → team breakdown (A7)** |
| Chase pending/late | Each pending/late row shows the referee name + **call button** |
| Adjustments | Own tab: table + "Add" sheet with the projected total |
| Standings | Table + confirmed visibility toggle (only place, D-5) + tie resolution + **Export to Excel** (A8) |

### 3.5 Event Admin / Owner: setup (simplified)
`/manage/:id/setup` becomes a **6-step checklist**:

| Step | Content | Simplifications |
|---|---|---|
| 1. Basics | Name EN/AR, date, points preset (2/1/0 default, 3/1/0, custom) | Code auto-generated. Currency forms, caps and guide-phone flag go under **Advanced**. **Import from Excel** card at the top of this step (A8) |
| 2. Teams | Editable table: Avatar · Name EN/AR · Color · Guides (📞) | **Add N teams** (auto codes/avatars/colors). Visual avatar grid. Color swatches |
| 3. Games | Editable table: Image · Name · Location · Referees (📞) | **Add N games**. Referee assignment as a column |
| 4. Schedule | **Grid**: rows = rounds, columns = games, cells = "Team A vs Team B" by **name** | **Add N rounds × M min**. In-cell conflict warnings. Opening-round toggle. Auto-fill: see D-3 below |
| 5. Staff | Table: Member · Role · Assignment · Phone | Add via a member search sheet |
| 6. Review | Readiness checks with "Fix" links | Buttons: **Go to Control**, **Download setup as Excel** |

**D-3 (open): auto-fill pairings.** The schedule grid alone already removes about 80% of today's effort (manual cells instead of 80 form submits).

| Option | Effort | Risk | When it pays off |
|---|---|---|---|
| **A — Manual grid only** (ship now) | Low | None | You already plan pairings on paper or Excel. Excel import still covers bulk |
| B — Auto-fill + manual edits | Medium (client algorithm + preview + atomic apply via import RPC) | Pairing rules may not match how DST really builds the schedule (fixed stations per team, rotation patterns) [Guess] | Many teams/rounds, built from scratch in-app |

**My recommendation:** build Option A in U7 and park B as **U7b**. Decide after one rehearsal shows how the schedule is actually built. The prompt treats U7b as **not authorised**.

### 3.6 Owner
- **Members table** (Name · Username · Phone 📞 · Login · Status · Event roles · ⋯) with sheets for create/edit/password.
- **Events table** (Event · Date · Status · Current · Admins · ⋯). New event = Name + Date. Code auto.
- Owner area sits in the account menu (D-6).

### 3.7 Team breakdown drill-down (A7)
Opened by tapping a team in **any** results or standings table: Leaderboard, admin Standings, the Results table, Home top-5, the Display results list (not the display standings).

| Part | Content |
|---|---|
| Header | Avatar, name, rank + total (if visible), guide(s) with 📞 (per §2.2) |
| Match breakdown table | Round · Game · Opponent(s) · Outcome · **Points earned** · Entered by/at (staff only) |
| Adjustments table | Points · Scope · Reason · Given by · Time (revoked rows struck through, staff only) |
| Reconciliation footer | Match points **+** adjustments **=** total, with count-up |

- **Presentation:** a full-height bottom sheet on mobile (keeps the user's place in the table) with "Open full page" → `/teams/:code`. On ≥ 1024 px, a side panel.
- **Visibility:** the existing rules apply unchanged. Anonymous users see the breakdown of any team they open via `get_team_view` (already the case today). Standings numbers appear only when visible.
- **Points per match come from the server** (standings are computed, never stored or recalculated client-side).

---

## 4. Navigation & information architecture

### 4.1 Role-aware bottom nav (max 5)
| Role | Items |
|---|---|
| Player / Guide | Home · Schedule · Standings* · About |
| Referee | My station · Schedule · Standings* · More |
| Admin / Owner | Control · Results · Standings · Setup · More |

\*When visible. **More** sheet: About · player Home · Display · Audit (admin) · **Import / Export** (admin) · Members & events (owner) · Language · Change password · Logout.

### 4.2 Manage area
- One `ManageLayout` with a sticky sub-nav: Control · Results · Adjustments · Standings · Setup · Audit.
- The **toolbar row** on the right of the sub-nav holds two permanent labelled buttons: **⬆ Import** and **⬇ Export** (A8).

### 4.3 Import / Export placement (A8)
| Where | Control |
|---|---|
| Manage toolbar (every manage page) | **⬆ Import** (→ import page) · **⬇ Export** (→ export sheet) |
| Setup step 1 | Card: "Have the event in Excel? **Import from Excel**" + "Download blank template" |
| Setup step 6 | **Download setup as Excel** |
| Standings | Primary button **⬇ Export standings (Excel)** |
| More sheet (admins) | Import / Export entries |

**Export flow becomes one tap.**
1. **⬇ Export** opens a sheet with what's included (Standings, Matches, Adjustments, Staff), the Cairo timestamp, and **Download .xlsx**.
2. Pressing Download fetches one fresh snapshot and downloads it immediately. The frozen-snapshot guarantee is kept: the file equals the fetched snapshot.
3. "Preview before download" is a secondary link.

The buttons always state the file type ("Excel .xlsx") and carry an icon + text, never an icon alone.

### 4.4 Header
Logo · event name · team chip (players/guides) or initials button (staff → account sheet) · language toggle. Remove the 🔑 and Logout buttons from the header.

### 4.5 Now sheet (quick access for every role)
The round banner becomes tappable on every page:
- **Players/guides:** my match + next, and admin contacts for guides.
- **Referees:** my station status + the guides at my station.
- **Admins:** completed/pending/late counts, a pending table with referee 📞, and **+5 · End round · End & start next**.

When no round is active, staff see "Next: Round N" with **Start round**.

---

## 5. Cards → tables map (A3)

Shared `ds-data-table`: sticky header, column priorities (p1 always, p2 ≥ 640 px, p3 ≥ 1024 px; hidden columns go into a row expand on mobile), status accent bar, row/cell tap, skeleton, empty state, tabular numerals, RTL-safe.

| Screen | Mobile columns (p1) | Wider |
|---|---|---|
| Home next matches | Round · Game (+location) · Opponent | Status |
| Home top-5 | # · Team · Total | W-D-L |
| Schedule (round/game) | Game (+location) · Matchup · Result | Status |
| Team breakdown matches | Round · Game · Opponent · Outcome · Pts | Entered by/at (staff) |
| Team breakdown adjustments | Points · Reason | By · Time |
| Game detail | Round · Matchup · Result | — |
| Leaderboard / admin standings | # · Team · W-D-L · Total | P · F · Adj · Tie |
| Referee late / upcoming | Round · Game · Teams | Status |
| Admin results | Game · Matchup · Result/Status · ⋯ | Referee 📞 · Entered by/at |
| Adjustments | Team · Points · Reason · ⋯ | Scope · By · Time · Revoked |
| Setup teams/games/staff | Avatar/Image · Name · ⋯ | Color, Location, Referees/Guides 📞 |
| Owner members/events | Name · Status · ⋯ | Phone 📞, Login, Roles / Admins |
| Audit | Time · Action · Actor | Entity; before/after in expand |

**Cards kept on purpose:** team picker, home Now hero, referee current-station hero, display mode.

## 6. Readability rules
1. `tabular-nums`, numbers aligned to the end, total bold. W-D-L as `3-1-0`.
2. Outcome = icon + word + color (✓ Win · = Draw · ✗ Loss · ⊘ Forfeit).
3. Status pills: Scheduled · Live · Pending · **Late** · Done · Void · Queued.
4. Team = avatar/color + **name**. Codes only in Advanced/export/audit.
5. Times in Cairo `HH:mm` + relative ("3 min ago"). Timers `dir="ltr"`.
6. Location always visible wherever a player or guide sees a match.
7. One primary action per region. Destructive actions live in the ⋯ menu.
8. Phone = 📞 + name as a `tel:` link, ≥ 44 px target.

## 7. Round lifecycle (A1, A2, A4)

### 7.1 Start round, optionally backdated (A4)
- `start_round(p_op_id, p_round, p_started_minutes_ago int default 0)`.
- Validation: `0 ≤ p_started_minutes_ago ≤ 180`. The resulting `started_at` must not be earlier than the event's most recent `closed_at` (no overlap with the previous round). The error for that is `START_BEFORE_PREVIOUS_ROUND_END`.
- `started_at = now() - make_interval(mins => p_started_minutes_ago)`. The audit records `started_minutes_ago`.
- UI: "Started ● Now ○ [__] minutes ago". It shows the computed end time ("ends 14:35") and, if that time is already past, a warning "This round will start in overtime".
- Timers for everyone derive from `started_at` (existing), so nothing else changes.

### 7.2 End round (A1, A2)
- **End round** = `close_round`. It no longer fails on pending matches. Any `SCHEDULED` matches stay `SCHEDULED` and become **late results**, scored 0 until entered.
- **No auto-void, no auto-forfeit.** Admins can still void a single match manually through the existing action.
- **Late results**:
  - The assigned referee may enter the **first** result of a late match.
  - Corrections in an ended round stay admin-only.
  - Admins can enter or correct any time (existing).
- Visibility:
  - Control shows a "Late n" KPI and filter.
  - The referee's My station shows a Late section.
  - Standings show the footnote "n results still pending" to everyone.
  - The audit row includes `late_match_ids`.

### 7.3 End & start next round (A1)
- Visible when a next `DRAFT` round exists (by number).
- One sheet: the pending list (kept as late) + "Next round started ● Now ○ [__] min ago" + Confirm.
- It sends two queued operations with separate op ids, end then start. If start fails, the first round stays ended and the error is shown with a retry for Start only.

## 8. Animation map
| Where | Animation |
|---|---|
| Route changes | View-transition fade + 8 px slide, mirrored in RTL |
| Tabs (Schedule, Manage sub-nav, Setup stepper, Display) | Sliding indicator + content fade |
| Count-up | Control KPIs, referee counts, standings totals, home rank/total, breakdown reconciliation, setup progress, bulk-create progress, import counts, adjustment projected total |
| Standings | FLIP reorder + ↑/↓ chips (existing, ported to table rows) |
| Timer | Ring depletes. Overtime red slow pulse. Banner slides in on start |
| Results | Status pill pop. Row teal flash on save. Realtime rows fade in (30 ms stagger) |
| Drill-down sheet | Slide up. Reconciliation numbers count up |
| Sheets | Slide up + backdrop fade |
| Player result | Win/draw/loss celebration (plan §13.6) |
| Reduced motion | All of the above instant |

## 9. Backend changes
| # | Change | For |
|---|---|---|
| B1 | `close_round` no longer blocks on pending matches. Returns `late_match_ids`. Old signature kept | A1, A2 |
| B2 | Referee may submit the **first** result for a `SCHEDULED` match in a `CLOSED` round; corrections admin-only | A2 |
| B3 | `start_round(..., p_started_minutes_ago)` with bounds + no overlap with the previous `closed_at`. Old signature kept | A4 |
| B4 | `get_referee_board`: assigned matches in `DRAFT`/`ACTIVE` rounds + late matches, with `bucket` and `editable` flags, + guides (name, phone) of teams in those matches | §3.3, A5 |
| B5 | `get_live_event`: `game_referees` and `team_guides` with phones (admins/owners only) | A5 |
| B6 | Guide-facing `get_event_contacts(p_event)`: event admins' names + phones. Callable only by members holding GUIDE/REFEREE/EVENT_ADMIN in that event, or owners | A5 |
| B7 | `get_standings`: add `pending_results int` (late + scheduled in ended rounds) | §7.2 footnote |
| B8 | `get_team_view`: add `points` per match and `match_points` subtotal, computed by the existing standings formula | A7 |

No schema (table) changes. All of it lives in one migration `0016_ux_round_contacts_breakdown.sql` + pgTAP.

## 10. Delivery phases
| Phase | Scope | Gate |
|---|---|---|
| U0 | In-flight `master` work merged; D032–D034 written | Clean `master` |
| U1 | Foundations: data table, tabs, status pill, outcome, count-up move, timer ring, sheet motion, view transitions | Unit tests |
| U2 | Landing, role nav, header/account sheet, ManageLayout + Import/Export toolbar, Now sheet | E2E landing per role |
| U3 | Round lifecycle + contacts + breakdown backend (B1–B8) | pgTAP role × state |
| U4 | Admin Control, Results, Adjustments, one-tap export, drill-down | Full round run without leaving `/manage` |
| U5 | Referee My station | Upcoming visible before Start; late entry works |
| U6 | Player/guide tables + drill-down | 360 px EN/AR screenshots, no page h-scroll |
| U7 | Setup checklist with manual schedule grid | 8×8×7 event in < 25 interactions without auto-fill |
| U7b | Auto-fill pairings | **Blocked on D-3** |
| U8 | Owner tables | — |

## 11. Risks & assumptions
| Item | Tag | Note |
|---|---|---|
| Tables at 360 px | [Likely] | More than 4 columns won't fit. Column priority + row expand is mandatory |
| Late results change standings after a round ends | [Confirmed] | The pending footnote keeps it honest |
| Backdated start into overtime | [Confirmed] | UI warning. Server allows it (bounded to 180 min) |
| Phone exposure | [Confirmed] decision | Strictly staff RPCs, role-scoped. Never in public RPCs or exports (export already excludes phones; keep it that way) |
| `withViewTransitions` on older Android | [Likely] | Falls back to instant navigation |
| Breakdown points vs standings drift | [Likely] | Both come from the same SQL formula. pgTAP asserts Σ breakdown = standings total |
