-- Alcance PDF borrador y Excel de control: solo ADMIN (tenant) y SECRETARIA (tenant + centro).

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

    IF v_rol = 'ADMIN' THEN
        IF p_id_cliente IS DISTINCT FROM public.get_my_tenant_id() THEN
            RAISE EXCEPTION 'Acceso denegado: cliente no autorizado.';
        END IF;
        RETURN;
    END IF;

    IF v_rol = 'SECRETARIA' THEN
        IF p_id_cliente IS DISTINCT FROM public.get_my_tenant_id() THEN
            RAISE EXCEPTION 'Acceso denegado: cliente no autorizado.';
        END IF;
        IF p_id_centro IS DISTINCT FROM public.get_my_center_id() THEN
            RAISE EXCEPTION 'Acceso denegado: centro no autorizado.';
        END IF;
        RETURN;
    END IF;

    RAISE EXCEPTION 'Acceso denegado: rol no autorizado.';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.assert_remesa_excel_scope(text, text) TO authenticated;
