-- Modificación solicitada por admin: pendiente de aceptación del profesor.

CREATE OR REPLACE FUNCTION public.tg_aviso_modificacion_admin_profesor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_centro text;
  v_mensaje text;
BEGIN
  IF trim(COALESCE(NEW."TIPO_MOVIMIENTO", '')) <> 'Modificación Pendiente' THEN
    RETURN NEW;
  END IF;

  IF NEW."ID_FICHAJE_CORREGIDO" IS NULL OR trim(NEW."ID_FICHAJE_CORREGIDO") = '' THEN
    RETURN NEW;
  END IF;

  v_centro := COALESCE(
    NULLIF(trim(NEW."ID_CENTRO"), ''),
    NULLIF(trim(public.get_my_center_id()), '')
  );

  v_mensaje := 'Se solicita tu autorización para modificar el fichaje '
    || NEW."ID_FICHAJE_CORREGIDO"
    || ' a las '
    || to_char(
      COALESCE(NEW."FECHA_HORA_MANUAL", NEW."FECHA_HORA")::timestamptz AT TIME ZONE 'Europe/Madrid',
      'DD/MM/YYYY HH24:MI'
    )
    || '.';

  IF NEW."MOTIVO_MODIFICACION" IS NOT NULL AND trim(NEW."MOTIVO_MODIFICACION") <> '' THEN
    v_mensaje := v_mensaje || ' Motivo: ' || NEW."MOTIVO_MODIFICACION";
  END IF;

  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_PROFESOR",
    "ID_FICHAJE",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    NEW."ID_CLIENTE",
    v_centro,
    NEW."ID_PROFESOR",
    NEW."ID_FICHAJE",
    'Modificación de fichaje pendiente',
    v_mensaje,
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_aviso_modificacion_admin_profesor ON public."FICHAJES";

CREATE TRIGGER tr_aviso_modificacion_admin_profesor
  AFTER INSERT ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_modificacion_admin_profesor();

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
  v_tipo_respuesta text;
  v_mensaje_admin text;
  v_centro text;
BEGIN
  IF p_id_fichaje IS NULL OR trim(p_id_fichaje) = '' THEN
    RAISE EXCEPTION 'ID de fichaje obligatorio';
  END IF;

  IF public.get_my_rol() <> 'PROFESOR' THEN
    RAISE EXCEPTION 'Solo el profesor puede responder a esta solicitud';
  END IF;

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

    UPDATE public."FICHAJES"
    SET "ESTADO" = 'Anulado por Corrección'
    WHERE "ID_FICHAJE" = v_original."ID_FICHAJE";

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

GRANT EXECUTE ON FUNCTION public.fn_responder_modificacion_fichaje_admin(text, boolean, text) TO authenticated;

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
      OR "TIPO" = 'Fichaje pendiente de aceptación'
      OR "TIPO" = 'Modificación de fichaje pendiente'
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
      OR "TIPO" = 'Fichaje pendiente de aceptación'
      OR "TIPO" = 'Modificación de fichaje pendiente'
    )
  )
  WITH CHECK (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND (
      ("TIPO" = 'URGENTE' AND "MENSAJE" LIKE '[FICHAJE_ALERT:%')
      OR "TIPO" = 'Fichaje pausa prolongada'
      OR "TIPO" = 'Fichaje pendiente de aceptación'
      OR "TIPO" = 'Modificación de fichaje pendiente'
    )
  );
