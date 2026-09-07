-- Tras activar preinscripción, sincronizar aviso de matrícula incompleta (tarifa/horarios pendientes).

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
  v_id_tarifa text;
  v_estado text;
  v_sesiones_tarifa int;
  v_horarios_activos int;
  v_nombre_alumno text;
  v_mensaje text;
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
    m."ID_TARIFA",
    COALESCE(t."SESIONES_SEMANALES", 0)
  INTO
    v_id_cliente,
    v_id_centro,
    v_id_curso,
    v_id_alumno,
    v_id_especialidad,
    v_estado,
    v_id_tarifa,
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

  IF v_id_tarifa IS NOT NULL
     AND v_sesiones_tarifa > 0
     AND v_horarios_activos >= v_sesiones_tarifa THEN
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

  IF v_id_tarifa IS NULL OR v_horarios_activos = 0 THEN
    v_mensaje := COALESCE(v_nombre_alumno, 'El alumno')
      || ' tiene la matrícula incompleta: pendiente de asignar tarifa y/o horarios semanales.';
  ELSE
    v_mensaje := COALESCE(v_nombre_alumno, 'El alumno')
      || ' tiene '
      || v_horarios_activos::text
      || ' de '
      || v_sesiones_tarifa::text
      || ' horarios semanales requeridos por su tarifa. Pendiente de completar.';
  END IF;

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
    v_mensaje,
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.activar_alumno_preinscripcion(p_id_alumno text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_alumno public."ALUMNOS"%ROWTYPE;
  v_id_matricula text;
BEGIN
  IF p_id_alumno IS NULL OR btrim(p_id_alumno) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ID de alumno obligatorio.');
  END IF;

  SELECT * INTO v_alumno
  FROM public."ALUMNOS"
  WHERE "ID_ALUMNO" = btrim(p_id_alumno);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Alumno no encontrado.');
  END IF;

  PERFORM public.fn_assert_matricula_staff_scope(v_alumno."ID_CLIENTE");

  IF COALESCE(v_alumno."ESTADO_ALUMNO", '') <> 'Preinscripción' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no está en estado Preinscripción.',
      'estado_actual', v_alumno."ESTADO_ALUMNO"
    );
  END IF;

  UPDATE public."ALUMNOS"
  SET "ESTADO_ALUMNO" = 'Activo', "updated_at" = now()
  WHERE "ID_ALUMNO" = v_alumno."ID_ALUMNO";

  UPDATE public."AVISOS_INTERNOS"
  SET "LEIDO" = true
  WHERE "ID_ALUMNO" = v_alumno."ID_ALUMNO"
    AND "TIPO" = 'Matrícula online pendiente'
    AND "LEIDO" = false;

  SELECT m."ID_MATRICULA"
  INTO v_id_matricula
  FROM public."MATRICULAS" m
  WHERE m."ID_ALUMNO" = v_alumno."ID_ALUMNO"
    AND LOWER(COALESCE(m."ESTADO", '')) IN ('activo', 'activa')
  ORDER BY m."created_at" DESC
  LIMIT 1;

  IF v_id_matricula IS NOT NULL THEN
    PERFORM public.fn_sync_aviso_matricula_incompleta(v_id_matricula);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id_alumno', v_alumno."ID_ALUMNO",
    'estado_alumno', 'Activo',
    'id_matricula', v_id_matricula
  );
END;
$function$;
