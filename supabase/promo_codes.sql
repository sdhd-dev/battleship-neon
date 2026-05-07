-- Battleship.Neon — promo codes system
-- Run AFTER economy.sql in the Supabase SQL editor.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ── promo_codes ──────────────────────────────────────────────
create table if not exists public.promo_codes (
  code text primary key,
  reward_coins int not null default 0,
  reward_cosmetic text,
  max_uses int,                       -- null = unlimited
  uses_count int not null default 0,
  expires_at timestamptz,             -- null = never expires
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists promo_codes_active_idx
  on public.promo_codes (active) where active = true;

-- ── promo_redemptions ───────────────────────────────────────
-- One row per user per code (the primary key enforces this).
create table if not exists public.promo_redemptions (
  user_id uuid not null,
  code text not null references public.promo_codes(code) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (user_id, code)
);

create index if not exists promo_redemptions_user_idx
  on public.promo_redemptions (user_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

drop policy if exists "promo_codes_select" on public.promo_codes;
drop policy if exists "promo_codes_update" on public.promo_codes;
create policy "promo_codes_select" on public.promo_codes for select using (true);
-- Anyone authenticated can bump uses_count via the redeem flow.
create policy "promo_codes_update" on public.promo_codes for update
  using (true) with check (true);

drop policy if exists "promo_redemptions_select" on public.promo_redemptions;
drop policy if exists "promo_redemptions_insert" on public.promo_redemptions;
create policy "promo_redemptions_select" on public.promo_redemptions
  for select using (true);
create policy "promo_redemptions_insert" on public.promo_redemptions
  for insert with check (auth.uid() = user_id);

-- ── Atomic redemption RPC ───────────────────────────────────
-- Validates the code, locks the row, increments the uses counter, and
-- inserts the redemption — all inside a transaction so concurrent
-- redemptions can't push uses_count past max_uses.
create or replace function public.redeem_promo_code(
  p_code text,
  p_user_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_code public.promo_codes%rowtype;
  v_already int;
begin
  -- Lock the row for the duration of this transaction.
  select * into v_code
    from public.promo_codes
    where code = upper(trim(p_code))
    for update;

  if not found then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;

  if not v_code.active then
    return json_build_object('ok', false, 'error', 'invalid');
  end if;

  if v_code.expires_at is not null and v_code.expires_at < now() then
    return json_build_object('ok', false, 'error', 'expired');
  end if;

  if v_code.max_uses is not null and v_code.uses_count >= v_code.max_uses then
    return json_build_object('ok', false, 'error', 'max_uses');
  end if;

  select count(*) into v_already
    from public.promo_redemptions
    where user_id = p_user_id and code = v_code.code;

  if v_already > 0 then
    return json_build_object('ok', false, 'error', 'already_used');
  end if;

  insert into public.promo_redemptions(user_id, code)
    values (p_user_id, v_code.code);

  update public.promo_codes
    set uses_count = uses_count + 1
    where code = v_code.code;

  return json_build_object(
    'ok', true,
    'reward_coins', v_code.reward_coins,
    'reward_cosmetic', v_code.reward_cosmetic
  );
end;
$$;

grant execute on function public.redeem_promo_code(text, uuid) to anon, authenticated;

-- ── Seed starter codes ──────────────────────────────────────
insert into public.promo_codes (code, reward_coins, reward_cosmetic, max_uses, expires_at, active)
values
  ('WELCOME2025', 100, null, null, null, true),
  ('ADMIRAL', 0, 'admiral', null, null, true),
  ('NFACTORIAL', 1500, null, 100, null, true)
on conflict (code) do update set
  reward_coins = excluded.reward_coins,
  reward_cosmetic = excluded.reward_cosmetic,
  max_uses = excluded.max_uses,
  expires_at = excluded.expires_at,
  active = excluded.active;

-- Stream INSERT/UPDATE events through Supabase Realtime for live use counters.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promo_codes'
  ) then
    execute 'alter publication supabase_realtime add table public.promo_codes';
  end if;
end $$;
