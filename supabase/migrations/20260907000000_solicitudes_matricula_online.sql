-- Matrícula online: textos legales en CLIENTES, solicitudes con token público y RPCs.

ALTER TABLE public."CLIENTES"
  ADD COLUMN IF NOT EXISTS "TEXTO_REGIMEN_INTERNO" text NULL,
  ADD COLUMN IF NOT EXISTS "TEXTO_AUT_MEDIOS" text NULL,
  ADD COLUMN IF NOT EXISTS "TEXTO_AUT_INSTALACIONES" text NULL,
  ADD COLUMN IF NOT EXISTS "TEXTO_AUT_WEB" text NULL,
  ADD COLUMN IF NOT EXISTS "TEXTO_AUT_RRSS" text NULL,
  ADD COLUMN IF NOT EXISTS "TEXTO_AUT_COMUNICACION" text NULL;

CREATE TABLE IF NOT EXISTS public."SOLICITUDES_MATRICULA" (
  "ID_SOLICITUD" text PRIMARY KEY DEFAULT (gen_random_uuid())::text,
  "TOKEN_PUBLICO" text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  "ID_CLIENTE" text NOT NULL,
  "ID_CENTRO" text NULL,
  "ID_LEAD" text NOT NULL,
  "ID_ALUMNO" text NOT NULL,
  "ESTADO" text NOT NULL DEFAULT 'pendiente'
    CHECK ("ESTADO" IN ('pendiente', 'firmada', 'expirada', 'cancelada')),
  "DATOS_JSON" jsonb NULL,
  "FIRMADO_AT" timestamptz NULL,
  "IP_DIRECCION" text NULL,
  "USER_AGENT" text NULL,
  "HASH_EVIDENCIA" text NULL,
  "NOMBRE_FIRMANTE" text NULL,
  "PDF_URL" text NULL,
  "EXPIRA_AT" timestamptz NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_matricula_token
  ON public."SOLICITUDES_MATRICULA" ("TOKEN_PUBLICO");

CREATE INDEX IF NOT EXISTS idx_solicitudes_matricula_lead
  ON public."SOLICITUDES_MATRICULA" ("ID_LEAD");

CREATE INDEX IF NOT EXISTS idx_solicitudes_matricula_alumno
  ON public."SOLICITUDES_MATRICULA" ("ID_ALUMNO");

ALTER TABLE public."SOLICITUDES_MATRICULA" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitudes_matricula_master ON public."SOLICITUDES_MATRICULA";
CREATE POLICY solicitudes_matricula_master ON public."SOLICITUDES_MATRICULA"
  FOR ALL
  USING (public.get_my_rol() = 'MASTER')
  WITH CHECK (public.get_my_rol() = 'MASTER');

DROP POLICY IF EXISTS solicitudes_matricula_tenant_staff ON public."SOLICITUDES_MATRICULA";
CREATE POLICY solicitudes_matricula_tenant_staff ON public."SOLICITUDES_MATRICULA"
  FOR ALL
  USING (
    public.get_my_rol() = ANY (ARRAY['ADMIN'::text, 'SECRETARIA'::text, 'DIRECCION'::text])
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  )
  WITH CHECK (
    public.get_my_rol() = ANY (ARRAY['ADMIN'::text, 'SECRETARIA'::text, 'DIRECCION'::text])
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  );

CREATE OR REPLACE FUNCTION public.fn_assert_matricula_staff_scope(p_id_cliente text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF public.get_my_rol() = 'MASTER' THEN
    RETURN;
  END IF;

  IF public.get_my_rol() = ANY (ARRAY['ADMIN'::text, 'SECRETARIA'::text, 'DIRECCION'::text])
     AND p_id_cliente = public.get_my_tenant_id() THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Acceso denegado para gestionar solicitudes de matrícula.';
END;
$function$;

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
    'NOMBRE_PADRE', p_lead."NOMBRE_CONTACTO",
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

  IF lower(COALESCE(v_lead."ESTADO", '')) = 'matriculado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El lead ya está matriculado.');
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
    "NOMBRE_PADRE",
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

  -- SEPA: tg_automatizar_mandato_sepa crea MANDATOS_SEPA pendiente al actualizar METODO_PAGO.
  IF upper(COALESCE(v_metodo_pago, '')) = 'SEPA' THEN
    PERFORM 1;
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

CREATE OR REPLACE FUNCTION public.activar_alumno_preinscripcion(p_id_alumno text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_alumno public."ALUMNOS"%ROWTYPE;
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

  RETURN jsonb_build_object(
    'ok', true,
    'id_alumno', v_alumno."ID_ALUMNO",
    'estado_alumno', 'Activo'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.crear_solicitud_matricula_desde_lead(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_solicitud_matricula_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.firmar_solicitud_matricula(text, jsonb, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_alumno_preinscripcion(text) TO authenticated;
