-- Matrícula online en blanco: alumno placeholder + solicitud pendiente sin lead.

CREATE OR REPLACE FUNCTION public.crear_solicitud_matricula_desde_cero(
  p_id_cliente text,
  p_id_centro text,
  p_id_curso text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_id_alumno text;
  v_id_solicitud text;
  v_token text;
  v_datos jsonb;
  v_id_curso text;
BEGIN
  IF p_id_cliente IS NULL OR btrim(p_id_cliente) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ID de cliente obligatorio.');
  END IF;

  IF p_id_centro IS NULL OR btrim(p_id_centro) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ID de centro obligatorio.');
  END IF;

  PERFORM public.fn_assert_matricula_staff_scope(btrim(p_id_cliente));

  IF NOT EXISTS (
    SELECT 1
    FROM public."CENTROS" c
    WHERE c."ID_CENTRO" = btrim(p_id_centro)
      AND c."ID_CLIENTE" = btrim(p_id_cliente)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Centro no válido para este cliente.');
  END IF;

  v_id_curso := NULLIF(btrim(p_id_curso), '');

  IF v_id_curso IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public."CURSO_ESCOLAR" c
    WHERE c."ID_CURSO" = v_id_curso
      AND c."ID_CENTRO" = btrim(p_id_centro)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Curso no válido para el centro seleccionado.');
  END IF;

  v_id_alumno := gen_random_uuid()::text;
  v_id_solicitud := gen_random_uuid()::text;
  v_token := replace(gen_random_uuid()::text, '-', '');

  v_datos := jsonb_strip_nulls(jsonb_build_object(
    'ID_CENTRO', btrim(p_id_centro),
    'ID_CURSO', v_id_curso
  ));

  INSERT INTO public."ALUMNOS" (
    "ID_ALUMNO",
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_CURSO",
    "NOMBRE_ALUMNO",
    "ESTADO_ALUMNO"
  ) VALUES (
    v_id_alumno,
    btrim(p_id_cliente),
    btrim(p_id_centro),
    v_id_curso,
    'Pendiente de matrícula',
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
    btrim(p_id_cliente),
    btrim(p_id_centro),
    NULL,
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

GRANT EXECUTE ON FUNCTION public.crear_solicitud_matricula_desde_cero(text, text, text) TO authenticated;
