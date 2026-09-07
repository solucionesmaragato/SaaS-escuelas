-- A: NOTAS de ventana métricas siempre con [Incidencia: …] (no [Alerta: …]).

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

  IF trim(COALESCE(NEW."METODO", '')) = 'Manual Web'
     AND (NEW."ID_FICHAJE_CORREGIDO" IS NULL OR trim(NEW."ID_FICHAJE_CORREGIDO") = '') THEN
    NEW."ESTADO" := 'Pendiente de aceptación';
  ELSIF v_movimiento = 'Modificación Pendiente' THEN
    NEW."ESTADO" := 'Pendiente de aceptación modificación';
  ELSIF v_movimiento IN ('Entrada', 'Fin de Pausa') THEN
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
        || ' [Incidencia: Fichaje fuera de ventana de entrada].';
    ELSE
      NEW."ESTADO" := 'Alerta';
      NEW."NOTAS" := COALESCE(NEW."NOTAS", '')
        || ' [Incidencia: Fichaje sin clase programada].';
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
        || ' [Incidencia: Fichaje fuera de ventana de salida].';
    ELSE
      NEW."ESTADO" := 'Alerta';
      NEW."NOTAS" := COALESCE(NEW."NOTAS", '')
        || ' [Incidencia: Salida sin clase programada].';
    END IF;
  END IF;

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
