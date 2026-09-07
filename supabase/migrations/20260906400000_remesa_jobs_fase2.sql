-- Fase 2 remesas: jobs de post-proceso (PDF borrador + Excel) en servidor.
-- >>> PEGAR SOLO ESTE ARCHIVO .sql EN SUPABASE SQL EDITOR <<<
-- >>> NO pegar aquí procesar-remesa-job/index.ts (es TypeScript; se despliega como Edge Function) <<<

CREATE TABLE IF NOT EXISTS public."REMESA_GENERACION_JOBS" (
  "ID_JOB" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ID_REMESA" text NOT NULL,
  "ID_CLIENTE" text NOT NULL,
  "ID_CENTRO" text NOT NULL,
  "ID_CURSO" text NOT NULL,
  "MES_PERIODO" text NOT NULL,
  "ESTADO" text NOT NULL DEFAULT 'pendiente',
  "PDF_TOTAL" integer NOT NULL DEFAULT 0,
  "PDF_OK" integer NOT NULL DEFAULT 0,
  "PDF_FAIL" integer NOT NULL DEFAULT 0,
  "EXCEL_OK" boolean NOT NULL DEFAULT false,
  "ERROR_MENSAJE" text NULL,
  "CREADO_POR" uuid NULL,
  "CREATED_AT" timestamptz NOT NULL DEFAULT now(),
  "UPDATED_AT" timestamptz NOT NULL DEFAULT now(),
  "INICIADO_AT" timestamptz NULL,
  "COMPLETADO_AT" timestamptz NULL,
  CONSTRAINT remesa_generacion_jobs_estado_chk
    CHECK ("ESTADO" IN ('pendiente', 'procesando', 'completado', 'error')),
  CONSTRAINT remesa_generacion_jobs_remesa_uq UNIQUE ("ID_REMESA")
);

CREATE INDEX IF NOT EXISTS idx_remesa_jobs_estado
  ON public."REMESA_GENERACION_JOBS" ("ESTADO");

CREATE INDEX IF NOT EXISTS idx_remesa_jobs_cliente_centro
  ON public."REMESA_GENERACION_JOBS" ("ID_CLIENTE", "ID_CENTRO");

ALTER TABLE public."REMESA_GENERACION_JOBS" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master_Todo_Remesa_Jobs" ON public."REMESA_GENERACION_JOBS";
CREATE POLICY "Master_Todo_Remesa_Jobs"
  ON public."REMESA_GENERACION_JOBS"
  FOR ALL
  TO authenticated
  USING (public.get_my_rol() = 'MASTER')
  WITH CHECK (public.get_my_rol() = 'MASTER');

DROP POLICY IF EXISTS "Admin_Remesa_Jobs" ON public."REMESA_GENERACION_JOBS";
CREATE POLICY "Admin_Remesa_Jobs"
  ON public."REMESA_GENERACION_JOBS"
  FOR ALL
  TO authenticated
  USING (
    public.get_my_rol() = 'ADMIN'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  )
  WITH CHECK (
    public.get_my_rol() = 'ADMIN'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  );

DROP POLICY IF EXISTS "Secretaria_Remesa_Jobs" ON public."REMESA_GENERACION_JOBS";
CREATE POLICY "Secretaria_Remesa_Jobs"
  ON public."REMESA_GENERACION_JOBS"
  FOR ALL
  TO authenticated
  USING (
    public.get_my_rol() = 'SECRETARIA'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_CENTRO" = public.get_my_center_id()
  )
  WITH CHECK (
    public.get_my_rol() = 'SECRETARIA'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_CENTRO" = public.get_my_center_id()
  );

GRANT SELECT ON public."REMESA_GENERACION_JOBS" TO authenticated;

CREATE OR REPLACE FUNCTION public.remesa_job_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

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

CREATE OR REPLACE FUNCTION public.encolar_remesa_post_proceso(p_id_remesa text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remesa record;
  v_id_job uuid;
  v_pdf_total integer;
BEGIN
  IF p_id_remesa IS NULL OR trim(p_id_remesa) = '' THEN
    RAISE EXCEPTION 'Falta id_remesa.';
  END IF;

  SELECT
    cr."ID_REMESA",
    cr."ID_CLIENTE",
    cr."ID_CENTRO",
    cr."ID_CURSO",
    cr."MES_PERIODO"
  INTO v_remesa
  FROM public."CONTROL_REMESAS" cr
  WHERE cr."ID_REMESA" = trim(p_id_remesa)
  LIMIT 1;

  IF v_remesa."ID_REMESA" IS NULL THEN
    RAISE EXCEPTION 'Remesa no encontrada.';
  END IF;

  PERFORM public.assert_remesa_job_scope(v_remesa."ID_CLIENTE", v_remesa."ID_CENTRO");

  SELECT count(*)::integer
  INTO v_pdf_total
  FROM public."RECIBOS_MENSUALES" rm
  WHERE rm."ID_CLIENTE" = v_remesa."ID_CLIENTE"
    AND rm."ID_CENTRO" = v_remesa."ID_CENTRO"
    AND rm."ID_CURSO" = v_remesa."ID_CURSO"
    AND rm."MES_PERIODO" = v_remesa."MES_PERIODO"
    AND lower(trim(coalesce(rm."ESTADO_PAGO", ''))) = 'borrador';

  SELECT j."ID_JOB"
  INTO v_id_job
  FROM public."REMESA_GENERACION_JOBS" j
  WHERE j."ID_REMESA" = v_remesa."ID_REMESA"
  LIMIT 1;

  IF v_id_job IS NOT NULL THEN
    UPDATE public."REMESA_GENERACION_JOBS"
    SET
      "ESTADO" = CASE
        WHEN "ESTADO" IN ('completado', 'error') THEN 'pendiente'
        ELSE "ESTADO"
      END,
      "PDF_TOTAL" = v_pdf_total,
      "PDF_OK" = CASE WHEN "ESTADO" IN ('completado', 'error') THEN 0 ELSE "PDF_OK" END,
      "PDF_FAIL" = CASE WHEN "ESTADO" IN ('completado', 'error') THEN 0 ELSE "PDF_FAIL" END,
      "EXCEL_OK" = CASE WHEN "ESTADO" IN ('completado', 'error') THEN false ELSE "EXCEL_OK" END,
      "ERROR_MENSAJE" = CASE WHEN "ESTADO" IN ('completado', 'error') THEN NULL ELSE "ERROR_MENSAJE" END,
      "COMPLETADO_AT" = CASE WHEN "ESTADO" IN ('completado', 'error') THEN NULL ELSE "COMPLETADO_AT" END,
      "INICIADO_AT" = CASE WHEN "ESTADO" IN ('completado', 'error') THEN NULL ELSE "INICIADO_AT" END,
      "UPDATED_AT" = now()
    WHERE "ID_JOB" = v_id_job;

    RETURN v_id_job;
  END IF;

  INSERT INTO public."REMESA_GENERACION_JOBS" (
    "ID_REMESA",
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_CURSO",
    "MES_PERIODO",
    "ESTADO",
    "PDF_TOTAL",
    "CREADO_POR"
  )
  VALUES (
    v_remesa."ID_REMESA",
    v_remesa."ID_CLIENTE",
    v_remesa."ID_CENTRO",
    v_remesa."ID_CURSO",
    v_remesa."MES_PERIODO",
    'pendiente',
    v_pdf_total,
    auth.uid()
  )
  RETURNING "ID_JOB" INTO v_id_job;

  RETURN v_id_job;
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

CREATE OR REPLACE FUNCTION public.fn_remesa_job_registrar_pdf(
  p_id_job uuid,
  p_id_recibo text,
  p_ok boolean,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job public."REMESA_GENERACION_JOBS"%ROWTYPE;
BEGIN
  SELECT *
  INTO v_job
  FROM public."REMESA_GENERACION_JOBS" j
  WHERE j."ID_JOB" = p_id_job
  LIMIT 1;

  IF v_job."ID_JOB" IS NULL THEN
    RAISE EXCEPTION 'Job no encontrado.';
  END IF;

  PERFORM public.assert_remesa_job_scope(v_job."ID_CLIENTE", v_job."ID_CENTRO");

  IF p_ok THEN
    UPDATE public."REMESA_GENERACION_JOBS"
    SET
      "PDF_OK" = "PDF_OK" + 1,
      "UPDATED_AT" = now()
    WHERE "ID_JOB" = p_id_job;
  ELSE
    UPDATE public."REMESA_GENERACION_JOBS"
    SET
      "PDF_FAIL" = "PDF_FAIL" + 1,
      "UPDATED_AT" = now()
    WHERE "ID_JOB" = p_id_job;

    IF p_id_recibo IS NOT NULL AND trim(p_id_recibo) <> '' THEN
      UPDATE public."REMESA_PROCESO_ALUMNO"
      SET
        "ESTADO" = 'pdf_fallido',
        "ERROR_PDF" = left(coalesce(trim(p_error), 'Error al generar PDF borrador.'), 500)
      WHERE "ID_REMESA" = v_job."ID_REMESA"
        AND "ID_RECIBO" = trim(p_id_recibo);
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_remesa_job_finalizar(
  p_id_job uuid,
  p_excel_ok boolean,
  p_error_mensaje text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_job public."REMESA_GENERACION_JOBS"%ROWTYPE;
  v_estado text;
BEGIN
  SELECT *
  INTO v_job
  FROM public."REMESA_GENERACION_JOBS" j
  WHERE j."ID_JOB" = p_id_job
  LIMIT 1;

  IF v_job."ID_JOB" IS NULL THEN
    RAISE EXCEPTION 'Job no encontrado.';
  END IF;

  PERFORM public.assert_remesa_job_scope(v_job."ID_CLIENTE", v_job."ID_CENTRO");

  v_estado := CASE
    WHEN coalesce(trim(p_error_mensaje), '') <> '' THEN 'error'
    WHEN v_job."PDF_FAIL" > 0 OR NOT coalesce(p_excel_ok, false) THEN 'completado'
    ELSE 'completado'
  END;

  UPDATE public."REMESA_GENERACION_JOBS"
  SET
    "ESTADO" = v_estado,
    "EXCEL_OK" = coalesce(p_excel_ok, false),
    "ERROR_MENSAJE" = left(nullif(trim(p_error_mensaje), ''), 1000),
    "COMPLETADO_AT" = now(),
    "UPDATED_AT" = now()
  WHERE "ID_JOB" = p_id_job;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sys_remesa_jobs_reset_stale()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public."REMESA_GENERACION_JOBS"
  SET
    "ESTADO" = 'pendiente',
    "UPDATED_AT" = now()
  WHERE "ESTADO" = 'procesando'
    AND "INICIADO_AT" IS NOT NULL
    AND "INICIADO_AT" < (now() - interval '20 minutes');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.encolar_remesa_post_proceso(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_remesa_job_reclamar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_remesa_job_registrar_pdf(uuid, text, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_remesa_job_finalizar(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_remesa_job_scope(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remesa_job_is_service_role() TO authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'job_remesa_jobs_reset_stale';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'job_remesa_jobs_reset_stale',
    '*/5 * * * *',
    'SELECT public.sys_remesa_jobs_reset_stale()'
  );
END;
$$;
