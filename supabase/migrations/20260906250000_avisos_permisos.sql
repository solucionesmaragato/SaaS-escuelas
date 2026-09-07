-- Permisos: un aviso por ID_PERMISO, sincronizado en INSERT y cambio de ESTADO.
-- Si ya existía (incluso LEIDO = true), se actualiza el mismo aviso y LEIDO vuelve a false.

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_PERMISO" text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_aviso_permiso
  ON public."AVISOS_INTERNOS" ("ID_PERMISO")
  WHERE "ID_PERMISO" IS NOT NULL;

DROP VIEW IF EXISTS public."VISTA_AVISOS_INTERNOS";

CREATE VIEW public."VISTA_AVISOS_INTERNOS"
WITH (security_invoker = true)
AS
SELECT
  a."ID_AVISO",
  a."ID_CLIENTE",
  a."ID_CENTRO",
  a."ID_CURSO",
  a."ID_HORARIO",
  a."ID_ALUMNO",
  a."ID_PROFESOR",
  a."ID_ESPECIALIDAD",
  a."ID_MANDATO",
  a."ID_INCIDENCIA",
  a."ID_MATRICULA",
  a."ID_GRUPO",
  a."ID_PRESTAMO",
  a."ID_PERMISO",
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  a."CANTIDAD",
  l."NOMBRE" AS "NOMBRE_LEAD",
  al."NOMBRE_ALUMNO" AS "NOMBRE_ALUMNO"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD"
LEFT JOIN public."ALUMNOS" al ON a."ID_ALUMNO" = al."ID_ALUMNO";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_build_mensaje_permiso(
  p_nombre_profesor text,
  p_tipo text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_estado text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_nombre text;
  v_tipo text;
  v_estado text;
BEGIN
  v_nombre := COALESCE(NULLIF(trim(p_nombre_profesor), ''), 'Trabajador');
  v_tipo := COALESCE(NULLIF(trim(p_tipo), ''), 'Permiso');
  v_estado := lower(trim(COALESCE(p_estado, 'pendiente')));

  IF v_estado = 'aprobado' THEN
    RETURN 'Permiso de ' || v_nombre || ' (' || v_tipo || ', '
      || to_char(p_fecha_inicio, 'DD/MM/YYYY') || '–' || to_char(p_fecha_fin, 'DD/MM/YYYY')
      || '): Aprobado.';
  END IF;

  IF v_estado = 'denegado' THEN
    RETURN 'Permiso de ' || v_nombre || ' (' || v_tipo || ', '
      || to_char(p_fecha_inicio, 'DD/MM/YYYY') || '–' || to_char(p_fecha_fin, 'DD/MM/YYYY')
      || '): Denegado.';
  END IF;

  RETURN 'Permiso de ' || v_nombre || ' (' || v_tipo || ', '
    || to_char(p_fecha_inicio, 'DD/MM/YYYY') || '–' || to_char(p_fecha_fin, 'DD/MM/YYYY')
    || '): Pendiente de tramitar.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_permiso(p_id_permiso text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_permiso RECORD;
  v_nombre_profesor text;
  v_mensaje text;
  v_tipo constant text := 'Permiso';
  v_id_aviso text;
BEGIN
  IF p_id_permiso IS NULL OR trim(p_id_permiso) = '' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_permiso
  FROM public."AUSENCIAS_PERMISOS"
  WHERE "ID_PERMISO" = p_id_permiso;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT "NOMBRE_PROFESOR"
  INTO v_nombre_profesor
  FROM public."PROFESOR"
  WHERE "ID_PROFESOR" = v_permiso."ID_PROFESOR"
    AND "ID_CLIENTE" = v_permiso."ID_CLIENTE"
  LIMIT 1;

  v_mensaje := public.fn_build_mensaje_permiso(
    v_nombre_profesor,
    v_permiso."TIPO",
    v_permiso."FECHA_INICIO",
    v_permiso."FECHA_FIN",
    v_permiso."ESTADO"
  );

  SELECT a."ID_AVISO"
  INTO v_id_aviso
  FROM public."AVISOS_INTERNOS" a
  WHERE a."ID_PERMISO" = p_id_permiso
  LIMIT 1;

  IF v_id_aviso IS NOT NULL THEN
    UPDATE public."AVISOS_INTERNOS"
    SET
      "ID_CLIENTE" = v_permiso."ID_CLIENTE",
      "ID_CENTRO" = v_permiso."ID_CENTRO",
      "ID_PROFESOR" = v_permiso."ID_PROFESOR",
      "TIPO" = v_tipo,
      "MENSAJE" = v_mensaje,
      "LEIDO" = false,
      "FECHA" = now()
    WHERE "ID_AVISO" = v_id_aviso;

    RETURN;
  END IF;

  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_PROFESOR",
    "ID_PERMISO",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    v_permiso."ID_CLIENTE",
    v_permiso."ID_CENTRO",
    v_permiso."ID_PROFESOR",
    p_id_permiso,
    v_tipo,
    v_mensaje,
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_aviso_permiso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."ESTADO" IS NOT DISTINCT FROM NEW."ESTADO" THEN
    RETURN NEW;
  END IF;

  PERFORM public.fn_sync_aviso_permiso(NEW."ID_PERMISO");
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_aviso_permiso ON public."AUSENCIAS_PERMISOS";

CREATE TRIGGER tr_aviso_permiso
  AFTER INSERT OR UPDATE OF "ESTADO" ON public."AUSENCIAS_PERMISOS"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_permiso();

DROP POLICY IF EXISTS "Profesor_Select_Avisos_Permiso" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Select_Avisos_Permiso"
  ON public."AVISOS_INTERNOS"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "TIPO" = 'Permiso'
    AND "ID_PROFESOR" = public.get_my_teacher_id()
  );

DROP POLICY IF EXISTS "Profesor_Update_Avisos_Permiso" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Update_Avisos_Permiso"
  ON public."AVISOS_INTERNOS"
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "TIPO" = 'Permiso'
    AND "ID_PROFESOR" = public.get_my_teacher_id()
  )
  WITH CHECK (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "TIPO" = 'Permiso'
    AND "ID_PROFESOR" = public.get_my_teacher_id()
  );
