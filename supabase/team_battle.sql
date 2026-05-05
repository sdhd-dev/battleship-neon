-- Battleship.Neon — 3v3 team battle
-- Run AFTER multiplayer.sql + economy.sql in the Supabase SQL editor.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ── team_rooms ──────────────────────────────────────────────
-- A team room is a 3v3 lobby keyed by a short alphanumeric room_code
-- so it can be shared verbally (e.g. "NEON42").
create table if not exists public.team_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  team1_ids text[] not null default '{}',
  team2_ids text[] not null default '{}',
  status text not null default 'waiting' check (status in ('waiting','placing','playing','finished')),
  turn_index int not null default 0,         -- 0..5: order is t1[0],t2[0],t1[1],t2[1],t1[2],t2[2]
  winner_team int,                            -- 1, 2, or null
  created_at timestamptz not null default now()
);

create index if not exists team_rooms_room_code_idx
  on public.team_rooms (room_code);

-- ── team_room_members ───────────────────────────────────────
-- Per-player state for a room: team assignment, ready flag, board.
create table if not exists public.team_room_members (
  room_id uuid not null references public.team_rooms(id) on delete cascade,
  user_id text not null,                      -- text to allow guest IDs
  username text not null,
  team int not null check (team in (1,2)),
  ready boolean not null default false,
  board_state jsonb,                          -- ships + shots received against this player
  alive boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists team_room_members_room_idx
  on public.team_room_members (room_id);

-- ── team_chat ───────────────────────────────────────────────
create table if not exists public.team_chat (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.team_rooms(id) on delete cascade,
  user_id text not null,
  username text not null,
  team int,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_chat_room_created_idx
  on public.team_chat (room_id, created_at);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.team_rooms enable row level security;
alter table public.team_room_members enable row level security;
alter table public.team_chat enable row level security;

drop policy if exists "team_rooms_select" on public.team_rooms;
drop policy if exists "team_rooms_insert" on public.team_rooms;
drop policy if exists "team_rooms_update" on public.team_rooms;
drop policy if exists "team_rooms_delete" on public.team_rooms;
create policy "team_rooms_select" on public.team_rooms for select using (true);
create policy "team_rooms_insert" on public.team_rooms for insert with check (true);
create policy "team_rooms_update" on public.team_rooms for update using (true) with check (true);
create policy "team_rooms_delete" on public.team_rooms for delete using (true);

drop policy if exists "team_room_members_select" on public.team_room_members;
drop policy if exists "team_room_members_insert" on public.team_room_members;
drop policy if exists "team_room_members_update" on public.team_room_members;
drop policy if exists "team_room_members_delete" on public.team_room_members;
create policy "team_room_members_select" on public.team_room_members for select using (true);
create policy "team_room_members_insert" on public.team_room_members for insert with check (true);
create policy "team_room_members_update" on public.team_room_members for update using (true) with check (true);
create policy "team_room_members_delete" on public.team_room_members for delete using (true);

drop policy if exists "team_chat_select" on public.team_chat;
drop policy if exists "team_chat_insert" on public.team_chat;
drop policy if exists "team_chat_delete" on public.team_chat;
create policy "team_chat_select" on public.team_chat for select using (true);
create policy "team_chat_insert" on public.team_chat for insert with check (true);
create policy "team_chat_delete" on public.team_chat for delete using (true);

-- ── Realtime ────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.team_rooms';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_room_members'
  ) then
    execute 'alter publication supabase_realtime add table public.team_room_members';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_chat'
  ) then
    execute 'alter publication supabase_realtime add table public.team_chat';
  end if;
end $$;
