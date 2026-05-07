-- Battleship.Neon — enable realtime on public.profiles
-- Run AFTER economy.sql in the Supabase SQL editor.
-- Idempotent: safe to re-run.
--
-- Without this, AuthProvider's `profile:<uid>` channel never receives
-- UPDATE events, so coin/xp/inventory changes made on one device do not
-- propagate to other open sessions of the same account.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end$$;

-- Realtime needs full row data to deliver postgres_changes payloads with
-- both old and new values. Default REPLICA IDENTITY (primary key only) is
-- enough for our filter (id=eq.<uid>), so no change required there.
