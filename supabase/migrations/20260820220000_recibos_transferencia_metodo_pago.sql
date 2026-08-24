-- Transferencia: solo RECIBOS_MENSUALES (alta manual). ALUMNOS CHECK sin cambios.

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
    WHEN lower(btrim(p_metodo)) IN ('transferencia', 'transfer') THEN 'Transferencia'
    ELSE 'SEPA'
  END;
$$;

ALTER TABLE public."RECIBOS_MENSUALES" DROP CONSTRAINT IF EXISTS recibos_metodo_pago_canonical;
ALTER TABLE public."RECIBOS_MENSUALES" ADD CONSTRAINT recibos_metodo_pago_canonical
  CHECK (
    "METODO_PAGO" IS NULL
    OR "METODO_PAGO" IN ('SEPA', 'Efectivo', 'Tarjeta', 'Bizum', 'Transferencia')
  );

NOTIFY pgrst, 'reload schema';
