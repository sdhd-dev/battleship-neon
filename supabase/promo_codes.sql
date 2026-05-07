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
  v_new_balance int;
  v_new_cosmetics text[];
begin
  -- The caller must be redeeming for themselves. Prevents one user from
  -- burning a unique-use code on someone else's account.
  if auth.uid() is null or auth.uid() <> p_user_id then
    return json_build_object('ok', false, 'error', 'auth');
  end if;

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

  -- Credit the reward server-side so the per-update growth cap on
  -- profiles can't silently drop large promo rewards. Bypass the guard
  -- trigger transaction-locally — only this RPC's updates inherit the
  -- bypass, the user's later direct PATCHes do not.
  perform set_config('app.guard_bypass', 'on', true);

  if v_code.reward_coins > 0 then
    update public.profiles
       set coins = coalesce(coins, 0) + v_code.reward_coins
     where id = p_user_id;
  end if;

  if v_code.reward_cosmetic is not null then
    update public.profiles
       set owned_cosmetics =
         case
           when owned_cosmetics is null then array[v_code.reward_cosmetic]
           when v_code.reward_cosmetic = any(owned_cosmetics) then owned_cosmetics
           else owned_cosmetics || v_code.reward_cosmetic
         end
     where id = p_user_id;
  end if;

  -- Read back the post-credit state so the client can update its local
  -- snapshot without a second round-trip (and without trying to push
  -- the new balance back through the guard trigger).
  select coalesce(coins, 0), coalesce(owned_cosmetics, '{}'::text[])
    into v_new_balance, v_new_cosmetics
    from public.profiles
    where id = p_user_id;

  return json_build_object(
    'ok', true,
    'reward_coins', v_code.reward_coins,
    'reward_cosmetic', v_code.reward_cosmetic,
    'new_balance', v_new_balance,
    'owned_cosmetics', v_new_cosmetics
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
