-- DNI del firmante en matrícula online

ALTER TABLE public."SOLICITUDES_MATRICULA"
  ADD COLUMN IF NOT EXISTS "DNI_FIRMANTE" text NULL;

CREATE OR REPLACE FUNCTION public.obtener_solicitud_matricula_publica(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_sol public."SOLICITUDES_MATRICULA"%ROWTYPE;
  v_cliente public."CLIENTES"%ROWTYPE;
  v_centro_nombre text;
  v_expirada boolean;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Token obligatorio.');
  END IF;

  SELECT * INTO v_sol
  FROM public."SOLICITUDES_MATRICULA"
  WHERE "TOKEN_PUBLICO" = btrim(p_token);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solicitud no encontrada.');
  END IF;

  v_expirada := v_sol."ESTADO" = 'expirada'
    OR (v_sol."EXPIRA_AT" IS NOT NULL AND v_sol."EXPIRA_AT" <= now());

  IF v_sol."ESTADO" = 'pendiente' AND v_expirada THEN
    UPDATE public."SOLICITUDES_MATRICULA"
    SET "ESTADO" = 'expirada', "updated_at" = now()
    WHERE "ID_SOLICITUD" = v_sol."ID_SOLICITUD";
    v_sol."ESTADO" := 'expirada';
  END IF;

  SELECT * INTO v_cliente
  FROM public."CLIENTES"
  WHERE "ID_CLIENTE" = v_sol."ID_CLIENTE";

  SELECT "NOMBRE_CENTRO"
  INTO v_centro_nombre
  FROM public."CENTROS"
  WHERE "ID_CENTRO" = v_sol."ID_CENTRO"
  LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'estado', v_sol."ESTADO",
    'expirada', v_expirada,
    'expira_at', v_sol."EXPIRA_AT",
    'escuela', jsonb_build_object(
      'nombre_escuela', v_cliente."NOMBRE_ESCUELA",
      'app_logo', v_cliente."APP_LOGO",
      'cif', v_cliente."CIF",
      'direccion', v_cliente."DIRECCION"
    ),
    'centro', jsonb_build_object(
      'nombre_centro', v_centro_nombre
    ),
    'textos', jsonb_build_object(
      'regimen_interno', v_cliente."TEXTO_REGIMEN_INTERNO",
      'aut_medios', v_cliente."TEXTO_AUT_MEDIOS",
      'aut_instalaciones', v_cliente."TEXTO_AUT_INSTALACIONES",
      'aut_web', v_cliente."TEXTO_AUT_WEB",
      'aut_rrss', v_cliente."TEXTO_AUT_RRSS",
      'aut_comunicacion', v_cliente."TEXTO_AUT_COMUNICACION"
    ),
    'datos', COALESCE(v_sol."DATOS_JSON", '{}'::jsonb),
    'firma', CASE
      WHEN v_sol."ESTADO" = 'firmada' THEN jsonb_build_object(
        'nombre_firmante', v_sol."NOMBRE_FIRMANTE",
        'dni_firmante', v_sol."DNI_FIRMANTE",
        'firmado_at', v_sol."FIRMADO_AT",
        'pdf_url', v_sol."PDF_URL"
      )
      ELSE NULL
    END
  );
END;
$function$;

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
  v_nombre_alumno text;
  v_metodo_pago text;
  v_id_matricula text;
  v_pdf_url text;
  v_hash text;
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

  SELECT * INTO v_lead
  FROM public."LEADS"
  WHERE "ID_LEAD" = v_sol."ID_LEAD";

  v_nombre_alumno := COALESCE(NULLIF(btrim(p_datos->>'NOMBRE_ALUMNO'), ''), v_lead."NOMBRE", 'Alumno');
  v_metodo_pago := NULLIF(btrim(p_datos->>'METODO_PAGO'), '');
  v_pdf_url := COALESCE(NULLIF(btrim(p_pdf_url), ''), 'client://matricula/' || v_sol."TOKEN_PUBLICO");
  v_hash := COALESCE(
    NULLIF(btrim(p_hash_evidencia), ''),
    encode(extensions.digest(
      COALESCE(p_datos::text, '') || '|' || COALESCE(p_nombre_firmante, '') || '|' || btrim(p_token),
      'sha256'
    ), 'hex')
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
    "ESTADO_ALUMNO" = 'Preinscripción',
    "ID_CENTRO" = COALESCE(NULLIF(btrim(p_datos->>'ID_CENTRO'), ''), v_sol."ID_CENTRO"),
    "ID_CURSO" = COALESCE(NULLIF(btrim(p_datos->>'ID_CURSO'), ''), v_lead."ID_CURSO")
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
        COALESCE(v_sol."ID_CENTRO", v_lead."ID_CENTRO"),
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
      COALESCE(v_sol."ID_CENTRO", v_lead."ID_CENTRO"),
      v_lead."ID_CURSO",
      v_lead."ESPECIALIDAD",
      'Activo',
      CURRENT_DATE
    );
  END IF;

  UPDATE public."LEADS"
  SET "ESTADO" = 'Matriculado', "updated_at" = now()
  WHERE "ID_LEAD" = v_sol."ID_LEAD";

  UPDATE public."SOLICITUDES_MATRICULA"
  SET
    "ESTADO" = 'firmada',
    "DATOS_JSON" = p_datos,
    "FIRMADO_AT" = now(),
    "IP_DIRECCION" = NULLIF(btrim(p_ip), ''),
    "USER_AGENT" = NULLIF(btrim(p_user_agent), ''),
    "HASH_EVIDENCIA" = v_hash,
    "NOMBRE_FIRMANTE" = btrim(p_nombre_firmante),
    "DNI_FIRMANTE" = NULLIF(btrim(p_datos->>'DNI_FIRMANTE'), ''),
    "PDF_URL" = v_pdf_url,
    "updated_at" = now()
  WHERE "ID_SOLICITUD" = v_sol."ID_SOLICITUD";

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
      v_lead."ID_CURSO",
      v_sol."ID_ALUMNO",
      v_id_matricula,
      'Matrícula online pendiente',
      'Matrícula online firmada por ' || btrim(p_nombre_firmante)
        || ' para ' || v_nombre_alumno || '. Pendiente de activación por secretaría.',
      false
    );
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
