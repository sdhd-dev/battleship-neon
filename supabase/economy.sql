-- Battleship.Neon — economy / XP / referrals / weekly tournament
-- Run AFTER multiplayer.sql in the Supabase SQL editor.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ── profiles: base + economy columns ─────────────────────────
-- The auth flow already upserts {id, username}. Ensure the table exists,
-- then add economy columns idempotently.
create table if not exists public.profiles (
  id uuid primary key,
  username text,
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists coins int not null default 0;
alter table public.profiles add column if not exists xp int not null default 0;
alter table public.profiles add column if not exists level int not null default 1;
alter table public.profiles add column if not exists pro boolean not null default false;
alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists ship_skin text default 'default';
alter table public.profiles add column if not exists active_board_theme text default 'default';
alter table public.profiles add column if not exists active_badge text;
alter table public.profiles add column if not exists owned_cosmetics text[] not null default '{}';
alter table public.profiles add column if not exists badges text[] not null default '{}';
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by text;
alter table public.profiles add column if not exists last_daily_win_at timestamptz;

create unique index if not exists profiles_username_idx
  on public.profiles (lower(username)) where username is not null;
create unique index if not exists profiles_referral_code_idx
  on public.profiles (lower(referral_code)) where referral_code is not null;

-- ── referrals ────────────────────────────────────────────────
-- One row per invited user. `awarded` flips to true once the referrer's
-- bonus has been credited locally (the client polls and self-credits).
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_username text not null,
  invited_username text not null unique,
  awarded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists referrals_referrer_idx
  on public.referrals (lower(referrer_username));

-- ── pvp_payouts: cap PvP rewards to 1 per opponent per UTC day ──
create table if not exists public.pvp_payouts (
  payer_username text not null,
  opponent_username text not null,
  day date not null,
  awarded_at timestamptz not null default now(),
  primary key (payer_username, opponent_username, day)
);

-- ── weekly_leaderboard ──────────────────────────────────────
-- Per-week snapshot. Key on (username, week_start). Resets implicitly
-- by virtue of every game-end upserting against the current Monday.
create table if not exists public.weekly_leaderboard (
  username text not null,
  city text,
  week_start date not null,
  wins int not null default 0,
  accuracy real not null default 0,
  rating int not null default 1000,
  updated_at timestamptz not null default now(),
  primary key (username, week_start)
);

create index if not exists weekly_leaderboard_week_rating_idx
  on public.weekly_leaderboard (week_start, rating desc);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.referrals enable row level security;
alter table public.pvp_payouts enable row level security;
alter table public.weekly_leaderboard enable row level security;

drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert
  with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "referrals_select" on public.referrals;
drop policy if exists "referrals_insert" on public.referrals;
drop policy if exists "referrals_update" on public.referrals;
create policy "referrals_select" on public.referrals for select using (true);
create policy "referrals_insert" on public.referrals for insert with check (true);
create policy "referrals_update" on public.referrals for update using (true) with check (true);

drop policy if exists "pvp_payouts_select" on public.pvp_payouts;
drop policy if exists "pvp_payouts_insert" on public.pvp_payouts;
create policy "pvp_payouts_select" on public.pvp_payouts for select using (true);
create policy "pvp_payouts_insert" on public.pvp_payouts for insert with check (true);

drop policy if exists "weekly_leaderboard_select" on public.weekly_leaderboard;
drop policy if exists "weekly_leaderboard_insert" on public.weekly_leaderboard;
drop policy if exists "weekly_leaderboard_update" on public.weekly_leaderboard;
create policy "weekly_leaderboard_select" on public.weekly_leaderboard for select using (true);
create policy "weekly_leaderboard_insert" on public.weekly_leaderboard for insert with check (true);
create policy "weekly_leaderboard_update" on public.weekly_leaderboard for update using (true) with check (true);
