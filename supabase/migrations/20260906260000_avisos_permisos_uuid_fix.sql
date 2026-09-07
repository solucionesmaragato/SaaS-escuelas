-- Fix: ID_AVISO es uuid; v_id_aviso no puede ser text en el WHERE.

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_permiso(p_id_permiso text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_permiso RECORD;
  v_nombre_profesor text;
  v_mensaje text;
  v_tipo constant text := 'Permiso';
  v_id_aviso uuid;
BEGIN
  IF p_id_permiso IS NULL OR trim(p_id_permiso) = '' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_permiso
  FROM public."AUSENCIAS_PERMISOS"
  WHERE "ID_PERMISO" = p_id_permiso;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "NOMBRE_PROFESOR"
  INTO v_nombre_profesor
  FROM public."PROFESOR"
  WHERE "ID_PROFESOR" = v_permiso."ID_PROFESOR"
    AND "ID_CLIENTE" = v_permiso."ID_CLIENTE"
  LIMIT 1;

  v_mensaje := public.fn_build_mensaje_permiso(
    v_nombre_profesor,
    v_permiso."TIPO",
    v_permiso."FECHA_INICIO",
    v_permiso."FECHA_FIN",
    v_permiso."ESTADO"
  );

  SELECT a."ID_AVISO"
  INTO v_id_aviso
  FROM public."AVISOS_INTERNOS" a
  WHERE a."ID_PERMISO" = p_id_permiso
  LIMIT 1;

  IF v_id_aviso IS NOT NULL THEN
    UPDATE public."AVISOS_INTERNOS"
    SET
      "ID_CLIENTE" = v_permiso."ID_CLIENTE",
      "ID_CENTRO" = v_permiso."ID_CENTRO",
      "ID_PROFESOR" = v_permiso."ID_PROFESOR",
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
    "ID_PROFESOR",
    "ID_PERMISO",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    v_permiso."ID_CLIENTE",
    v_permiso."ID_CENTRO",
    v_permiso."ID_PROFESOR",
    p_id_permiso,
    v_tipo,
    v_mensaje,
    false
  );
END;
$function$;
