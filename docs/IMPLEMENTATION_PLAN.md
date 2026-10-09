# BTSApp — DST Event Scoring Platform
## Implementation Plan & Agreed Solution Design

| | |
|---|---|
| **Owner / Product** | Peter (DST) — owners: `masry`, `gendui` |
| **Status** | AGREED DESIGN — ready for implementation |
| **Version** | 1.0 — 2026-10-09 |
| **Repo** | `github.com/peter-elmasry/BTSApp` (Angular 21.2 scaffold, Tailwind 4.1 wired via PostCSS, Vitest) |
| **Audience** | The implementing engineering agent. Follow this document literally; where it says MUST, do not deviate without raising it. |

> Confidence tags used below: **[Confirmed]** = verified fact / agreed decision · **[Likely]** = strong inference, verify while implementing · **[Guess]** = assumption, verify and report back.

---

## 0. How to use this document

1. Read sections 1–6 fully before writing code. They define the domain, the permission model and the non-negotiable rules.
2. Build strictly in the phase order in **section 16**. Each phase has acceptance criteria; a phase is done only when all of them pass.
3. All business rules live in the **database (Postgres RPC functions + RLS)**. The Angular app is a client; Angular guards are UX only. If you find yourself enforcing a rule only in TypeScript, stop — it belongs in SQL too.
4. When something in this document is ambiguous or conflicts with reality (library incompatibility, Supabase limit changed), pick the safest option, write it in `docs/DECISIONS.md` (create it), and continue.
5. Commits: use the repo's configured git identity only. **Do not add any AI co-author / session trailers** to commits or PRs. One feature branch + PR per phase.

---

## 1. Product summary

A mobile-first web app used live during a DST youth sports event (players aged 18–22). The event consists of **rounds**; in each round several **games** (stations) run in parallel; at each game **two teams** play one **match**. Referees record results (win / draw / loss / forfeit), staff can grant bonuses/penalties, and a live leaderboard (whose visibility the event admins control) ranks the teams. Players do not log in — they just pick their team. Staff log in.

Special round: the **Opening round (اللعبة الافتتاحية)** — a single match in which **all teams** play one game together and the referee picks **one or more winners** (any number, up to all teams).

---

## 2. Actors & roles  [Confirmed]

Two independent layers.

### 2.1 System role (on the member account)

| System role | Who | Powers |
|---|---|---|
| `OWNER` | `masry`, `gendui` (seeded) | Everything, in every event. **Only owners** create events, create/edit/deactivate DST members, reset passwords, assign Event Admins. Owner promotion is NOT exposed in the UI (done via SQL by a developer). |
| `MEMBER` | Every other DST member | No powers by default. Gains powers only through event roles. |

### 2.2 Event role (per event, table `event_roles`)

| Event role | Cardinality | Powers inside that event |
|---|---|---|
| `EVENT_ADMIN` | **many per event** | Full control of the event: settings, points, currency, caps, leaderboard visibility, teams, games, rounds, schedule, XLSX template import, assigning referees to games and guides to teams, start/extend/close/reopen rounds, enter/correct any result any time, match- and event-level adjustments, void matches, resolve ties, export, audit log. Cannot create members or events. Cannot assign other Event Admins (owners do). |
| `REFEREE` | many per event; assigned to 1..n games | Enter/correct results only for matches of **their assigned games**, only while the round is `ACTIVE` (including overtime). Match-level adjustments on those matches, within the match cap. |
| `GUIDE` | at most **one per team**, optional | Same permissions as a player (read-only). Shown on the team card. Does not need a password. |
| *(Player)* | anonymous | No login. Picks a team (stored on device), can switch team any time. |

> "Moderator" from earlier discussions **is** `EVENT_ADMIN`. There is no separate moderator role.

### 2.3 Permission matrix (server-enforced)

| Capability | Player / Guide | Referee | Event Admin | Owner |
|---|---|---|---|---|
| Pick / switch team, home, schedule, team & game pages, About | ✅ | ✅ | ✅ | ✅ |
| Leaderboard & full results of other teams | only if `leaderboard_public` | only if public | ✅ | ✅ |
| Own team's results (team view) | ✅ | ✅ | ✅ | ✅ |
| Submit / correct match result | ❌ | assigned games, round `ACTIVE` | any match, any round state | ✅ |
| MATCH-scope adjustment | ❌ | assigned games, round `ACTIVE`, within match cap | within match cap | ✅ (within cap) |
| EVENT-scope adjustment | ❌ | ❌ | within event cap | ✅ (within cap) |
| Revoke adjustment | ❌ | own adjustments, round `ACTIVE` | any | ✅ |
| Event settings / teams / games / rounds / schedule / import | ❌ | ❌ | ✅ | ✅ |
| Assign referees ↔ games, guides ↔ teams | ❌ | ❌ | ✅ | ✅ |
| Start / extend / close / reopen round | ❌ | ❌ | ✅ | ✅ |
| Void match, resolve ties, export, audit log | ❌ | ❌ | ✅ | ✅ |
| Assign Event Admins, create events | ❌ | ❌ | ❌ | ✅ |
| Create / edit / deactivate members, reset passwords | ❌ | ❌ | ❌ | ✅ |

---

## 3. Architecture  [Confirmed]

```
 Phones (players, referees, admins)                Vercel (static hosting)
 ┌───────────────────────────────┐   HTTPS   ┌──────────────────────────────┐
 │ Angular 21 SPA + PWA (SW)     │ ◀───────▶ │ dist/btsapp/browser           │
 │  - Transloco i18n EN / AR-EG  │           └──────────────────────────────┘
 │  - Tailwind 4 design system   │
 │  - supabase-js client         │──────────────────────────────┐
 │  - IndexedDB offline op queue │                              ▼
 └───────────────────────────────┘          ┌───────────────────────────────────────┐
                                            │ Supabase                              │
                                            │  Postgres  : tables + RLS + RPC funcs │
                                            │  Auth      : staff accounts (password)│
                                            │  Realtime  : broadcast "something     │
                                            │              changed" signals         │
                                            │  Storage   : game images              │
                                            │  Edge Fns  : login, members (admin)   │
                                            └───────────────────────────────────────┘
 GitHub Actions: CI (lint/test/build), `supabase db push` + `functions deploy`, weekly keep-alive ping.
 Vercel: deploys from GitHub on push (preview per PR, production on main).
```

### 3.1 Key architectural rules (MUST)

1. **No direct table writes from the client.** RLS denies `insert/update/delete` on all domain tables for `anon` and `authenticated`. Every mutation is a `SECURITY DEFINER` Postgres function (RPC) that (a) checks permissions via helper functions, (b) validates, (c) writes, (d) writes `audit_log`, (e) emits a realtime signal. One place for all rules.
2. **Reads** for public data go through RPCs too (so hidden-leaderboard rules are enforceable). Simple reference tables (teams, games, rounds) may be readable via RLS `select` for `anon` — results/outcomes may not (see 6.6).
3. **Standings are computed, never stored.** A SQL function computes them from results × current points config + active adjustments. Changing points config recalculates everything automatically (agreed).
4. **Server time is the source of truth** for round timers. Client computes clock offset from `server_now()`.
5. **Every mutation RPC takes `p_op_id uuid`** (client-generated). Duplicate op ids return the stored result without re-applying (idempotency for the offline retry queue).
6. **The service-role key never reaches the browser.** It exists only in Edge Function secrets and GitHub Actions secrets.

### 3.2 Why Supabase realtime uses *broadcast signals*, not row payloads
Anonymous users must not receive result rows when the leaderboard is hidden. So DB triggers broadcast thin messages (`{type:'match_changed', matchId, roundId}`) on a public channel `event:<event_id>`; each client then refetches through the RPC that applies visibility rules. Use `realtime.send(...)` from triggers **[Likely — verify the current Supabase API name/signature]**. Clients debounce refetches (500 ms).

---

## 4. Repository layout (target)

```
BTSApp/
├─ docs/
│  ├─ IMPLEMENTATION_PLAN.md        ← this file
│  ├─ DECISIONS.md                  ← you create; log deviations here
│  └─ EVENT_DAY_RUNBOOK.md          ← phase 7
├─ design/brand/dst-logo-source-white.png   ← source logo (already committed by architect)
├─ scripts/
│  ├─ brand-assets.mjs              ← sharp: trim/crop/recolor/icons
│  ├─ set-env.mjs                   ← writes src/environments/environment.ts from env vars
│  └─ seed-owners.mjs               ← creates masry & gendui via Auth admin API
├─ public/
│  ├─ brand/                        ← generated logo variants, favicon, PWA icons
│  ├─ avatars/                      ← team avatar SVGs + avatars.json manifest
│  └─ i18n/en.json, ar.json
├─ src/app/
│  ├─ core/
│  │  ├─ supabase/ (client, generated db types, rpc wrappers)
│  │  ├─ auth/ (auth.store.ts, guards/*.ts)
│  │  ├─ i18n/ (transloco loader, direction service, currency-plural pipe)
│  │  ├─ realtime/ (event-channel.service.ts, polling fallback)
│  │  ├─ offline/ (op-queue.service.ts — IndexedDB)
│  │  ├─ time/ (server-clock.service.ts)
│  │  └─ player/ (team-selection.store.ts)
│  ├─ shared/ui/ (ds-* design-system components)
│  ├─ shared/anim/ (celebration overlay, confetti, count-up, flip list)
│  ├─ layout/ (app-shell, header, bottom-nav, staff-drawer)
│  └─ features/
│     ├─ public/ (choose-team, home, schedule, team-detail, game-detail, leaderboard, about, display)
│     ├─ auth/ (login)
│     ├─ referee/ (my-matches, match-entry)
│     ├─ manage/ (event-admin area — see §10)
│     └─ owner/ (members, events)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/ (0001_schema.sql, 0002_helpers.sql, 0003_rls.sql, 0004_rpc_*.sql, 0005_realtime.sql …)
│  ├─ functions/login/index.ts
│  ├─ functions/members/index.ts
│  └─ tests/ (permission-matrix + scoring integration tests)
├─ vercel.json
└─ .github/workflows/ (ci.yml, deploy-supabase.yml, keepalive.yml)
```

Keep the Angular app at the repo root (do not move it into a monorepo folder).

---

## 5. Data model (Postgres)  [Confirmed design]

Use `uuid` PKs (`gen_random_uuid()`), `timestamptz`, `citext` for usernames. All event-scoped tables carry `event_id` for RLS and indexing. Enums as `text` + `CHECK` (easier migrations).

### 5.1 Tables

```sql
-- Members (DST team members: owners, admins, referees, guides)
create table members (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users(id) on delete set null, -- null = cannot log in (e.g. guide-only)
  username        citext not null unique check (username ~ '^[a-z0-9_.]{3,30}$'),
  phone           text unique,                 -- E.164, e.g. +201001234567
  full_name_en    text not null,
  full_name_ar    text,
  system_role     text not null default 'MEMBER' check (system_role in ('OWNER','MEMBER')),
  is_active       boolean not null default true,
  created_by      uuid references members(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table events (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique,           -- e.g. BTS-2026
  name_en              text not null,
  name_ar              text,
  status               text not null default 'DRAFT' check (status in ('DRAFT','LIVE','FINISHED','ARCHIVED')),
  is_current           boolean not null default false, -- exactly one current event (partial unique index)
  starts_on            date,
  leaderboard_public   boolean not null default false,
  show_guide_phone     boolean not null default false,
  points_win           int not null default 2  check (points_win  >= 0),
  points_draw          int not null default 1  check (points_draw >= 0),
  points_loss          int not null default 0  check (points_loss >= 0),
  currency_en_one      text not null default 'Point',
  currency_en_other    text not null default 'Points',
  currency_ar_one      text not null default 'نقطة',
  currency_ar_two      text not null default 'نقطتين',
  currency_ar_plural   text not null default 'نقط',
  match_bonus_cap      int check (match_bonus_cap   >= 0),  -- null = unlimited
  match_penalty_cap    int check (match_penalty_cap >= 0),
  event_bonus_cap      int check (event_bonus_cap   >= 0),
  event_penalty_cap    int check (event_penalty_cap >= 0),
  created_by           uuid references members(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index one_current_event on events (is_current) where is_current;

create table teams (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  code               text not null,                  -- T01
  name_en            text not null,
  name_ar            text,
  avatar_key         text not null,                  -- must exist in public/avatars/avatars.json
  color_hex          text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order         int not null default 0,
  final_tiebreak_pos int,                            -- set by "Resolve tie"; null = none
  unique (event_id, code)
);

create table games (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id) on delete cascade,
  code         text not null,                        -- G01
  name_en      text not null,
  name_ar      text,
  location_en  text,
  location_ar  text,
  image_path   text,                                 -- Supabase Storage path, optional
  unique (event_id, code)
);

create table rounds (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  number         int  not null check (number >= 0),  -- OPENING uses 0
  type           text not null default 'REGULAR' check (type in ('REGULAR','OPENING')),
  name_en        text,
  name_ar        text,
  duration_min   int  not null check (duration_min between 1 and 600),
  extension_min  int  not null default 0 check (extension_min >= 0),
  status         text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','CLOSED')),
  started_at     timestamptz,
  closed_at      timestamptz,
  unique (event_id, number)
);
create unique index one_active_round_per_event on rounds (event_id) where status = 'ACTIVE';
create unique index one_opening_round_per_event on rounds (event_id) where type = 'OPENING';

create table matches (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references events(id) on delete cascade,
  round_id           uuid not null references rounds(id) on delete cascade,
  game_id            uuid not null references games(id)  on delete restrict,
  status             text not null default 'SCHEDULED' check (status in ('SCHEDULED','COMPLETED','VOID')),
  result_entered_by  uuid references members(id),
  result_entered_at  timestamptz,
  void_reason        text,
  unique (round_id, game_id)                         -- one match per game per round (agreed)
);

create table match_participants (
  match_id  uuid not null references matches(id) on delete cascade,
  round_id  uuid not null references rounds(id)  on delete cascade, -- denormalised for the constraint below
  team_id   uuid not null references teams(id)   on delete restrict,
  side      text check (side in ('A','B')),       -- null for OPENING
  outcome   text not null default 'PENDING' check (outcome in ('PENDING','WIN','LOSS','DRAW','FORFEIT')),
  primary key (match_id, team_id),
  unique (round_id, team_id)                       -- a team plays at most once per round
);

create table event_roles (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  role       text not null check (role in ('EVENT_ADMIN','REFEREE','GUIDE')),
  team_id    uuid references teams(id) on delete cascade,   -- required iff GUIDE
  created_by uuid references members(id),
  created_at timestamptz not null default now(),
  unique (event_id, member_id, role),
  check ((role = 'GUIDE') = (team_id is not null))
);
create unique index one_guide_per_team on event_roles (event_id, team_id) where role = 'GUIDE';

create table referee_games (
  event_id  uuid not null references events(id)  on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  game_id   uuid not null references games(id)   on delete cascade,
  primary key (event_id, member_id, game_id)
);  -- a member here MUST also hold REFEREE in event_roles (enforced in RPC)

create table adjustments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  scope       text not null check (scope in ('MATCH','EVENT')),
  match_id    uuid references matches(id) on delete cascade,
  team_id     uuid not null references teams(id) on delete cascade,
  points      int  not null check (points <> 0),     -- + bonus / - penalty
  reason      text not null check (length(trim(reason)) >= 3),
  given_by    uuid not null references members(id),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  revoked_by  uuid references members(id),
  revoke_reason text,
  check ((scope = 'MATCH') = (match_id is not null))
);

create table audit_log (
  id         bigint generated always as identity primary key,
  event_id   uuid references events(id) on delete cascade,
  actor_id   uuid references members(id),
  action     text not null,      -- e.g. RESULT_SUBMITTED, ROUND_EXTENDED, ADJUSTMENT_ADDED
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);

create table client_ops (            -- idempotency for offline retries
  op_id     uuid primary key,
  actor_id  uuid references members(id),
  rpc_name  text not null,
  result    jsonb not null,
  at        timestamptz not null default now()
);

create table login_attempts (
  identifier   text not null,
  attempted_at timestamptz not null default now(),
  success      boolean not null
);
```

Add indexes on every `event_id`, `matches(round_id)`, `match_participants(team_id)`, `adjustments(team_id)`, `audit_log(event_id, at desc)`.

### 5.2 Helper functions (migration `0002_helpers.sql`)

```
current_member_id()            → members.id for auth.uid(), null if anon/inactive
is_owner()                     → bool
is_event_admin(p_event uuid)   → is_owner() or EVENT_ADMIN role in event
is_referee_for_match(p_match)  → member has REFEREE role and referee_games row for the match's game
is_staff(p_event)              → is_owner() or any EVENT_ADMIN/REFEREE role in event
can_see_results(p_event)       → events.leaderboard_public or is_staff(p_event)
emit(p_event, p_type, p_payload jsonb)  → realtime broadcast on topic 'event:'||p_event
audit(...)                     → insert into audit_log
```

All `SECURITY DEFINER` functions MUST `set search_path = public, pg_temp`.

---

## 6. Business rules  [Confirmed]

### 6.1 Rounds — lifecycle `DRAFT → ACTIVE → CLOSED` (reopen: `CLOSED → ACTIVE`)

| Action | Who | Preconditions | Effect |
|---|---|---|---|
| `start_round` | Event Admin | status `DRAFT`; no other `ACTIVE` round in event; every non-void match in the round is valid (regular: 2 participants; opening: all teams) | `status=ACTIVE`, `started_at=now()`; event `DRAFT→LIVE` if needed |
| `extend_round(minutes)` | Event Admin | status `ACTIVE`; 1 ≤ minutes ≤ 120 | `extension_min += minutes` |
| `close_round` | Event Admin **only** | status `ACTIVE`; **no match in `SCHEDULED`** (all `COMPLETED` or `VOID`) | `status=CLOSED`, `closed_at=now()`. Otherwise raise `PENDING_MATCHES` with list of match ids |
| `reopen_round(reason)` | Event Admin | status `CLOSED`; no other `ACTIVE` round | `status=ACTIVE` (does not reset timer; audit with reason) |

- **No auto-close, ever.** When `now() > started_at + (duration_min + extension_min) minutes` the round is in **OVERTIME** (derived, not stored). Overtime UI: red count-up timer for everyone; for Event Admins a sticky bar "Overtime +mm:ss · N matches pending · [Extend] [Close round]".
- Referees MAY submit results during overtime until the admin closes (agreed).
- Editing schedule (participants, game) of a match: Event Admin only; forbidden if match `COMPLETED` (reset result first via `reset_match_result`).

### 6.2 Results

Allowed outcome sets:

| Match type | Valid combinations |
|---|---|
| REGULAR (2 teams) | `WIN/LOSS`, `LOSS/WIN`, `DRAW/DRAW`, `FORFEIT/WIN`, `WIN/FORFEIT`, `FORFEIT/FORFEIT` |
| OPENING (all teams) | each team ∈ {`WIN`,`LOSS`,`FORFEIT`}; at least one `WIN` unless all are `FORFEIT`; **any number of winners up to all teams**; no `DRAW` |

- Submitting sets match `COMPLETED`, `result_entered_by`, `result_entered_at`. Re-submitting = correction (audited with before/after).
- `reset_match_result` (Event Admin): all outcomes back to `PENDING`, status `SCHEDULED`.
- `void_match(reason)` (Event Admin): status `VOID`, excluded from standings and from "pending" checks.

### 6.3 Points  [Confirmed: opening uses same points]

| Outcome | Points |
|---|---|
| WIN | `points_win` |
| DRAW | `points_draw` |
| LOSS | `points_loss` |
| FORFEIT | `points_loss` (scored like a loss for the absent team) |
| PENDING / VOID match | 0 |

Total = Σ outcome points + Σ non-revoked adjustments. Changing points config instantly recalculates (computed). The settings screen MUST show a warning when the event is `LIVE`: "Changing points recalculates all results."

### 6.4 Adjustments (bonus / penalty) & caps

- Each adjustment stores `given_by`; the UI shows the giver's name + reason + time wherever adjustments are shown (match detail, team detail, export).
- **MATCH scope**: referee (assigned game, round `ACTIVE`) or Event Admin. Cap check per **team per match**: Σ positive non-revoked MATCH adjustments ≤ `match_bonus_cap`; Σ |negative| ≤ `match_penalty_cap`.
- **EVENT scope**: Event Admin / Owner only. Cap check per **team per event** on EVENT-scope adjustments: same logic with `event_*_cap`.
- `null` cap = unlimited; `0` = not allowed. Violations raise `CAP_EXCEEDED` with remaining allowance.
- Revocation instead of deletion. Revoked adjustments are shown struck through to staff, hidden from public.

### 6.5 Standings & ties  [Confirmed]

`get_standings(event_id)` returns per team: `rank, team, played, wins, draws, losses, forfeits, match_points, adjustment_points, total, is_tied, final_tiebreak_pos`.

Ordering: `total desc`, then `final_tiebreak_pos asc nulls last`, then `name`. Teams with equal `total` and no tiebreak share the same rank and get `is_tied = true`. **Ties are resolved manually** by an Event Admin via "Resolve tie" (drag to order tied teams → `set_tiebreak(event_id, team_ids[])`), audited. No automatic tie-break criteria.

### 6.6 Leaderboard visibility  [Confirmed — read the limitation]

- `leaderboard_public = false` (default): `get_standings` raises `LEADERBOARD_HIDDEN` for non-staff; `get_schedule` returns matches **without outcomes** for non-staff; home shows "الترتيب مستخبي… خليها مفاجأة 😉".
- Players can always see **their own team's** results via `get_team_view(team_code)` (needed for win/lose animations).
- **Honest limitation:** since players are anonymous, someone could call `get_team_view` for every team and rebuild the table. This is accepted — it's suspense, not secrecy. Do not over-engineer.

### 6.7 Team selection (players)

- Stored in `localStorage` key `bts.team.<eventId>` = team code. If no team → redirect to `/choose-team`.
- Switch any time via header avatar → bottom sheet → confirm ("متأكد إنك عايز تغيّر فريقك؟").
- Deep link `/?team=T01` (for printed QR codes) pre-selects with a confirm step.

### 6.8 Members & login

- Login with **username OR phone** + password. Phone normalisation: strip spaces/dashes; `01XXXXXXXXX` → `+201XXXXXXXXX`; `00201…` → `+201…`.
- Lockout: 5 failed attempts per identifier within 10 min → reject for 10 min (`login_attempts`).
- Members are created by owners only (Edge Function `members`). Password optional at creation (guides don't need one); setting a password creates the Supabase Auth user.
- Deactivated members cannot log in (`login` checks `is_active`) and lose all powers (`current_member_id()` returns null).

---

## 7. Supabase specifics

### 7.1 Auth with username/phone  [Likely — verify]
Supabase Auth natively uses email or phone+SMS. We avoid SMS entirely:
- Each staff auth user gets a **synthetic email** `m-<member_uuid>@members.dst-bts.app`, created via the Admin API with `email_confirm: true`. Email confirmation and all email sending stay disabled. Users never see this email.
- **Edge Function `login`** (`POST {identifier, password}`): normalise → find member by username or phone → lockout check → `signInWithPassword(syntheticEmail, password)` with the anon key server-side → return `{access_token, refresh_token}`; on any failure return the same generic `INVALID_CREDENTIALS` (no user enumeration). Client calls `supabase.auth.setSession(...)`.
- Verify GoTrue accepts the chosen domain; if not, use another syntactically valid domain and record it in `DECISIONS.md`.

### 7.2 Edge Function `members` (owner-only)
Actions: `create`, `update`, `set_password`, `deactivate`, `reactivate`. Verifies the caller's JWT → `is_owner()`. Uses service-role key for `auth.admin.*`. Writes `audit_log`.

### 7.3 Seeding owners
`scripts/seed-owners.mjs` (run locally/CI with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_MASRY_PASSWORD`, `OWNER_GENDUI_PASSWORD`): idempotently creates members `masry` and `gendui` with `system_role='OWNER'` and their auth users. **Passwords never committed.** Phones left null (owners set them later in the UI).

### 7.4 Storage
Bucket `game-images` (public read). Upload policy: `is_event_admin(event)` via path convention `<event_id>/<game_id>.<ext>`. Client resizes to max 1024px WebP before upload.

### 7.5 Realtime
Topic `event:<event_id>`, public, broadcast only. Message types: `round_changed`, `match_changed`, `adjustment_changed`, `settings_changed`, `roster_changed`. Emitted from the RPCs (or triggers). Client: subscribe when tab visible; unsubscribe when hidden > 60 s; on reconnect refetch everything.

### 7.6 Free-tier risks  [Likely — verify current limits and note them in DECISIONS.md]
- Free projects **pause after ~7 days of inactivity** → `keepalive.yml` GitHub Action pings a cheap RPC weekly; runbook says "open the app the day before".
- Realtime **concurrent connection cap (~200 on free)**. If the event exceeds it, the polling fallback (§12) must keep everything working. Polling interval 15 s, jittered.
- DB size / egress are far from limits for this volume.

### 7.7 Volume assumptions  [Guess — confirm with Peter]
≤ 40 teams, ≤ 25 games, ≤ 20 rounds, ≤ 600 player devices, ≤ 40 staff.

---

## 8. RPC catalogue

All return JSON; all mutation RPCs take `p_op_id uuid` first and are idempotent via `client_ops`. Error contract: `raise exception using errcode='P0001', message='<CODE>', detail='<json>'`. Client maps `<CODE>` to i18n key `errors.<CODE>`.

**Public (anon + authenticated)**
| RPC | Returns |
|---|---|
| `server_now()` | timestamptz |
| `get_current_event()` | public event fields incl. currency forms, points, `leaderboard_public`, flags |
| `get_bootstrap(p_event)` | teams (+ guide name; guide phone only if `show_guide_phone`), games, rounds (+ derived `ends_at`, `is_overtime`) |
| `get_schedule(p_event)` | matches + participants; outcomes only if `can_see_results` |
| `get_team_view(p_event, p_team_code)` | team, guide, its matches with outcomes, opponents, its points/rank only if `can_see_results` |
| `get_standings(p_event)` | standings rows (§6.5) or `LEADERBOARD_HIDDEN` |

**Authenticated staff**
| RPC | Who |
|---|---|
| `get_my_profile()` | any member → member + event roles + assigned games |
| `get_referee_board(p_event)` | referee → active round matches for assigned games |
| `submit_match_result(p_op_id, p_match, p_outcomes jsonb)` | referee (rules §6.2) / event admin |
| `add_adjustment(p_op_id, p_event, p_scope, p_match, p_team, p_points, p_reason)` | §6.4 |
| `revoke_adjustment(p_op_id, p_adjustment, p_reason)` | §2.3 |

**Event Admin**
`upsert_event_settings`, `upsert_team`, `delete_team` (only if no participants), `upsert_game`, `delete_game` (only if no matches), `upsert_round`, `delete_round` (DRAFT only), `upsert_match(p_round, p_game, p_team_codes[])`, `delete_match`, `generate_opening_match(p_round, p_game)`, `set_event_role(member, role, team?)`, `remove_event_role`, `set_referee_games(member, game_ids[])`, `start_round`, `extend_round`, `close_round`, `reopen_round`, `reset_match_result`, `void_match`, `set_tiebreak`, `import_event_setup(p_op_id, p_event, p_payload jsonb, p_mode, p_dry_run)`, `get_export_data(p_event)`, `get_audit_log(p_event, p_limit, p_before)`, `get_pending_matches(p_round)`.

**Owner**
`create_event`, `set_current_event`, `assign_event_admin`, `remove_event_admin`, `list_members` (+ Edge Function `members` for writes).

---

## 9. Frontend architecture

### 9.1 Conventions (MUST)
- Angular 21: standalone components, **signals** for state, `ChangeDetectionStrategy.OnPush`, new control flow (`@if/@for/@switch`), lazy-loaded feature routes, functional guards/resolvers, `inject()`.
- Reactive Forms for all forms (do not adopt experimental signal forms).
- State: small signal stores per domain (`EventStore`, `AuthStore`, `TeamSelectionStore`, `RoundClockStore`) — no NgRx.
- Supabase types generated (`supabase gen types typescript`) into `core/supabase/database.types.ts`; RPC wrappers are typed.
- Environment: `scripts/set-env.mjs` generates `environment.ts` from `SUPABASE_URL` / `SUPABASE_ANON_KEY` at build (Vercel env vars). The anon key is public by design.
- Bundle: initial < 500 kB (current budget). `exceljs` and `canvas-confetti` MUST be lazy-loaded.

### 9.2 Routes & guards

| Route | Component | Guards |
|---|---|---|
| `/` | redirect → `/home` or `/choose-team` | `teamChosenGuard` |
| `/choose-team` | team picker | — |
| `/home` | my team dashboard | `teamChosenGuard` |
| `/schedule` | tabs: My team · By round · By game | `teamChosenGuard` |
| `/teams/:code`, `/games/:code` | detail | — |
| `/leaderboard` | standings | `leaderboardVisibleGuard` (public flag or staff; else redirect home with toast) |
| `/about` | About us | — |
| `/display` | big-screen mode | `leaderboardVisibleGuard` |
| `/login` | login | `guestOnlyGuard` |
| `/ref`, `/ref/match/:id` | referee board, result entry | `authGuard`, `eventRoleGuard(['REFEREE','EVENT_ADMIN'])` |
| `/manage/:eventId/**` | event admin area | `authGuard`, `eventRoleGuard(['EVENT_ADMIN'])` (owners pass) |
| `/owner/**` | members, events | `authGuard`, `ownerGuard` |

Guards read `AuthStore` (profile loaded once after session restore; guards await it). **Reminder: guards are UX only; RPCs enforce.**

### 9.3 Layout (mobile-first)
- Design at **360×740 first**, then `md:` (≥768) and `lg:` (≥1024) enhancements.
- **Header** (Deep Navy): white DST mark (left in LTR / right in RTL), event name, language toggle `EN | ع`, team avatar chip (players) or user menu (staff).
- **Bottom nav** (players): Home · Schedule · Leaderboard (hidden when not visible) · About. Staff get an extra "Referee" or "Manage" tab.
- Touch targets ≥ 44×44 px; primary actions in thumb zone (bottom); safe-area insets respected.
- Live round banner under header on every page: "الجولة 3 شغالة · 12:41" (teal) / overtime (red, pulsing).

---

## 10. Screens (functional spec)

### 10.1 Public
1. **Choose team** — grid (2 cols mobile) of team cards: avatar, team color ring, name, guide name. Tap → card flips, color burst, confirm button "أيوه، ده فريقي!". Search box if > 12 teams.
2. **Home** — hero: my team avatar/name/color, rank + points (if visible, count-up animation). Current round banner + **my current match card** (game name, location, game image, opponent avatar, countdown). Then "Next matches" list, then leaderboard preview top 5 (if visible). Pull-to-refresh.
3. **Schedule** — segmented tabs; rows show round, game, location, opponent(s), outcome chip (when allowed).
4. **Team detail** — avatar, color, guide (name; phone if allowed), full schedule with results (own-team rule §6.6), adjustments (points, reason, given by).
5. **Game detail** — image, location, matches per round.
6. **Leaderboard** — rank, avatar, name, W/D/L, adjustments, total with currency label; tie badge; my team row highlighted and auto-scrolled into view; animated rank changes (FLIP).
7. **About** — content in §14, both languages.
8. **Display (`/display`)** — landscape big screen: leaderboard + current round timer + last 5 results ticker; auto-cycles views every 20 s; no navigation chrome.

### 10.2 Referee
1. **Board (`/ref`)** — active round header + timer; one card per assigned match: game, two team avatars, status.
2. **Match entry** — REGULAR: big segmented control `[Team A wins] [Draw] [Team B wins]`, overflow `⋯` for Forfeit A / Forfeit B / Both forfeit. OPENING: list of all teams with toggle chips (winner) + forfeit option per team, counter "3 winners selected". Then **bottom-sheet confirm** with summary → submit. Below: adjustments section (+/- stepper, reason, shows remaining cap). Pending-offline badge if queued.

### 10.3 Event Admin (`/manage/:eventId`)
1. **Live control (default tab)** — round stepper; current round card with Start / +5 / +10 / custom extend / Close; overtime bar; pending matches list with quick actions (enter result, void). Close blocked dialog lists pending matches.
2. **Results** — all matches of selected round, edit any result.
3. **Adjustments** — add MATCH/EVENT adjustment, list with giver, revoke.
4. **Setup** — event settings: names, points (win/draw/loss), currency forms (EN one/other, AR one/two/plural) with **live preview** ("1 حلوف · 2 حلوفين · 5 حلاليف · 11 حلوف"), caps, `leaderboard_public` toggle, `show_guide_phone` toggle.
5. **Teams / Games** — CRUD lists (cards on mobile, table on desktop); avatar picker from catalog; color picker (preset swatches); game image upload.
6. **Rounds & schedule** — rounds list (number, type, duration); per round a **match builder**: for each game pick Team A / Team B (dropdowns exclude teams already used in the round); "Generate opening match" for OPENING rounds. Inline validation.
7. **Staff** — event roles table: member, role, assigned games (referee) / team (guide); add from member search.
8. **Import** — download template · upload · preview · errors · confirm (§11).
9. **Export** — download standings XLSX (§11.4).
10. **Ties** — appears when standings have ties: drag to order.
11. **Audit log** — filterable list.

### 10.4 Owner (`/owner`)
1. **Members** — list/search; create (username, phone, names, optional password); edit; set password; deactivate.
2. **Events** — create event, set current event, assign/remove Event Admins.

---

## 11. XLSX import / export

Library: **`exceljs`**, lazy-loaded in the manage area, parsed **in the browser**; the server re-validates everything in `import_event_setup`. (Do not use the unmaintained npm `xlsx` package.) [Likely]

### 11.1 Template (generated by the app — "Download template")
Sheets in order; header row frozen; `*` = required; data-validation dropdowns where noted.

| Sheet | Columns |
|---|---|
| `README` | instructions EN + AR, allowed values |
| `Event` | key/value rows: `name_en*, name_ar, points_win*, points_draw*, points_loss*, currency_en_one*, currency_en_other*, currency_ar_one*, currency_ar_two*, currency_ar_plural*, match_bonus_cap, match_penalty_cap, event_bonus_cap, event_penalty_cap, leaderboard_public (TRUE/FALSE)` |
| `Teams` | `code*, name_en*, name_ar, avatar_key* (dropdown from Avatars), color_hex*` |
| `Games` | `code*, name_en*, name_ar, location_en, location_ar` (images via UI only) |
| `Rounds` | `number*, type* (REGULAR/OPENING), name_en, name_ar, duration_min*` |
| `Matches` | `round_number*, game_code*, team_a_code, team_b_code` (for the OPENING round: one row, team columns empty → all teams) |
| `Staff` | `member* (username or phone), role* (REFEREE/GUIDE), game_codes (comma-separated, REFEREE), team_code (GUIDE)` |
| `Avatars` | read-only list of `avatar_key` values |

### 11.2 Validation (client preview + server, same rules)
Required fields; codes unique per sheet; references resolve (game/team/round codes, members exist and are active); one match per game per round; a team at most once per round; team A ≠ team B; regular match has both teams; exactly one OPENING round max (number 0) with exactly one match; one guide per team; hex colors; avatar keys exist; numbers ≥ 0.

### 11.3 Flow & modes
Upload → parse → client validation table (row-level errors, red) → `import_event_setup(dry_run=true)` → merged report → **Confirm** → `dry_run=false`. **All-or-nothing transaction.**
- `UPSERT` (default): match by `code` / `number`; never deletes.
- `REPLACE`: wipes teams/games/rounds/matches/staff of the event then imports; allowed only while event `DRAFT` and no round ever started.

### 11.4 Export (Event Admin / Owner) — "Export standings" anytime
File `DST-<eventCode>-standings-YYYYMMDD-HHmm.xlsx` (Africa/Cairo time). Sheets: `Standings` (rank, team EN/AR, P, W, D, L, F, match pts, adjustments, total, tie), `Matches` (round, game, teams, outcomes, entered by, at), `Adjustments` (team, scope, match, points, reason, given by, at, revoked), `Staff`. Header styled navy/white, totals bold, generated-at stamp.

---

## 12. Offline & weak-network behaviour  [Confirmed]

- **PWA**: `@angular/service-worker`; cache app shell, i18n JSON, brand, avatars. Installable (manifest with DST icons, theme `#172B4D`, background `#FFF9EB`).
- **Last-known data**: each read RPC response cached in IndexedDB keyed by RPC+args; shown immediately with a subtle "Last updated hh:mm" stamp when offline.
- **Op queue** (`core/offline/op-queue.service.ts`): every mutation gets `op_id = crypto.randomUUID()` and is written to IndexedDB *before* sending. On failure due to network → stays queued; retry with exponential backoff (2s → 60s) and on `online` / `visibilitychange`. Non-network errors (permission, validation) → dequeued and shown as error. UI: badge "1 pending upload" + toast "النت فاصل — هنبعت النتيجة أول ما يرجع".
- **Realtime fallback**: if channel not `SUBSCRIBED` for > 10 s → poll relevant RPCs every 15 s (±3 s jitter) until resubscribed.
- Payloads small: no `select *` of unused columns; images lazy-loaded.

---

## 13. Design system

### 13.1 Tokens — `src/styles.css` (Tailwind v4 `@theme`)

```css
@import 'tailwindcss';

@theme {
  --color-gold:        #FFB800;  /* Primary — Team Gold */
  --color-navy:        #172B4D;  /* Secondary / Main text — Deep Navy */
  --color-white:       #FFFFFF;
  --color-teal:        #087F8C;  /* Accent — Active Teal */
  --color-ivory:       #FFF9EB;  /* Background — Warm Ivory */
  --color-gold-soft:   #FFF0C2;  /* Highlight — Soft Gold */
  --color-slate:       #5F6B7A;  /* Muted text */
  --color-mist:        #E5E7EB;  /* Borders */
  --color-success:     #16794B;
  --color-warning:     #9A6700;
  --color-error:       #C53030;
  --color-info:        #2563EB;

  --font-sans: 'Cairo', system-ui, sans-serif;
  --radius-card: 1rem;
  --shadow-card: 0 1px 2px rgb(23 43 77 / .06), 0 4px 12px rgb(23 43 77 / .08);
}

html { background: var(--color-ivory); color: var(--color-navy); }
.tabular { font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
```

Font: **Cairo** (Google Fonts, weights 400/600/700/800) — covers Arabic and Latin.

### 13.2 Colour usage rules (MUST)
- Gold buttons carry **navy text** (white on gold fails contrast).
- **Gold text is only allowed on navy backgrounds** (gold on ivory/white is unreadable, ~1.6:1). [Likely]
- Teal = live/active states (running round, selected tab). Red = overtime, errors. Soft gold = highlight rows (my team).
- Team colours are used only for avatar rings, card accents and confetti — never for text.

### 13.3 Components (`shared/ui`, prefix `ds-`)
`ds-button` (primary/secondary/ghost/danger; sm/md/lg; loading; full-width), `ds-icon-button`, `ds-input` (label, hint, error, prefix/suffix, ControlValueAccessor), `ds-select`, `ds-number-stepper` (points/minutes), `ds-toggle`, `ds-segmented` (result entry), `ds-chip-toggle` (opening winners), `ds-file-drop`, `ds-color-swatches`, `ds-avatar` (team avatar + color ring + size), `ds-card`, `ds-badge`, `ds-tabs`, `ds-bottom-sheet`, `ds-confirm-sheet`, `ds-toast` (service), `ds-timer` (countdown / overtime count-up from server clock), `ds-empty-state`, `ds-skeleton`, `ds-table` (cards on mobile, table ≥ md).
All form inputs implement `ControlValueAccessor`, show errors from Angular validators via i18n keys, have visible focus rings (teal), and support RTL via logical utilities only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`). **Never** use `ml/mr/pl/pr/left/right/text-left/text-right`.

### 13.4 Brand assets (`scripts/brand-assets.mjs`, using `sharp`)
Source: `design/brand/dst-logo-source-white.png` — **white artwork on transparent**, 3508×2480 with large padding; artwork bbox ≈ x 28–3481, y 434–1898 (3453×1464). It contains the fish-shaped "DST" mark (top ≈ 67 %) and the lines "What Would Jesus Do ?" / "ST. DEMIANA SPORTS TEAM" (bottom ≈ 33 %).
Generate into `public/brand/`:
- `dst-logo-full-white.webp/png` (trimmed, width 1200) and `dst-logo-full-navy.*` (recoloured `#172B4D`).
- `dst-mark-white.*` / `dst-mark-navy.*` — **mark only** (crop the top ≈ 67 % of the trimmed artwork; verify visually that no tagline pixels remain), width 480.
- `favicon.ico` + PWA icons 192/512 + maskable 512: white mark centred on navy square with 12 % padding.
Usage: header = `dst-mark-white` (height 28–32 px); splash & About = full logo (white on navy panel); light surfaces = navy variants. Replace the default Angular `favicon.ico`.

### 13.5 Team avatars
Create **24 original SVG avatars** (simple flat emblems: animals, sports objects, stars, shields — nothing copyrighted, no brand mascots) in `public/avatars/`, plus `avatars.json` `[{ "key": "falcon", "label_en": "Falcon", "label_ar": "صقر", "file": "falcon.svg" }, …]`. Avatars are monochrome-on-transparent so they sit on the team colour ring.

### 13.6 Motion (age 18–22: lively, but never blocking)
Use CSS keyframes + Angular 21 native `animate.enter` / `animate.leave` (do **not** add `@angular/animations`, it is deprecated) [Likely]; `canvas-confetti` lazy-loaded.

| Moment | Animation |
|---|---|
| Choose team | card 3D flip + team-colour radial burst + light haptic (`navigator.vibrate(30)` where supported) |
| Switch team | avatar chip swap with scale/rotate |
| Round started | banner slides down, teal pulse |
| Overtime | timer turns red, slow pulse |
| **My team won** | full-screen overlay, confetti in team colour + gold, "كسبتوا! 🎉 عاش يا أبطال", points count-up, auto-dismiss 4 s |
| **My team lost** | soft overlay, gentle rise animation, "ملحوقة! الجاية بتاعتكم 💪" + "ONE TEAM. ONE SPIRIT." — encouraging, never mocking |
| Draw | handshake icon pop, "تعادل! روح رياضية 🤝" |
| Leaderboard update | FLIP row reordering + ↑/↓ rank chips + number count-up |
| Leaderboard reveal (admin toggles public) | staggered row cascade |

Celebration trigger: when `get_team_view` returns a newly completed match for my team not in `localStorage bts.seenResults.<eventId>` → show once, then mark seen. Respect `prefers-reduced-motion` (show static result card instead).

---

## 14. i18n & content

### 14.1 Setup
- Runtime switching with **Transloco** (`@jsverse/transloco`) [Likely — confirm Angular 21 peer support; fallback `@ngx-translate/core`]. Files `public/i18n/en.json`, `public/i18n/ar.json`. **Default language: `ar`.** Persist choice in `localStorage bts.lang`.
- On change: set `<html lang>` and `<html dir="rtl|ltr">`; Tailwind logical utilities handle layout; icons that imply direction (arrows, chevrons) flip via `rtl:` variant.
- Numbers: Western digits in both languages (`Intl.NumberFormat('ar-EG-u-nu-latn')`). Times in Africa/Cairo.
- Entity names: show `*_ar` in Arabic, fall back to `*_en` when empty (and vice-versa).
- AR copy is **Egyptian colloquial**, friendly, short.

### 14.2 Currency pluralisation — `currencyLabel` pipe
Use `Intl.PluralRules(lang)` on `Math.abs(n)`:
- EN: `one → currency_en_one`, else `currency_en_other`.
- AR: `one → ar_one`, `two → ar_two`, `few (3–10) → ar_plural`, `many (11–99) → ar_one`, `other/zero → ar_one`.
Render `"{{n}} {{label}}"` (e.g. `2 حلوفين`, `5 حلاليف`, `11 حلوف`, `+3 Points`). Unit-test every category.

### 14.3 Starter glossary (extend; keep keys stable)

| Key | EN | AR (Egyptian) |
|---|---|---|
| nav.home | Home | الرئيسية |
| nav.schedule | Schedule | المواعيد |
| nav.leaderboard | Standings | الترتيب |
| nav.about | About us | مين إحنا |
| team.choose.title | Pick your team | اختار فريقك |
| team.choose.confirm | Yes, that's my team! | أيوه، ده فريقي! |
| team.switch | Switch team | غيّر فريقك |
| team.switch.confirm | Sure you want to switch teams? | متأكد إنك عايز تغيّر فريقك؟ |
| team.guide | Guide | المرشد |
| round.live | Round {{n}} is live | الجولة {{n}} شغالة دلوقتي |
| round.overtime | Time's up — waiting for the admin to close the round | الوقت خلص — مستنيين الأدمن يقفل الجولة |
| round.opening | Opening game | اللعبة الافتتاحية |
| match.next | Your next match | ماتشك الجاي |
| match.vs | vs | ضد |
| result.win | You won! 🎉 | كسبتوا! 🎉 عاش يا أبطال |
| result.loss | So close! The next one's yours 💪 | ملحوقة! الجاية بتاعتكم 💪 |
| result.draw | Draw! Great sportsmanship 🤝 | تعادل! روح رياضية عالية 🤝 |
| result.forfeit | Forfeit | انسحاب / مجاش |
| leaderboard.hidden | Standings are hidden for now… keep the surprise 😉 | الترتيب مستخبي دلوقتي… خليها مفاجأة 😉 |
| auth.login | Log in | تسجيل الدخول |
| auth.identifier | Username or phone | اسم المستخدم أو رقم الموبايل |
| auth.password | Password | الباسورد |
| errors.INVALID_CREDENTIALS | Wrong username/phone or password | البيانات مش مظبوطة |
| errors.LOCKED_OUT | Too many attempts, try again in 10 minutes | محاولات كتير، جرّب تاني بعد ١٠ دقايق |
| ref.confirm | Confirm result | تأكيد النتيجة |
| admin.round.start | Start round | ابدأ الجولة |
| admin.round.extend | Add time | زوّد الوقت |
| admin.round.close | Close round | اقفل الجولة |
| admin.round.pending | {{n}} matches still without a result | فيه {{n}} ماتشات لسه من غير نتيجة |
| errors.CAP_EXCEEDED | Bonus/penalty cap reached ({{left}} left) | وصلت للحد الأقصى (فاضل {{left}}) |
| offline.queued | No connection — we'll send it once you're back online | النت فاصل — هنبعت النتيجة أول ما يرجع |
| export.standings | Export standings | نزّل الترتيب |
| import.title | Import event setup | رفع إعدادات الإيفنت |

### 14.4 About us (verbatim content)
Render on a **Deep Navy panel** with white body text so the highlighted phrases can use Team Gold (§13.2). Wrap these phrases in `<span class="text-gold font-bold">`: **"DST | Demiana Sports Team"**, **"What Would Jesus Do?"**, **"ONE TEAM. ONE SPIRIT."** (and in AR also **"فريق واحد. روح واحدة."**). Full logo (white) on top. Store as structured i18n content (paragraph arrays), not raw HTML strings.

**EN**
> DST | Demiana Sports Team
>
> Founded in 2011, Demiana Sports Team (DST) is a Christian sports ministry serving the youth of St. Demiana Church in Haram. We believe that sports are more than just games or competitions; they are a powerful way to build character, strengthen relationships, and reflect Christian values in everyday life. Through sports, we aim to create an environment where young people grow in faith, discipline, teamwork, responsibility, respect, and love. Our mission is not simply to develop better athletes, but to inspire better people who demonstrate the spirit of Christ both on and off the field. Guided by one simple question, "What Would Jesus Do?", we strive to make every game, every challenge, and every interaction an opportunity to live out our faith, support one another, and lead by example.
>
> ONE TEAM. ONE SPIRIT.

**AR**
> DST | Demiana Sports Team
>
> بدأت خدمة دميانة الرياضية (DST) سنة 2011 في كنيسة الشهيدة دميانة بالهرم، وكان هدفنا من أول يوم إن الرياضة تكون وسيلة نقدر من خلالها نخدم الشباب، ونساعدهم يكبروا ويبقوا أشخاص أفضل.
>
> في DST، إحنا مؤمنين إن الرياضة مش مجرد لعبة أو منافسة بنحاول نكسبها، لكنها فرصة نتعلم منها حاجات مهمة في حياتنا، زي الالتزام، والتعاون، والمسؤولية، والاحترام، والمحبة، وإن كل واحد فينا ليه دور مهم في الفريق.
>
> إحنا مش بس بنسعى إننا نكون لاعيبة شاطرين أو نحقق بطولات، لكن الأهم عندنا إننا نبني شخصيات تقدر تعيش القيم والمبادئ المسيحية في كل مكان، سواء جوه الملعب أو برّه.
>
> بنحاول نخلق جو كل واحد فيه يحس إنه جزء من عيلة، يتعلم فيها إزاي يشجع غيره، ويسنده، ويحترمه، ويفرح لنجاحه، ويتعامل بروح رياضية حتى وقت الخسارة.
>
> هدفنا مش بس إن كل واحد فينا يبقى لاعب أفضل، لكن إنه يبقى إنسان أفضل.
>
> وعشان كده، في كل موقف بنقابله، بنحاول نسأل نفسنا سؤال بسيط:
>
> What Would Jesus Do? — يا ترى يسوع كان هيعمل إيه مكاني؟
>
> ومن خلال كل تمرين، وكل ماتش، وكل موقف بنعيشه مع بعض، بنحاول نقدم صورة حقيقية للمحبة المسيحية، ونخلي إيماننا يبان في تصرفاتنا مش بس في كلامنا.
>
> ONE TEAM. ONE SPIRIT.
>
> فريق واحد. روح واحدة.

---

## 15. DevOps

### 15.1 Vercel (frontend)
- Import GitHub repo; framework preset Angular; build `node scripts/set-env.mjs && ng build`; output `dist/btsapp/browser` [Likely — verify actual output path after first build].
- `vercel.json`: SPA rewrite `{"rewrites":[{"source":"/((?!.*\\.).*)","destination":"/index.html"}]}`; long-cache headers for hashed assets; `no-cache` for `ngsw.json`, `index.html`.
- Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Production + Preview). Preview deployments use a separate Supabase project or branch if available; otherwise production — note in DECISIONS.md.

### 15.2 GitHub Actions
- `ci.yml` (PR + main): `npm ci`, prettier check, `ng build`, `vitest run`.
- `deploy-supabase.yml` (main, paths `supabase/**`): `supabase link` → `supabase db push` → `supabase functions deploy login members`. Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
- `keepalive.yml`: weekly cron calling `server_now()` to prevent free-tier pause.

### 15.3 Local dev
`supabase start` (Docker) for local DB + functions; `npm start` for Angular. Document in README.

---

## 16. Delivery phases & acceptance criteria

Each phase = one branch + PR. Do not start a phase before the previous one's criteria pass.

**Phase 0 — Foundations**
- Supabase project linked; migrations 0001–0003 (schema, helpers, RLS) applied; owners seeded.
- Tailwind tokens, Cairo font, Transloco EN/AR with RTL switching, app shell (header, bottom nav), `ds-button/input/select/toggle/card/avatar/toast/bottom-sheet`.
- Brand assets generated; avatars catalog created.
- Vercel deploy + CI green.
- ✅ Switching language flips direction with no layout breakage at 360 px; header shows white DST mark; Lighthouse PWA/a11y ≥ 90 on shell.

**Phase 1 — Auth & owner area**
- `login` + `members` Edge Functions; login page (username or phone); `AuthStore`; all guards; owner Members & Events screens; assign Event Admins.
- ✅ masry logs in with username and with phone; wrong password ×5 locks for 10 min; a REFEREE cannot open `/owner` (guard) **and** calling owner RPCs with a referee JWT fails (server).

**Phase 2 — Event setup (manual)**
- Settings (points, currency forms with live preview, caps, toggles), Teams, Games (+image upload), Rounds, match builder incl. opening match generation, Staff (event roles, referee↔games, guide↔team).
- ✅ Cannot schedule a team twice in a round or two matches on one game in a round (DB constraint + friendly error); second guide on same team rejected.

**Phase 3 — XLSX import**
- Template download, parse, preview, dry-run, all-or-nothing import, UPSERT/REPLACE.
- ✅ A file with 1 bad row imports nothing and shows the row error; a valid file builds the full event; REPLACE refused after a round started.

**Phase 4 — Public player experience**
- Choose/switch team (+ `?team=` deep link), Home, Schedule, Team/Game detail, About, server clock + round banner.
- ✅ Usable one-handed at 360 px; selection persists across reloads; hidden leaderboard ⇒ other teams' outcomes not returned by `get_schedule` for anon.

**Phase 5 — Live operations**
- Round lifecycle UI (start, extend, overtime, close with pending-matches blocker, reopen), referee board + result entry (regular & opening), adjustments with caps & giver, void/reset, realtime broadcast + polling fallback, offline op queue + idempotency.
- ✅ Referee cannot submit for an unassigned game or a CLOSED round (server); same `op_id` sent twice applies once; airplane-mode submit is delivered after reconnect; round never auto-closes; close blocked while a match is pending.

**Phase 6 — Standings, visibility, export, display**
- `get_standings`, leaderboard page with animations, visibility toggle, tie resolution, export XLSX, `/display`.
- ✅ Changing `points_win` mid-event recalculates totals instantly; tied teams share rank until resolved; export matches on-screen standings exactly.

**Phase 7 — Polish & readiness**
- Win/lose/draw celebrations, motion polish, reduced-motion, PWA install, QR sheet per team (owner/admin printable page), performance budget, `EVENT_DAY_RUNBOOK.md`.
- ✅ Initial bundle < 500 kB; 3G-throttled first load < 4 s on mid-range Android profile; all permission-matrix tests pass.

---

## 17. Testing (minimum)

- **Unit (Vitest):** currency plural pipe (all AR categories), phone normaliser, outcome-combination validator, XLSX parser/validator, clock offset, op-queue retry logic.
- **DB integration (`supabase/tests`, run against local Supabase):** the full **permission matrix in §2.3** — for each RPC, call as anon / referee (assigned & unassigned) / event admin / owner and assert allow/deny; scoring & caps; round state machine; idempotency.
- **E2E (Playwright, viewport 390×844, both `ar` and `en`):** choose team → see match → referee submits → player sees result animation; admin import → start → overtime → close.

---

## 18. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Supabase free project paused before event | weekly keep-alive Action + runbook check the day before |
| Realtime connection cap exceeded | polling fallback is a first-class path; test it with realtime disabled |
| Weak hotspot/mobile data | PWA cache, IndexedDB last-known data, idempotent op queue, small payloads |
| Wrong result entered | corrections audited; admin can fix any time; giver/enterer names visible |
| Gold-on-light illegibility | colour rules §13.2 |
| Hidden leaderboard reconstructable by power users | accepted (§6.6) |
| Owner passwords leaked | never in repo; seeded from secrets; owners can reset via Edge Function |

---

## 19. Out of scope (v1)
Automatic tie-break rules, multiple simultaneous events, SMS/OTP, push notifications, player accounts, image uploads for teams (avatars are catalog-only), chat.
