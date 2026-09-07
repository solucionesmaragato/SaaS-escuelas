-- Parche Fase 2 (si ya aplicaste 20260906400000): MASTER en scope + anti-doble-proceso activo.
-- PEGAR SOLO EN SQL EDITOR (no TypeScript).

CREATE OR REPLACE FUNCTION public.assert_remesa_job_scope(
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
  IF public.remesa_job_is_service_role() THEN
    RETURN;
  END IF;

  v_rol := public.get_my_rol();

  IF v_rol = 'MASTER' THEN
    RETURN;
  END IF;

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

CREATE OR REPLACE FUNCTION public.fn_remesa_job_reclamar(p_id_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job public."REMESA_GENERACION_JOBS"%ROWTYPE;
BEGIN
  IF p_id_job IS NULL THEN
    RAISE EXCEPTION 'Falta id_job.';
  END IF;

  UPDATE public."REMESA_GENERACION_JOBS" j
  SET
    "ESTADO" = 'pendiente',
    "UPDATED_AT" = now()
  WHERE j."ID_JOB" = p_id_job
    AND j."ESTADO" = 'procesando'
    AND j."INICIADO_AT" IS NOT NULL
    AND j."INICIADO_AT" < (now() - interval '20 minutes');

  SELECT *
  INTO v_job
  FROM public."REMESA_GENERACION_JOBS" j
  WHERE j."ID_JOB" = p_id_job
  LIMIT 1;

  IF v_job."ID_JOB" IS NULL THEN
    RAISE EXCEPTION 'Job no encontrado.';
  END IF;

  PERFORM public.assert_remesa_job_scope(v_job."ID_CLIENTE", v_job."ID_CENTRO");

  IF v_job."ESTADO" NOT IN ('pendiente', 'procesando') THEN
    RETURN jsonb_build_object('claimed', false, 'job', to_jsonb(v_job));
  END IF;

  IF v_job."ESTADO" = 'procesando'
    AND v_job."INICIADO_AT" IS NOT NULL
    AND v_job."INICIADO_AT" >= (now() - interval '20 minutes') THEN
    RETURN jsonb_build_object('claimed', false, 'job', to_jsonb(v_job));
  END IF;

  UPDATE public."REMESA_GENERACION_JOBS" j
  SET
    "ESTADO" = 'procesando',
    "INICIADO_AT" = coalesce(j."INICIADO_AT", now()),
    "UPDATED_AT" = now()
  WHERE j."ID_JOB" = p_id_job
    AND j."ESTADO" IN ('pendiente', 'procesando')
  RETURNING * INTO v_job;

  IF v_job."ID_JOB" IS NULL THEN
    SELECT * INTO v_job
    FROM public."REMESA_GENERACION_JOBS" j
    WHERE j."ID_JOB" = p_id_job;

    RETURN jsonb_build_object('claimed', false, 'job', to_jsonb(v_job));
  END IF;

  RETURN jsonb_build_object('claimed', true, 'job', to_jsonb(v_job));
END;
$function$;
