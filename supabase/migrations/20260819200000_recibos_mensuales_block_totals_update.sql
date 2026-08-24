-- Impide modificar manualmente los totales de cabecera en RECIBOS_MENSUALES.
-- Las líneas (VENTAS_LINEAS) son la fuente; la cabecera la escribe generar_remesa_mensual (INSERT).
-- Funciones SECURITY DEFINER pueden habilitar escritura con:
--   PERFORM set_config('harmony.allow_recibo_totals_write', 'on', true);

CREATE OR REPLACE FUNCTION public.trg_recibos_mensuales_block_totals_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF current_setting('harmony.allow_recibo_totals_write', true) IN ('1', 'on', 'true') THEN
        RETURN NEW;
    END IF;

    IF NEW."TOTAL_BASE" IS DISTINCT FROM OLD."TOTAL_BASE"
       OR NEW."DESCUENTO" IS DISTINCT FROM OLD."DESCUENTO"
       OR NEW."TOTAL_IVA" IS DISTINCT FROM OLD."TOTAL_IVA"
       OR NEW."TOTAL_DOC" IS DISTINCT FROM OLD."TOTAL_DOC" THEN
        RAISE EXCEPTION
            'Los totales del recibo (TOTAL_BASE, DESCUENTO, TOTAL_IVA, TOTAL_DOC) no se pueden modificar manualmente. Corrija matrícula, cargos extra o ajuste manual en la ficha del alumno antes de generar la remesa.';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_recibos_mensuales_block_totals_update ON public."RECIBOS_MENSUALES";

CREATE TRIGGER tg_recibos_mensuales_block_totals_update
    BEFORE UPDATE ON public."RECIBOS_MENSUALES"
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_recibos_mensuales_block_totals_update();
