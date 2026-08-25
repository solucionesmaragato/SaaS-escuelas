-- Pre-OAuth: crear DEMO + perfil ADMIN con ID NULL para pasar la lista blanca
-- de tg_auth_sincronizar_perfil sin modificar el trigger.

CREATE OR REPLACE FUNCTION public.provision_demo_preauth(
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
  v_existing_demo_perfil record;
  v_existing_demo_cliente text;
  v_clone jsonb;
  v_logo text;
  v_cif text;
  v_direccion text;
  v_url_web text;
  v_attempts integer := 0;
  v_email text;
BEGIN
  IF p_nombre IS NULL OR p_telefono IS NULL OR p_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parámetros incompletos.');
  END IF;

  v_email := lower(trim(p_email));

  SELECT p."ID_PERFIL", p."ID_CLIENTE", p."ID_CENTRO", p."ID_PROFESOR"
  INTO v_existing_demo_perfil
  FROM public."PERFILES" p
  WHERE lower(trim(p."EMAIL")) = v_email
    AND p."ID_CLIENTE" LIKE 'DEMO-%'
  ORDER BY p."ID_PERFIL"
  LIMIT 1;

  IF FOUND THEN
    IF public.demo_seed_usable(v_existing_demo_perfil."ID_CLIENTE") THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_exists', true,
        'id_cliente', v_existing_demo_perfil."ID_CLIENTE",
        'id_centro', v_existing_demo_perfil."ID_CENTRO"
      );
    END IF;

    v_demo_id := v_existing_demo_perfil."ID_CLIENTE";
    v_centro_id := COALESCE(v_existing_demo_perfil."ID_CENTRO", v_demo_id || '_CEN_001');
    v_prof_id := v_existing_demo_perfil."ID_PROFESOR";
  ELSE
    SELECT c."ID_CLIENTE"
    INTO v_existing_demo_cliente
    FROM public."CLIENTES" c
    WHERE c."ID_CLIENTE" LIKE 'DEMO-%'
      AND lower(c."EMAIL_CLIENTE") = v_email
    ORDER BY c."ID_CLIENTE"
    LIMIT 1;

    IF v_existing_demo_cliente IS NOT NULL THEN
      v_demo_id := v_existing_demo_cliente;
    ELSE
      v_demo_id := public.next_demo_cliente_id();
    END IF;

    v_centro_id := v_demo_id || '_CEN_001';

    SELECT p."ID_PROFESOR"
    INTO v_prof_id
    FROM public."PROFESOR" p
    WHERE p."ID_CLIENTE" = v_demo_id
      AND lower(p."EMAIL_PROFESORES") = v_email
    LIMIT 1;

    IF v_prof_id IS NULL THEN
      v_prof_id := public.demo_gen_prefixed('PRO');
    END IF;
  END IF;

  SELECT c."APP_LOGO", c."CIF", c."DIRECCION", c."URL_WEB"
  INTO v_logo, v_cif, v_direccion, v_url_web
  FROM public."CLIENTES" c
  WHERE c."ID_CLIENTE" = 'ESC_018';

  IF NOT EXISTS (SELECT 1 FROM public."CLIENTES" WHERE "ID_CLIENTE" = v_demo_id) THEN
    INSERT INTO public."CLIENTES" (
      "ID_CLIENTE", "NOMBRE_ESCUELA", "TLF_REAL", "EMAIL_CLIENTE", "ESTADO_CLIENTE",
      "DEMO_TRIAL_STARTED_AT",
      "PLAN", "SECRETARIA", "NOMINAS", "APP_LOGO", "CIF", "DIRECCION", "URL_WEB",
      "METODO_PAGO_PROPIO", "PAGO", "TIPO_COBRO", "ESTADO_MANDATO", "MONTAJE_PENDIENTE", "DESCUENTO",
      "IBAN", "STRIPE_ID", "STRIPE_API_KEY", "KOREFACTU_BASE_URL", "KOREFACTU_API_KEY",
      "IDENTIFICADOR_ACREEDOR", "DOCUMENTO_SEPA"
    ) VALUES (
      v_demo_id,
      'DEMO · ' || trim(p_nombre),
      trim(p_telefono),
      v_email,
      'Activo',
      now(),
      'DEMO',
      false,
      false,
      v_logo,
      v_cif,
      v_direccion,
      v_url_web,
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

  UPDATE public."CLIENTES"
  SET
    "NOMBRE_ESCUELA" = 'DEMO · ' || trim(p_nombre),
    "TLF_REAL" = trim(p_telefono),
    "EMAIL_CLIENTE" = v_email,
    "CIF" = v_cif,
    "DIRECCION" = v_direccion,
    "URL_WEB" = v_url_web,
    "APP_LOGO" = v_logo
  WHERE "ID_CLIENTE" = v_demo_id;

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

  UPDATE public."CENTROS"
  SET "TELEFONO_CENTRO" = trim(p_telefono)
  WHERE "ID_CENTRO" = v_centro_id;

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
      v_email,
      v_centro_id,
      CURRENT_DATE
    );
  ELSE
    UPDATE public."PROFESOR"
    SET
      "NOMBRE_PROFESOR" = trim(p_nombre),
      "TELEFONO" = trim(p_telefono),
      "EMAIL_PROFESORES" = v_email,
      "ID_CENTRO" = v_centro_id
    WHERE "ID_PROFESOR" = v_prof_id
      AND "ID_CLIENTE" = v_demo_id;
  END IF;

  INSERT INTO public."PERFILES" (
    "ID", "ID_CLIENTE", "ID_PROFESOR", "ID_CENTRO", "NOMBRE", "EMAIL", "ROL", "ESTADO"
  )
  SELECT
    NULL,
    v_demo_id,
    v_prof_id,
    v_centro_id,
    trim(p_nombre),
    v_email,
    'ADMIN',
    'ACTIVO'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public."PERFILES" p
    WHERE p."ID_CLIENTE" = v_demo_id
      AND lower(trim(p."EMAIL")) = v_email
      AND p."ROL" = 'ADMIN'
  );

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
      SELECT p."ID_CLIENTE"
      FROM public."PERFILES" p
      WHERE lower(trim(p."EMAIL")) = lower(trim(p_email))
        AND p."ID_CLIENTE" LIKE 'DEMO-%'
      ORDER BY p."ID_PERFIL"
      LIMIT 1
    )) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_exists', true,
        'id_cliente', (
          SELECT p."ID_CLIENTE"
          FROM public."PERFILES" p
          WHERE lower(trim(p."EMAIL")) = lower(trim(p_email))
            AND p."ID_CLIENTE" LIKE 'DEMO-%'
          ORDER BY p."ID_PERFIL"
          LIMIT 1
        )
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
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
  v_existing_demo_perfil record;
  v_preauth_perfil record;
  v_orphan_demo text;
  v_clone jsonb;
  v_logo text;
  v_cif text;
  v_direccion text;
  v_url_web text;
  v_attempts integer := 0;
  v_email text;
BEGIN
  IF p_user_id IS NULL OR p_nombre IS NULL OR p_telefono IS NULL OR p_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Parámetros incompletos.');
  END IF;

  v_email := lower(trim(p_email));

  SELECT p."ID_PERFIL", p."ID_CLIENTE", p."ID_CENTRO", p."ID_PROFESOR"
  INTO v_preauth_perfil
  FROM public."PERFILES" p
  WHERE lower(trim(p."EMAIL")) = v_email
    AND p."ID_CLIENTE" LIKE 'DEMO-%'
    AND p."ID" IS NULL
  ORDER BY p."ID_PERFIL"
  LIMIT 1;

  IF FOUND AND public.demo_seed_usable(v_preauth_perfil."ID_CLIENTE") THEN
    UPDATE public."PERFILES"
    SET "ID" = p_user_id
    WHERE "ID_PERFIL" = v_preauth_perfil."ID_PERFIL"
      AND "ID" IS NULL;

    RETURN jsonb_build_object(
      'ok', true,
      'already_exists', true,
      'id_cliente', v_preauth_perfil."ID_CLIENTE",
      'id_centro', v_preauth_perfil."ID_CENTRO"
    );
  END IF;

  SELECT p."ID_PERFIL", p."ID_CLIENTE", p."ID_CENTRO", p."ID_PROFESOR"
  INTO v_existing_demo_perfil
  FROM public."PERFILES" p
  WHERE p."ID" = p_user_id
    AND p."ID_CLIENTE" LIKE 'DEMO-%'
  ORDER BY p."ID_PERFIL"
  LIMIT 1;

  IF FOUND THEN
    IF public.demo_seed_usable(v_existing_demo_perfil."ID_CLIENTE") THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_exists', true,
        'id_cliente', v_existing_demo_perfil."ID_CLIENTE",
        'id_centro', v_existing_demo_perfil."ID_CENTRO"
      );
    END IF;

    v_demo_id := v_existing_demo_perfil."ID_CLIENTE";
    v_centro_id := COALESCE(v_existing_demo_perfil."ID_CENTRO", v_demo_id || '_CEN_001');
    v_prof_id := v_existing_demo_perfil."ID_PROFESOR";
  ELSE
    SELECT p."ID_PERFIL", p."ID_CLIENTE", p."ID_CENTRO", p."ID_PROFESOR"
    INTO v_existing_demo_perfil
    FROM public."PERFILES" p
    WHERE lower(trim(p."EMAIL")) = v_email
      AND p."ID_CLIENTE" LIKE 'DEMO-%'
    ORDER BY p."ID_PERFIL"
    LIMIT 1;

    IF FOUND THEN
      v_demo_id := v_existing_demo_perfil."ID_CLIENTE";
      v_centro_id := COALESCE(v_existing_demo_perfil."ID_CENTRO", v_demo_id || '_CEN_001');
      v_prof_id := v_existing_demo_perfil."ID_PROFESOR";
    ELSE
      SELECT c."ID_CLIENTE"
      INTO v_orphan_demo
      FROM public."CLIENTES" c
      WHERE c."ID_CLIENTE" LIKE 'DEMO-%'
        AND lower(c."EMAIL_CLIENTE") = v_email
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
        AND lower(p."EMAIL_PROFESORES") = v_email
      LIMIT 1;

      IF v_prof_id IS NULL THEN
        v_prof_id := public.demo_gen_prefixed('PRO');
      END IF;
    END IF;
  END IF;

  SELECT c."APP_LOGO", c."CIF", c."DIRECCION", c."URL_WEB"
  INTO v_logo, v_cif, v_direccion, v_url_web
  FROM public."CLIENTES" c
  WHERE c."ID_CLIENTE" = 'ESC_018';

  IF NOT EXISTS (SELECT 1 FROM public."CLIENTES" WHERE "ID_CLIENTE" = v_demo_id) THEN
    INSERT INTO public."CLIENTES" (
      "ID_CLIENTE", "NOMBRE_ESCUELA", "TLF_REAL", "EMAIL_CLIENTE", "ESTADO_CLIENTE",
      "DEMO_TRIAL_STARTED_AT",
      "PLAN", "SECRETARIA", "NOMINAS", "APP_LOGO", "CIF", "DIRECCION", "URL_WEB",
      "METODO_PAGO_PROPIO", "PAGO", "TIPO_COBRO", "ESTADO_MANDATO", "MONTAJE_PENDIENTE", "DESCUENTO",
      "IBAN", "STRIPE_ID", "STRIPE_API_KEY", "KOREFACTU_BASE_URL", "KOREFACTU_API_KEY",
      "IDENTIFICADOR_ACREEDOR", "DOCUMENTO_SEPA"
    ) VALUES (
      v_demo_id,
      'DEMO · ' || trim(p_nombre),
      trim(p_telefono),
      v_email,
      'Activo',
      now(),
      'DEMO',
      false,
      false,
      v_logo,
      v_cif,
      v_direccion,
      v_url_web,
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

  UPDATE public."CLIENTES"
  SET
    "NOMBRE_ESCUELA" = 'DEMO · ' || trim(p_nombre),
    "TLF_REAL" = trim(p_telefono),
    "EMAIL_CLIENTE" = v_email,
    "CIF" = v_cif,
    "DIRECCION" = v_direccion,
    "URL_WEB" = v_url_web,
    "APP_LOGO" = v_logo
  WHERE "ID_CLIENTE" = v_demo_id;

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

  UPDATE public."CENTROS"
  SET "TELEFONO_CENTRO" = trim(p_telefono)
  WHERE "ID_CENTRO" = v_centro_id;

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
      v_email,
      v_centro_id,
      CURRENT_DATE
    );
  ELSE
    UPDATE public."PROFESOR"
    SET
      "NOMBRE_PROFESOR" = trim(p_nombre),
      "TELEFONO" = trim(p_telefono),
      "EMAIL_PROFESORES" = v_email,
      "ID_CENTRO" = v_centro_id
    WHERE "ID_PROFESOR" = v_prof_id
      AND "ID_CLIENTE" = v_demo_id;
  END IF;

  INSERT INTO public."PERFILES" (
    "ID", "ID_CLIENTE", "ID_PROFESOR", "ID_CENTRO", "NOMBRE", "EMAIL", "ROL", "ESTADO"
  )
  SELECT
    p_user_id,
    v_demo_id,
    v_prof_id,
    v_centro_id,
    trim(p_nombre),
    v_email,
    'ADMIN',
    'ACTIVO'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public."PERFILES" p
    WHERE p."ID_CLIENTE" = v_demo_id
      AND (
        p."ID" = p_user_id
        OR (
          lower(trim(p."EMAIL")) = v_email
          AND p."ROL" = 'ADMIN'
        )
      )
  );

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
      SELECT p."ID_CLIENTE"
      FROM public."PERFILES" p
      WHERE (p."ID" = p_user_id OR lower(trim(p."EMAIL")) = lower(trim(p_email)))
        AND p."ID_CLIENTE" LIKE 'DEMO-%'
      ORDER BY p."ID_PERFIL"
      LIMIT 1
    )) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_exists', true,
        'id_cliente', (
          SELECT p."ID_CLIENTE"
          FROM public."PERFILES" p
          WHERE (p."ID" = p_user_id OR lower(trim(p."EMAIL")) = lower(trim(p_email)))
            AND p."ID_CLIENTE" LIKE 'DEMO-%'
          ORDER BY p."ID_PERFIL"
          LIMIT 1
        )
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_demo_preauth(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_demo_preauth(text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.provision_demo_signup(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_demo_signup(uuid, text, text, text) TO service_role;
