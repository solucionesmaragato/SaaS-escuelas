-- D1/D3: el profesor no puede marcar LEIDO en avisos de fichaje (solo SELECT).
-- D2: máximo una solicitud abierta por ID_FICHAJE_CORREGIDO.

DROP POLICY IF EXISTS "Profesor_Update_Avisos_Fichaje" ON public."AVISOS_INTERNOS";

CREATE OR REPLACE FUNCTION public.tg_fichaje_una_solicitud_pendiente()
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
  IF v_mov NOT IN ('Corrección Pendiente', 'Modificación Pendiente') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."FICHAJES" f
    WHERE f."ID_CLIENTE" = NEW."ID_CLIENTE"
      AND f."ID_FICHAJE_CORREGIDO" = NEW."ID_FICHAJE_CORREGIDO"
      AND (
        (
          trim(COALESCE(f."TIPO_MOVIMIENTO", '')) = 'Corrección Pendiente'
          AND COALESCE(f."ESTADO", '') <> 'Rechazado'
        )
        OR (
          trim(COALESCE(f."TIPO_MOVIMIENTO", '')) = 'Modificación Pendiente'
          AND COALESCE(f."ESTADO", '') = 'Pendiente de aceptación modificación'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Ya existe una solicitud pendiente para este fichaje';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_fichaje_una_solicitud_pendiente ON public."FICHAJES";

CREATE TRIGGER tr_fichaje_una_solicitud_pendiente
  BEFORE INSERT ON public."FICHAJES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_fichaje_una_solicitud_pendiente();

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
  IF public.get_my_rol() NOT IN ('MASTER', 'ADMIN', 'SECRETARIA') THEN
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
    true
  );
END;
$$;
