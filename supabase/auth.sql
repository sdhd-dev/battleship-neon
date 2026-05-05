-- Battleship.Neon — username-only auth (random-UUID synthetic emails)
-- Run AFTER economy.sql in the Supabase SQL editor.
-- Idempotent: safe to re-run.
--
-- Project setting required: Authentication → Sign In / Up → "Confirm email"
-- must be DISABLED. Random synthetic addresses can't receive a confirmation,
-- so the project has to skip that step for the username flow to work.

-- The synthetic address that supabase.auth was created with. Random per
-- signup so we never collide on the per-address email send rate limit.
alter table public.profiles add column if not exists auth_email text;

-- Lowercased copy of username for direct equality lookup at sign-in time.
-- The existing functional index on lower(username) enforces uniqueness,
-- but it can't be queried with `.eq("username_lc", ...)` from the client.
alter table public.profiles add column if not exists username_lc text;

create unique index if not exists profiles_username_lc_idx
  on public.profiles (username_lc) where username_lc is not null;

-- Backfill for any rows created under the old username@battleship.neon flow.
update public.profiles
   set username_lc = lower(username)
 where username is not null and username_lc is null;
