-- Fixes prematrícula desde alumno: ID_CURSO prefill, FECHA_ALTA en MATRICULAS, estado Activo al firmar.
-- Orden: después de 20260907081000 (TEXTOS_LEGALES snapshot en firmar_solicitud_matricula).

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
    'ID_CENTRO', p_alumno."ID_CENTRO",
    'ID_CURSO', p_alumno."ID_CURSO"
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

-- Extensión de 081000: conservar Activo al firmar renovación; aviso solo si no era Activo.
CREATE OR REPLACE FUNCTION public.firmar_solicitud_matricula(
  p_token text,
  p_datos jsonb,
  p_nombre_firmante text,
  p_ip text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_hash_evidencia text DEFAULT NULL,
  p_pdf_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_sol public."SOLICITUDES_MATRICULA"%ROWTYPE;
  v_lead public."LEADS"%ROWTYPE;
  v_alumno public."ALUMNOS"%ROWTYPE;
  v_cliente public."CLIENTES"%ROWTYPE;
  v_lead_found boolean := false;
  v_nombre_alumno text;
  v_metodo_pago text;
  v_id_matricula text;
  v_id_curso text;
  v_especialidad text;
  v_pdf_url text;
  v_hash text;
  v_datos_firmados jsonb;
  v_estado_previo text;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token obligatorio.');
  END IF;

  IF p_nombre_firmante IS NULL OR btrim(p_nombre_firmante) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nombre del firmante obligatorio.');
  END IF;

  IF p_datos IS NULL OR p_datos = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Datos del formulario obligatorios.');
  END IF;

  IF p_datos->>'DNI_FIRMANTE' IS NULL OR btrim(p_datos->>'DNI_FIRMANTE') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DNI del firmante obligatorio.');
  END IF;

  IF COALESCE((p_datos->>'acepta_regimen')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debe aceptar el régimen interno.');
  END IF;

  IF COALESCE((p_datos->>'AUT_MEDIOS')::boolean, false) IS NOT TRUE
     OR COALESCE((p_datos->>'AUT_INSTALACIONES')::boolean, false) IS NOT TRUE
     OR COALESCE((p_datos->>'AUT_WEB')::boolean, false) IS NOT TRUE
     OR COALESCE((p_datos->>'AUT_RRSS')::boolean, false) IS NOT TRUE
     OR COALESCE((p_datos->>'AUT_COMUNICACION_TOTAL')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Debe aceptar todas las autorizaciones.');
  END IF;

  SELECT * INTO v_sol
  FROM public."SOLICITUDES_MATRICULA"
  WHERE "TOKEN_PUBLICO" = btrim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada.');
  END IF;

  IF v_sol."ESTADO" = 'firmada' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La solicitud ya fue firmada.');
  END IF;

  IF v_sol."ESTADO" IN ('expirada', 'cancelada')
     OR (v_sol."EXPIRA_AT" IS NOT NULL AND v_sol."EXPIRA_AT" <= now()) THEN
    UPDATE public."SOLICITUDES_MATRICULA"
    SET "ESTADO" = 'expirada', "updated_at" = now()
    WHERE "ID_SOLICITUD" = v_sol."ID_SOLICITUD";
    RETURN jsonb_build_object('ok', false, 'error', 'La solicitud ha expirado.');
  END IF;

  IF v_sol."ID_LEAD" IS NOT NULL THEN
    SELECT * INTO v_lead
    FROM public."LEADS"
    WHERE "ID_LEAD" = v_sol."ID_LEAD";
    v_lead_found := FOUND;
  END IF;

  SELECT * INTO v_alumno
  FROM public."ALUMNOS"
  WHERE "ID_ALUMNO" = v_sol."ID_ALUMNO";

  v_estado_previo := v_alumno."ESTADO_ALUMNO";

  v_nombre_alumno := COALESCE(
    NULLIF(btrim(p_datos->>'NOMBRE_ALUMNO'), ''),
    CASE WHEN v_lead_found THEN v_lead."NOMBRE" ELSE NULL END,
    v_alumno."NOMBRE_ALUMNO",
    'Alumno'
  );
  v_metodo_pago := NULLIF(btrim(p_datos->>'METODO_PAGO'), '');
  v_pdf_url := COALESCE(NULLIF(btrim(p_pdf_url), ''), 'client://matricula/' || v_sol."TOKEN_PUBLICO");
  v_hash := COALESCE(
    NULLIF(btrim(p_hash_evidencia), ''),
    encode(extensions.digest(
      COALESCE(p_datos::text, '') || '|' || COALESCE(p_nombre_firmante, '') || '|' || btrim(p_token),
      'sha256'
    ), 'hex')
  );

  SELECT m."ID_CURSO", m."ESPECIALIDAD"
  INTO v_id_curso, v_especialidad
  FROM public."MATRICULAS" m
  WHERE m."ID_ALUMNO" = v_sol."ID_ALUMNO"
    AND LOWER(COALESCE(m."ESTADO", '')) IN ('activo', 'activa')
  ORDER BY m."FECHA_ALTA" DESC NULLS LAST
  LIMIT 1;

  v_id_curso := COALESCE(
    NULLIF(btrim(p_datos->>'ID_CURSO'), ''),
    CASE WHEN v_lead_found THEN v_lead."ID_CURSO" ELSE NULL END,
    v_id_curso
  );
  v_especialidad := COALESCE(
    NULLIF(btrim(p_datos->>'ESPECIALIDAD'), ''),
    CASE WHEN v_lead_found THEN v_lead."ESPECIALIDAD" ELSE NULL END,
    v_especialidad
  );

  UPDATE public."ALUMNOS"
  SET
    "NOMBRE_ALUMNO" = v_nombre_alumno,
    "DNI" = NULLIF(btrim(p_datos->>'DNI'), ''),
    "MAIL" = NULLIF(btrim(p_datos->>'MAIL'), ''),
    "TLF_ALUMNO" = NULLIF(btrim(p_datos->>'TLF_ALUMNO'), ''),
    "TLF_COMUNICACION" = NULLIF(btrim(p_datos->>'TLF_COMUNICACION'), ''),
    "NOMBRE_MADRE" = NULLIF(btrim(p_datos->>'NOMBRE_MADRE'), ''),
    "TLF_MADRE" = NULLIF(btrim(p_datos->>'TLF_MADRE'), ''),
    "NOMBRE_PADRE" = NULLIF(btrim(p_datos->>'NOMBRE_PADRE'), ''),
    "TLF_PADRE" = NULLIF(btrim(p_datos->>'TLF_PADRE'), ''),
    "DIRECCION" = NULLIF(btrim(p_datos->>'DIRECCION'), ''),
    "CP" = NULLIF(btrim(p_datos->>'CP'), ''),
    "MUNICIPIO" = NULLIF(btrim(p_datos->>'MUNICIPIO'), ''),
    "PROVINCIA" = NULLIF(btrim(p_datos->>'PROVINCIA'), ''),
    "NACIMIENTO" = CASE
      WHEN NULLIF(btrim(p_datos->>'NACIMIENTO'), '') IS NULL THEN NULL
      ELSE (p_datos->>'NACIMIENTO')::date
    END,
    "METODO_PAGO" = v_metodo_pago,
    "IBAN" = NULLIF(btrim(p_datos->>'IBAN'), ''),
    "TITULAR_CUENTA" = NULLIF(btrim(p_datos->>'TITULAR_CUENTA'), ''),
    "TLF_BIZUM" = NULLIF(btrim(p_datos->>'TLF_BIZUM'), ''),
    "AUT_MEDIOS" = true,
    "AUT_INSTALACIONES" = true,
    "AUT_WEB" = true,
    "AUT_RRSS" = true,
    "AUT_COMUNICACION_TOTAL" = true,
    "ESTADO_ALUMNO" = CASE
      WHEN v_sol."ID_LEAD" IS NOT NULL THEN 'Preinscripción'
      WHEN lower(btrim(COALESCE(v_estado_previo, ''))) = 'activo' THEN 'Activo'
      ELSE 'Preinscripción'
    END,
    "ID_CENTRO" = COALESCE(
      NULLIF(btrim(p_datos->>'ID_CENTRO'), ''),
      v_sol."ID_CENTRO",
      CASE WHEN v_lead_found THEN v_lead."ID_CENTRO" ELSE NULL END,
      v_alumno."ID_CENTRO"
    ),
    "ID_CURSO" = v_id_curso
  WHERE "ID_ALUMNO" = v_sol."ID_ALUMNO";

  IF upper(btrim(COALESCE(v_metodo_pago, ''))) = 'SEPA' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."MANDATOS_SEPA"
      WHERE "ID_ALUMNO" = v_sol."ID_ALUMNO"
    ) THEN
      INSERT INTO public."MANDATOS_SEPA" (
        "ID_MANDATO",
        "ID_ALUMNO",
        "ID_CLIENTE",
        "ID_CENTRO",
        "TOKEN_PUBLICO",
        "ESTADO"
      ) VALUES (
        gen_random_uuid()::text,
        v_sol."ID_ALUMNO",
        v_sol."ID_CLIENTE",
        COALESCE(
          v_sol."ID_CENTRO",
          CASE WHEN v_lead_found THEN v_lead."ID_CENTRO" ELSE NULL END,
          v_alumno."ID_CENTRO"
        ),
        replace(gen_random_uuid()::text, '-', ''),
        'pendiente'
      );
    END IF;
  END IF;

  SELECT m."ID_MATRICULA"
  INTO v_id_matricula
  FROM public."MATRICULAS" m
  WHERE m."ID_ALUMNO" = v_sol."ID_ALUMNO"
    AND LOWER(COALESCE(m."ESTADO", '')) IN ('activo', 'activa')
  ORDER BY m."FECHA_ALTA" DESC NULLS LAST
  LIMIT 1;

  IF v_id_matricula IS NULL THEN
    v_id_matricula := gen_random_uuid()::text;
    INSERT INTO public."MATRICULAS" (
      "ID_MATRICULA",
      "ID_CLIENTE",
      "ID_ALUMNO",
      "ID_CENTRO",
      "ID_CURSO",
      "ESPECIALIDAD",
      "ESTADO",
      "FECHA_ALTA"
    ) VALUES (
      v_id_matricula,
      v_sol."ID_CLIENTE",
      v_sol."ID_ALUMNO",
      COALESCE(
        v_sol."ID_CENTRO",
        CASE WHEN v_lead_found THEN v_lead."ID_CENTRO" ELSE NULL END,
        v_alumno."ID_CENTRO"
      ),
      v_id_curso,
      v_especialidad,
      'Activo',
      CURRENT_DATE
    );
  END IF;

  IF v_sol."ID_LEAD" IS NOT NULL THEN
    UPDATE public."LEADS"
    SET "ESTADO" = 'Matriculado', "updated_at" = now()
    WHERE "ID_LEAD" = v_sol."ID_LEAD";
  END IF;

  SELECT * INTO v_cliente
  FROM public."CLIENTES"
  WHERE "ID_CLIENTE" = v_sol."ID_CLIENTE";

  v_datos_firmados := p_datos || jsonb_build_object(
    'TEXTOS_LEGALES', jsonb_strip_nulls(jsonb_build_object(
      'regimen_interno', v_cliente."TEXTO_REGIMEN_INTERNO",
      'aut_medios', v_cliente."TEXTO_AUT_MEDIOS",
      'aut_instalaciones', v_cliente."TEXTO_AUT_INSTALACIONES",
      'aut_web', v_cliente."TEXTO_AUT_WEB",
      'aut_rrss', v_cliente."TEXTO_AUT_RRSS",
      'aut_comunicacion', v_cliente."TEXTO_AUT_COMUNICACION"
    ))
  );

  UPDATE public."SOLICITUDES_MATRICULA"
  SET
    "ESTADO" = 'firmada',
    "DATOS_JSON" = v_datos_firmados,
    "FIRMADO_AT" = now(),
    "IP_DIRECCION" = NULLIF(btrim(p_ip), ''),
    "USER_AGENT" = NULLIF(btrim(p_user_agent), ''),
    "HASH_EVIDENCIA" = v_hash,
    "NOMBRE_FIRMANTE" = btrim(p_nombre_firmante),
    "DNI_FIRMANTE" = NULLIF(btrim(p_datos->>'DNI_FIRMANTE'), ''),
    "PDF_URL" = v_pdf_url,
    "updated_at" = now()
  WHERE "ID_SOLICITUD" = v_sol."ID_SOLICITUD";

  IF lower(btrim(COALESCE(v_estado_previo, ''))) <> 'activo' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS"
      WHERE "ID_ALUMNO" = v_sol."ID_ALUMNO"
        AND "TIPO" = 'Matrícula online pendiente'
        AND "LEIDO" = false
    ) THEN
      INSERT INTO public."AVISOS_INTERNOS" (
        "ID_CLIENTE",
        "ID_CENTRO",
        "ID_CURSO",
        "ID_ALUMNO",
        "ID_MATRICULA",
        "TIPO",
        "MENSAJE",
        "LEIDO"
      ) VALUES (
        v_sol."ID_CLIENTE",
        v_sol."ID_CENTRO",
        v_id_curso,
        v_sol."ID_ALUMNO",
        v_id_matricula,
        'Matrícula online pendiente',
        'Matrícula online firmada por ' || btrim(p_nombre_firmante)
          || ' para ' || v_nombre_alumno || '. Pendiente de activación por secretaría.',
        false
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id_alumno', v_sol."ID_ALUMNO",
    'id_matricula', v_id_matricula,
    'pdf_url', v_pdf_url,
    'hash_evidencia', v_hash,
    'firmado_at', now()
  );
END;
$function$;
