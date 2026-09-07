-- Al completar la matrícula (horarios activos >= SESIONES_SEMANALES de la tarifa),
-- marcar como leídos los avisos pendientes de matrícula incompleta y grupo.

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_matricula_incompleta(p_id_matricula text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_id_cliente text;
  v_id_centro text;
  v_id_curso text;
  v_id_alumno text;
  v_id_especialidad text;
  v_estado text;
  v_sesiones_tarifa int;
  v_horarios_activos int;
  v_nombre_alumno text;
BEGIN
  IF p_id_matricula IS NULL OR p_id_matricula = '' THEN
    RETURN;
  END IF;

  SELECT
    m."ID_CLIENTE",
    m."ID_CENTRO",
    m."ID_CURSO",
    m."ID_ALUMNO",
    m."ESPECIALIDAD",
    m."ESTADO",
    COALESCE(t."SESIONES_SEMANALES", 0)
  INTO
    v_id_cliente,
    v_id_centro,
    v_id_curso,
    v_id_alumno,
    v_id_especialidad,
    v_estado,
    v_sesiones_tarifa
  FROM public."MATRICULAS" m
  LEFT JOIN public."TARIFAS" t ON m."ID_TARIFA" = t."ID_TARIFA"
  WHERE m."ID_MATRICULA" = p_id_matricula;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF LOWER(COALESCE(v_estado, '')) NOT IN ('activo', 'activa') THEN
    UPDATE public."AVISOS_INTERNOS"
    SET "LEIDO" = true
    WHERE "ID_MATRICULA" = p_id_matricula
      AND "LEIDO" = false
      AND "TIPO" IN ('Matrícula incompleta', 'Matrícula pendiente grupo');
    RETURN;
  END IF;

  SELECT COUNT(*)::int
  INTO v_horarios_activos
  FROM public."HORARIOS_MATRICULAS"
  WHERE "ID_MATRICULA" = p_id_matricula
    AND LOWER(COALESCE("ESTADO", '')) IN ('activo', 'activa');

  IF v_sesiones_tarifa <= 0 OR v_horarios_activos >= v_sesiones_tarifa THEN
    UPDATE public."AVISOS_INTERNOS"
    SET "LEIDO" = true
    WHERE "ID_MATRICULA" = p_id_matricula
      AND "LEIDO" = false
      AND "TIPO" IN ('Matrícula incompleta', 'Matrícula pendiente grupo');
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."AVISOS_INTERNOS"
    WHERE "ID_MATRICULA" = p_id_matricula
      AND "TIPO" = 'Matrícula incompleta'
      AND "LEIDO" = false
  ) THEN
    RETURN;
  END IF;

  SELECT "NOMBRE_ALUMNO"
  INTO v_nombre_alumno
  FROM public."ALUMNOS"
  WHERE "ID_ALUMNO" = v_id_alumno
  LIMIT 1;

  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_CURSO",
    "ID_ALUMNO",
    "ID_ESPECIALIDAD",
    "ID_MATRICULA",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    v_id_cliente,
    v_id_centro,
    v_id_curso,
    v_id_alumno,
    v_id_especialidad,
    p_id_matricula,
    'Matrícula incompleta',
    COALESCE(v_nombre_alumno, 'El alumno')
      || ' tiene '
      || v_horarios_activos::text
      || ' de '
      || v_sesiones_tarifa::text
      || ' horarios semanales requeridos por su tarifa. Pendiente de completar.',
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_calcular_alerta_subprogramado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
    v_id_matricula text;
    v_sesiones_tarifa int;
    v_horarios_activos int;
    v_estado_matricula text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_id_matricula := OLD."ID_MATRICULA";
    ELSE
        v_id_matricula := NEW."ID_MATRICULA";
    END IF;

    IF v_id_matricula IS NOT NULL THEN
        SELECT m."ESTADO", COALESCE(t."SESIONES_SEMANALES", 0)
        INTO v_estado_matricula, v_sesiones_tarifa
        FROM public."MATRICULAS" m
        LEFT JOIN public."TARIFAS" t ON m."ID_TARIFA" = t."ID_TARIFA"
        WHERE m."ID_MATRICULA" = v_id_matricula;

        IF LOWER(COALESCE(v_estado_matricula, '')) NOT IN ('activo', 'activa') THEN
            UPDATE public."MATRICULAS"
            SET "ALERTA_SUBPROGRAMADO" = FALSE
            WHERE "ID_MATRICULA" = v_id_matricula;

            PERFORM public.fn_sync_aviso_matricula_incompleta(v_id_matricula);
        ELSE
            SELECT COUNT(*)::int INTO v_horarios_activos
            FROM public."HORARIOS_MATRICULAS"
            WHERE "ID_MATRICULA" = v_id_matricula
              AND LOWER(COALESCE("ESTADO", '')) IN ('activo', 'activa');

            UPDATE public."MATRICULAS"
            SET "ALERTA_SUBPROGRAMADO" = (v_horarios_activos < v_sesiones_tarifa)
            WHERE "ID_MATRICULA" = v_id_matricula;

            PERFORM public.fn_sync_aviso_matricula_incompleta(v_id_matricula);
        END IF;
    END IF;

    RETURN NULL;
END;
$function$;
