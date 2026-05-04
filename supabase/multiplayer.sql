-- Battleship.Neon — multiplayer schema
-- Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  player1_id text not null,
  player2_id text,
  player1_name text,
  player2_name text,
  status text not null default 'waiting',
  game_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rooms_created_at_idx on public.rooms (created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id text not null,
  player_name text,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_room_id_created_at_idx
  on public.messages (room_id, created_at);

alter table public.rooms enable row level security;
alter table public.messages enable row level security;

-- Permissive policies: anyone with the room id (a UUID) can read and write.
-- This is intentional for an invite-link-driven lobby. Tighten if you wire
-- in authenticated identity per player.
drop policy if exists "rooms_select" on public.rooms;
drop policy if exists "rooms_insert" on public.rooms;
drop policy if exists "rooms_update" on public.rooms;
drop policy if exists "messages_select" on public.messages;
drop policy if exists "messages_insert" on public.messages;
drop policy if exists "messages_delete" on public.messages;

create policy "rooms_select" on public.rooms for select using (true);
create policy "rooms_insert" on public.rooms for insert with check (true);
create policy "rooms_update" on public.rooms for update using (true) with check (true);

create policy "messages_select" on public.messages for select using (true);
create policy "messages_insert" on public.messages for insert with check (true);
create policy "messages_delete" on public.messages for delete using (true);

-- Stream INSERT/UPDATE/DELETE events through Supabase Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.rooms';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;
