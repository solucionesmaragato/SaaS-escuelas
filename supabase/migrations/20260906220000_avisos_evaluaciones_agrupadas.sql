-- Evaluaciones: un aviso pendiente agrupado por profesor + centro (solo INSERT).
-- Incrementa CANTIDAD si ya existe aviso no leído; nuevo aviso tras marcar LEIDO = true.

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "CANTIDAD" integer NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_avisos_evaluaciones_nuevas_pendiente
  ON public."AVISOS_INTERNOS" ("ID_CLIENTE", "ID_CENTRO", "ID_PROFESOR", "TIPO")
  WHERE "LEIDO" = false AND "TIPO" = 'Evaluaciones nuevas';

CREATE OR REPLACE FUNCTION public.fn_build_mensaje_evaluaciones_nuevas(
  p_nombre_profesor text,
  p_cantidad integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
BEGIN
  IF COALESCE(p_cantidad, 0) <= 1 THEN
    RETURN COALESCE(p_nombre_profesor, 'El profesor') || ' ha subido 1 nueva evaluación.';
  END IF;

  RETURN COALESCE(p_nombre_profesor, 'El profesor')
    || ' ha subido '
    || p_cantidad::text
    || ' nuevas evaluaciones.';
END;
$function$;

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
  v_id_aviso text;
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

CREATE OR REPLACE FUNCTION public.tg_aviso_evaluaciones_nuevas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  PERFORM public.fn_sync_aviso_evaluaciones_nuevas(
    NEW."ID_CLIENTE",
    NEW."ID_CENTRO",
    NEW."ID_PROFESOR",
    NEW."ID_CURSO"
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_evaluaciones_before_insert ON public."EVALUACIONES";

CREATE TRIGGER tr_evaluaciones_before_insert
  BEFORE INSERT ON public."EVALUACIONES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_evaluaciones_before_insert();

DROP TRIGGER IF EXISTS tr_aviso_evaluaciones_nuevas ON public."EVALUACIONES";

CREATE TRIGGER tr_aviso_evaluaciones_nuevas
  AFTER INSERT ON public."EVALUACIONES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_evaluaciones_nuevas();
