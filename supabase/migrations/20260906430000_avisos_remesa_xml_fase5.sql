-- Fase 5 remesas: avisos XML SEPA al Enviar (éxito al guardar link, fallo vía RPC).
-- >>> PEGAR SOLO ESTE ARCHIVO .sql EN SUPABASE SQL EDITOR <<<

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
  v_mes text;
BEGIN
  PERFORM public.assert_remesa_excel_scope(p_id_cliente, p_id_centro);

  SELECT cr."ID_REMESA", cr."MES_PERIODO"
  INTO v_id_remesa, v_mes
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

  IF NULLIF(trim(p_link), '') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_REMESA" = v_id_remesa
        AND a."TIPO" = 'Remesa XML SEPA generado'
    ) THEN
      INSERT INTO public."AVISOS_INTERNOS" (
        "ID_CLIENTE",
        "ID_CENTRO",
        "ID_CURSO",
        "ID_REMESA",
        "TIPO",
        "MENSAJE",
        "LEIDO",
        "FECHA"
      ) VALUES (
        p_id_cliente,
        p_id_centro,
        p_id_curso,
        v_id_remesa,
        'Remesa XML SEPA generado',
        'Cierre mensual ' || coalesce(v_mes, p_mes_periodo)
          || ': XML SEPA generado correctamente para el envío al banco.',
        false,
        now()
      );
    END IF;
  END IF;

  RETURN v_id_remesa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_aviso_remesa_xml_fallido(
  p_id_cliente text,
  p_id_centro text,
  p_id_curso text,
  p_mes_periodo text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id_remesa text;
  v_mes text;
BEGIN
  PERFORM public.assert_remesa_excel_scope(p_id_cliente, p_id_centro);

  SELECT cr."ID_REMESA", cr."MES_PERIODO"
  INTO v_id_remesa, v_mes
  FROM public."CONTROL_REMESAS" cr
  WHERE cr."ID_CLIENTE" = p_id_cliente
    AND cr."ID_CENTRO" = p_id_centro
    AND cr."ID_CURSO" = p_id_curso
    AND cr."MES_PERIODO" = p_mes_periodo
  LIMIT 1;

  IF v_id_remesa IS NULL THEN
    RAISE EXCEPTION 'No se encontro CONTROL_REMESAS para ese cliente, centro, curso y periodo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."AVISOS_INTERNOS" a
    WHERE a."ID_REMESA" = v_id_remesa
      AND a."TIPO" = 'Remesa XML SEPA fallido'
  ) THEN
    INSERT INTO public."AVISOS_INTERNOS" (
      "ID_CLIENTE",
      "ID_CENTRO",
      "ID_CURSO",
      "ID_REMESA",
      "TIPO",
      "MENSAJE",
      "LEIDO",
      "FECHA"
    ) VALUES (
      p_id_cliente,
      p_id_centro,
      p_id_curso,
      v_id_remesa,
      'Remesa XML SEPA fallido',
      'Cierre mensual ' || coalesce(v_mes, p_mes_periodo)
        || ': no se pudo generar el XML SEPA. '
        || left(coalesce(nullif(trim(p_error), ''), 'Error desconocido.'), 500),
      false,
      now()
    );
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.guardar_link_xml_remesa(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_aviso_remesa_xml_fallido(text, text, text, text, text) TO authenticated;
