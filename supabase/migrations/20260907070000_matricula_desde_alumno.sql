-- Matrícula online desde alumno existente (sin lead).

ALTER TABLE public."SOLICITUDES_MATRICULA"
  ALTER COLUMN "ID_LEAD" DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_alumno_datos_json_prefill(p_alumno public."ALUMNOS")
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'NOMBRE_ALUMNO', p_alumno."NOMBRE_ALUMNO",
    'DNI', p_alumno."DNI",
    'MAIL', p_alumno."MAIL",
    'TLF_COMUNICACION', p_alumno."TLF_COMUNICACION",
    'TLF_ALUMNO', p_alumno."TLF_ALUMNO",
    'NOMBRE_MADRE', p_alumno."NOMBRE_MADRE",
    'TLF_MADRE', p_alumno."TLF_MADRE",
    'NOMBRE_PADRE', p_alumno."NOMBRE_PADRE",
    'TLF_PADRE', p_alumno."TLF_PADRE",
    'DIRECCION', p_alumno."DIRECCION",
    'CP', p_alumno."CP",
    'MUNICIPIO', p_alumno."MUNICIPIO",
    'PROVINCIA', p_alumno."PROVINCIA",
    'NACIMIENTO', p_alumno."NACIMIENTO",
    'METODO_PAGO', p_alumno."METODO_PAGO",
    'IBAN', p_alumno."IBAN",
    'TITULAR_CUENTA', p_alumno."TITULAR_CUENTA",
    'TLF_BIZUM', p_alumno."TLF_BIZUM",
    'ID_CENTRO', p_alumno."ID_CENTRO"
  ));
$function$;

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

  IF v_alumno."TLF_COMUNICACION" IS NULL OR btrim(v_alumno."TLF_COMUNICACION") = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'El alumno no tiene teléfono de comunicación.'
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
  ORDER BY m."created_at" DESC
  LIMIT 1;

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

GRANT EXECUTE ON FUNCTION public.crear_solicitud_matricula_desde_alumno(text) TO authenticated;

-- Nota: firmar_solicitud_matricula con ID_LEAD nullable → ver 20260907080000_firmar_solicitud_matricula_sin_lead.sql
