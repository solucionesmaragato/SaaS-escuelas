-- Catálogos de curso y especialidad para el formulario público /matricular.

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
  v_cursos jsonb;
  v_especialidades jsonb;
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

  v_cursos := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id_curso', c."ID_CURSO",
      'nombre_curso', c."NOMBRE_CURSO"
    ) ORDER BY c."NOMBRE_CURSO")
    FROM public."CURSO_ESCOLAR" c
    WHERE v_sol."ID_CENTRO" IS NOT NULL
      AND c."ID_CENTRO" = v_sol."ID_CENTRO"
      AND lower(COALESCE(c."ESTADO", 'activo')) IN ('activo', 'activa')
  ), '[]'::jsonb);

  v_especialidades := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id_especialidad', e."ID_ESPECIALIDAD",
      'especialidad', e."ESPECIALIDAD"
    ) ORDER BY e."ESPECIALIDAD")
    FROM public."ESPECIALIDADES" e
    WHERE e."ID_CLIENTE" = v_sol."ID_CLIENTE"
  ), '[]'::jsonb);

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
    'cursos', v_cursos,
    'especialidades', v_especialidades,
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
