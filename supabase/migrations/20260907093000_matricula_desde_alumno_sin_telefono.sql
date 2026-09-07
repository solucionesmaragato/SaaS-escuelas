-- Permitir crear solicitud de matrícula desde alumno sin TLF_COMUNICACION (copiar enlace).

CREATE OR REPLACE FUNCTION public.crear_solicitud_matricula_desde_alumno(p_id_alumno text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_alumno public."ALUMNOS"%ROWTYPE;
  v_existing public."SOLICITUDES_MATRICULA"%ROWTYPE;
  v_id_solicitud text;
  v_token text;
  v_datos jsonb;
  v_estado_alumno text;
  v_id_curso text;
  v_especialidad text;
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

  v_estado_alumno := lower(btrim(COALESCE(v_alumno."ESTADO_ALUMNO", '')));

  IF v_estado_alumno NOT IN ('preinscripción', 'preinscripcion', 'activo') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no está en un estado válido para enviar matrícula online.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."SOLICITUDES_MATRICULA"
    WHERE "ID_ALUMNO" = v_alumno."ID_ALUMNO"
      AND "ESTADO" = 'firmada'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya existe una solicitud firmada para este alumno.');
  END IF;

  SELECT * INTO v_existing
  FROM public."SOLICITUDES_MATRICULA"
  WHERE "ID_ALUMNO" = v_alumno."ID_ALUMNO"
    AND "ESTADO" = 'pendiente'
    AND ("EXPIRA_AT" IS NULL OR "EXPIRA_AT" > now())
  ORDER BY "created_at" DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'id_solicitud', v_existing."ID_SOLICITUD",
      'id_alumno', v_existing."ID_ALUMNO",
      'token_publico', v_existing."TOKEN_PUBLICO",
      'expira_at', v_existing."EXPIRA_AT",
      'reused', true
    );
  END IF;

  SELECT m."ID_CURSO", m."ESPECIALIDAD"
  INTO v_id_curso, v_especialidad
  FROM public."MATRICULAS" m
  WHERE m."ID_ALUMNO" = v_alumno."ID_ALUMNO"
    AND LOWER(COALESCE(m."ESTADO", '')) IN ('activo', 'activa')
  ORDER BY m."FECHA_ALTA" DESC NULLS LAST
  LIMIT 1;

  v_id_curso := COALESCE(v_id_curso, v_alumno."ID_CURSO");

  v_datos := public.fn_alumno_datos_json_prefill(v_alumno)
    || jsonb_strip_nulls(jsonb_build_object(
      'ID_CURSO', v_id_curso,
      'ESPECIALIDAD', v_especialidad
    ));

  v_id_solicitud := gen_random_uuid()::text;
  v_token := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public."SOLICITUDES_MATRICULA" (
    "ID_SOLICITUD",
    "TOKEN_PUBLICO",
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_LEAD",
    "ID_ALUMNO",
    "ESTADO",
    "DATOS_JSON",
    "EXPIRA_AT"
  ) VALUES (
    v_id_solicitud,
    v_token,
    v_alumno."ID_CLIENTE",
    v_alumno."ID_CENTRO",
    NULL,
    v_alumno."ID_ALUMNO",
    'pendiente',
    v_datos,
    now() + interval '30 days'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_solicitud', v_id_solicitud,
    'id_alumno', v_alumno."ID_ALUMNO",
    'token_publico', v_token,
    'expira_at', (now() + interval '30 days'),
    'reused', false
  );
END;
$function$;
