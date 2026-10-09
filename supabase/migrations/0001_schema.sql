create extension if not exists citext with schema public;
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

