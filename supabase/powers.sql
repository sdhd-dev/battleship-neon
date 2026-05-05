-- Power inventory + Secret Word Mode tracking.
-- Adds two columns to profiles: powers (jsonb array of {type,count}) and
-- secret_word_wins (running win counter that drives roulette spin scaling).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS powers jsonb DEFAULT '[]';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS secret_word_wins int DEFAULT 0;
