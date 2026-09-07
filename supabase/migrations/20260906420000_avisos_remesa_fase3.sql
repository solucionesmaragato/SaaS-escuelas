-- Fase 3 remesas: avisos al cerrar el post-proceso (PDF + Excel).
-- >>> PEGAR SOLO ESTE ARCHIVO .sql EN SUPABASE SQL EDITOR <<<

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
  v_excel_err text;
  r_proceso record;
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

  v_excel_err := nullif(trim(p_error_mensaje), '');

  v_estado := CASE
    WHEN v_excel_err IS NOT NULL THEN 'error'
    ELSE 'completado'
  END;

  FOR r_proceso IN
    SELECT
      p."ID_ALUMNO",
      p."ID_RECIBO",
      p."ERROR_PDF",
      al."NOMBRE_ALUMNO"
    FROM public."REMESA_PROCESO_ALUMNO" p
    LEFT JOIN public."ALUMNOS" al ON al."ID_ALUMNO" = p."ID_ALUMNO"
    WHERE p."ID_REMESA" = v_job."ID_REMESA"
      AND p."ESTADO" = 'pdf_fallido'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_REMESA" = v_job."ID_REMESA"
        AND a."ID_RECIBO" IS NOT DISTINCT FROM r_proceso."ID_RECIBO"
        AND a."TIPO" = 'Remesa PDF borrador fallido'
    ) THEN
      INSERT INTO public."AVISOS_INTERNOS" (
        "ID_CLIENTE",
        "ID_CENTRO",
        "ID_CURSO",
        "ID_ALUMNO",
        "ID_REMESA",
        "ID_RECIBO",
        "TIPO",
        "MENSAJE",
        "LEIDO",
        "FECHA"
      ) VALUES (
        v_job."ID_CLIENTE",
        v_job."ID_CENTRO",
        v_job."ID_CURSO",
        r_proceso."ID_ALUMNO",
        v_job."ID_REMESA",
        r_proceso."ID_RECIBO",
        'Remesa PDF borrador fallido',
        'Cierre mensual ' || v_job."MES_PERIODO" || ': no se pudo generar el PDF borrador de '
          || coalesce(r_proceso."NOMBRE_ALUMNO", 'alumno')
          || ' (recibo ' || coalesce(r_proceso."ID_RECIBO", 'sin recibo') || '). '
          || coalesce(r_proceso."ERROR_PDF", 'Error desconocido.'),
        false,
        now()
      );
    END IF;
  END LOOP;

  FOR r_proceso IN
    SELECT
      p."ID_ALUMNO",
      p."ID_RECIBO",
      al."NOMBRE_ALUMNO"
    FROM public."REMESA_PROCESO_ALUMNO" p
    LEFT JOIN public."ALUMNOS" al ON al."ID_ALUMNO" = p."ID_ALUMNO"
    WHERE p."ID_REMESA" = v_job."ID_REMESA"
      AND p."ESTADO" = 'recibo_no_generado'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_REMESA" = v_job."ID_REMESA"
        AND a."ID_ALUMNO" IS NOT DISTINCT FROM r_proceso."ID_ALUMNO"
        AND a."TIPO" = 'Remesa recibo no generado'
    ) THEN
      INSERT INTO public."AVISOS_INTERNOS" (
        "ID_CLIENTE",
        "ID_CENTRO",
        "ID_CURSO",
        "ID_ALUMNO",
        "ID_REMESA",
        "ID_RECIBO",
        "TIPO",
        "MENSAJE",
        "LEIDO",
        "FECHA"
      ) VALUES (
        v_job."ID_CLIENTE",
        v_job."ID_CENTRO",
        v_job."ID_CURSO",
        r_proceso."ID_ALUMNO",
        v_job."ID_REMESA",
        r_proceso."ID_RECIBO",
        'Remesa recibo no generado',
        'Cierre mensual ' || v_job."MES_PERIODO" || ': no se generó recibo para '
          || coalesce(r_proceso."NOMBRE_ALUMNO", 'alumno') || '.',
        false,
        now()
      );
    END IF;
  END LOOP;

  IF NOT coalesce(p_excel_ok, false)
    AND (v_job."PDF_OK" + v_job."PDF_FAIL") > 0 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_REMESA" = v_job."ID_REMESA"
        AND a."TIPO" = 'Remesa Excel fallido'
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
        v_job."ID_CLIENTE",
        v_job."ID_CENTRO",
        v_job."ID_CURSO",
        v_job."ID_REMESA",
        'Remesa Excel fallido',
        'Cierre mensual ' || v_job."MES_PERIODO" || ': no se pudo generar el Excel de control. '
          || coalesce(v_excel_err, 'Error desconocido.'),
        false,
        now()
      );
    END IF;
  END IF;

  IF coalesce(p_excel_ok, false)
    AND v_job."PDF_FAIL" = 0
    AND v_excel_err IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_REMESA" = v_job."ID_REMESA"
        AND a."TIPO" = 'Remesa borrador lista'
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
        v_job."ID_CLIENTE",
        v_job."ID_CENTRO",
        v_job."ID_CURSO",
        v_job."ID_REMESA",
        'Remesa borrador lista',
        'Cierre mensual ' || v_job."MES_PERIODO" || ': remesa borrador lista ('
          || v_job."PDF_OK"::text || ' PDF, Excel de control generado).',
        false,
        now()
      );
    END IF;
  END IF;

  UPDATE public."REMESA_GENERACION_JOBS"
  SET
    "ESTADO" = v_estado,
    "EXCEL_OK" = coalesce(p_excel_ok, false),
    "ERROR_MENSAJE" = left(v_excel_err, 1000),
    "COMPLETADO_AT" = now(),
    "UPDATED_AT" = now()
  WHERE "ID_JOB" = p_id_job;
END;
$function$;
