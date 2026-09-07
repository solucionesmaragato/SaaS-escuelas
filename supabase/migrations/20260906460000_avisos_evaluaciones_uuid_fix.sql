-- Fix: ID_AVISO es uuid; v_id_aviso no puede ser text en el WHERE (error 42883 al crear evaluación).
-- >>> PEGAR SOLO ESTE ARCHIVO .sql EN SUPABASE SQL EDITOR <<<

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_evaluaciones_nuevas(
  p_id_cliente text,
  p_id_centro text,
  p_id_profesor text,
  p_id_curso text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_nombre_profesor text;
  v_id_aviso uuid;
  v_cantidad integer;
  v_tipo constant text := 'Evaluaciones nuevas';
BEGIN
  IF p_id_cliente IS NULL OR trim(p_id_cliente) = '' THEN
    RETURN;
  END IF;

  IF p_id_profesor IS NULL OR trim(p_id_profesor) = '' THEN
    RETURN;
  END IF;

  IF p_id_centro IS NULL OR trim(p_id_centro) = '' THEN
    RETURN;
  END IF;

  SELECT "NOMBRE_PROFESOR"
  INTO v_nombre_profesor
  FROM public."PROFESOR"
  WHERE "ID_PROFESOR" = p_id_profesor
  LIMIT 1;

  v_nombre_profesor := COALESCE(v_nombre_profesor, p_id_profesor);

  SELECT a."ID_AVISO", COALESCE(a."CANTIDAD", 1)
  INTO v_id_aviso, v_cantidad
  FROM public."AVISOS_INTERNOS" a
  WHERE a."ID_CLIENTE" = p_id_cliente
    AND a."ID_CENTRO" = p_id_centro
    AND a."ID_PROFESOR" = p_id_profesor
    AND a."TIPO" = v_tipo
    AND a."LEIDO" = false
  LIMIT 1
  FOR UPDATE;

  IF v_id_aviso IS NOT NULL THEN
    v_cantidad := v_cantidad + 1;

    UPDATE public."AVISOS_INTERNOS"
    SET
      "CANTIDAD" = v_cantidad,
      "MENSAJE" = public.fn_build_mensaje_evaluaciones_nuevas(v_nombre_profesor, v_cantidad),
      "FECHA" = now()
    WHERE "ID_AVISO" = v_id_aviso;

    RETURN;
  END IF;

  BEGIN
    INSERT INTO public."AVISOS_INTERNOS" (
      "ID_CLIENTE",
      "ID_CENTRO",
      "ID_CURSO",
      "ID_PROFESOR",
      "TIPO",
      "MENSAJE",
      "CANTIDAD",
      "LEIDO"
    ) VALUES (
      p_id_cliente,
      p_id_centro,
      p_id_curso,
      p_id_profesor,
      v_tipo,
      public.fn_build_mensaje_evaluaciones_nuevas(v_nombre_profesor, 1),
      1,
      false
    );
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public."AVISOS_INTERNOS" a
      SET
        "CANTIDAD" = COALESCE(a."CANTIDAD", 1) + 1,
        "MENSAJE" = public.fn_build_mensaje_evaluaciones_nuevas(
          v_nombre_profesor,
          COALESCE(a."CANTIDAD", 1) + 1
        ),
        "FECHA" = now()
      WHERE a."ID_CLIENTE" = p_id_cliente
        AND a."ID_CENTRO" = p_id_centro
        AND a."ID_PROFESOR" = p_id_profesor
        AND a."TIPO" = v_tipo
        AND a."LEIDO" = false;
  END;
END;
$function$;
