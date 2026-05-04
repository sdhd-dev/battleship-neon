-- Battleship.Neon — social sharing & viral claims
-- Run AFTER economy.sql in the Supabase SQL editor.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ── viral_claims ────────────────────────────────────────────
-- A user submits a screenshot of their viral post (1k+ likes).
-- Status flow: pending -> approved | rejected.
-- When approved, the creator manually pays the user via Kaspi/PayPal.
create table if not exists public.viral_claims (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  platform text not null,
  post_url text not null,
  screenshot_url text not null,
  payout_method text,
  payout_handle text,
  note text,
  status text not null default 'pending',
  reward_amount_usd int,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  paid_at timestamptz
);

create index if not exists viral_claims_username_idx
  on public.viral_claims (lower(username));
create index if not exists viral_claims_status_idx
  on public.viral_claims (status, created_at desc);

-- ── Mark approved viral creators on the profile so the
--    leaderboard can render the 🔥 Viral Creator badge.
alter table public.profiles
  add column if not exists viral_creator boolean not null default false;

-- ── RLS ──────────────────────────────────────────────────────
alter table public.viral_claims enable row level security;

drop policy if exists "viral_claims_select" on public.viral_claims;
drop policy if exists "viral_claims_insert" on public.viral_claims;
drop policy if exists "viral_claims_update" on public.viral_claims;
-- Anyone can read claim status (so users can poll their own).
create policy "viral_claims_select" on public.viral_claims for select using (true);
-- Anyone authenticated or anonymous may submit a claim — gated client-side
-- by username ownership. Tighten if abuse becomes an issue.
create policy "viral_claims_insert" on public.viral_claims for insert with check (true);
-- Only the creator (service role) approves/rejects from the dashboard.
create policy "viral_claims_update" on public.viral_claims for update using (false) with check (false);

-- ── Storage bucket for screenshots ──────────────────────────
-- Create a public bucket "viral-screenshots" if missing. The client uploads
-- straight to storage, then references the public URL on the claim row.
insert into storage.buckets (id, name, public)
values ('viral-screenshots', 'viral-screenshots', true)
on conflict (id) do nothing;

drop policy if exists "viral_screenshots_read" on storage.objects;
drop policy if exists "viral_screenshots_write" on storage.objects;
create policy "viral_screenshots_read" on storage.objects for select
  using (bucket_id = 'viral-screenshots');
create policy "viral_screenshots_write" on storage.objects for insert
  with check (bucket_id = 'viral-screenshots');
