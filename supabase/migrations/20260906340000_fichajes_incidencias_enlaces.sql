-- FASE 6/6: incidencias en NOTAS, vínculos entre correcciones y anotación desde avisos.

CREATE OR REPLACE FUNCTION public.fn_append_fichaje_nota_if_missing(
  p_id_fichaje text,
  p_fragment text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_id_fichaje IS NULL OR trim(p_id_fichaje) = '' THEN
    RETURN;
  END IF;
  IF p_fragment IS NULL OR trim(p_fragment) = '' THEN
    RETURN;
  END IF;

  UPDATE public."FICHAJES"
  SET "NOTAS" = trim(COALESCE("NOTAS", '') || ' ' || trim(p_fragment))
  WHERE "ID_FICHAJE" = p_id_fichaje
    AND COALESCE("NOTAS", '') NOT LIKE '%' || trim(p_fragment) || '%';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_vincular_fichaje_correccion(
  p_original_id text,
  p_nuevo_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_original_id IS NULL OR trim(p_original_id) = ''
     OR p_nuevo_id IS NULL OR trim(p_nuevo_id) = '' THEN
    RETURN;
  END IF;

  PERFORM public.fn_append_fichaje_nota_if_missing(
    p_nuevo_id,
    '[Vinculo:correccion:' || trim(p_original_id) || ']'
  );

  UPDATE public."FICHAJES"
  SET "ESTADO" = 'Anulado por Corrección'
  WHERE "ID_FICHAJE" = p_original_id
    AND COALESCE("ESTADO", '') IS DISTINCT FROM 'Anulado por Corrección';

  PERFORM public.fn_append_fichaje_nota_if_missing(
    p_original_id,
    '[Vinculo:sustituido:' || trim(p_nuevo_id) || ']'
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

  PERFORM public.fn_append_fichaje_nota_if_missing(
    p_id_fichaje,
    '[Incidencia: Llegó ' || v_minutos || ' minutos tarde]'
  );

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

CREATE OR REPLACE FUNCTION public.tg_aviso_fichaje_anotar_incidencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion_bloque text;
  v_entrada_id text;
BEGIN
  IF NEW."MENSAJE" IS NULL OR trim(NEW."MENSAJE") = '' THEN
    RETURN NEW;
  END IF;

  IF NEW."MENSAJE" LIKE '[FICHAJE_PAUSA_ALERT:%' AND NEW."ID_FICHAJE" IS NOT NULL THEN
    PERFORM public.fn_append_fichaje_nota_if_missing(
      NEW."ID_FICHAJE",
      '[Incidencia: Pausa prolongada sin clase]'
    );
    RETURN NEW;
  END IF;

  IF NEW."MENSAJE" LIKE '[FICHAJE_ALERT:%:salida]%' THEN
    v_sesion_bloque := substring(NEW."MENSAJE" FROM '\[FICHAJE_ALERT:([^:]+):salida\]');
    IF v_sesion_bloque IS NULL OR trim(v_sesion_bloque) = '' THEN
      RETURN NEW;
    END IF;

    SELECT f."ID_FICHAJE"
    INTO v_entrada_id
    FROM public."FICHAJES" f
    JOIN public."SESIONES" s
      ON s."ID_SESION"::text = v_sesion_bloque
     AND s."ID_CLIENTE"::text = NEW."ID_CLIENTE"::text
     AND s."ID_PROFESOR"::text = NEW."ID_PROFESOR"::text
    WHERE f."ID_PROFESOR"::text = NEW."ID_PROFESOR"::text
      AND f."ID_CLIENTE"::text = NEW."ID_CLIENTE"::text
      AND COALESCE(f."ESTADO", '') <> 'Anulado por Corrección'
      AND trim(f."TIPO_MOVIMIENTO") IN ('Entrada', 'Fin de Pausa')
      AND f."FECHA_HORA"::timestamptz >= (
        (s."FECHA_EXACTA"::date + s."HORA_INICIO"::time) AT TIME ZONE 'Europe/Madrid'
      ) - interval '15 minutes'
      AND f."FECHA_HORA"::timestamptz <= (
        (s."FECHA_EXACTA"::date + s."HORA_FIN"::time) AT TIME ZONE 'Europe/Madrid'
      )
    ORDER BY f."FECHA_HORA" DESC
    LIMIT 1;

    IF v_entrada_id IS NOT NULL THEN
      PERFORM public.fn_append_fichaje_nota_if_missing(
        v_entrada_id,
        '[Incidencia: No fichó salida del bloque]'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_aviso_fichaje_anotar_incidencia ON public."AVISOS_INTERNOS";

CREATE TRIGGER tr_aviso_fichaje_anotar_incidencia
  AFTER INSERT ON public."AVISOS_INTERNOS"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_fichaje_anotar_incidencia();

CREATE OR REPLACE FUNCTION public.tg_fichaje_vinculo_correccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov text;
BEGIN
  IF NEW."ID_FICHAJE_CORREGIDO" IS NULL OR trim(NEW."ID_FICHAJE_CORREGIDO") = '' THEN
    RETURN NEW;
  END IF;

  v_mov := trim(COALESCE(NEW."TIPO_MOVIMIENTO", ''));

  IF v_mov IN ('Corrección Pendiente', 'Modificación Pendiente')
     OR COALESCE(NEW."ESTADO", '') IN (
       'Pendiente de aceptación',
       'Pendiente de aceptación modificación'
     ) THEN
    PERFORM public.fn_append_fichaje_nota_if_missing(
      NEW."ID_FICHAJE",
      '[Incidencia: Solicitud pendiente sobre fichaje ' || trim(NEW."ID_FICHAJE_CORREGIDO") || ']'
    );
    RETURN NEW;
  END IF;

  PERFORM public.fn_vincular_fichaje_correccion(
    trim(NEW."ID_FICHAJE_CORREGIDO"),
    NEW."ID_FICHAJE"
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fichaje_vinculo_correccion ON public."FICHAJES";

CREATE TRIGGER tr_fichaje_vinculo_correccion
  AFTER INSERT ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fichaje_vinculo_correccion();

CREATE OR REPLACE FUNCTION public.tg_fichaje_correccion_aprobada_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original RECORD;
BEGIN
  IF OLD."TIPO_MOVIMIENTO" = 'Corrección Pendiente'
     AND NEW."TIPO_MOVIMIENTO" = 'Corrección Aprobada'
     AND NEW."ID_FICHAJE_CORREGIDO" IS NOT NULL
     AND trim(NEW."ID_FICHAJE_CORREGIDO") <> '' THEN
    SELECT *
    INTO v_original
    FROM public."FICHAJES"
    WHERE "ID_FICHAJE" = NEW."ID_FICHAJE_CORREGIDO";

    IF FOUND THEN
      UPDATE public."FICHAJES"
      SET "TIPO_MOVIMIENTO" = v_original."TIPO_MOVIMIENTO"
      WHERE "ID_FICHAJE" = NEW."ID_FICHAJE";

      PERFORM public.fn_vincular_fichaje_correccion(
        v_original."ID_FICHAJE",
        NEW."ID_FICHAJE"
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fichaje_correccion_aprobada_update ON public."FICHAJES";

CREATE TRIGGER tr_fichaje_correccion_aprobada_update
  AFTER UPDATE OF "TIPO_MOVIMIENTO" ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fichaje_correccion_aprobada_update();

CREATE OR REPLACE FUNCTION public.fn_responder_modificacion_fichaje_admin(
  p_id_fichaje text,
  p_acepta boolean,
  p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_f RECORD;
  v_original RECORD;
  v_nombre text;
  v_centro text;
  v_tipo_respuesta text;
  v_mensaje_admin text;
BEGIN
  SELECT *
  INTO v_f
  FROM public."FICHAJES"
  WHERE "ID_FICHAJE" = p_id_fichaje
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fichaje no encontrado o no autorizado';
  END IF;

  IF trim(COALESCE(v_f."TIPO_MOVIMIENTO", '')) <> 'Modificación Pendiente' THEN
    RAISE EXCEPTION 'Este fichaje no es una modificación pendiente';
  END IF;

  IF COALESCE(v_f."ESTADO", '') <> 'Pendiente de aceptación modificación' THEN
    RAISE EXCEPTION 'Esta modificación ya fue respondida';
  END IF;

  SELECT *
  INTO v_original
  FROM public."FICHAJES"
  WHERE "ID_FICHAJE" = v_f."ID_FICHAJE_CORREGIDO"
    AND "ID_CLIENTE" = v_f."ID_CLIENTE";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fichaje original no encontrado';
  END IF;

  SELECT "NOMBRE_PROFESOR"
  INTO v_nombre
  FROM public."PROFESOR"
  WHERE "ID_PROFESOR" = v_f."ID_PROFESOR"
    AND "ID_CLIENTE" = v_f."ID_CLIENTE"
  LIMIT 1;

  v_nombre := COALESCE(v_nombre, v_f."ID_PROFESOR");
  v_centro := NULLIF(trim(COALESCE(v_f."ID_CENTRO", '')), '');

  IF p_acepta THEN
    UPDATE public."FICHAJES"
    SET
      "TIPO_MOVIMIENTO" = v_original."TIPO_MOVIMIENTO",
      "FECHA_HORA" = COALESCE(v_f."FECHA_HORA_MANUAL", v_f."FECHA_HORA"),
      "ESTADO" = 'Correcto'
    WHERE "ID_FICHAJE" = p_id_fichaje;

    PERFORM public.fn_vincular_fichaje_correccion(v_original."ID_FICHAJE", p_id_fichaje);

    v_tipo_respuesta := 'Modificación de fichaje autorizada';
    v_mensaje_admin := v_nombre || ' ha autorizado la modificación del fichaje '
      || v_original."ID_FICHAJE" || '.';
  ELSE
    IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
      RAISE EXCEPTION 'Debes indicar el motivo del rechazo';
    END IF;

    UPDATE public."FICHAJES"
    SET
      "ESTADO" = 'Rechazado',
      "NOTAS" = trim(COALESCE(v_f."NOTAS", '') || ' [Rechazo modificación: ' || trim(p_motivo) || '].')
    WHERE "ID_FICHAJE" = p_id_fichaje;

    v_tipo_respuesta := 'Modificación de fichaje rechazada';
    v_mensaje_admin := v_nombre || ' ha rechazado la modificación. Motivo: ' || trim(p_motivo);
  END IF;

  UPDATE public."AVISOS_INTERNOS"
  SET "LEIDO" = true
  WHERE "ID_FICHAJE" = p_id_fichaje
    AND "TIPO" = 'Modificación de fichaje pendiente'
    AND COALESCE("LEIDO", false) = false;

  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_PROFESOR",
    "ID_FICHAJE",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    v_f."ID_CLIENTE",
    v_centro,
    v_f."ID_PROFESOR",
    p_id_fichaje,
    v_tipo_respuesta,
    v_mensaje_admin,
    false
  );
END;
$$;

-- Incidencias legibles en ventanas de tolerancia (tg_procesar_metricas_y_alertas).
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
