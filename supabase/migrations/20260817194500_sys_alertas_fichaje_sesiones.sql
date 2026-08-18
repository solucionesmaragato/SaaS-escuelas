-- Alertas proactivas: sesión programada sin fichaje (y sin permiso aprobado).
-- Fuente: FICHAJES. SESIONES.HORA_* = hora local Europe/Madrid.

CREATE OR REPLACE FUNCTION public.sys_alertas_fichaje_sesiones()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Entrada: evaluar cuando now() >= HORA_INICIO + 1 min (Europe/Madrid)
  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_PROFESOR",
    "ID_HORARIO",
    "ID_ESPECIALIDAD",
    "TIPO",
    "MENSAJE",
    "FECHA",
    "LEIDO"
  )
  SELECT
    sb."ID_CLIENTE",
    sb."ID_PROFESOR",
    sb."ID_HORARIO",
    sb."ESPECIALIDAD",
    'URGENTE',
    format(
      '[FICHAJE_ALERT:%s:entrada] %s no ha fichado entrada para la sesión del %s (%s-%s).',
      sb."ID_SESION",
      COALESCE(p."NOMBRE_PROFESOR", sb."ID_PROFESOR"::text),
      to_char(sb.fecha_sesion, 'DD/MM/YYYY'),
      to_char(sb."HORA_INICIO"::time, 'HH24:MI'),
      to_char(sb."HORA_FIN"::time, 'HH24:MI')
    ),
    now(),
    false
  FROM (
    SELECT DISTINCT ON (
      s."ID_PROFESOR",
      s."FECHA_EXACTA"::date,
      s."HORA_INICIO",
      COALESCE(s."ID_AULA", ''::text)
    )
      s."ID_SESION",
      s."ID_CLIENTE",
      s."ID_PROFESOR",
      s."ID_HORARIO",
      s."ESPECIALIDAD",
      s."FECHA_EXACTA"::date AS fecha_sesion,
      s."HORA_INICIO",
      s."HORA_FIN",
      ((s."FECHA_EXACTA"::date + s."HORA_INICIO"::time) AT TIME ZONE 'Europe/Madrid') AS inicio_tz
    FROM public."SESIONES" s
    WHERE s."ID_PROFESOR" IS NOT NULL
      AND trim(s."ID_PROFESOR") <> ''
      AND s."HORA_INICIO" IS NOT NULL
      AND s."HORA_FIN" IS NOT NULL
      AND COALESCE(s."ESTADO", '') NOT IN ('Cancelada', 'Incidencia')
    ORDER BY
      s."ID_PROFESOR",
      s."FECHA_EXACTA"::date,
      s."HORA_INICIO",
      COALESCE(s."ID_AULA", ''::text),
      s."ID_SESION"
  ) sb
  JOIN public."PROFESOR" p
    ON p."ID_PROFESOR"::text = sb."ID_PROFESOR"::text
   AND p."ID_CLIENTE"::text = sb."ID_CLIENTE"::text
  WHERE now() >= sb.inicio_tz + interval '1 minute'
    AND NOT EXISTS (
      SELECT 1
      FROM public."AUSENCIAS_PERMISOS" ap
      WHERE ap."ID_PROFESOR"::text = sb."ID_PROFESOR"::text
        AND ap."ID_CLIENTE"::text = sb."ID_CLIENTE"::text
        AND ap."ESTADO" = 'Aprobado'
        AND sb.fecha_sesion BETWEEN ap."FECHA_INICIO"::date AND ap."FECHA_FIN"::date
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."FICHAJES" f
      WHERE f."ID_PROFESOR"::text = sb."ID_PROFESOR"::text
        AND f."ID_CLIENTE"::text = sb."ID_CLIENTE"::text
        AND COALESCE(f."ESTADO", '') <> 'Anulado por Corrección'
        AND trim(f."TIPO_MOVIMIENTO") IN ('Entrada', 'Fin de Pausa')
        AND trim(f."TIPO_MOVIMIENTO") NOT ILIKE '%corrección%'
        AND f."FECHA_HORA"::timestamptz >= sb.inicio_tz - interval '15 minutes'
        AND f."FECHA_HORA"::timestamptz <= sb.inicio_tz + interval '1 minute'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_CLIENTE"::text = sb."ID_CLIENTE"::text
        AND a."MENSAJE" LIKE '[FICHAJE_ALERT:' || sb."ID_SESION"::text || ':entrada]%'
    );

  -- Salida: evaluar cuando now() >= HORA_FIN + 16 min (Europe/Madrid)
  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_PROFESOR",
    "ID_HORARIO",
    "ID_ESPECIALIDAD",
    "TIPO",
    "MENSAJE",
    "FECHA",
    "LEIDO"
  )
  SELECT
    sb."ID_CLIENTE",
    sb."ID_PROFESOR",
    sb."ID_HORARIO",
    sb."ESPECIALIDAD",
    'URGENTE',
    format(
      '[FICHAJE_ALERT:%s:salida] %s no ha fichado salida para la sesión del %s (%s-%s).',
      sb."ID_SESION",
      COALESCE(p."NOMBRE_PROFESOR", sb."ID_PROFESOR"::text),
      to_char(sb.fecha_sesion, 'DD/MM/YYYY'),
      to_char(sb."HORA_INICIO"::time, 'HH24:MI'),
      to_char(sb."HORA_FIN"::time, 'HH24:MI')
    ),
    now(),
    false
  FROM (
    SELECT DISTINCT ON (
      s."ID_PROFESOR",
      s."FECHA_EXACTA"::date,
      s."HORA_INICIO",
      COALESCE(s."ID_AULA", ''::text)
    )
      s."ID_SESION",
      s."ID_CLIENTE",
      s."ID_PROFESOR",
      s."ID_HORARIO",
      s."ESPECIALIDAD",
      s."FECHA_EXACTA"::date AS fecha_sesion,
      s."HORA_INICIO",
      s."HORA_FIN",
      ((s."FECHA_EXACTA"::date + s."HORA_INICIO"::time) AT TIME ZONE 'Europe/Madrid') AS inicio_tz,
      ((s."FECHA_EXACTA"::date + s."HORA_FIN"::time) AT TIME ZONE 'Europe/Madrid') AS fin_tz
    FROM public."SESIONES" s
    WHERE s."ID_PROFESOR" IS NOT NULL
      AND trim(s."ID_PROFESOR") <> ''
      AND s."HORA_INICIO" IS NOT NULL
      AND s."HORA_FIN" IS NOT NULL
      AND COALESCE(s."ESTADO", '') NOT IN ('Cancelada', 'Incidencia')
    ORDER BY
      s."ID_PROFESOR",
      s."FECHA_EXACTA"::date,
      s."HORA_INICIO",
      COALESCE(s."ID_AULA", ''::text),
      s."ID_SESION"
  ) sb
  JOIN public."PROFESOR" p
    ON p."ID_PROFESOR"::text = sb."ID_PROFESOR"::text
   AND p."ID_CLIENTE"::text = sb."ID_CLIENTE"::text
  WHERE now() >= sb.fin_tz + interval '16 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public."AUSENCIAS_PERMISOS" ap
      WHERE ap."ID_PROFESOR"::text = sb."ID_PROFESOR"::text
        AND ap."ID_CLIENTE"::text = sb."ID_CLIENTE"::text
        AND ap."ESTADO" = 'Aprobado'
        AND sb.fecha_sesion BETWEEN ap."FECHA_INICIO"::date AND ap."FECHA_FIN"::date
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."FICHAJES" f
      WHERE f."ID_PROFESOR"::text = sb."ID_PROFESOR"::text
        AND f."ID_CLIENTE"::text = sb."ID_CLIENTE"::text
        AND COALESCE(f."ESTADO", '') <> 'Anulado por Corrección'
        AND trim(f."TIPO_MOVIMIENTO") = 'Salida'
        AND trim(f."TIPO_MOVIMIENTO") NOT ILIKE '%corrección%'
        AND f."FECHA_HORA"::timestamptz >= sb.inicio_tz
        AND f."FECHA_HORA"::timestamptz <= sb.fin_tz + interval '16 minutes'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_CLIENTE"::text = sb."ID_CLIENTE"::text
        AND a."MENSAJE" LIKE '[FICHAJE_ALERT:' || sb."ID_SESION"::text || ':salida]%'
    );
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'job_alertas_fichaje_sesiones';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'job_alertas_fichaje_sesiones',
    '* * * * *',
    'SELECT public.sys_alertas_fichaje_sesiones()'
  );
END;
$$;
