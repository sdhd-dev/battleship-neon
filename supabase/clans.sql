-- Battleship.Neon — clan system
-- Run AFTER economy.sql in the Supabase SQL editor.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ── clans ───────────────────────────────────────────────────
create table if not exists public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null check (char_length(tag) between 2 and 4),
  emblem text not null default '⚓',
  color text not null default '#00f0ff',
  description text not null default '',
  leader_id uuid not null,
  bank_coins int not null default 0,
  total_wins int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists clans_name_idx
  on public.clans (lower(name));
create unique index if not exists clans_tag_idx
  on public.clans (upper(tag));
create index if not exists clans_total_wins_idx
  on public.clans (total_wins desc);

-- ── clan_members ────────────────────────────────────────────
create table if not exists public.clan_members (
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null,
  username text not null,
  role text not null default 'member' check (role in ('leader','officer','member')),
  joined_at timestamptz not null default now(),
  contributed_coins int not null default 0,
  primary key (user_id)
);

create index if not exists clan_members_clan_idx on public.clan_members (clan_id);
create index if not exists clan_members_username_idx
  on public.clan_members (lower(username));

-- ── clan_wars ────────────────────────────────────────────────
create table if not exists public.clan_wars (
  id uuid primary key default gen_random_uuid(),
  clan1_id uuid not null references public.clans(id) on delete cascade,
  clan2_id uuid not null references public.clans(id) on delete cascade,
  clan1_score int not null default 0,
  clan2_score int not null default 0,
  week_start date not null,
  winner_clan_id uuid references public.clans(id),
  created_at timestamptz not null default now()
);

create index if not exists clan_wars_week_idx
  on public.clan_wars (week_start desc);
create index if not exists clan_wars_clans_idx
  on public.clan_wars (clan1_id, clan2_id, week_start);

-- ── clan_missions ────────────────────────────────────────────
create table if not exists public.clan_missions (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans(id) on delete cascade,
  mission_type text not null,        -- e.g. 'wins', 'shots_hit'
  target int not null,
  progress int not null default 0,
  reward_coins int not null,
  completed boolean not null default false,
  week_start date not null,
  created_at timestamptz not null default now()
);

create index if not exists clan_missions_week_idx
  on public.clan_missions (clan_id, week_start);

-- ── clan_chat ────────────────────────────────────────────────
create table if not exists public.clan_chat (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null,
  username text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists clan_chat_clan_created_idx
  on public.clan_chat (clan_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_wars enable row level security;
alter table public.clan_missions enable row level security;
alter table public.clan_chat enable row level security;

drop policy if exists "clans_select" on public.clans;
drop policy if exists "clans_insert" on public.clans;
drop policy if exists "clans_update" on public.clans;
drop policy if exists "clans_delete" on public.clans;
create policy "clans_select" on public.clans for select using (true);
create policy "clans_insert" on public.clans for insert
  with check (auth.uid() = leader_id);
create policy "clans_update" on public.clans for update using (true) with check (true);
create policy "clans_delete" on public.clans for delete using (auth.uid() = leader_id);

drop policy if exists "clan_members_select" on public.clan_members;
drop policy if exists "clan_members_insert" on public.clan_members;
drop policy if exists "clan_members_update" on public.clan_members;
drop policy if exists "clan_members_delete" on public.clan_members;
create policy "clan_members_select" on public.clan_members for select using (true);
create policy "clan_members_insert" on public.clan_members for insert with check (true);
create policy "clan_members_update" on public.clan_members for update using (true) with check (true);
create policy "clan_members_delete" on public.clan_members for delete using (true);

drop policy if exists "clan_wars_select" on public.clan_wars;
drop policy if exists "clan_wars_insert" on public.clan_wars;
drop policy if exists "clan_wars_update" on public.clan_wars;
create policy "clan_wars_select" on public.clan_wars for select using (true);
create policy "clan_wars_insert" on public.clan_wars for insert with check (true);
create policy "clan_wars_update" on public.clan_wars for update using (true) with check (true);

drop policy if exists "clan_missions_select" on public.clan_missions;
drop policy if exists "clan_missions_insert" on public.clan_missions;
drop policy if exists "clan_missions_update" on public.clan_missions;
create policy "clan_missions_select" on public.clan_missions for select using (true);
create policy "clan_missions_insert" on public.clan_missions for insert with check (true);
create policy "clan_missions_update" on public.clan_missions for update using (true) with check (true);

drop policy if exists "clan_chat_select" on public.clan_chat;
drop policy if exists "clan_chat_insert" on public.clan_chat;
drop policy if exists "clan_chat_delete" on public.clan_chat;
create policy "clan_chat_select" on public.clan_chat for select using (true);
create policy "clan_chat_insert" on public.clan_chat for insert
  with check (auth.uid() = user_id);
create policy "clan_chat_delete" on public.clan_chat for delete using (true);

-- ── RPC: donate to clan bank ────────────────────────────────
-- Atomically deducts coins from the donor's profile and adds them to
-- the clan bank + the donor's contributed_coins counter.
create or replace function public.clan_donate(
  p_clan_id uuid,
  p_user_id uuid,
  p_amount int
)
returns json
language plpgsql
security definer
as $$
declare
  v_balance int;
begin
  if p_amount <= 0 then
    return json_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  select coins into v_balance from public.profiles where id = p_user_id for update;
  if not found or v_balance < p_amount then
    return json_build_object('ok', false, 'error', 'insufficient');
  end if;

  update public.profiles set coins = coins - p_amount where id = p_user_id;
  update public.clans set bank_coins = bank_coins + p_amount where id = p_clan_id;
  update public.clan_members
    set contributed_coins = contributed_coins + p_amount
    where clan_id = p_clan_id and user_id = p_user_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.clan_donate(uuid, uuid, int) to anon, authenticated;

-- ── RPC: distribute bank coins to all members ───────────────
-- Pays each member `p_amount` coins. Caller must verify leadership;
-- this function only enforces the bank balance.
create or replace function public.clan_distribute(
  p_clan_id uuid,
  p_amount int
)
returns json
language plpgsql
security definer
as $$
declare
  v_count int;
  v_total int;
  v_bank int;
begin
  if p_amount <= 0 then
    return json_build_object('ok', false, 'error', 'invalid_amount');
  end if;

  select count(*) into v_count from public.clan_members where clan_id = p_clan_id;
  v_total := v_count * p_amount;

  select bank_coins into v_bank from public.clans where id = p_clan_id for update;
  if v_bank < v_total then
    return json_build_object('ok', false, 'error', 'insufficient');
  end if;

  update public.clans set bank_coins = bank_coins - v_total where id = p_clan_id;
  update public.profiles
    set coins = coins + p_amount
    where id in (select user_id from public.clan_members where clan_id = p_clan_id);

  return json_build_object('ok', true, 'count', v_count, 'per_member', p_amount);
end;
$$;

grant execute on function public.clan_distribute(uuid, int) to anon, authenticated;

-- ── RPC: record a clan win ───────────────────────────────────
-- Bumps clan total_wins, progresses any active 'wins' mission for the
-- current week, and credits the bank if the mission completes.
create or replace function public.clan_record_win(
  p_clan_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_mission record;
  v_credited int := 0;
begin
  update public.clans set total_wins = total_wins + 1 where id = p_clan_id;

  for v_mission in
    select * from public.clan_missions
    where clan_id = p_clan_id
      and mission_type = 'wins'
      and not completed
      and week_start = (date_trunc('week', now())::date)
    for update
  loop
    update public.clan_missions
      set progress = least(progress + 1, target),
          completed = (progress + 1 >= target)
      where id = v_mission.id;

    if v_mission.progress + 1 >= v_mission.target then
      update public.clans
        set bank_coins = bank_coins + v_mission.reward_coins
        where id = p_clan_id;
      v_credited := v_credited + v_mission.reward_coins;
    end if;
  end loop;

  return json_build_object('ok', true, 'credited', v_credited);
end;
$$;

grant execute on function public.clan_record_win(uuid) to anon, authenticated;

-- ── Realtime subscriptions ──────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clan_chat'
  ) then
    execute 'alter publication supabase_realtime add table public.clan_chat';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clan_members'
  ) then
    execute 'alter publication supabase_realtime add table public.clan_members';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clan_missions'
  ) then
    execute 'alter publication supabase_realtime add table public.clan_missions';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clans'
  ) then
    execute 'alter publication supabase_realtime add table public.clans';
  end if;
end $$;
