-- Guardado de LINK_XML_SEPA tras generar pain.008.001.02 (mismo alcance que Excel).

CREATE OR REPLACE FUNCTION public.guardar_link_xml_remesa(
    p_id_cliente text,
    p_id_centro text,
    p_id_curso text,
    p_mes_periodo text,
    p_link text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_id_remesa text;
BEGIN
    PERFORM public.assert_remesa_excel_scope(p_id_cliente, p_id_centro);

    SELECT cr."ID_REMESA"
    INTO v_id_remesa
    FROM public."CONTROL_REMESAS" cr
    WHERE cr."ID_CLIENTE" = p_id_cliente
      AND cr."ID_CENTRO" = p_id_centro
      AND cr."ID_CURSO" = p_id_curso
      AND cr."MES_PERIODO" = p_mes_periodo
    LIMIT 1;

    IF v_id_remesa IS NULL THEN
        RAISE EXCEPTION 'No se encontro CONTROL_REMESAS para ese cliente, centro, curso y periodo.';
    END IF;

    UPDATE public."CONTROL_REMESAS"
    SET "LINK_XML_SEPA" = NULLIF(trim(p_link), '')
    WHERE "ID_REMESA" = v_id_remesa;

    RETURN v_id_remesa;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.guardar_link_xml_remesa(text, text, text, text, text) TO authenticated;
