-- Recalcula cabecera RECIBOS_MENSUALES desde VENTAS_LINEAS (misma matemática que generar_remesa_mensual).

CREATE OR REPLACE FUNCTION public.recalcular_recibo_desde_lineas(p_id_recibo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_estado text;
    v_total_doc numeric;
    v_suma_iva numeric;
    v_total_base numeric;
    v_dto_euros numeric;
BEGIN
    SELECT LOWER(TRIM(COALESCE("ESTADO_PAGO", '')))
    INTO v_estado
    FROM public."RECIBOS_MENSUALES"
    WHERE "ID_RECIBO" = p_id_recibo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recibo no encontrado: %', p_id_recibo;
    END IF;

    IF v_estado <> 'borrador' THEN
        RAISE EXCEPTION 'Solo se pueden recalcular recibos en estado Borrador.';
    END IF;

    SELECT
        COALESCE(SUM(vl."SUBTOTAL"), 0),
        COALESCE(SUM(
            CASE
                WHEN COALESCE(vl."IVA_PORCENTAJE", 0) > 0 THEN
                    ROUND(vl."CANTIDAD" * vl."PRECIO_UNITARIO" * (vl."IVA_PORCENTAJE" / 100.0), 2)
                ELSE 0
            END
        ), 0),
        COALESCE(SUM(
            CASE
                WHEN vl."CONCEPTO" NOT LIKE 'Dto. hermanos%'
                 AND vl."CONCEPTO" NOT LIKE 'Ajuste:%'
                THEN vl."CANTIDAD" * vl."PRECIO_UNITARIO"
                ELSE 0
            END
        ), 0)
    INTO v_total_doc, v_suma_iva, v_total_base
    FROM public."VENTAS_LINEAS" vl
    WHERE vl."ID_RECIBO" = p_id_recibo;

    SELECT COALESCE(ABS(SUM(vl."SUBTOTAL")), 0)
    INTO v_dto_euros
    FROM public."VENTAS_LINEAS" vl
    WHERE vl."ID_RECIBO" = p_id_recibo
      AND vl."CONCEPTO" LIKE 'Dto. hermanos%';

    PERFORM set_config('harmony.allow_recibo_totals_write', 'on', true);

    UPDATE public."RECIBOS_MENSUALES"
    SET
        "TOTAL_BASE" = v_total_base,
        "DESCUENTO" = v_dto_euros,
        "TOTAL_IVA" = v_suma_iva,
        "TOTAL_DOC" = ROUND(v_total_doc, 2)
    WHERE "ID_RECIBO" = p_id_recibo;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalcular_recibo_desde_lineas(text) TO authenticated;
