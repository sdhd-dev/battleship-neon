-- Battleship.Neon — clan treasury fix
-- Idempotent supplemental migration. Run AFTER clans.sql in the Supabase SQL editor.
-- Replaces the donate function with a strict, atomic, raise-on-error version,
-- adds a per-donation log so we can compute weekly top donors, and adds an
-- RPC to send bank coins to a single member (used for both leader withdraw
-- and "distribute to member").

-- ── donation log ─────────────────────────────────────────────
create table if not exists public.clan_donations (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans(id) on delete cascade,
  user_id uuid not null,
  username text not null,
  amount int not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists clan_donations_clan_created_idx
  on public.clan_donations (clan_id, created_at desc);
create index if not exists clan_donations_clan_user_idx
  on public.clan_donations (clan_id, user_id);

alter table public.clan_donations enable row level security;
drop policy if exists "clan_donations_select" on public.clan_donations;
drop policy if exists "clan_donations_insert" on public.clan_donations;
create policy "clan_donations_select" on public.clan_donations for select using (true);
create policy "clan_donations_insert" on public.clan_donations for insert with check (true);

-- ── donate (atomic, raise-on-error, logs row) ────────────────
-- create or replace cannot change the return type, so drop the previous
-- definition (the json-returning version from clans.sql) first.
drop function if exists public.clan_donate(uuid, uuid, int);

create or replace function public.clan_donate(
  p_clan_id uuid,
  p_user_id uuid,
  p_amount int
)
returns void
language plpgsql
security definer
as $$
declare
  v_username text;
begin
  if p_amount is null or p_amount < 10 then
    raise exception 'Minimum donation is 10 coins';
  end if;

  update public.profiles
     set coins = coins - p_amount
   where id = p_user_id and coins >= p_amount;

  if not found then
    raise exception 'Insufficient coins';
  end if;

  update public.clans
     set bank_coins = bank_coins + p_amount
   where id = p_clan_id;

  update public.clan_members
     set contributed_coins = contributed_coins + p_amount
   where clan_id = p_clan_id and user_id = p_user_id
   returning username into v_username;

  if v_username is not null then
    insert into public.clan_donations (clan_id, user_id, username, amount)
    values (p_clan_id, p_user_id, v_username, p_amount);
  end if;
end;
$$;

grant execute on function public.clan_donate(uuid, uuid, int) to anon, authenticated;

-- ── send bank coins to a single member ───────────────────────
-- Used by both "Distribute to member" (target = chosen member) and
-- "Withdraw" (target = caller). Caller-side checks enforce that only
-- leader/officer can invoke this.
create or replace function public.clan_send_to_member(
  p_clan_id uuid,
  p_target_user_id uuid,
  p_amount int
)
returns void
language plpgsql
security definer
as $$
declare
  v_is_member boolean;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  select exists(
    select 1 from public.clan_members
     where clan_id = p_clan_id and user_id = p_target_user_id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Target is not a clan member';
  end if;

  update public.clans
     set bank_coins = bank_coins - p_amount
   where id = p_clan_id and bank_coins >= p_amount;

  if not found then
    raise exception 'Insufficient bank coins';
  end if;

  update public.profiles
     set coins = coins + p_amount
   where id = p_target_user_id;
end;
$$;

grant execute on function public.clan_send_to_member(uuid, uuid, int) to anon, authenticated;
