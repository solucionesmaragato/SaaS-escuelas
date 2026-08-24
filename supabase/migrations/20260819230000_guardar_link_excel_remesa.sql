-- Excel de control: meta y guardado de LINK_EXCEL_CONTABILIDAD con alcance Recibos_All_Admin
-- (MASTER; ADMIN por tenant; SECRETARIA/DIRECCION por centro).

CREATE OR REPLACE FUNCTION public.assert_remesa_excel_scope(
    p_id_cliente text,
    p_id_centro text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_rol text;
BEGIN
    v_rol := public.get_my_rol();

    IF v_rol NOT IN ('MASTER', 'ADMIN', 'SECRETARIA', 'DIRECCION') THEN
        RAISE EXCEPTION 'Acceso denegado: rol no autorizado.';
    END IF;

    IF v_rol = 'ADMIN' AND p_id_cliente IS DISTINCT FROM public.get_my_tenant_id() THEN
        RAISE EXCEPTION 'Acceso denegado: cliente no autorizado.';
    END IF;

    IF v_rol IN ('SECRETARIA', 'DIRECCION') AND p_id_centro IS DISTINCT FROM public.get_my_center_id() THEN
        RAISE EXCEPTION 'Acceso denegado: centro no autorizado.';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_remesa_excel_meta(
    p_id_cliente text,
    p_id_centro text,
    p_id_curso text,
    p_mes_periodo text
)
RETURNS TABLE(
    "ID_REMESA" text,
    "LINK_EXCEL_CONTABILIDAD" text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM public.assert_remesa_excel_scope(p_id_cliente, p_id_centro);

    RETURN QUERY
    SELECT
        cr."ID_REMESA",
        cr."LINK_EXCEL_CONTABILIDAD"
    FROM public."CONTROL_REMESAS" cr
    WHERE cr."ID_CLIENTE" = p_id_cliente
      AND cr."ID_CENTRO" = p_id_centro
      AND cr."ID_CURSO" = p_id_curso
      AND cr."MES_PERIODO" = p_mes_periodo
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontro CONTROL_REMESAS para ese cliente, centro, curso y periodo.';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guardar_link_excel_remesa(
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
    SET "LINK_EXCEL_CONTABILIDAD" = NULLIF(trim(p_link), '')
    WHERE "ID_REMESA" = v_id_remesa;

    RETURN v_id_remesa;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_remesa_excel_meta(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_link_excel_remesa(text, text, text, text, text) TO authenticated;
