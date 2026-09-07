-- Fichajes: ventanas de validación en tg_procesar_metricas (±15/+3/+16 min por bloque)
-- y avisos de pausa prolongada (>20 min sin clase programada).

CREATE OR REPLACE FUNCTION public.fn_fichaje_bloques_profesor(
  p_id_cliente text,
  p_id_profesor text,
  p_fecha date
)
RETURNS TABLE (
  "ID_SESION_BLOQUE" text,
  "ID_CENTRO" text,
  fecha_sesion date,
  inicio_tz timestamptz,
  fin_tz timestamptz,
  "HORA_INICIO_BLOQUE" time,
  "HORA_FIN_BLOQUE" time
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH sesiones_base AS (
    SELECT
      s."ID_SESION",
      s."ID_CLIENTE",
      s."ID_PROFESOR",
      s."ID_CENTRO",
      s."FECHA_EXACTA"::date AS fecha_sesion,
      s."HORA_INICIO",
      s."HORA_FIN",
      ((s."FECHA_EXACTA"::date + s."HORA_INICIO"::time) AT TIME ZONE 'Europe/Madrid') AS inicio_tz,
      ((s."FECHA_EXACTA"::date + s."HORA_FIN"::time) AT TIME ZONE 'Europe/Madrid') AS fin_tz
    FROM public."SESIONES" s
    WHERE s."ID_CLIENTE"::text = p_id_cliente::text
      AND s."ID_PROFESOR"::text = p_id_profesor::text
      AND s."FECHA_EXACTA"::date = p_fecha
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
      min(scb."ID_CENTRO") FILTER (
        WHERE scb."ID_CENTRO" IS NOT NULL AND trim(scb."ID_CENTRO") <> ''
      ) AS "ID_CENTRO"
    FROM sesiones_con_bloque scb
    GROUP BY scb."ID_CLIENTE", scb."ID_PROFESOR", scb.fecha_sesion, scb.block_num
  )
  SELECT
    b."ID_SESION_BLOQUE",
    b."ID_CENTRO",
    b.fecha_sesion,
    b.inicio_tz,
    b.fin_tz,
    b."HORA_INICIO_BLOQUE",
    b."HORA_FIN_BLOQUE"
  FROM bloques b;
$$;

CREATE OR REPLACE FUNCTION public.tg_procesar_metricas_y_alertas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original RECORD;
  v_original_encontrado boolean := false;
  v_ultima_entrada timestamp without time zone;
  v_proxima_salida_id text;
  v_proxima_salida_hora timestamp without time zone;
  v_fecha_madrid date;
  v_movimiento text;
  v_tiene_bloques boolean;
  v_en_ventana boolean;
BEGIN
  -- SECTION 1: Control de rectificaciones
  IF NEW."ID_FICHAJE_CORREGIDO" IS NOT NULL AND NEW."ID_FICHAJE_CORREGIDO" <> '' THEN
    SELECT * INTO v_original
    FROM public."FICHAJES"
    WHERE "ID_FICHAJE" = NEW."ID_FICHAJE_CORREGIDO";

    IF FOUND THEN
      v_original_encontrado := true;
      NEW."ID_CENTRO" := COALESCE(NEW."ID_CENTRO", v_original."ID_CENTRO");
      NEW."ID_CURSO" := COALESCE(NEW."ID_CURSO", v_original."ID_CURSO");
      NEW."ID_PROFESOR" := COALESCE(NEW."ID_PROFESOR", v_original."ID_PROFESOR");

      IF NEW."TIPO_MOVIMIENTO" = 'Corrección Aprobada' THEN
        NEW."TIPO_MOVIMIENTO" := v_original."TIPO_MOVIMIENTO";
      END IF;
    END IF;
  END IF;

  v_movimiento := trim(COALESCE(NEW."TIPO_MOVIMIENTO", ''));
  v_fecha_madrid := (NEW."FECHA_HORA"::timestamptz AT TIME ZONE 'Europe/Madrid')::date;

  -- SECTION 2: Validar ventanas por bloque de sesiones
  IF v_movimiento IN ('Entrada', 'Fin de Pausa') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.fn_fichaje_bloques_profesor(
        NEW."ID_CLIENTE"::text,
        NEW."ID_PROFESOR"::text,
        v_fecha_madrid
      ) bl
    ) INTO v_tiene_bloques;

    SELECT EXISTS (
      SELECT 1
      FROM public.fn_fichaje_bloques_profesor(
        NEW."ID_CLIENTE"::text,
        NEW."ID_PROFESOR"::text,
        v_fecha_madrid
      ) bl
      WHERE NEW."FECHA_HORA"::timestamptz >= bl.inicio_tz - interval '15 minutes'
        AND NEW."FECHA_HORA"::timestamptz <= bl.inicio_tz + interval '3 minutes'
    ) INTO v_en_ventana;

    IF v_en_ventana THEN
      NEW."ESTADO" := 'Correcto';
    ELSIF v_tiene_bloques THEN
      NEW."ESTADO" := 'Alerta';
      NEW."NOTAS" := COALESCE(NEW."NOTAS", '')
        || ' [Alerta: Fichaje fuera de ventana de entrada (±15/+3 min del bloque)].';
    ELSE
      NEW."ESTADO" := 'Alerta';
      NEW."NOTAS" := COALESCE(NEW."NOTAS", '')
        || ' [Alerta: Fichaje sin clase programada].';
    END IF;
  ELSIF v_movimiento = 'Salida' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.fn_fichaje_bloques_profesor(
        NEW."ID_CLIENTE"::text,
        NEW."ID_PROFESOR"::text,
        v_fecha_madrid
      ) bl
    ) INTO v_tiene_bloques;

    SELECT EXISTS (
      SELECT 1
      FROM public.fn_fichaje_bloques_profesor(
        NEW."ID_CLIENTE"::text,
        NEW."ID_PROFESOR"::text,
        v_fecha_madrid
      ) bl
      WHERE NEW."FECHA_HORA"::timestamptz >= bl.inicio_tz
        AND NEW."FECHA_HORA"::timestamptz <= bl.fin_tz + interval '16 minutes'
    ) INTO v_en_ventana;

    IF v_en_ventana THEN
      NEW."ESTADO" := 'Correcto';
    ELSIF v_tiene_bloques THEN
      NEW."ESTADO" := 'Alerta';
      NEW."NOTAS" := COALESCE(NEW."NOTAS", '')
        || ' [Alerta: Fichaje fuera de ventana de salida (fin de bloque +16 min)].';
    ELSE
      NEW."ESTADO" := 'Alerta';
      NEW."NOTAS" := COALESCE(NEW."NOTAS", '')
        || ' [Alerta: Salida sin clase programada].';
    END IF;
  END IF;

  -- SECTION 3: Cálculo automático de intervalos
  IF v_movimiento = 'Salida' THEN
    SELECT "FECHA_HORA" INTO v_ultima_entrada
    FROM public."FICHAJES"
    WHERE "ID_PROFESOR" = NEW."ID_PROFESOR"
      AND "ID_CLIENTE" = NEW."ID_CLIENTE"
      AND "TIPO_MOVIMIENTO" = 'Entrada'
      AND "FECHA_HORA" <= NEW."FECHA_HORA"
      AND "ID_FICHAJE" <> COALESCE(NEW."ID_FICHAJE_CORREGIDO", '')
    ORDER BY "FECHA_HORA" DESC
    LIMIT 1;

    IF v_ultima_entrada IS NOT NULL THEN
      NEW."TOTAL_HORAS_INTERVALO" := (NEW."FECHA_HORA" - v_ultima_entrada)::time;
    END IF;
  END IF;

  -- SECTION 4: Repercusión blindada contra el Error 55000
  IF v_original_encontrado THEN
    IF v_original."TIPO_MOVIMIENTO" = 'Entrada' THEN
      SELECT "ID_FICHAJE", "FECHA_HORA" INTO v_proxima_salida_id, v_proxima_salida_hora
      FROM public."FICHAJES"
      WHERE "ID_PROFESOR" = NEW."ID_PROFESOR"
        AND "ID_CLIENTE" = NEW."ID_CLIENTE"
        AND "TIPO_MOVIMIENTO" = 'Salida'
        AND "FECHA_HORA" > v_original."FECHA_HORA"
      ORDER BY "FECHA_HORA" ASC
      LIMIT 1;

      IF v_proxima_salida_id IS NOT NULL THEN
        UPDATE public."FICHAJES"
        SET "TOTAL_HORAS_INTERVALO" = (v_proxima_salida_hora - NEW."FECHA_HORA")::time
        WHERE "ID_FICHAJE" = v_proxima_salida_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sys_alertas_fichaje_pausa_larga()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hora_actual time := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::time;
  v_fecha_actual date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_PROFESOR",
    "ID_FICHAJE",
    "TIPO",
    "MENSAJE",
    "FECHA",
    "LEIDO"
  )
  SELECT
    uf."ID_CLIENTE",
    uf."ID_CENTRO",
    uf."ID_PROFESOR",
    uf."ID_FICHAJE",
    'Fichaje pausa prolongada',
    format(
      '[FICHAJE_PAUSA_ALERT:%s] %s lleva más de 20 minutos en pausa sin clase programada (desde %s).',
      uf."ID_FICHAJE",
      COALESCE(p."NOMBRE_PROFESOR", uf."ID_PROFESOR"::text),
      to_char(uf."FECHA_HORA"::timestamptz AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
    ),
    now(),
    false
  FROM (
    SELECT DISTINCT ON (f."ID_PROFESOR", f."ID_CLIENTE")
      f."ID_FICHAJE",
      f."ID_CLIENTE",
      f."ID_CENTRO",
      f."ID_PROFESOR",
      f."FECHA_HORA",
      f."TIPO_MOVIMIENTO"
    FROM public."FICHAJES" f
    WHERE trim(f."TIPO_MOVIMIENTO") IN ('Entrada', 'Salida', 'Inicio Pausa', 'Fin de Pausa')
      AND COALESCE(f."ESTADO", '') <> 'Anulado por Corrección'
      AND (f."FECHA_HORA"::timestamptz AT TIME ZONE 'Europe/Madrid')::date = v_fecha_actual
    ORDER BY f."ID_PROFESOR", f."ID_CLIENTE", f."FECHA_HORA" DESC
  ) uf
  JOIN public."PROFESOR" p
    ON p."ID_PROFESOR"::text = uf."ID_PROFESOR"::text
   AND p."ID_CLIENTE"::text = uf."ID_CLIENTE"::text
  WHERE trim(uf."TIPO_MOVIMIENTO") = 'Inicio Pausa'
    AND uf."FECHA_HORA"::timestamptz <= now() - interval '20 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM public."SESIONES" s
      WHERE s."ID_PROFESOR"::text = uf."ID_PROFESOR"::text
        AND s."ID_CLIENTE"::text = uf."ID_CLIENTE"::text
        AND s."FECHA_EXACTA"::date = v_fecha_actual
        AND v_hora_actual >= s."HORA_INICIO"
        AND v_hora_actual <= s."HORA_FIN"
        AND COALESCE(s."ESTADO", '') NOT IN ('Cancelada', 'Incidencia')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS" a
      WHERE a."MENSAJE" LIKE '[FICHAJE_PAUSA_ALERT:' || uf."ID_FICHAJE"::text || ']%'
    );
END;
$$;

DROP POLICY IF EXISTS "Profesor_Select_Avisos_Fichaje" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Select_Avisos_Fichaje"
  ON public."AVISOS_INTERNOS"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND (
      ("TIPO" = 'URGENTE' AND "MENSAJE" LIKE '[FICHAJE_ALERT:%')
      OR "TIPO" = 'Fichaje pausa prolongada'
    )
  );

DROP POLICY IF EXISTS "Profesor_Update_Avisos_Fichaje" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Update_Avisos_Fichaje"
  ON public."AVISOS_INTERNOS"
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND (
      ("TIPO" = 'URGENTE' AND "MENSAJE" LIKE '[FICHAJE_ALERT:%')
      OR "TIPO" = 'Fichaje pausa prolongada'
    )
  )
  WITH CHECK (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND (
      ("TIPO" = 'URGENTE' AND "MENSAJE" LIKE '[FICHAJE_ALERT:%')
      OR "TIPO" = 'Fichaje pausa prolongada'
    )
  );
