-- Borrado seguro de tenants DEMO-* y bypass de veto al eliminar matrículas demo.

CREATE OR REPLACE FUNCTION public.tg_block_delete_matriculas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.demo_clone', true) = '1' THEN
    RETURN OLD;
  END IF;

  IF OLD."ID_CLIENTE" LIKE 'DEMO-%' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    'RESTRICT_VETO: Operación denegada. Por motivos de integridad fiscal y facturación, no se permite eliminar matrículas. Por favor, cambia su estado a "Inactivo" o "Baja".';
END;
$$;

CREATE OR REPLACE FUNCTION public.demo_delete_tenant(p_cliente text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_perfiles_deleted integer := 0;
  v_otp_by_email integer := 0;
  v_otp_by_curso integer := 0;
  v_solicitudes_deleted integer := 0;
  v_remesa_proceso_deleted integer := 0;
  v_ra_jobs_deleted integer := 0;
  v_cliente_exists boolean := false;
BEGIN
  IF p_cliente IS NULL OR btrim(p_cliente) !~ '^DEMO-[0-9]+$' THEN
    RAISE EXCEPTION 'ID_CLIENTE demo inválido: %', p_cliente;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public."CLIENTES" c WHERE c."ID_CLIENTE" = p_cliente
  ) INTO v_cliente_exists;

  IF NOT v_cliente_exists THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Cliente demo no encontrado.',
      'id_cliente', p_cliente
    );
  END IF;

  SELECT lower(btrim(c."EMAIL_CLIENTE")) INTO v_email
  FROM public."CLIENTES" c
  WHERE c."ID_CLIENTE" = p_cliente;

  DELETE FROM public."PERFILES" WHERE "ID_CLIENTE" = p_cliente;
  GET DIAGNOSTICS v_perfiles_deleted = ROW_COUNT;

  IF v_email IS NOT NULL AND v_email <> '' THEN
    DELETE FROM public."VERIFICACIONES_OTP" vo
    WHERE lower(btrim(vo."EMAIL_SOLICITANTE")) = v_email;
    GET DIAGNOSTICS v_otp_by_email = ROW_COUNT;
  END IF;

  DELETE FROM public."VERIFICACIONES_OTP" vo
  USING public."CURSO_ESCOLR" ce
  WHERE vo."ID_CURSO" = ce."ID_CURSO"
    AND ce."ID_CLIENTE" = p_cliente;
  GET DIAGNOSTICS v_otp_by_curso = ROW_COUNT;

  DELETE FROM public."REMESA_PROCESO_ALUMNO" WHERE "ID_CLIENTE" = p_cliente;
  GET DIAGNOSTICS v_remesa_proceso_deleted = ROW_COUNT;

  DELETE FROM public."REMESA_GENERACION_JOBS" WHERE "ID_CLIENTE" = p_cliente;
  GET DIAGNOSTICS v_remesa_jobs_deleted = ROW_COUNT;

  DELETE FROM public."SOLICITUDES_MATRICULA" WHERE "ID_CLIENTE" = p_cliente;
  GET DIAGNOSTICS v_solicitudes_deleted = ROW_COUNT;

  PERFORM public.demo_purge_incomplete_madrid_seed(p_cliente, NULL);

  DELETE FROM public."CLIENTES" WHERE "ID_CLIENTE" = p_cliente;

  RETURN jsonb_build_object(
    'ok', true,
    'id_cliente', p_cliente,
    'perfiles_deleted', v_perfiles_deleted,
    'otp_deleted_by_email', v_otp_by_email,
    'otp_deleted_by_curso', v_otp_by_curso,
    'remesa_proceso_deleted', v_remesa_proceso_deleted,
    'remesa_jobs_deleted', v_remesa_jobs_deleted,
    'solicitudes_deleted', v_solicitudes_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.demo_delete_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demo_delete_tenant(text) TO service_role;
