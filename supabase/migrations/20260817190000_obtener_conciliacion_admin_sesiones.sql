-- Conciliación fichaje ↔ SESIONES (±15 min entrada / +15 min salida).
-- Fuente: FICHAJES. SESIONES.HORA_* = hora local Europe/Madrid; FECHA_HORA fichaje = timestamptz (UTC).

DROP FUNCTION IF EXISTS public.obtener_conciliacion_admin(uuid, date, date);
DROP FUNCTION IF EXISTS public.obtener_conciliacion_admin(text, date, date);

CREATE OR REPLACE FUNCTION public.obtener_conciliacion_admin(
  p_id_cliente text,
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS TABLE (
  "ID_FICHAJE" text,
  "ID_PROFESOR" text,
  "ID_CENTRO" text,
  "NOMBRE_PROFESOR" text,
  "TIPO_MOVIMIENTO" text,
  "FECHA_HORA_REAL" timestamptz,
  "HORA_REAL" text,
  "HORA_TEORICA_IDEAL" text,
  "DIFERENCIA_MINUTOS" integer,
  "ESTADO_TOLERANCIA" text,
  "ESTADO_LEGAL" text,
  "ID_FICHAJE_CORREGIDO" text,
  "METODO" text,
  "TOTAL_HORAS_INTERVALO" numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sesiones_bloque AS (
    SELECT DISTINCT ON (
      s."ID_PROFESOR",
      s."FECHA_EXACTA"::date,
      s."HORA_INICIO",
      COALESCE(s."ID_AULA", ''::text)
    )
      s."ID_PROFESOR",
      s."FECHA_EXACTA"::date AS fecha_sesion,
      s."HORA_INICIO",
      s."HORA_FIN",
      ((s."FECHA_EXACTA"::date + s."HORA_INICIO"::time) AT TIME ZONE 'Europe/Madrid') AS inicio_tz,
      ((s."FECHA_EXACTA"::date + s."HORA_FIN"::time) AT TIME ZONE 'Europe/Madrid') AS fin_tz
    FROM public."SESIONES" s
    WHERE s."ID_CLIENTE" = p_id_cliente
      AND s."ID_PROFESOR" IS NOT NULL
      AND trim(s."ID_PROFESOR") <> ''
      AND s."HORA_INICIO" IS NOT NULL
      AND s."HORA_FIN" IS NOT NULL
      AND s."FECHA_EXACTA"::date BETWEEN p_fecha_desde AND p_fecha_hasta
      AND COALESCE(s."ESTADO", '') NOT IN ('Cancelada', 'Incidencia')
    ORDER BY
      s."ID_PROFESOR",
      s."FECHA_EXACTA"::date,
      s."HORA_INICIO",
      COALESCE(s."ID_AULA", ''::text),
      s."ID_SESION"
  ),
  fichajes_rango AS (
    SELECT
      f."ID_FICHAJE",
      f."ID_PROFESOR",
      f."ID_CENTRO",
      p."NOMBRE_PROFESOR",
      f."TIPO_MOVIMIENTO",
      f."FECHA_HORA"::timestamptz AS fecha_hora_real,
      trim(f."TIPO_MOVIMIENTO") AS tipo_norm,
      (f."FECHA_HORA"::timestamptz AT TIME ZONE 'Europe/Madrid')::date AS fecha_fichaje,
      COALESCE(f."ESTADO", '') AS estado_legal,
      f."ID_FICHAJE_CORREGIDO",
      f."METODO",
      CASE
        WHEN f."TOTAL_HORAS_INTERVALO" IS NULL THEN NULL::numeric
        ELSE round(
          (EXTRACT(EPOCH FROM f."TOTAL_HORAS_INTERVALO"::interval) / 3600.0)::numeric,
          4
        )
      END AS total_horas_intervalo
    FROM public."FICHAJES" f
    LEFT JOIN public."PROFESOR" p
      ON p."ID_PROFESOR"::text = f."ID_PROFESOR"::text
     AND p."ID_CLIENTE"::text = f."ID_CLIENTE"::text
    WHERE f."ID_CLIENTE" = p_id_cliente
      AND (f."FECHA_HORA"::timestamptz AT TIME ZONE 'Europe/Madrid')::date
        BETWEEN p_fecha_desde AND p_fecha_hasta
  ),
  conciliados AS (
    SELECT
      fr."ID_FICHAJE",
      fr."ID_PROFESOR",
      fr."ID_CENTRO",
      fr."NOMBRE_PROFESOR",
      fr."TIPO_MOVIMIENTO",
      fr.fecha_hora_real,
      fr.tipo_norm,
      fr.fecha_fichaje,
      fr.estado_legal,
      fr."ID_FICHAJE_CORREGIDO",
      fr."METODO",
      fr.total_horas_intervalo,
      m.hora_teorica_match,
      m.diferencia_minutos,
      m.estado_tolerancia
    FROM fichajes_rango fr
    LEFT JOIN LATERAL (
      SELECT
        CASE
          WHEN fr.tipo_norm IN ('Entrada', 'Fin de Pausa') THEN sb."HORA_INICIO"::time
          WHEN fr.tipo_norm IN ('Salida', 'Inicio Pausa') THEN sb."HORA_FIN"::time
          ELSE NULL::time
        END AS hora_teorica_match,
        CASE
          WHEN fr.tipo_norm IN ('Entrada', 'Fin de Pausa') THEN round(
            extract(epoch FROM (fr.fecha_hora_real - sb.inicio_tz)) / 60.0
          )::integer
          WHEN fr.tipo_norm IN ('Salida', 'Inicio Pausa') THEN round(
            extract(epoch FROM (fr.fecha_hora_real - sb.fin_tz)) / 60.0
          )::integer
          ELSE NULL::integer
        END AS diferencia_minutos,
        'Correcto'::text AS estado_tolerancia
      FROM sesiones_bloque sb
      WHERE sb."ID_PROFESOR"::text = fr."ID_PROFESOR"::text
        AND sb.fecha_sesion = fr.fecha_fichaje
        AND (
          (
            fr.tipo_norm IN ('Entrada', 'Fin de Pausa')
            AND fr.fecha_hora_real >= sb.inicio_tz - interval '15 minutes'
            AND fr.fecha_hora_real <= sb.fin_tz
          )
          OR (
            fr.tipo_norm IN ('Salida', 'Inicio Pausa')
            AND fr.fecha_hora_real >= sb.inicio_tz
            AND fr.fecha_hora_real <= sb.fin_tz + interval '15 minutes'
          )
        )
      ORDER BY abs(
        CASE
          WHEN fr.tipo_norm IN ('Entrada', 'Fin de Pausa') THEN extract(
            epoch FROM (fr.fecha_hora_real - sb.inicio_tz)
          )
          WHEN fr.tipo_norm IN ('Salida', 'Inicio Pausa') THEN extract(
            epoch FROM (fr.fecha_hora_real - sb.fin_tz)
          )
          ELSE 999999
        END
      )
      LIMIT 1
    ) m ON fr.estado_legal IS DISTINCT FROM 'Anulado por Corrección'
      AND fr.tipo_norm <> ''
      AND fr.tipo_norm NOT ILIKE '%corrección%'
  )
  SELECT
    c."ID_FICHAJE"::text,
    c."ID_PROFESOR"::text,
    c."ID_CENTRO"::text,
    c."NOMBRE_PROFESOR"::text,
    c."TIPO_MOVIMIENTO"::text,
    c.fecha_hora_real AS "FECHA_HORA_REAL",
    to_char(c.fecha_hora_real AT TIME ZONE 'Europe/Madrid', 'HH24:MI') AS "HORA_REAL",
    CASE
      WHEN c.hora_teorica_match IS NULL THEN '—'::text
      ELSE to_char(c.hora_teorica_match, 'HH24:MI')
    END AS "HORA_TEORICA_IDEAL",
    COALESCE(c.diferencia_minutos, 0)::integer AS "DIFERENCIA_MINUTOS",
    CASE
      WHEN c.estado_legal = 'Anulado por Corrección' THEN 'Alerta'::text
      WHEN c.tipo_norm ILIKE '%corrección%' THEN 'Alerta'::text
      WHEN c.estado_tolerancia = 'Correcto' THEN 'Correcto'::text
      ELSE 'Alerta'::text
    END AS "ESTADO_TOLERANCIA",
    c.estado_legal::text AS "ESTADO_LEGAL",
    c."ID_FICHAJE_CORREGIDO"::text,
    c."METODO"::text,
    c.total_horas_intervalo::numeric AS "TOTAL_HORAS_INTERVALO"
  FROM conciliados c
  ORDER BY c.fecha_hora_real ASC;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_conciliacion_admin(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_conciliacion_admin(text, date, date) TO service_role;
