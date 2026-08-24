-- REF_RECIBO: {REF_FACTURA}-{NNNN} si el centro tiene REF; si no, {ID_CLIENTE}-{NNNN}.

CREATE OR REPLACE FUNCTION public.generar_ref_recibo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  ref_prefix text;
  siguiente_numero int;
BEGIN
  SELECT NULLIF(btrim("REF_FACTURA"), '')
  INTO ref_prefix
  FROM public."CENTROS"
  WHERE "ID_CENTRO" = NEW."ID_CENTRO"
  LIMIT 1;

  IF ref_prefix IS NULL THEN
    ref_prefix := NULLIF(btrim(NEW."ID_CLIENTE"), '');
  END IF;

  IF ref_prefix IS NULL THEN
    RAISE EXCEPTION 'Falta ID_CLIENTE para generar la referencia del recibo';
  END IF;

  SELECT COALESCE(MAX(SUBSTRING("REF_RECIBO" FROM '-([0-9]+)$')::INT), 0) + 1
  INTO siguiente_numero
  FROM public."RECIBOS_MENSUALES"
  WHERE "ID_CLIENTE" = NEW."ID_CLIENTE"
    AND "ID_CENTRO" = NEW."ID_CENTRO";

  NEW."REF_RECIBO" := ref_prefix || '-' || LPAD(siguiente_numero::TEXT, 4, '0');

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
