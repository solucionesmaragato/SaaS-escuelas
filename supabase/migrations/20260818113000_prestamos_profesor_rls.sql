-- PRESTAMOS_MATERIAL: RLS profesor sin depender de ID_CENTRO fijo en perfil.
-- Funciones prest_* / tenant_single_*: solo políticas y triggers de PRESTAMOS_MATERIAL.
-- No modifica get_my_tenant_id, get_my_center_id, get_my_rol ni get_my_teacher_id.

CREATE OR REPLACE FUNCTION public.tenant_single_active_center_id(p_id_cliente text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH centros AS (
    SELECT c."ID_CENTRO"
    FROM public."CENTROS" c
    WHERE c."ID_CLIENTE" = p_id_cliente
      AND trim(coalesce(c."ID_CENTRO", '')) <> ''
      AND (
        c."ESTADO" IS NULL
        OR trim(c."ESTADO") = ''
        OR lower(trim(c."ESTADO")) = 'activo'
      )
  )
  SELECT c."ID_CENTRO"
  FROM centros c
  WHERE (SELECT count(*) FROM centros) = 1
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ensure_my_profiles_single_center()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH single_centers AS (
    SELECT c."ID_CLIENTE", min(c."ID_CENTRO") AS "ID_CENTRO"
    FROM public."CENTROS" c
    WHERE c."ID_CLIENTE" IS NOT NULL
      AND trim(c."ID_CLIENTE") <> ''
      AND trim(coalesce(c."ID_CENTRO", '')) <> ''
      AND (
        c."ESTADO" IS NULL
        OR trim(c."ESTADO") = ''
        OR lower(trim(c."ESTADO")) = 'activo'
      )
    GROUP BY c."ID_CLIENTE"
    HAVING count(*) = 1
  ),
  updated AS (
    UPDATE public."PERFILES" p
    SET "ID_CENTRO" = sc."ID_CENTRO"
    FROM single_centers sc
    WHERE p."ID" = auth.uid()
      AND p."ID_CLIENTE" = sc."ID_CLIENTE"
      AND (p."ID_CENTRO" IS NULL OR trim(p."ID_CENTRO") = '')
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_my_profiles_single_center() TO authenticated;

CREATE OR REPLACE FUNCTION public.prest_prof_es_creador(p_creado_por text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    p_creado_por IS NOT NULL
    AND trim(p_creado_por) <> ''
    AND trim(p_creado_por) = public.get_my_teacher_id();
$$;

CREATE OR REPLACE FUNCTION public.prest_prof_alumno_es_mio(p_id_alumno text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."HORARIOS_MATRICULAS" hm
    WHERE hm."ID_CLIENTE" = public.get_my_tenant_id()
      AND hm."ID_ALUMNO" = p_id_alumno
      AND hm."ID_PROFESOR" = public.get_my_teacher_id()
      AND lower(trim(coalesce(hm."ESTADO", ''))) = 'activo'
  );
$$;

CREATE OR REPLACE FUNCTION public.prest_prof_puede_ver(
  p_id_cliente text,
  p_categoria text,
  p_id_receptor text,
  p_creado_por text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    public.get_my_rol() = 'PROFESOR'
    AND p_id_cliente = public.get_my_tenant_id()
    AND (
      public.prest_prof_es_creador(p_creado_por)
      OR (
        upper(trim(coalesce(p_categoria, ''))) = 'PROFESOR'
        AND trim(coalesce(p_id_receptor, '')) = public.get_my_teacher_id()
      )
      OR (
        upper(trim(coalesce(p_categoria, ''))) = 'ALUMNO'
        AND public.prest_prof_alumno_es_mio(p_id_receptor)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.prest_prof_puede_escribir(
  p_id_cliente text,
  p_categoria text,
  p_id_receptor text,
  p_creado_por text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    public.get_my_rol() = 'PROFESOR'
    AND p_id_cliente = public.get_my_tenant_id()
    AND public.get_my_teacher_id() IS NOT NULL
    AND trim(public.get_my_teacher_id()) <> ''
    AND (
      p_creado_por IS NULL
      OR trim(p_creado_por) = ''
      OR public.prest_prof_es_creador(p_creado_por)
    )
    AND (
      (
        upper(trim(coalesce(p_categoria, ''))) = 'PROFESOR'
        AND trim(coalesce(p_id_receptor, '')) = public.get_my_teacher_id()
      )
      OR (
        upper(trim(coalesce(p_categoria, ''))) = 'ALUMNO'
        AND public.prest_prof_alumno_es_mio(p_id_receptor)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.prest_resolve_centro_from_horario(
  p_id_cliente text,
  p_id_alumno text,
  p_id_profesor text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT hm."ID_CENTRO"
  FROM public."HORARIOS_MATRICULAS" hm
  WHERE hm."ID_CLIENTE" = p_id_cliente
    AND hm."ID_ALUMNO" = p_id_alumno
    AND hm."ID_PROFESOR" = p_id_profesor
    AND lower(trim(coalesce(hm."ESTADO", ''))) = 'activo'
    AND hm."ID_CENTRO" IS NOT NULL
    AND trim(hm."ID_CENTRO") <> ''
  ORDER BY hm."ID_HORARIO"
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.prest_resolve_centro(
  p_id_cliente text,
  p_id_centro text,
  p_categoria text,
  p_id_receptor text,
  p_creado_por text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_centro text;
  v_profesor text;
BEGIN
  v_centro := nullif(trim(coalesce(p_id_centro, '')), '');
  IF v_centro IS NOT NULL THEN
    RETURN v_centro;
  END IF;

  v_centro := nullif(trim(coalesce(public.get_my_center_id(), '')), '');
  IF v_centro IS NOT NULL THEN
    RETURN v_centro;
  END IF;

  v_centro := public.tenant_single_active_center_id(p_id_cliente);
  IF v_centro IS NOT NULL THEN
    RETURN v_centro;
  END IF;

  IF upper(trim(coalesce(p_categoria, ''))) = 'ALUMNO'
     AND p_id_receptor IS NOT NULL
     AND trim(p_id_receptor) <> '' THEN
    SELECT nullif(trim(coalesce(a."ID_CENTRO", '')), '')
    INTO v_centro
    FROM public."ALUMNOS" a
    WHERE a."ID_ALUMNO" = p_id_receptor
      AND a."ID_CLIENTE" = p_id_cliente
    LIMIT 1;

    IF v_centro IS NOT NULL THEN
      RETURN v_centro;
    END IF;
  END IF;

  v_profesor := nullif(trim(coalesce(p_creado_por, public.get_my_teacher_id(), '')), '');
  IF upper(trim(coalesce(p_categoria, ''))) = 'ALUMNO'
     AND p_id_receptor IS NOT NULL
     AND trim(p_id_receptor) <> ''
     AND v_profesor IS NOT NULL THEN
    RETURN public.prest_resolve_centro_from_horario(
      p_id_cliente,
      p_id_receptor,
      v_profesor
    );
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_prestamos_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
    NEW."CREATED_AT" := NOW();
    NEW."UPDATED_AT" := NOW();

    IF public.get_my_rol() = 'PROFESOR'
       AND (NEW."CREADO_POR" IS NULL OR trim(NEW."CREADO_POR") = '') THEN
      NEW."CREADO_POR" := public.get_my_teacher_id();
    END IF;

    IF NEW."ID_CENTRO" IS NULL OR trim(NEW."ID_CENTRO") = '' THEN
      NEW."ID_CENTRO" := public.prest_resolve_centro(
        NEW."ID_CLIENTE",
        NEW."ID_CENTRO",
        NEW."CATEGORIA",
        NEW."ID_RECEPTOR",
        NEW."CREADO_POR"
      );
    END IF;

    IF NEW."FECHA_DEVOLUCION" IS NOT NULL THEN
        NEW."ESTADO_DEVOLUCION" := 'Devuelto';
    ELSIF NEW."FECHA_FIN_PRESTAMO" IS NOT NULL AND CURRENT_DATE > NEW."FECHA_FIN_PRESTAMO" THEN
        NEW."ESTADO_DEVOLUCION" := 'Pendiente';
    ELSE
        NEW."ESTADO_DEVOLUCION" := 'Prestado';
    END IF;

    RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Prestamos_Profesor_Select" ON public."PRESTAMOS_MATERIAL";
CREATE POLICY "Prestamos_Profesor_Select"
  ON public."PRESTAMOS_MATERIAL"
  FOR SELECT
  TO authenticated
  USING (
    public.prest_prof_puede_ver(
      "ID_CLIENTE",
      "CATEGORIA",
      "ID_RECEPTOR",
      "CREADO_POR"
    )
  );

DROP POLICY IF EXISTS "Prestamos_Profesor_Insert" ON public."PRESTAMOS_MATERIAL";
CREATE POLICY "Prestamos_Profesor_Insert"
  ON public."PRESTAMOS_MATERIAL"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.prest_prof_puede_escribir(
      "ID_CLIENTE",
      "CATEGORIA",
      "ID_RECEPTOR",
      "CREADO_POR"
    )
    AND "ID_CENTRO" IS NOT NULL
    AND trim("ID_CENTRO") <> ''
  );

DROP POLICY IF EXISTS "Prestamos_Profesor_Update" ON public."PRESTAMOS_MATERIAL";
CREATE POLICY "Prestamos_Profesor_Update"
  ON public."PRESTAMOS_MATERIAL"
  FOR UPDATE
  TO authenticated
  USING (
    public.prest_prof_es_creador("CREADO_POR")
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  )
  WITH CHECK (
    public.prest_prof_es_creador("CREADO_POR")
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  );
