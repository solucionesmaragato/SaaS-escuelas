-- enviar_remesa_bloque: opcional p_id_recibos para cobrar solo los incluidos en el XML.

CREATE OR REPLACE FUNCTION public.enviar_remesa_bloque(
    p_id_cliente text,
    p_id_centro text,
    p_id_curso text,
    p_mes_periodo text,
    p_id_recibos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE public."CONTROL_REMESAS"
    SET "ESTADO" = 'Enviada'
    WHERE "ID_CLIENTE" IS NOT DISTINCT FROM p_id_cliente
      AND "ID_CENTRO" IS NOT DISTINCT FROM p_id_centro
      AND "ID_CURSO" IS NOT DISTINCT FROM p_id_curso
      AND "MES_PERIODO" IS NOT DISTINCT FROM p_mes_periodo;

    UPDATE public."RECIBOS_MENSUALES"
    SET "ESTADO_PAGO" = 'Cobrado'
    WHERE "ID_CLIENTE" IS NOT DISTINCT FROM p_id_cliente
      AND "ID_CENTRO" IS NOT DISTINCT FROM p_id_centro
      AND "MES_PERIODO" IS NOT DISTINCT FROM p_mes_periodo
      AND (p_id_curso IS NULL OR p_id_curso = '' OR "ID_CURSO" = p_id_curso)
      AND "ESTADO_PAGO" = 'Borrador'
      AND public.is_metodo_pago_sepa("METODO_PAGO")
      AND (
          p_id_recibos IS NULL
          OR "ID_RECIBO" = ANY (p_id_recibos)
      );

    RETURN jsonb_build_object(
        'status', 'success',
        'mensaje', 'Remesa enviada y recibos consolidados correctamente.'
    );
END;
$function$;
