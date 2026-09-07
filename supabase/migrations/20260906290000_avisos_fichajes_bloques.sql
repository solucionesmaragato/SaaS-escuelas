-- Fichajes: alertas por bloques de sesiones consecutivas (sin hueco), margen entrada +3 min,
-- ID_CENTRO desde la sesión, y actualización del aviso si el profesor ficha tarde.

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_FICHAJE" text NULL;

CREATE INDEX IF NOT EXISTS idx_avisos_fichaje
  ON public."AVISOS_INTERNOS" ("ID_FICHAJE")
  WHERE "ID_FICHAJE" IS NOT NULL;

DROP VIEW IF EXISTS public."VISTA_AVISOS_INTERNOS";

CREATE VIEW public."VISTA_AVISOS_INTERNOS"
WITH (security_invoker = true)
AS
SELECT
  a."ID_AVISO",
  a."ID_CLIENTE",
  a."ID_CENTRO",
  a."ID_CURSO",
  a."ID_HORARIO",
  a."ID_ALUMNO",
  a."ID_PROFESOR",
  a."ID_ESPECIALIDAD",
  a."ID_MANDATO",
  a."ID_INCIDENCIA",
  a."ID_MATRICULA",
  a."ID_GRUPO",
  a."ID_PRESTAMO",
  a."ID_PERMISO",
  a."ID_DOCUMENTO",
  a."ID_FICHAJE",
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  a."CANTIDAD",
  l."NOMBRE" AS "NOMBRE_LEAD",
  al."NOMBRE_ALUMNO" AS "NOMBRE_ALUMNO"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD"
LEFT JOIN public."ALUMNOS" al ON a."ID_ALUMNO" = al."ID_ALUMNO";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;

CREATE OR REPLACE FUNCTION public.sys_alertas_fichaje_sesiones()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Entrada: evaluar cuando now() >= inicio_bloque + 3 min (Europe/Madrid)
  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_PROFESOR",
    "ID_HORARIO",
    "ID_ESPECIALIDAD",
    "TIPO",
    "MENSAJE",
    "FECHA",
    "LEIDO"
  )
  SELECT
    bl."ID_CLIENTE",
    bl."ID_CENTRO",
    bl."ID_PROFESOR",
    bl."ID_HORARIO",
    bl."ESPECIALIDAD",
    'URGENTE',
    format(
      '[FICHAJE_ALERT:%s:entrada] %s no ha fichado entrada para el bloque del %s (%s-%s).',
      bl."ID_SESION_BLOQUE",
      COALESCE(p."NOMBRE_PROFESOR", bl."ID_PROFESOR"::text),
      to_char(bl.fecha_sesion, 'DD/MM/YYYY'),
      to_char(bl."HORA_INICIO_BLOQUE"::time, 'HH24:MI'),
      to_char(bl."HORA_FIN_BLOQUE"::time, 'HH24:MI')
    ),
    now(),
    false
  FROM (
    WITH sesiones_base AS (
      SELECT
        s."ID_SESION",
        s."ID_CLIENTE",
        s."ID_PROFESOR",
        s."ID_CENTRO",
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
    ),
    sesiones_con_prev AS (
      SELECT
        sb.*,
        lag(sb."HORA_FIN") OVER (
          PARTITION BY sb."ID_PROFESOR", sb."ID_CLIENTE", sb.fecha_sesion
          ORDER BY sb."HORA_INICIO", sb."ID_SESION"
        ) AS prev_hora_fin
      FROM sesiones_base sb
    ),
    sesiones_con_bloque AS (
      SELECT
        scp.*,
        sum(
          CASE
            WHEN scp.prev_hora_fin IS NULL OR scp.prev_hora_fin <> scp."HORA_INICIO" THEN 1
            ELSE 0
          END
        ) OVER (
          PARTITION BY scp."ID_PROFESOR", scp."ID_CLIENTE", scp.fecha_sesion
          ORDER BY scp."HORA_INICIO", scp."ID_SESION"
        ) AS block_num
      FROM sesiones_con_prev scp
    ),
    bloques AS (
      SELECT
        scb."ID_CLIENTE",
        scb."ID_PROFESOR",
        scb.fecha_sesion,
        scb.block_num,
        min(scb."ID_SESION") AS "ID_SESION_BLOQUE",
        min(scb.inicio_tz) AS inicio_tz,
        max(scb.fin_tz) AS fin_tz,
        min(scb."HORA_INICIO") AS "HORA_INICIO_BLOQUE",
        max(scb."HORA_FIN") AS "HORA_FIN_BLOQUE",
        min(scb."ID_CENTRO") FILTER (WHERE scb."ID_CENTRO" IS NOT NULL AND trim(scb."ID_CENTRO") <> '') AS "ID_CENTRO",
        min(scb."ID_HORARIO") FILTER (WHERE scb."ID_HORARIO" IS NOT NULL AND trim(scb."ID_HORARIO") <> '') AS "ID_HORARIO",
        min(scb."ESPECIALIDAD") FILTER (WHERE scb."ESPECIALIDAD" IS NOT NULL AND trim(scb."ESPECIALIDAD") <> '') AS "ESPECIALIDAD"
      FROM sesiones_con_bloque scb
      GROUP BY scb."ID_CLIENTE", scb."ID_PROFESOR", scb.fecha_sesion, scb.block_num
    )
    SELECT * FROM bloques
  ) bl
  JOIN public."PROFESOR" p
    ON p."ID_PROFESOR"::text = bl."ID_PROFESOR"::text
   AND p."ID_CLIENTE"::text = bl."ID_CLIENTE"::text
  WHERE now() >= bl.inicio_tz + interval '3 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public."AUSENCIAS_PERMISOS" ap
      WHERE ap."ID_PROFESOR"::text = bl."ID_PROFESOR"::text
        AND ap."ID_CLIENTE"::text = bl."ID_CLIENTE"::text
        AND ap."ESTADO" = 'Aprobado'
        AND bl.fecha_sesion BETWEEN ap."FECHA_INICIO"::date AND ap."FECHA_FIN"::date
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."FICHAJES" f
      WHERE f."ID_PROFESOR"::text = bl."ID_PROFESOR"::text
        AND f."ID_CLIENTE"::text = bl."ID_CLIENTE"::text
        AND COALESCE(f."ESTADO", '') <> 'Anulado por Corrección'
        AND trim(f."TIPO_MOVIMIENTO") IN ('Entrada', 'Fin de Pausa')
        AND trim(f."TIPO_MOVIMIENTO") NOT ILIKE '%corrección%'
        AND f."FECHA_HORA"::timestamptz >= bl.inicio_tz - interval '15 minutes'
        AND f."FECHA_HORA"::timestamptz <= bl.inicio_tz + interval '3 minutes'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_CLIENTE"::text = bl."ID_CLIENTE"::text
        AND a."MENSAJE" LIKE '[FICHAJE_ALERT:' || bl."ID_SESION_BLOQUE"::text || ':entrada]%'
    );

  -- Salida: evaluar cuando now() >= fin_bloque + 16 min (Europe/Madrid)
  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_PROFESOR",
    "ID_HORARIO",
    "ID_ESPECIALIDAD",
    "TIPO",
    "MENSAJE",
    "FECHA",
    "LEIDO"
  )
  SELECT
    bl."ID_CLIENTE",
    bl."ID_CENTRO",
    bl."ID_PROFESOR",
    bl."ID_HORARIO",
    bl."ESPECIALIDAD",
    'URGENTE',
    format(
      '[FICHAJE_ALERT:%s:salida] %s no ha fichado salida para el bloque del %s (%s-%s).',
      bl."ID_SESION_BLOQUE",
      COALESCE(p."NOMBRE_PROFESOR", bl."ID_PROFESOR"::text),
      to_char(bl.fecha_sesion, 'DD/MM/YYYY'),
      to_char(bl."HORA_INICIO_BLOQUE"::time, 'HH24:MI'),
      to_char(bl."HORA_FIN_BLOQUE"::time, 'HH24:MI')
    ),
    now(),
    false
  FROM (
    WITH sesiones_base AS (
      SELECT
        s."ID_SESION",
        s."ID_CLIENTE",
        s."ID_PROFESOR",
        s."ID_CENTRO",
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
    ),
    sesiones_con_prev AS (
      SELECT
        sb.*,
        lag(sb."HORA_FIN") OVER (
          PARTITION BY sb."ID_PROFESOR", sb."ID_CLIENTE", sb.fecha_sesion
          ORDER BY sb."HORA_INICIO", sb."ID_SESION"
        ) AS prev_hora_fin
      FROM sesiones_base sb
    ),
    sesiones_con_bloque AS (
      SELECT
        scp.*,
        sum(
          CASE
            WHEN scp.prev_hora_fin IS NULL OR scp.prev_hora_fin <> scp."HORA_INICIO" THEN 1
            ELSE 0
          END
        ) OVER (
          PARTITION BY scp."ID_PROFESOR", scp."ID_CLIENTE", scp.fecha_sesion
          ORDER BY scp."HORA_INICIO", scp."ID_SESION"
        ) AS block_num
      FROM sesiones_con_prev scp
    ),
    bloques AS (
      SELECT
        scb."ID_CLIENTE",
        scb."ID_PROFESOR",
        scb.fecha_sesion,
        scb.block_num,
        min(scb."ID_SESION") AS "ID_SESION_BLOQUE",
        min(scb.inicio_tz) AS inicio_tz,
        max(scb.fin_tz) AS fin_tz,
        min(scb."HORA_INICIO") AS "HORA_INICIO_BLOQUE",
        max(scb."HORA_FIN") AS "HORA_FIN_BLOQUE",
        min(scb."ID_CENTRO") FILTER (WHERE scb."ID_CENTRO" IS NOT NULL AND trim(scb."ID_CENTRO") <> '') AS "ID_CENTRO",
        min(scb."ID_HORARIO") FILTER (WHERE scb."ID_HORARIO" IS NOT NULL AND trim(scb."ID_HORARIO") <> '') AS "ID_HORARIO",
        min(scb."ESPECIALIDAD") FILTER (WHERE scb."ESPECIALIDAD" IS NOT NULL AND trim(scb."ESPECIALIDAD") <> '') AS "ESPECIALIDAD"
      FROM sesiones_con_bloque scb
      GROUP BY scb."ID_CLIENTE", scb."ID_PROFESOR", scb.fecha_sesion, scb.block_num
    )
    SELECT * FROM bloques
  ) bl
  JOIN public."PROFESOR" p
    ON p."ID_PROFESOR"::text = bl."ID_PROFESOR"::text
   AND p."ID_CLIENTE"::text = bl."ID_CLIENTE"::text
  WHERE now() >= bl.fin_tz + interval '16 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public."AUSENCIAS_PERMISOS" ap
      WHERE ap."ID_PROFESOR"::text = bl."ID_PROFESOR"::text
        AND ap."ID_CLIENTE"::text = bl."ID_CLIENTE"::text
        AND ap."ESTADO" = 'Aprobado'
        AND bl.fecha_sesion BETWEEN ap."FECHA_INICIO"::date AND ap."FECHA_FIN"::date
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."FICHAJES" f
      WHERE f."ID_PROFESOR"::text = bl."ID_PROFESOR"::text
        AND f."ID_CLIENTE"::text = bl."ID_CLIENTE"::text
        AND COALESCE(f."ESTADO", '') <> 'Anulado por Corrección'
        AND trim(f."TIPO_MOVIMIENTO") = 'Salida'
        AND trim(f."TIPO_MOVIMIENTO") NOT ILIKE '%corrección%'
        AND f."FECHA_HORA"::timestamptz >= bl.inicio_tz
        AND f."FECHA_HORA"::timestamptz <= bl.fin_tz + interval '16 minutes'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."ID_CLIENTE"::text = bl."ID_CLIENTE"::text
        AND a."MENSAJE" LIKE '[FICHAJE_ALERT:' || bl."ID_SESION_BLOQUE"::text || ':salida]%'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_fichaje_entrada_tarde(p_id_fichaje text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_f RECORD;
  v_block RECORD;
  v_nombre text;
  v_minutos int;
BEGIN
  IF p_id_fichaje IS NULL OR trim(p_id_fichaje) = '' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_f
  FROM public."FICHAJES"
  WHERE "ID_FICHAJE" = p_id_fichaje;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF trim(COALESCE(v_f."TIPO_MOVIMIENTO", '')) NOT IN ('Entrada', 'Fin de Pausa') THEN
    RETURN;
  END IF;

  IF COALESCE(v_f."ESTADO", '') = 'Anulado por Corrección'
     OR trim(COALESCE(v_f."TIPO_MOVIMIENTO", '')) ILIKE '%corrección%' THEN
    RETURN;
  END IF;

  SELECT
    bl."ID_SESION_BLOQUE",
    bl.inicio_tz,
    bl.fin_tz,
    bl.fecha_sesion,
    bl."HORA_INICIO_BLOQUE",
    bl."HORA_FIN_BLOQUE"
  INTO v_block
  FROM (
    WITH sesiones_base AS (
      SELECT
        s."ID_SESION",
        s."ID_CLIENTE",
        s."ID_PROFESOR",
        s."FECHA_EXACTA"::date AS fecha_sesion,
        s."HORA_INICIO",
        s."HORA_FIN",
        ((s."FECHA_EXACTA"::date + s."HORA_INICIO"::time) AT TIME ZONE 'Europe/Madrid') AS inicio_tz,
        ((s."FECHA_EXACTA"::date + s."HORA_FIN"::time) AT TIME ZONE 'Europe/Madrid') AS fin_tz
      FROM public."SESIONES" s
      WHERE s."ID_PROFESOR"::text = v_f."ID_PROFESOR"::text
        AND s."ID_CLIENTE"::text = v_f."ID_CLIENTE"::text
        AND COALESCE(s."ESTADO", '') NOT IN ('Cancelada', 'Incidencia')
        AND s."HORA_INICIO" IS NOT NULL
        AND s."HORA_FIN" IS NOT NULL
    ),
    sesiones_con_prev AS (
      SELECT
        sb.*,
        lag(sb."HORA_FIN") OVER (
          PARTITION BY sb."ID_PROFESOR", sb."ID_CLIENTE", sb.fecha_sesion
          ORDER BY sb."HORA_INICIO", sb."ID_SESION"
        ) AS prev_hora_fin
      FROM sesiones_base sb
    ),
    sesiones_con_bloque AS (
      SELECT
        scp.*,
        sum(
          CASE
            WHEN scp.prev_hora_fin IS NULL OR scp.prev_hora_fin <> scp."HORA_INICIO" THEN 1
            ELSE 0
          END
        ) OVER (
          PARTITION BY scp."ID_PROFESOR", scp."ID_CLIENTE", scp.fecha_sesion
          ORDER BY scp."HORA_INICIO", scp."ID_SESION"
        ) AS block_num
      FROM sesiones_con_prev scp
    ),
    bloques AS (
      SELECT
        scb."ID_CLIENTE",
        scb."ID_PROFESOR",
        scb.fecha_sesion,
        scb.block_num,
        min(scb."ID_SESION") AS "ID_SESION_BLOQUE",
        min(scb.inicio_tz) AS inicio_tz,
        max(scb.fin_tz) AS fin_tz,
        min(scb."HORA_INICIO") AS "HORA_INICIO_BLOQUE",
        max(scb."HORA_FIN") AS "HORA_FIN_BLOQUE"
      FROM sesiones_con_bloque scb
      GROUP BY scb."ID_CLIENTE", scb."ID_PROFESOR", scb.fecha_sesion, scb.block_num
    )
    SELECT *
    FROM bloques bl
    WHERE bl.fecha_sesion = (v_f."FECHA_HORA"::timestamptz AT TIME ZONE 'Europe/Madrid')::date
      AND v_f."FECHA_HORA"::timestamptz >= bl.inicio_tz - interval '15 minutes'
      AND v_f."FECHA_HORA"::timestamptz <= bl.fin_tz
    ORDER BY bl.inicio_tz
    LIMIT 1
  ) bl;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_f."FECHA_HORA"::timestamptz <= v_block.inicio_tz + interval '3 minutes' THEN
    RETURN;
  END IF;

  v_minutos := greatest(
    1,
    ceil(extract(epoch FROM (v_f."FECHA_HORA"::timestamptz - v_block.inicio_tz)) / 60.0)::int
  );

  SELECT "NOMBRE_PROFESOR"
  INTO v_nombre
  FROM public."PROFESOR"
  WHERE "ID_PROFESOR"::text = v_f."ID_PROFESOR"::text
    AND "ID_CLIENTE"::text = v_f."ID_CLIENTE"::text
  LIMIT 1;

  v_nombre := COALESCE(v_nombre, v_f."ID_PROFESOR"::text);

  UPDATE public."AVISOS_INTERNOS" a
  SET
    "MENSAJE" = format(
      '[FICHAJE_ALERT:%s:entrada] %s ha fichado %s minutos tarde para el bloque del %s (%s-%s).',
      v_block."ID_SESION_BLOQUE",
      v_nombre,
      v_minutos,
      to_char(v_block.fecha_sesion, 'DD/MM/YYYY'),
      to_char(v_block."HORA_INICIO_BLOQUE"::time, 'HH24:MI'),
      to_char(v_block."HORA_FIN_BLOQUE"::time, 'HH24:MI')
    ),
    "ID_FICHAJE" = p_id_fichaje,
    "FECHA" = now()
  WHERE a."ID_CLIENTE"::text = v_f."ID_CLIENTE"::text
    AND a."MENSAJE" LIKE '[FICHAJE_ALERT:' || v_block."ID_SESION_BLOQUE"::text || ':entrada]%'
    AND COALESCE(a."LEIDO", false) = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_aviso_fichaje_entrada_tarde()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_sync_aviso_fichaje_entrada_tarde(NEW."ID_FICHAJE");
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_aviso_fichaje_entrada_tarde ON public."FICHAJES";

CREATE TRIGGER tr_aviso_fichaje_entrada_tarde
  AFTER INSERT ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_fichaje_entrada_tarde();
