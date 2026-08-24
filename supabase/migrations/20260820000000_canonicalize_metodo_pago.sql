-- Canonical METODO_PAGO: SEPA | Efectivo | Tarjeta | Bizum | NULL

CREATE OR REPLACE FUNCTION public.canonicalize_metodo_pago(p_metodo text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NULLIF(btrim(p_metodo), '') IS NULL THEN NULL
    WHEN lower(btrim(p_metodo)) IN ('efectivo', 'cash') THEN 'Efectivo'
    WHEN lower(btrim(p_metodo)) IN ('tarjeta', 'card', 'tpv', 'stripe') THEN 'Tarjeta'
    WHEN lower(btrim(p_metodo)) IN ('bizum') THEN 'Bizum'
    ELSE 'SEPA'
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_metodo_pago_sepa(p_metodo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT public.canonicalize_metodo_pago(p_metodo) = 'SEPA';
$$;

CREATE OR REPLACE FUNCTION public.trg_canonicalize_metodo_pago()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW."METODO_PAGO" := public.canonicalize_metodo_pago(NEW."METODO_PAGO");
  RETURN NEW;
END;
$$;

-- Backfill (NULL stays NULL; EFECTIVO/BIZUM/Banco/etc. normalize before CHECK)
UPDATE public."ALUMNOS"
SET "METODO_PAGO" = public.canonicalize_metodo_pago("METODO_PAGO")
WHERE "METODO_PAGO" IS DISTINCT FROM public.canonicalize_metodo_pago("METODO_PAGO");

UPDATE public."RECIBOS_MENSUALES"
SET "METODO_PAGO" = public.canonicalize_metodo_pago("METODO_PAGO")
WHERE "METODO_PAGO" IS DISTINCT FROM public.canonicalize_metodo_pago("METODO_PAGO");

ALTER TABLE public."ALUMNOS" DROP CONSTRAINT IF EXISTS alumnos_metodo_pago_canonical;
ALTER TABLE public."ALUMNOS" ADD CONSTRAINT alumnos_metodo_pago_canonical
  CHECK (
    "METODO_PAGO" IS NULL
    OR "METODO_PAGO" IN ('SEPA', 'Efectivo', 'Tarjeta', 'Bizum')
  );

ALTER TABLE public."RECIBOS_MENSUALES" DROP CONSTRAINT IF EXISTS recibos_metodo_pago_canonical;
ALTER TABLE public."RECIBOS_MENSUALES" ADD CONSTRAINT recibos_metodo_pago_canonical
  CHECK (
    "METODO_PAGO" IS NULL
    OR "METODO_PAGO" IN ('SEPA', 'Efectivo', 'Tarjeta', 'Bizum')
  );

DROP TRIGGER IF EXISTS tg_canonicalize_metodo_pago_alumnos ON public."ALUMNOS";
CREATE TRIGGER tg_canonicalize_metodo_pago_alumnos
  BEFORE INSERT OR UPDATE OF "METODO_PAGO" ON public."ALUMNOS"
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_canonicalize_metodo_pago();

DROP TRIGGER IF EXISTS tg_canonicalize_metodo_pago_recibos ON public."RECIBOS_MENSUALES";
CREATE TRIGGER tg_canonicalize_metodo_pago_recibos
  BEFORE INSERT OR UPDATE OF "METODO_PAGO" ON public."RECIBOS_MENSUALES"
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_canonicalize_metodo_pago();

NOTIFY pgrst, 'reload schema';
