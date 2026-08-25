-- Demo provision: never leave ADMIN on an empty Madrid seed; retry incomplete clone once.

CREATE OR REPLACE FUNCTION public.demo_seed_usable(p_cliente text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT count(*) > 0
    FROM public."ALUMNOS" a
    WHERE a."ID_CLIENTE" = p_cliente
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.demo_purge_incomplete_madrid_seed(
  p_cliente text,
  p_keep_profesor text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_cliente IS NULL OR p_cliente !~ '^DEMO-[0-9]+$' THEN
    RAISE EXCEPTION 'ID_CLIENTE demo inválido: %', p_cliente;
  END IF;

  PERFORM set_config('app.demo_clone', '1', true);

  DELETE FROM public."VENTAS_LINEAS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."RECIBOS_MENSUALES" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."CARGOS_EXTRA" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."SESIONES" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."INCIDENCIAS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."HORARIOS_MATRICULAS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."MATRICULAS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."GRUPOS_HORARIOS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."GRUPOS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."ALUMNOS_EVALUACION" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."EVALUACIONES" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."ALUMNOS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."LEADS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."MANDATOS_SEPA" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."PRESTAMOS_MATERIAL" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."AUSENCIAS_PERMISOS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."TURNOS_PROFESORES" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."FICHAJES" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."AVISOS_INTERNOS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."DOCUMENTOS_LEGALES_V2" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."CONTROL_REMESAS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."FACTURACION_PROPIA" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."AUDITORIA_LOGS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."RUBRICAS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."HORARIO_COMERCIAL" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."AULA" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."ESPECIALIDADES" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."TARIFAS" WHERE "ID_CLIENTE" = p_cliente;
  DELETE FROM public."CURSO_ESCOLAR" WHERE "ID_CLIENTE" = p_cliente;

  DELETE FROM public."PROFESOR"
  WHERE "ID_CLIENTE" = p_cliente
    AND (p_keep_profesor IS NULL OR "ID_PROFESOR" IS DISTINCT FROM p_keep_profesor);

  DELETE FROM public."CENTROS" WHERE "ID_CLIENTE" = p_cliente;
END;
$$;




CREATE OR REPLACE FUNCTION public.clone_demo_esc018_madrid(
  p_target_cliente text,
  p_source_cliente text DEFAULT 'ESC_018',
  p_source_centro text DEFAULT 'ESC_018_CEN_001'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_centro text;
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
BEGIN
  IF p_target_cliente IS NULL OR p_target_cliente !~ '^DEMO-[0-9]+$' THEN
    RAISE EXCEPTION 'ID_CLIENTE destino inválido: %', p_target_cliente;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."CENTROS"
    WHERE "ID_CLIENTE" = p_source_cliente AND "ID_CENTRO" = p_source_centro
  ) THEN
    RAISE EXCEPTION 'Centro origen % / % no encontrado.', p_source_cliente, p_source_centro;
  END IF;

  v_target_centro := p_target_cliente || '_CEN_001';

  IF EXISTS (SELECT 1 FROM public."CENTROS" WHERE "ID_CENTRO" = v_target_centro) THEN
    IF public.demo_seed_usable(p_target_cliente) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'skipped', true,
        'id_centro', v_target_centro,
        'message', 'Centro demo ya existía con seed usable; clon omitido.'
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'incomplete', true,
      'id_centro', v_target_centro,
      'error', 'Centro demo incompleto (0 alumnos). Requiere purge y reclonado.'
    );
  END IF;

  CREATE TEMP TABLE demo_id_map (
    entity text NOT NULL,
    old_id text NOT NULL,
    new_id text NOT NULL,
    PRIMARY KEY (entity, old_id)
  ) ON COMMIT DROP;

  PERFORM set_config('app.demo_clone', '1', true);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  VALUES ('centro', p_source_centro, v_target_centro);

  INSERT INTO public."CENTROS" (
    "ID_CENTRO", "ID_CLIENTE", "NOMBRE_CENTRO", "DIRECCION", "TELEFONO_CENTRO",
    "EMAIL_CENTRO", "ESTADO", "REF_FACTURA", "VAPI_ASSISTANT_ID", "VAPI_PHONE_NUMBER"
  )
  SELECT
    v_target_centro,
    p_target_cliente,
    c."NOMBRE_CENTRO",
    c."DIRECCION",
    c."TELEFONO_CENTRO",
    c."EMAIL_CENTRO",
    c."ESTADO",
    NULL,
    NULL,
    NULL
  FROM public."CENTROS" c
  WHERE c."ID_CENTRO" = p_source_centro;

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'curso', ce."ID_CURSO", gen_random_uuid()::text
  FROM public."CURSO_ESCOLAR" ce
  WHERE ce."ID_CLIENTE" = p_source_cliente AND ce."ID_CENTRO" = p_source_centro;

  INSERT INTO public."CURSO_ESCOLAR" (
    "ID_CURSO", "ID_CLIENTE", "ID_CENTRO", "NOMBRE_CURSO", "FECHA_INICIO", "FECHA_FIN",
    "FESTIVOS", "ESTADO"
  )
  SELECT m.new_id, p_target_cliente, v_target_centro, ce."NOMBRE_CURSO", ce."FECHA_INICIO",
         ce."FECHA_FIN", ce."FESTIVOS", ce."ESTADO"
  FROM public."CURSO_ESCOLAR" ce
  JOIN demo_id_map m ON m.entity = 'curso' AND m.old_id = ce."ID_CURSO"
  WHERE ce."ID_CLIENTE" = p_source_cliente AND ce."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('CURSO_ESCOLAR', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'especialidad', e."ID_ESPECIALIDAD", public.demo_gen_prefixed('ESP')
  FROM public."ESPECIALIDADES" e
  WHERE e."ID_CLIENTE" = p_source_cliente;

  INSERT INTO public."ESPECIALIDADES" ("ID_ESPECIALIDAD", "ID_CLIENTE", "ESPECIALIDAD")
  SELECT m.new_id, p_target_cliente, e."ESPECIALIDAD"
  FROM public."ESPECIALIDADES" e
  JOIN demo_id_map m ON m.entity = 'especialidad' AND m.old_id = e."ID_ESPECIALIDAD"
  WHERE e."ID_CLIENTE" = p_source_cliente;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ESPECIALIDADES', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'aula', a."ID_AULA", public.demo_gen_prefixed('AUL')
  FROM public."AULA" a
  WHERE a."ID_CLIENTE" = p_source_cliente AND a."ID_CENTRO" = p_source_centro;

  INSERT INTO public."AULA" ("ID_AULA", "ID_CLIENTE", "NOMBRE_AULA", "CAPACIDAD", "ESPECIALIDAD", "ID_CENTRO")
  SELECT
    m.new_id,
    p_target_cliente,
    a."NOMBRE_AULA",
    a."CAPACIDAD",
    (
      SELECT array_agg(em.new_id ORDER BY u.ord)
      FROM unnest(COALESCE(a."ESPECIALIDAD", ARRAY[]::text[])) WITH ORDINALITY AS u(old_id, ord)
      JOIN demo_id_map em ON em.entity = 'especialidad' AND em.old_id = u.old_id
    ),
    v_target_centro
  FROM public."AULA" a
  JOIN demo_id_map m ON m.entity = 'aula' AND m.old_id = a."ID_AULA"
  WHERE a."ID_CLIENTE" = p_source_cliente AND a."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('AULA', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'profesor', p."ID_PROFESOR", public.demo_gen_prefixed('PRO')
  FROM public."PROFESOR" p
  WHERE p."ID_CLIENTE" = p_source_cliente AND p."ID_CENTRO" = p_source_centro;

  INSERT INTO public."PROFESOR" (
    "ID_PROFESOR", "ID_CLIENTE", "NOMBRE_PROFESOR", "TELEFONO", "ESPECIALIDAD", "AULA",
    "EMAIL_PROFESORES", "DNI", "N_SEG_SOCIAL", "DOMICILIO", "NACIMIENTO", "FECHA_ALTA",
    "SALDO_VACACIONES", "SALDO_AP", "FECHA_BAJA", "ID_CENTRO"
  )
  SELECT
    m.new_id,
    p_target_cliente,
    p."NOMBRE_PROFESOR",
    p."TELEFONO",
    (
      SELECT array_agg(em.new_id ORDER BY u.ord)
      FROM unnest(COALESCE(p."ESPECIALIDAD", ARRAY[]::text[])) WITH ORDINALITY AS u(old_id, ord)
      JOIN demo_id_map em ON em.entity = 'especialidad' AND em.old_id = u.old_id
    ),
    (
      SELECT array_agg(am.new_id ORDER BY u.ord)
      FROM unnest(COALESCE(p."AULA", ARRAY[]::text[])) WITH ORDINALITY AS u(old_id, ord)
      JOIN demo_id_map am ON am.entity = 'aula' AND am.old_id = u.old_id
    ),
    NULL,
    NULL,
    NULL,
    p."DOMICILIO",
    p."NACIMIENTO",
    p."FECHA_ALTA",
    p."SALDO_VACACIONES",
    p."SALDO_AP",
    p."FECHA_BAJA",
    v_target_centro
  FROM public."PROFESOR" p
  JOIN demo_id_map m ON m.entity = 'profesor' AND m.old_id = p."ID_PROFESOR"
  WHERE p."ID_CLIENTE" = p_source_cliente AND p."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('PROFESOR', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'tarifa', t."ID_TARIFA", public.demo_gen_prefixed('TAR')
  FROM public."TARIFAS" t
  WHERE t."ID_CLIENTE" = p_source_cliente;

  INSERT INTO public."TARIFAS" (
    "ID_TARIFA", "ID_CLIENTE", "SERVICIO", "PRECIO", "FORMATO_VENTA", "TIPO_COBRO",
    "SESIONES_SEMANALES", "TOTAL_HORAS_SEMANALES", "DETALLES", "COLUMNAS_HORARIOS_MATRICULAS"
  )
  SELECT m.new_id, p_target_cliente, t."SERVICIO", t."PRECIO", t."FORMATO_VENTA", t."TIPO_COBRO",
         t."SESIONES_SEMANALES", t."TOTAL_HORAS_SEMANALES", t."DETALLES", t."COLUMNAS_HORARIOS_MATRICULAS"
  FROM public."TARIFAS" t
  JOIN demo_id_map m ON m.entity = 'tarifa' AND m.old_id = t."ID_TARIFA"
  WHERE t."ID_CLIENTE" = p_source_cliente;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('TARIFAS', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'horario_comercial', hc."ID_HORARIO", public.demo_gen_prefixed('HCO')
  FROM public."HORARIO_COMERCIAL" hc
  WHERE hc."ID_CLIENTE" = p_source_cliente;

  INSERT INTO public."HORARIO_COMERCIAL" (
    "ID_HORARIO", "ID_CLIENTE", "DIA_SEMANA", "ABRE_MAÑANA", "CIERRA_MAÑANA", "ABRE_TARDE",
    "CIERRA_TARDE", "TFNO_DESVIO", "SEG_ESPERA", "ID_CENTRO"
  )
  SELECT m.new_id, p_target_cliente, hc."DIA_SEMANA", hc."ABRE_MAÑANA", hc."CIERRA_MAÑANA",
         hc."ABRE_TARDE", hc."CIERRA_TARDE", hc."TFNO_DESVIO", hc."SEG_ESPERA", v_target_centro
  FROM public."HORARIO_COMERCIAL" hc
  JOIN demo_id_map m ON m.entity = 'horario_comercial' AND m.old_id = hc."ID_HORARIO"
  WHERE hc."ID_CLIENTE" = p_source_cliente;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('HORARIO_COMERCIAL', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'grupo', g."ID_GRUPO", gen_random_uuid()::text
  FROM public."GRUPOS" g
  WHERE g."ID_CLIENTE" = p_source_cliente AND g."ID_CENTRO" = p_source_centro;

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'alumno', a."ID_ALUMNO", gen_random_uuid()::text
  FROM public."ALUMNOS" a
  WHERE a."ID_CLIENTE" = p_source_cliente AND a."ID_CENTRO" = p_source_centro;

  INSERT INTO public."ALUMNOS" (
    "ID_ALUMNO", "ID_CLIENTE", "NOMBRE_ALUMNO", "TLF_COMUNICACION", "MAIL", "DNI", "TLF_ALUMNO",
    "NOMBRE_MADRE", "TLF_MADRE", "NOMBRE_PADRE", "TLF_PADRE", "DIRECCION", "CP", "NACIMIENTO",
    "DTO_HERMANOS_PORCENTAJE", "ESTADO_MATRICULA", "MES_DEVOLUCION_RESERVA", "ESTADO_RESERVA",
    "AJUSTE_MANUAL_EUR", "MOTIVO_AJUSTE", "METODO_PAGO", "IBAN", "TITULAR_CUENTA", "TLF_BIZUM",
    "MANDATO", "TARJETA", "STRIPE_ID", "KOREFACTU_ID", "TOTAL_MENSUAL", "NOTAS",
    "AUT_MEDIOS", "AUT_INSTALACIONES", "AUT_WEB", "AUT_RRSS", "AUT_COMUNICACION_TOTAL",
    "ESTADO_ALUMNO", "FOTO", "ID_CENTRO", "created_at", "updated_at", "ID_CURSO", "MUNICIPIO", "PROVINCIA"
  )
  SELECT
    am.new_id,
    p_target_cliente,
    a."NOMBRE_ALUMNO", a."TLF_COMUNICACION", a."MAIL", a."DNI", a."TLF_ALUMNO",
    a."NOMBRE_MADRE", a."TLF_MADRE", a."NOMBRE_PADRE", a."TLF_PADRE", a."DIRECCION", a."CP", a."NACIMIENTO",
    a."DTO_HERMANOS_PORCENTAJE", a."ESTADO_MATRICULA", a."MES_DEVOLUCION_RESERVA", a."ESTADO_RESERVA",
    a."AJUSTE_MANUAL_EUR", a."MOTIVO_AJUSTE", a."METODO_PAGO", NULL, a."TITULAR_CUENTA", a."TLF_BIZUM",
    a."MANDATO", NULL, NULL, NULL, a."TOTAL_MENSUAL", a."NOTAS",
    a."AUT_MEDIOS", a."AUT_INSTALACIONES", a."AUT_WEB", a."AUT_RRSS", a."AUT_COMUNICACION_TOTAL",
    a."ESTADO_ALUMNO", a."FOTO", v_target_centro, a."created_at", a."updated_at",
    cm.new_id, a."MUNICIPIO", a."PROVINCIA"
  FROM public."ALUMNOS" a
  JOIN demo_id_map am ON am.entity = 'alumno' AND am.old_id = a."ID_ALUMNO"
  LEFT JOIN demo_id_map cm ON cm.entity = 'curso' AND cm.old_id = a."ID_CURSO"
  WHERE a."ID_CLIENTE" = p_source_cliente AND a."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('ALUMNOS', v_n);

  INSERT INTO public."GRUPOS" (
    "ID_GRUPO", "ID_CLIENTE", "ID_ESPECIALIDAD", "ID_ALUMNOS", "ESTADO", "NOMBRE_GRUPO",
    "NIVEL_ETAPA", "PLAZAS_MAXIMAS", "ID_CENTRO", "ID_CURSO", "ID_TARIFA"
  )
  SELECT
    gm.new_id,
    p_target_cliente,
    em.new_id,
    (
      SELECT array_agg(am.new_id ORDER BY u.ord)
      FROM unnest(COALESCE(g."ID_ALUMNOS", ARRAY[]::text[])) WITH ORDINALITY AS u(old_id, ord)
      JOIN demo_id_map am ON am.entity = 'alumno' AND am.old_id = u.old_id
    ),
    g."ESTADO",
    g."NOMBRE_GRUPO",
    g."NIVEL_ETAPA",
    g."PLAZAS_MAXIMAS",
    v_target_centro,
    cm.new_id,
    tm.new_id
  FROM public."GRUPOS" g
  JOIN demo_id_map gm ON gm.entity = 'grupo' AND gm.old_id = g."ID_GRUPO"
  LEFT JOIN demo_id_map em ON em.entity = 'especialidad' AND em.old_id = g."ID_ESPECIALIDAD"
  LEFT JOIN demo_id_map cm ON cm.entity = 'curso' AND cm.old_id = g."ID_CURSO"
  LEFT JOIN demo_id_map tm ON tm.entity = 'tarifa' AND tm.old_id = g."ID_TARIFA"
  WHERE g."ID_CLIENTE" = p_source_cliente AND g."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('GRUPOS', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'grupo_horario', gh."ID_GRUPO_HORARIO", public.demo_gen_prefixed('GRH')
  FROM public."GRUPOS_HORARIOS" gh
  WHERE gh."ID_CLIENTE" = p_source_cliente AND gh."ID_CENTRO" = p_source_centro;

  INSERT INTO public."GRUPOS_HORARIOS" (
    "ID_GRUPO_HORARIO", "ID_CLIENTE", "ID_GRUPO", "DIA_SEMANA", "HORA_INICIO", "HORA_FIN",
    "ID_PROFESOR", "ID_AULA", "ID_CENTRO", "ID_CURSO"
  )
  SELECT
    m.new_id,
    p_target_cliente,
    gm.new_id,
    gh."DIA_SEMANA",
    gh."HORA_INICIO",
    gh."HORA_FIN",
    pm.new_id,
    am.new_id,
    v_target_centro,
    cm.new_id
  FROM public."GRUPOS_HORARIOS" gh
  JOIN demo_id_map m ON m.entity = 'grupo_horario' AND m.old_id = gh."ID_GRUPO_HORARIO"
  LEFT JOIN demo_id_map gm ON gm.entity = 'grupo' AND gm.old_id = gh."ID_GRUPO"
  LEFT JOIN demo_id_map pm ON pm.entity = 'profesor' AND pm.old_id = gh."ID_PROFESOR"
  LEFT JOIN demo_id_map am ON am.entity = 'aula' AND am.old_id = gh."ID_AULA"
  LEFT JOIN demo_id_map cm ON cm.entity = 'curso' AND cm.old_id = gh."ID_CURSO"
  WHERE gh."ID_CLIENTE" = p_source_cliente AND gh."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('GRUPOS_HORARIOS', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'matricula', mat."ID_MATRICULA", gen_random_uuid()::text
  FROM public."MATRICULAS" mat
  JOIN public."ALUMNOS" a ON a."ID_ALUMNO" = mat."ID_ALUMNO"
  WHERE mat."ID_CLIENTE" = p_source_cliente AND a."ID_CENTRO" = p_source_centro;

  INSERT INTO public."MATRICULAS" (
    "ID_MATRICULA", "ID_CLIENTE", "ID_ALUMNO", "ID_TARIFA", "ESPECIALIDAD", "ESTADO",
    "FECHA_ALTA", "FECHA_BAJA", "ID_PROFESOR", "ID_CENTRO", "created_at", "updated_at",
    "ID_CURSO", "ALERTA_SUBPROGRAMADO"
  )
  SELECT
    mm.new_id,
    p_target_cliente,
    am.new_id,
    tm.new_id,
    em.new_id,
    mat."ESTADO",
    mat."FECHA_ALTA",
    mat."FECHA_BAJA",
    pm.new_id,
    v_target_centro,
    mat."created_at",
    mat."updated_at",
    cm.new_id,
    mat."ALERTA_SUBPROGRAMADO"
  FROM public."MATRICULAS" mat
  JOIN demo_id_map mm ON mm.entity = 'matricula' AND mm.old_id = mat."ID_MATRICULA"
  JOIN public."ALUMNOS" a ON a."ID_ALUMNO" = mat."ID_ALUMNO"
  LEFT JOIN demo_id_map am ON am.entity = 'alumno' AND am.old_id = mat."ID_ALUMNO"
  LEFT JOIN demo_id_map tm ON tm.entity = 'tarifa' AND tm.old_id = mat."ID_TARIFA"
  LEFT JOIN demo_id_map em ON em.entity = 'especialidad' AND em.old_id = mat."ESPECIALIDAD"
  LEFT JOIN demo_id_map pm ON pm.entity = 'profesor' AND pm.old_id = mat."ID_PROFESOR"
  LEFT JOIN demo_id_map cm ON cm.entity = 'curso' AND cm.old_id = mat."ID_CURSO"
  WHERE mat."ID_CLIENTE" = p_source_cliente AND a."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('MATRICULAS', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'horario', hm."ID_HORARIO", gen_random_uuid()::text
  FROM public."HORARIOS_MATRICULAS" hm
  WHERE hm."ID_CLIENTE" = p_source_cliente AND hm."ID_CENTRO" = p_source_centro;

  INSERT INTO public."HORARIOS_MATRICULAS" (
    "ID_HORARIO", "ID_CLIENTE", "ID_MATRICULA", "ID_ALUMNO", "ID_ESPECIALIDAD", "ID_GRUPO",
    "ID_PROFESOR", "ID_AULA", "ID_TARIFA", "TIPO_CLASE", "TIPO_SESION", "PRECIO", "DIA",
    "DURACION", "HORA_INICIO", "HORA_FIN", "FALTAS_RECUPERABLES", "FALTAS_NO_RECUPERABLES",
    "RECUPERACIONES", "SALDO", "ID_GRUPO_HORARIO", "ID_CENTRO", "ESTADO", "ID_CURSO"
  )
  SELECT
    hm_m.new_id,
    p_target_cliente,
    mat_m.new_id,
    alum_m.new_id,
    esp_m.new_id,
    grp_m.new_id,
    pro_m.new_id,
    aul_m.new_id,
    tar_m.new_id,
    hm."TIPO_CLASE",
    hm."TIPO_SESION",
    hm."PRECIO",
    hm."DIA",
    hm."DURACION",
    hm."HORA_INICIO",
    hm."HORA_FIN",
    hm."FALTAS_RECUPERABLES",
    hm."FALTAS_NO_RECUPERABLES",
    hm."RECUPERACIONES",
    hm."SALDO",
    gh_m.new_id,
    v_target_centro,
    hm."ESTADO",
    cur_m.new_id
  FROM public."HORARIOS_MATRICULAS" hm
  JOIN demo_id_map hm_m ON hm_m.entity = 'horario' AND hm_m.old_id = hm."ID_HORARIO"
  LEFT JOIN demo_id_map mat_m ON mat_m.entity = 'matricula' AND mat_m.old_id = hm."ID_MATRICULA"
  LEFT JOIN demo_id_map alum_m ON alum_m.entity = 'alumno' AND alum_m.old_id = hm."ID_ALUMNO"
  LEFT JOIN demo_id_map esp_m ON esp_m.entity = 'especialidad' AND esp_m.old_id = hm."ID_ESPECIALIDAD"
  LEFT JOIN demo_id_map grp_m ON grp_m.entity = 'grupo' AND grp_m.old_id = hm."ID_GRUPO"
  LEFT JOIN demo_id_map pro_m ON pro_m.entity = 'profesor' AND pro_m.old_id = hm."ID_PROFESOR"
  LEFT JOIN demo_id_map aul_m ON aul_m.entity = 'aula' AND aul_m.old_id = hm."ID_AULA"
  LEFT JOIN demo_id_map tar_m ON tar_m.entity = 'tarifa' AND tar_m.old_id = hm."ID_TARIFA"
  LEFT JOIN demo_id_map gh_m ON gh_m.entity = 'grupo_horario' AND gh_m.old_id = hm."ID_GRUPO_HORARIO"
  LEFT JOIN demo_id_map cur_m ON cur_m.entity = 'curso' AND cur_m.old_id = hm."ID_CURSO"
  WHERE hm."ID_CLIENTE" = p_source_cliente
    AND hm."ID_CENTRO" = p_source_centro
    AND hm."ID_GRUPO_HORARIO" IS NOT NULL
  ON CONFLICT ("ID_ALUMNO", "ID_GRUPO_HORARIO") WHERE "ID_GRUPO_HORARIO" IS NOT NULL DO NOTHING;

  INSERT INTO public."HORARIOS_MATRICULAS" (
    "ID_HORARIO", "ID_CLIENTE", "ID_MATRICULA", "ID_ALUMNO", "ID_ESPECIALIDAD", "ID_GRUPO",
    "ID_PROFESOR", "ID_AULA", "ID_TARIFA", "TIPO_CLASE", "TIPO_SESION", "PRECIO", "DIA",
    "DURACION", "HORA_INICIO", "HORA_FIN", "FALTAS_RECUPERABLES", "FALTAS_NO_RECUPERABLES",
    "RECUPERACIONES", "SALDO", "ID_GRUPO_HORARIO", "ID_CENTRO", "ESTADO", "ID_CURSO"
  )
  SELECT
    hm_m.new_id,
    p_target_cliente,
    mat_m.new_id,
    alum_m.new_id,
    esp_m.new_id,
    grp_m.new_id,
    pro_m.new_id,
    aul_m.new_id,
    tar_m.new_id,
    hm."TIPO_CLASE",
    hm."TIPO_SESION",
    hm."PRECIO",
    hm."DIA",
    hm."DURACION",
    hm."HORA_INICIO",
    hm."HORA_FIN",
    hm."FALTAS_RECUPERABLES",
    hm."FALTAS_NO_RECUPERABLES",
    hm."RECUPERACIONES",
    hm."SALDO",
    NULL,
    v_target_centro,
    hm."ESTADO",
    cur_m.new_id
  FROM public."HORARIOS_MATRICULAS" hm
  JOIN demo_id_map hm_m ON hm_m.entity = 'horario' AND hm_m.old_id = hm."ID_HORARIO"
  LEFT JOIN demo_id_map mat_m ON mat_m.entity = 'matricula' AND mat_m.old_id = hm."ID_MATRICULA"
  LEFT JOIN demo_id_map alum_m ON alum_m.entity = 'alumno' AND alum_m.old_id = hm."ID_ALUMNO"
  LEFT JOIN demo_id_map esp_m ON esp_m.entity = 'especialidad' AND esp_m.old_id = hm."ID_ESPECIALIDAD"
  LEFT JOIN demo_id_map grp_m ON grp_m.entity = 'grupo' AND grp_m.old_id = hm."ID_GRUPO"
  LEFT JOIN demo_id_map pro_m ON pro_m.entity = 'profesor' AND pro_m.old_id = hm."ID_PROFESOR"
  LEFT JOIN demo_id_map aul_m ON aul_m.entity = 'aula' AND aul_m.old_id = hm."ID_AULA"
  LEFT JOIN demo_id_map tar_m ON tar_m.entity = 'tarifa' AND tar_m.old_id = hm."ID_TARIFA"
  LEFT JOIN demo_id_map cur_m ON cur_m.entity = 'curso' AND cur_m.old_id = hm."ID_CURSO"
  WHERE hm."ID_CLIENTE" = p_source_cliente
    AND hm."ID_CENTRO" = p_source_centro
    AND hm."ID_GRUPO_HORARIO" IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('HORARIOS_MATRICULAS', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'recibo', r."ID_RECIBO", public.demo_gen_recibo_id()
  FROM public."RECIBOS_MENSUALES" r
  WHERE r."ID_CLIENTE" = p_source_cliente
    AND r."ID_CENTRO" = p_source_centro
    AND r."ESTADO_PAGO" = 'Borrador';

  INSERT INTO public."RECIBOS_MENSUALES" (
    "ID_RECIBO", "ID_CLIENTE", "REF_RECIBO", "ID_ALUMNO", "MAIL", "TLF", "FECHA", "MES_PERIODO",
    "RECEPTOR_NOMBRE", "CIF_DNI", "DIRECCION", "TIPO_DOC", "METODO_PAGO", "TOTAL_BASE", "DESCUENTO",
    "TOTAL_IVA", "TOTAL_DOC", "NUM_FACTURA_KOREFACTU", "LINK_FACTURA_KOREFACTU", "HUELLA_HASH",
    "URL_QR", "LINK_PDF_RECIBO", "ESTADO_PAGO", "ID_CENTRO", "ID_CURSO", "LINK_PDF_BORRADOR"
  )
  SELECT
    rm.new_id,
    p_target_cliente,
    r."REF_RECIBO",
    am.new_id,
    r."MAIL",
    r."TLF",
    r."FECHA",
    r."MES_PERIODO",
    r."RECEPTOR_NOMBRE",
    r."CIF_DNI",
    r."DIRECCION",
    r."TIPO_DOC",
    r."METODO_PAGO",
    r."TOTAL_BASE",
    r."DESCUENTO",
    r."TOTAL_IVA",
    r."TOTAL_DOC",
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'Borrador',
    v_target_centro,
    cm.new_id,
    r."LINK_PDF_BORRADOR"
  FROM public."RECIBOS_MENSUALES" r
  JOIN demo_id_map rm ON rm.entity = 'recibo' AND rm.old_id = r."ID_RECIBO"
  LEFT JOIN demo_id_map am ON am.entity = 'alumno' AND am.old_id = r."ID_ALUMNO"
  LEFT JOIN demo_id_map cm ON cm.entity = 'curso' AND cm.old_id = r."ID_CURSO"
  WHERE r."ID_CLIENTE" = p_source_cliente
    AND r."ID_CENTRO" = p_source_centro
    AND r."ESTADO_PAGO" = 'Borrador';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('RECIBOS_MENSUALES', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'linea', vl."ID_LINEA", public.demo_gen_prefixed('LIN')
  FROM public."VENTAS_LINEAS" vl
  JOIN public."RECIBOS_MENSUALES" r ON r."ID_RECIBO" = vl."ID_RECIBO"
  WHERE vl."ID_CLIENTE" = p_source_cliente
    AND r."ID_CENTRO" = p_source_centro
    AND r."ESTADO_PAGO" = 'Borrador';

  INSERT INTO public."VENTAS_LINEAS" (
    "ID_LINEA", "ID_CLIENTE", "ID_RECIBO", "CONCEPTO", "ID_MATRICULA", "CANTIDAD",
    "PRECIO_UNITARIO", "DESCUENTO_LINEA", "IVA_PORCENTAJE", "SUBTOTAL"
  )
  SELECT
    lm.new_id,
    p_target_cliente,
    rm.new_id,
    vl."CONCEPTO",
    mm.new_id,
    vl."CANTIDAD",
    vl."PRECIO_UNITARIO",
    vl."DESCUENTO_LINEA",
    vl."IVA_PORCENTAJE",
    vl."SUBTOTAL"
  FROM public."VENTAS_LINEAS" vl
  JOIN demo_id_map lm ON lm.entity = 'linea' AND lm.old_id = vl."ID_LINEA"
  JOIN demo_id_map rm ON rm.entity = 'recibo' AND rm.old_id = vl."ID_RECIBO"
  LEFT JOIN demo_id_map mm ON mm.entity = 'matricula' AND mm.old_id = vl."ID_MATRICULA"
  WHERE vl."ID_CLIENTE" = p_source_cliente;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('VENTAS_LINEAS', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'cargo', c."ID_CARGO", public.demo_gen_prefixed('CRG')
  FROM public."CARGOS_EXTRA" c
  WHERE c."ID_CLIENTE" = p_source_cliente AND c."ID_CENTRO" = p_source_centro;

  INSERT INTO public."CARGOS_EXTRA" (
    "ID_CARGO", "ID_CLIENTE", "ID_CENTRO", "ID_ALUMNO", "CONCEPTO", "CANTIDAD", "PRECIO_UNITARIO",
    "PORCENTAJE_IVA", "FECHA_CARGO", "ESTADO", "ID_RECIBO_VINCULADO", "CREADO_POR", "created_at"
  )
  SELECT
    cm.new_id,
    p_target_cliente,
    v_target_centro,
    am.new_id,
    c."CONCEPTO",
    c."CANTIDAD",
    c."PRECIO_UNITARIO",
    c."PORCENTAJE_IVA",
    c."FECHA_CARGO",
    c."ESTADO",
    rm.new_id,
    c."CREADO_POR",
    c."created_at"
  FROM public."CARGOS_EXTRA" c
  JOIN demo_id_map cm ON cm.entity = 'cargo' AND cm.old_id = c."ID_CARGO"
  LEFT JOIN demo_id_map am ON am.entity = 'alumno' AND am.old_id = c."ID_ALUMNO"
  LEFT JOIN demo_id_map rm ON rm.entity = 'recibo' AND rm.old_id = c."ID_RECIBO_VINCULADO"
  WHERE c."ID_CLIENTE" = p_source_cliente AND c."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('CARGOS_EXTRA', v_n);

  INSERT INTO demo_id_map (entity, old_id, new_id)
  SELECT 'turno', tp."ID_TURNO", public.demo_gen_prefixed('TUR')
  FROM public."TURNOS_PROFESORES" tp
  WHERE tp."ID_CLIENTE" = p_source_cliente AND tp."ID_CENTRO" = p_source_centro;

  INSERT INTO public."TURNOS_PROFESORES" (
    "ID_TURNO", "ID_CLIENTE", "ID_PROFESOR", "DIA_SEMANA", "ABRE_MAÑANA", "CIERRA_MAÑANA",
    "ABRE_TARDE", "CIERRA_TARDE", "ESPECIALIDAD", "ID_CENTRO"
  )
  SELECT
    tm.new_id,
    p_target_cliente,
    pm.new_id,
    tp."DIA_SEMANA",
    tp."ABRE_MAÑANA",
    tp."CIERRA_MAÑANA",
    tp."ABRE_TARDE",
    tp."CIERRA_TARDE",
    tp."ESPECIALIDAD",
    v_target_centro
  FROM public."TURNOS_PROFESORES" tp
  JOIN demo_id_map tm ON tm.entity = 'turno' AND tm.old_id = tp."ID_TURNO"
  LEFT JOIN demo_id_map pm ON pm.entity = 'profesor' AND pm.old_id = tp."ID_PROFESOR"
  WHERE tp."ID_CLIENTE" = p_source_cliente AND tp."ID_CENTRO" = p_source_centro;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('TURNOS_PROFESORES', v_n);

  RETURN jsonb_build_object(
    'ok', true,
    'id_centro', v_target_centro,
    'counts', v_counts,
    'skipped_tables', jsonb_build_array(
      'SESIONES', 'INCIDENCIAS', 'LEADS', 'MANDATOS_SEPA', 'AUSENCIAS_PERMISOS', 'EVALUACIONES',
      'RUBRICAS', 'PRESTAMOS_MATERIAL'
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_demo_signup(
  p_user_id uuid,
  p_nombre text,
  p_telefono text,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_demo_id text;
  v_centro_id text;
  v_prof_id text;
  v_existing_perfil record;
  v_orphan_demo text;
  v_clone jsonb;
  v_logo text;
  v_attempts integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_nombre IS NULL OR p_telefono IS NULL OR p_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parámetros incompletos.');
  END IF;

  SELECT p."ID_PERFIL", p."ID_CLIENTE", p."ID_CENTRO", p."ID_PROFESOR"
  INTO v_existing_perfil
  FROM public."PERFILES" p
  WHERE p."ID" = p_user_id
  ORDER BY p."ID_PERFIL"
  LIMIT 1;

  IF FOUND THEN
    IF public.demo_seed_usable(v_existing_perfil."ID_CLIENTE") THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_exists', true,
        'id_cliente', v_existing_perfil."ID_CLIENTE",
        'id_centro', v_existing_perfil."ID_CENTRO"
      );
    END IF;

    v_demo_id := v_existing_perfil."ID_CLIENTE";
    v_centro_id := COALESCE(v_existing_perfil."ID_CENTRO", v_demo_id || '_CEN_001');
    v_prof_id := v_existing_perfil."ID_PROFESOR";
  ELSE
    SELECT c."ID_CLIENTE"
    INTO v_orphan_demo
    FROM public."CLIENTES" c
    WHERE c."ID_CLIENTE" LIKE 'DEMO-%'
      AND lower(c."EMAIL_CLIENTE") = lower(p_email)
      AND NOT EXISTS (
        SELECT 1 FROM public."PERFILES" p WHERE p."ID_CLIENTE" = c."ID_CLIENTE"
      )
    ORDER BY c."ID_CLIENTE"
    LIMIT 1;

    IF v_orphan_demo IS NOT NULL THEN
      v_demo_id := v_orphan_demo;
    ELSE
      v_demo_id := public.next_demo_cliente_id();
    END IF;

    v_centro_id := v_demo_id || '_CEN_001';

    SELECT p."ID_PROFESOR"
    INTO v_prof_id
    FROM public."PROFESOR" p
    WHERE p."ID_CLIENTE" = v_demo_id
      AND lower(p."EMAIL_PROFESORES") = lower(trim(p_email))
    LIMIT 1;

    IF v_prof_id IS NULL THEN
      v_prof_id := public.demo_gen_prefixed('PRO');
    END IF;
  END IF;

  SELECT c."APP_LOGO"
  INTO v_logo
  FROM public."CLIENTES" c
  WHERE c."ID_CLIENTE" = 'ESC_018';

  IF NOT EXISTS (SELECT 1 FROM public."CLIENTES" WHERE "ID_CLIENTE" = v_demo_id) THEN
    INSERT INTO public."CLIENTES" (
      "ID_CLIENTE", "NOMBRE_ESCUELA", "TLF_REAL", "EMAIL_CLIENTE", "ESTADO_CLIENTE",
      "PLAN", "SECRETARIA", "NOMINAS", "APP_LOGO", "METODO_PAGO_PROPIO", "PAGO",
      "TIPO_COBRO", "ESTADO_MANDATO", "MONTAJE_PENDIENTE", "DESCUENTO",
      "IBAN", "STRIPE_ID", "STRIPE_API_KEY", "KOREFACTU_BASE_URL", "KOREFACTU_API_KEY",
      "IDENTIFICADOR_ACREEDOR", "DOCUMENTO_SEPA"
    ) VALUES (
      v_demo_id,
      'DEMO · ' || trim(p_nombre),
      trim(p_telefono),
      lower(trim(p_email)),
      'Activo',
      'DEMO',
      false,
      false,
      v_logo,
      NULL,
      'DEMO',
      NULL,
      NULL,
      false,
      '0',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    );
  END IF;

  LOOP
    v_attempts := v_attempts + 1;

    IF v_attempts = 1 AND EXISTS (
      SELECT 1 FROM public."CENTROS" WHERE "ID_CENTRO" = v_centro_id
    ) AND NOT public.demo_seed_usable(v_demo_id) THEN
      PERFORM public.demo_purge_incomplete_madrid_seed(v_demo_id, v_prof_id);
    END IF;

    BEGIN
      v_clone := public.clone_demo_esc018_madrid(v_demo_id);
    EXCEPTION
      WHEN OTHERS THEN
        v_clone := jsonb_build_object('ok', false, 'error', SQLERRM);
    END;

    EXIT WHEN public.demo_seed_usable(v_demo_id);
    EXIT WHEN v_attempts >= 2;

    PERFORM public.demo_purge_incomplete_madrid_seed(v_demo_id, v_prof_id);
  END LOOP;

  IF NOT public.demo_seed_usable(v_demo_id) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'id_cliente', v_demo_id,
      'id_centro', v_centro_id,
      'clone', v_clone,
      'error', COALESCE(v_clone->>'error', 'El clon de Madrid falló y no se ha creado un perfil ADMIN sobre un seed vacío.')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public."PROFESOR"
    WHERE "ID_PROFESOR" = v_prof_id
  ) THEN
    INSERT INTO public."PROFESOR" (
      "ID_PROFESOR", "ID_CLIENTE", "NOMBRE_PROFESOR", "TELEFONO", "EMAIL_PROFESORES", "ID_CENTRO", "FECHA_ALTA"
    ) VALUES (
      v_prof_id,
      v_demo_id,
      trim(p_nombre),
      trim(p_telefono),
      lower(trim(p_email)),
      v_centro_id,
      CURRENT_DATE
    );
  ELSE
    UPDATE public."PROFESOR"
    SET
      "NOMBRE_PROFESOR" = trim(p_nombre),
      "TELEFONO" = trim(p_telefono),
      "EMAIL_PROFESORES" = lower(trim(p_email)),
      "ID_CENTRO" = v_centro_id
    WHERE "ID_PROFESOR" = v_prof_id
      AND "ID_CLIENTE" = v_demo_id;
  END IF;

  IF v_existing_perfil."ID_PERFIL" IS NULL THEN
    INSERT INTO public."PERFILES" (
      "ID", "ID_CLIENTE", "ID_PROFESOR", "ID_CENTRO", "NOMBRE", "EMAIL", "ROL", "ESTADO"
    )
    SELECT
      p_user_id,
      v_demo_id,
      v_prof_id,
      v_centro_id,
      trim(p_nombre),
      lower(trim(p_email)),
      'ADMIN',
      'ACTIVO'
    WHERE NOT EXISTS (
      SELECT 1 FROM public."PERFILES" p WHERE p."ID" = p_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id_cliente', v_demo_id,
    'id_centro', v_centro_id,
    'id_profesor', v_prof_id,
    'clone', v_clone
  );
EXCEPTION
  WHEN unique_violation THEN
    IF public.demo_seed_usable((
      SELECT "ID_CLIENTE" FROM public."PERFILES" WHERE "ID" = p_user_id LIMIT 1
    )) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_exists', true,
        'id_cliente', (SELECT "ID_CLIENTE" FROM public."PERFILES" WHERE "ID" = p_user_id LIMIT 1)
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.demo_seed_usable(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.demo_purge_incomplete_madrid_seed(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_demo_esc018_madrid(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_demo_signup(uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.demo_seed_usable(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.demo_purge_incomplete_madrid_seed(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clone_demo_esc018_madrid(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_demo_signup(uuid, text, text, text) TO service_role;

-- Reparación one-shot DEMO-0004: reclonar Madrid sin borrar PERFIL.
DO $$
DECLARE
  v_keep text;
  v_clone jsonb;
  n_alumnos integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."CLIENTES" WHERE "ID_CLIENTE" = 'DEMO-0004') THEN
    RETURN;
  END IF;

  SELECT count(*) INTO n_alumnos FROM public."ALUMNOS" WHERE "ID_CLIENTE" = 'DEMO-0004';
  IF n_alumnos > 0 THEN
    RETURN;
  END IF;

  SELECT p."ID_PROFESOR"
  INTO v_keep
  FROM public."PERFILES" p
  WHERE p."ID_CLIENTE" = 'DEMO-0004'
  ORDER BY p."ID_PERFIL"
  LIMIT 1;

  PERFORM public.demo_purge_incomplete_madrid_seed('DEMO-0004', v_keep);
  v_clone := public.clone_demo_esc018_madrid('DEMO-0004');

  IF NOT public.demo_seed_usable('DEMO-0004') THEN
    RAISE EXCEPTION 'Reparación DEMO-0004 falló: %', COALESCE(v_clone->>'error', 'clone sin alumnos');
  END IF;

  UPDATE public."PROFESOR" pr
  SET "ID_CENTRO" = 'DEMO-0004_CEN_001'
  FROM public."PERFILES" p
  WHERE p."ID_CLIENTE" = 'DEMO-0004'
    AND pr."ID_PROFESOR" = p."ID_PROFESOR";

  UPDATE public."PERFILES"
  SET "ID_CENTRO" = 'DEMO-0004_CEN_001'
  WHERE "ID_CLIENTE" = 'DEMO-0004'
    AND ("ID_CENTRO" IS DISTINCT FROM 'DEMO-0004_CEN_001');
END;
$$;

