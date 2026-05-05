-- Battleship.Neon — leaderboard fix
-- Idempotent. Run AFTER economy.sql in the Supabase SQL editor.
-- Adds the rating/wins/accuracy columns the all-time leaderboard reads,
-- so the client can fetch top players from `profiles` directly instead of
-- a missing `leaderboard` table.

alter table public.profiles add column if not exists wins int not null default 0;
alter table public.profiles add column if not exists accuracy real not null default 0;
alter table public.profiles add column if not exists rating int not null default 1000;

create index if not exists profiles_rating_idx
  on public.profiles (rating desc) where username is not null;
