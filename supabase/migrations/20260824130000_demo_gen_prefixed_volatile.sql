-- Fix: demo_gen_prefixed / demo_gen_recibo_id must be VOLATILE (IMMUTABLE cached same UUID per statement).

CREATE OR REPLACE FUNCTION public.demo_gen_prefixed(p_prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT p_prefix || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
$$;

CREATE OR REPLACE FUNCTION public.demo_gen_recibo_id()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'rec_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;
