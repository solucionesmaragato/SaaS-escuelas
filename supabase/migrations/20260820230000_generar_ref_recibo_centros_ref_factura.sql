-- Serie REF_RECIBO desde CENTROS.REF_FACTURA (por ID_CENTRO del recibo).

CREATE OR REPLACE FUNCTION public.generar_ref_recibo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  ref_factura text;
  siguiente_numero int;
BEGIN
  SELECT btrim("REF_FACTURA")
  INTO ref_factura
  FROM public."CENTROS"
  WHERE "ID_CENTRO" = NEW."ID_CENTRO"
  LIMIT 1;

  IF ref_factura IS NULL OR ref_factura = '' THEN
    RAISE EXCEPTION 'Falta REF_FACTURA en el centro %', NEW."ID_CENTRO";
  END IF;

  SELECT COALESCE(MAX(SUBSTRING("REF_RECIBO" FROM '-([0-9]+)$')::INT), 0) + 1
  INTO siguiente_numero
  FROM public."RECIBOS_MENSUALES"
  WHERE "ID_CLIENTE" = NEW."ID_CLIENTE"
    AND "ID_CENTRO" = NEW."ID_CENTRO";

  NEW."REF_RECIBO" := ref_factura || '-' || LPAD(siguiente_numero::TEXT, 4, '0');

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
