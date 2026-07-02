-- E8-02 — Tacan persistence schema (Epics 7-8: trophies, cosmetics, history)
-- Ready to apply when the meta-progression epics are built. Nothing in the
-- game reads or writes these tables yet — games run fully in server memory.

create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  name          text unique not null,
  trophy_points integer not null default 0 check (trophy_points >= 0),
  created_at    timestamptz not null default now()
);

create table if not exists cosmetics_owned (
  player_id   uuid not null references players(id) on delete cascade,
  cosmetic_id text not null,           -- e.g. "avatar:karo", "pieces:frost", "board:ember"
  acquired_at timestamptz not null default now(),
  primary key (player_id, cosmetic_id)
);

create table if not exists match_history (
  id          uuid primary key default gen_random_uuid(),
  room_code   text not null,
  played_at   timestamptz not null default now(),
  winner_seat integer not null,
  -- one entry per seat: { seat, name, avatar, score, trophiesEarned }
  seats       jsonb not null
);

-- Locked down by default; policies come with E8-01 (Supabase Auth).
alter table players         enable row level security;
alter table cosmetics_owned enable row level security;
alter table match_history   enable row level security;
