-- Corrección solicitada por profesor: aviso admin + RPC aprobar/rechazar (con FECHA_HORA_MANUAL).

CREATE OR REPLACE FUNCTION public.tg_aviso_correccion_pendiente_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre text;
  v_centro text;
  v_mensaje text;
BEGIN
  IF trim(COALESCE(NEW."TIPO_MOVIMIENTO", '')) <> 'Corrección Pendiente' THEN
    RETURN NEW;
  END IF;

  IF NEW."ID_FICHAJE_CORREGIDO" IS NULL OR trim(NEW."ID_FICHAJE_CORREGIDO") = '' THEN
    RETURN NEW;
  END IF;

  SELECT "NOMBRE_PROFESOR"
  INTO v_nombre
  FROM public."PROFESOR"
  WHERE "ID_PROFESOR" = NEW."ID_PROFESOR"
    AND "ID_CLIENTE" = NEW."ID_CLIENTE"
  LIMIT 1;

  v_nombre := COALESCE(v_nombre, NEW."ID_PROFESOR"::text);
  v_centro := NULLIF(trim(COALESCE(NEW."ID_CENTRO", '')), '');

  v_mensaje := v_nombre || ' solicita corrección del fichaje '
    || trim(NEW."ID_FICHAJE_CORREGIDO")
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
    'Corrección de fichaje pendiente',
    v_mensaje,
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_aviso_correccion_pendiente_admin ON public."FICHAJES";

CREATE TRIGGER tr_aviso_correccion_pendiente_admin
  AFTER INSERT ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_correccion_pendiente_admin();

CREATE OR REPLACE FUNCTION public.fn_responder_correccion_fichaje_admin(
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
  v_mensaje_profe text;
BEGIN
  IF public.get_my_rol() NOT IN ('MASTER', 'ADMIN', 'DIRECCION', 'SECRETARIA') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT *
  INTO v_f
  FROM public."FICHAJES"
  WHERE "ID_FICHAJE" = p_id_fichaje
    AND "ID_CLIENTE" = public.get_my_tenant_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fichaje no encontrado';
  END IF;

  IF trim(COALESCE(v_f."TIPO_MOVIMIENTO", '')) <> 'Corrección Pendiente' THEN
    RAISE EXCEPTION 'Este fichaje no es una corrección pendiente';
  END IF;

  IF COALESCE(v_f."ESTADO", '') = 'Rechazado' THEN
    RAISE EXCEPTION 'Esta corrección ya fue rechazada';
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

    v_tipo_respuesta := 'Corrección de fichaje autorizada';
    v_mensaje_profe := 'Tu solicitud de corrección del fichaje '
      || v_original."ID_FICHAJE" || ' ha sido autorizada.';
  ELSE
    IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
      RAISE EXCEPTION 'Debes indicar el motivo del rechazo';
    END IF;

    UPDATE public."FICHAJES"
    SET
      "ESTADO" = 'Rechazado',
      "NOTAS" = trim(
        COALESCE(v_f."NOTAS", '')
        || ' [Rechazo corrección admin: ' || trim(p_motivo) || '].'
      )
    WHERE "ID_FICHAJE" = p_id_fichaje;

    v_tipo_respuesta := 'Corrección de fichaje rechazada';
    v_mensaje_profe := 'Tu solicitud de corrección del fichaje '
      || v_original."ID_FICHAJE" || ' ha sido rechazada. Motivo: ' || trim(p_motivo);
  END IF;

  UPDATE public."AVISOS_INTERNOS"
  SET "LEIDO" = true
  WHERE "ID_FICHAJE" = p_id_fichaje
    AND "TIPO" = 'Corrección de fichaje pendiente'
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
    v_mensaje_profe,
    false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_responder_correccion_fichaje_admin(text, boolean, text) TO authenticated;

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
      SET
        "TIPO_MOVIMIENTO" = v_original."TIPO_MOVIMIENTO",
        "FECHA_HORA" = COALESCE(NEW."FECHA_HORA_MANUAL", NEW."FECHA_HORA"),
        "ESTADO" = 'Correcto'
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
      OR "TIPO" = 'Corrección de fichaje autorizada'
      OR "TIPO" = 'Corrección de fichaje rechazada'
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
      OR "TIPO" = 'Corrección de fichaje autorizada'
      OR "TIPO" = 'Corrección de fichaje rechazada'
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
      OR "TIPO" = 'Corrección de fichaje autorizada'
      OR "TIPO" = 'Corrección de fichaje rechazada'
    )
  );
