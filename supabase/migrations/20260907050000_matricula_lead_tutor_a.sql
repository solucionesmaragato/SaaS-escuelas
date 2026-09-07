-- Matrícula online desde lead: contacto → Tutor A (NOMBRE_MADRE) y rechazo si lead cerrado.

CREATE OR REPLACE FUNCTION public.fn_lead_datos_json_prefill(p_lead public."LEADS")
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'NOMBRE_ALUMNO', p_lead."NOMBRE",
    'MAIL', p_lead."EMAIL_LEAD",
    'TLF_COMUNICACION', p_lead."TELEFONO",
    'TLF_ALUMNO', p_lead."TELEFONO",
    'NOMBRE_MADRE', p_lead."NOMBRE_CONTACTO",
    'ID_CENTRO', p_lead."ID_CENTRO",
    'ID_CURSO', p_lead."ID_CURSO",
    'ESPECIALIDAD', p_lead."ESPECIALIDAD"
  ));
$function$;

CREATE OR REPLACE FUNCTION public.crear_solicitud_matricula_desde_lead(p_id_lead text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_lead public."LEADS"%ROWTYPE;
  v_existing public."SOLICITUDES_MATRICULA"%ROWTYPE;
  v_id_alumno text;
  v_id_solicitud text;
  v_token text;
  v_datos jsonb;
  v_estado text;
BEGIN
  IF p_id_lead IS NULL OR btrim(p_id_lead) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ID de lead obligatorio.');
  END IF;

  SELECT * INTO v_lead
  FROM public."LEADS"
  WHERE "ID_LEAD" = btrim(p_id_lead);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lead no encontrado.');
  END IF;

  PERFORM public.fn_assert_matricula_staff_scope(v_lead."ID_CLIENTE");

  v_estado := lower(btrim(COALESCE(v_lead."ESTADO", '')));

  IF v_estado = 'matriculado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El lead ya está matriculado.');
  END IF;

  IF v_estado IN ('cerrado', 'cerrado (no matriculado)') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El lead está cerrado.');
  END IF;

  SELECT * INTO v_existing
  FROM public."SOLICITUDES_MATRICULA"
  WHERE "ID_LEAD" = v_lead."ID_LEAD"
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

  IF EXISTS (
    SELECT 1
    FROM public."SOLICITUDES_MATRICULA"
    WHERE "ID_LEAD" = v_lead."ID_LEAD"
      AND "ESTADO" = 'firmada'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya existe una solicitud firmada para este lead.');
  END IF;

  v_datos := public.fn_lead_datos_json_prefill(v_lead);
  v_id_alumno := gen_random_uuid()::text;
  v_id_solicitud := gen_random_uuid()::text;
  v_token := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public."ALUMNOS" (
    "ID_ALUMNO",
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_CURSO",
    "NOMBRE_ALUMNO",
    "MAIL",
    "TLF_COMUNICACION",
    "TLF_ALUMNO",
    "NOMBRE_MADRE",
    "ESTADO_ALUMNO"
  ) VALUES (
    v_id_alumno,
    v_lead."ID_CLIENTE",
    v_lead."ID_CENTRO",
    v_lead."ID_CURSO",
    COALESCE(v_lead."NOMBRE", 'Alumno pendiente'),
    v_lead."EMAIL_LEAD",
    v_lead."TELEFONO",
    v_lead."TELEFONO",
    v_lead."NOMBRE_CONTACTO",
    'Preinscripción'
  );

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
    v_lead."ID_CLIENTE",
    v_lead."ID_CENTRO",
    v_lead."ID_LEAD",
    v_id_alumno,
    'pendiente',
    v_datos,
    now() + interval '30 days'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'id_solicitud', v_id_solicitud,
    'id_alumno', v_id_alumno,
    'token_publico', v_token,
    'expira_at', (now() + interval '30 days'),
    'reused', false
  );
END;
$function$;
