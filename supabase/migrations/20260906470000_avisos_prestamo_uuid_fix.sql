-- Fix: ID_AVISO es uuid; v_id_aviso no puede ser text en el WHERE (error 42883 al actualizar préstamo).
-- >>> PEGAR SOLO ESTE ARCHIVO .sql EN SUPABASE SQL EDITOR <<<

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_prestamo_material(p_id_prestamo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_prestamo RECORD;
  v_receptor_nombre text;
  v_id_profesor text;
  v_id_alumno text;
  v_mensaje text;
  v_tipo constant text := 'Préstamo material';
  v_id_aviso uuid;
BEGIN
  IF p_id_prestamo IS NULL OR trim(p_id_prestamo) = '' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_prestamo
  FROM public."PRESTAMOS_MATERIAL"
  WHERE "ID_PRESTAMO" = p_id_prestamo;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF upper(trim(COALESCE(v_prestamo."CATEGORIA", ''))) = 'ALUMNO' THEN
    v_id_alumno := NULLIF(trim(v_prestamo."ID_RECEPTOR"), '');
    v_id_profesor := NULLIF(trim(v_prestamo."CREADO_POR"), '');
    SELECT "NOMBRE_ALUMNO"
    INTO v_receptor_nombre
    FROM public."ALUMNOS"
    WHERE "ID_ALUMNO" = v_id_alumno
    LIMIT 1;
  ELSIF upper(trim(COALESCE(v_prestamo."CATEGORIA", ''))) = 'PROFESOR' THEN
    v_id_alumno := NULL;
    v_id_profesor := COALESCE(
      NULLIF(trim(v_prestamo."CREADO_POR"), ''),
      NULLIF(trim(v_prestamo."ID_RECEPTOR"), '')
    );
    SELECT "NOMBRE_PROFESOR"
    INTO v_receptor_nombre
    FROM public."PROFESOR"
    WHERE "ID_PROFESOR" = NULLIF(trim(v_prestamo."ID_RECEPTOR"), '')
    LIMIT 1;
  ELSE
    RETURN;
  END IF;

  v_mensaje := public.fn_build_mensaje_prestamo_material(
    v_prestamo."ELEMENTO",
    v_receptor_nombre,
    v_prestamo."ESTADO_DEVOLUCION"
  );

  SELECT a."ID_AVISO"
  INTO v_id_aviso
  FROM public."AVISOS_INTERNOS" a
  WHERE a."ID_PRESTAMO" = p_id_prestamo
  LIMIT 1;

  IF v_id_aviso IS NOT NULL THEN
    UPDATE public."AVISOS_INTERNOS"
    SET
      "ID_CLIENTE" = v_prestamo."ID_CLIENTE",
      "ID_CENTRO" = v_prestamo."ID_CENTRO",
      "ID_ALUMNO" = v_id_alumno,
      "ID_PROFESOR" = v_id_profesor,
      "TIPO" = v_tipo,
      "MENSAJE" = v_mensaje,
      "LEIDO" = false,
      "FECHA" = now()
    WHERE "ID_AVISO" = v_id_aviso;

    RETURN;
  END IF;

  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_ALUMNO",
    "ID_PROFESOR",
    "ID_PRESTAMO",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    v_prestamo."ID_CLIENTE",
    v_prestamo."ID_CENTRO",
    v_id_alumno,
    v_id_profesor,
    p_id_prestamo,
    v_tipo,
    v_mensaje,
    false
  );
END;
$function$;
