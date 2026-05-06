-- Battleship.Neon — Global Market
-- Run AFTER economy.sql, powers.sql and workshop.sql.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ── market_listings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  seller_username text NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('power', 'ship')),
  item_data jsonb NOT NULL,
  price int NOT NULL CHECK (price >= 10 AND price <= 9999),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  buyer_id uuid,
  buyer_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz
);

ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_select" ON public.market_listings;
DROP POLICY IF EXISTS "market_insert" ON public.market_listings;
DROP POLICY IF EXISTS "market_update" ON public.market_listings;
CREATE POLICY "market_select" ON public.market_listings FOR SELECT USING (true);
CREATE POLICY "market_insert" ON public.market_listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);
CREATE POLICY "market_update" ON public.market_listings FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS market_status_idx
  ON public.market_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS market_seller_idx
  ON public.market_listings (seller_id, status);

-- ── RPC: market_buy ─────────────────────────────────────────
-- Atomic purchase: deduct buyer coins, mark listing sold, then add the
-- item to the buyer's profile. Returns json {ok, error?} so the client
-- can react to insufficient-funds, self-buy, or stale-listing cases.
create or replace function public.market_buy(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_buyer_username text
)
returns json
language plpgsql
security definer
as $$
declare
  v_listing public.market_listings;
  v_balance int;
  v_buyer_powers jsonb;
  v_existing jsonb;
  v_index int;
  v_count int;
  v_power_type text;
begin
  select * into v_listing from public.market_listings
    where id = p_listing_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_listing.status <> 'active' then
    return json_build_object('ok', false, 'error', 'unavailable');
  end if;
  if v_listing.seller_id = p_buyer_id then
    return json_build_object('ok', false, 'error', 'self_buy');
  end if;

  select coins into v_balance from public.profiles
    where id = p_buyer_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'no_profile');
  end if;
  if v_balance < v_listing.price then
    return json_build_object('ok', false, 'error', 'insufficient');
  end if;

  -- Deduct coins from buyer
  update public.profiles set coins = coins - v_listing.price
    where id = p_buyer_id;
  -- Credit seller
  update public.profiles set coins = coins + v_listing.price
    where id = v_listing.seller_id;

  -- Transfer the item
  if v_listing.item_type = 'power' then
    v_power_type := v_listing.item_data->>'type';
    select powers into v_buyer_powers from public.profiles
      where id = p_buyer_id;
    if v_buyer_powers is null then v_buyer_powers := '[]'::jsonb; end if;
    v_index := -1;
    for i in 0..jsonb_array_length(v_buyer_powers) - 1 loop
      if v_buyer_powers->i->>'type' = v_power_type then
        v_index := i;
        exit;
      end if;
    end loop;
    if v_index >= 0 then
      v_count := coalesce((v_buyer_powers->v_index->>'count')::int, 0) + 1;
      v_buyer_powers := jsonb_set(
        v_buyer_powers,
        array[v_index::text, 'count'],
        to_jsonb(v_count)
      );
    else
      v_buyer_powers := v_buyer_powers || jsonb_build_object(
        'type', v_power_type,
        'count', 1
      );
    end if;
    update public.profiles set powers = v_buyer_powers
      where id = p_buyer_id;
  elsif v_listing.item_type = 'ship' then
    update public.profiles set custom_ship = v_listing.item_data
      where id = p_buyer_id;
  end if;

  -- Mark listing sold
  update public.market_listings
    set status = 'sold',
        buyer_id = p_buyer_id,
        buyer_username = p_buyer_username,
        sold_at = now()
    where id = p_listing_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.market_buy(uuid, uuid, text) to anon, authenticated;

-- ── RPC: market_cancel ──────────────────────────────────────
-- Returns the item to the seller and marks the listing cancelled.
create or replace function public.market_cancel(
  p_listing_id uuid,
  p_user_id uuid
)
returns json
language plpgsql
security definer
as $$
declare
  v_listing public.market_listings;
  v_seller_powers jsonb;
  v_index int;
  v_count int;
  v_power_type text;
begin
  select * into v_listing from public.market_listings
    where id = p_listing_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_listing.seller_id <> p_user_id then
    return json_build_object('ok', false, 'error', 'not_owner');
  end if;
  if v_listing.status <> 'active' then
    return json_build_object('ok', false, 'error', 'unavailable');
  end if;

  if v_listing.item_type = 'power' then
    v_power_type := v_listing.item_data->>'type';
    select powers into v_seller_powers from public.profiles
      where id = p_user_id;
    if v_seller_powers is null then v_seller_powers := '[]'::jsonb; end if;
    v_index := -1;
    for i in 0..jsonb_array_length(v_seller_powers) - 1 loop
      if v_seller_powers->i->>'type' = v_power_type then
        v_index := i;
        exit;
      end if;
    end loop;
    if v_index >= 0 then
      v_count := coalesce((v_seller_powers->v_index->>'count')::int, 0) + 1;
      v_seller_powers := jsonb_set(
        v_seller_powers,
        array[v_index::text, 'count'],
        to_jsonb(v_count)
      );
    else
      v_seller_powers := v_seller_powers || jsonb_build_object(
        'type', v_power_type,
        'count', 1
      );
    end if;
    update public.profiles set powers = v_seller_powers
      where id = p_user_id;
  elsif v_listing.item_type = 'ship' then
    update public.profiles set custom_ship = v_listing.item_data
      where id = p_user_id;
  end if;

  update public.market_listings
    set status = 'cancelled'
    where id = p_listing_id;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.market_cancel(uuid, uuid) to anon, authenticated;

-- ── Realtime ────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'market_listings'
  ) then
    execute 'alter publication supabase_realtime add table public.market_listings';
  end if;
end $$;
