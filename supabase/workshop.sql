-- ─────────────────────────────────────────────────────────────
-- Workshop & Secret Word progress columns on profiles.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS decoded_words text[] DEFAULT '{}'::text[];

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_ship_unlocked boolean DEFAULT false;

-- custom_ship payload shape:
--   {
--     "type":   "destroyer" | "submarine" | "cruiser" | "battleship" | "carrier",
--     "name":   "string (max 12 alphanum/space)",
--     "skin":   "skin id (e.g. cyber-blue, gold-titan)",
--     "power":  "precision" | "airstrike" | "radar" | "shield" | "smokescreen",
--     "badge":  "single emoji",
--     "createdAt": <unix-ms>
--   }
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_ship jsonb DEFAULT NULL;

-- Backfill for legacy rows: ensure decoded_words is never null so that
-- length() and array_length() reads stay safe.
UPDATE public.profiles
   SET decoded_words = '{}'::text[]
 WHERE decoded_words IS NULL;
