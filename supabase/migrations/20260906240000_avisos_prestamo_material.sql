-- Préstamos material: un aviso por ID_PRESTAMO, sincronizado en cada cambio de ESTADO_DEVOLUCION.
-- Si ya existía (incluso LEIDO = true), se actualiza el mismo aviso y LEIDO vuelve a false.

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_PRESTAMO" text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_aviso_prestamo_material
  ON public."AVISOS_INTERNOS" ("ID_PRESTAMO")
  WHERE "ID_PRESTAMO" IS NOT NULL;

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
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  l."NOMBRE" AS "NOMBRE_LEAD",
  al."NOMBRE_ALUMNO" AS "NOMBRE_ALUMNO"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD"
LEFT JOIN public."ALUMNOS" al ON a."ID_ALUMNO" = al."ID_ALUMNO";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_build_mensaje_prestamo_material(
  p_elemento text,
  p_receptor_nombre text,
  p_estado_devolucion text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  v_elemento text;
  v_receptor text;
  v_estado text;
BEGIN
  v_elemento := COALESCE(NULLIF(trim(p_elemento), ''), 'Material');
  v_receptor := COALESCE(NULLIF(trim(p_receptor_nombre), ''), 'receptor');
  v_estado := lower(trim(COALESCE(p_estado_devolucion, '')));

  IF v_estado = 'devuelto' THEN
    RETURN 'Préstamo «' || v_elemento || '» de ' || v_receptor || ': Devuelto.';
  END IF;

  IF v_estado = 'pendiente' THEN
    RETURN 'Préstamo «' || v_elemento || '» a ' || v_receptor || ': Pendiente de devolución.';
  END IF;

  RETURN 'Préstamo «' || v_elemento || '» a ' || v_receptor || ': Prestado.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_prestamo_material(p_id_prestamo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_prestamo RECORD;
  v_receptor_nombre text;
  v_id_profesor text;
  v_id_alumno text;
  v_mensaje text;
  v_tipo constant text := 'Préstamo material';
  v_id_aviso text;
BEGIN
  IF p_id_prestamo IS NULL OR trim(p_id_prestamo) = '' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_prestamo
  FROM public."PRESTAMOS_MATERIAL"
  WHERE "ID_PRESTAMO" = p_id_prestamo;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF upper(trim(COALESCE(v_prestamo."CATEGORIA", ''))) = 'ALUMNO' THEN
    v_id_alumno := NULLIF(trim(v_prestamo."ID_RECEPTOR"), '');
    v_id_profesor := NULLIF(trim(v_prestamo."CREADO_POR"), '');
    SELECT "NOMBRE_ALUMNO"
    INTO v_receptor_nombre
    FROM public."ALUMNOS"
    WHERE "ID_ALUMNO" = v_id_alumno
    LIMIT 1;
  ELSIF upper(trim(COALESCE(v_prestamo."CATEGORIA", ''))) = 'PROFESOR' THEN
    v_id_alumno := NULL;
    v_id_profesor := COALESCE(
      NULLIF(trim(v_prestamo."CREADO_POR"), ''),
      NULLIF(trim(v_prestamo."ID_RECEPTOR"), '')
    );
    SELECT "NOMBRE_PROFESOR"
    INTO v_receptor_nombre
    FROM public."PROFESOR"
    WHERE "ID_PROFESOR" = NULLIF(trim(v_prestamo."ID_RECEPTOR"), '')
    LIMIT 1;
  ELSE
    RETURN;
  END IF;

  v_mensaje := public.fn_build_mensaje_prestamo_material(
    v_prestamo."ELEMENTO",
    v_receptor_nombre,
    v_prestamo."ESTADO_DEVOLUCION"
  );

  SELECT a."ID_AVISO"
  INTO v_id_aviso
  FROM public."AVISOS_INTERNOS" a
  WHERE a."ID_PRESTAMO" = p_id_prestamo
  LIMIT 1;

  IF v_id_aviso IS NOT NULL THEN
    UPDATE public."AVISOS_INTERNOS"
    SET
      "ID_CLIENTE" = v_prestamo."ID_CLIENTE",
      "ID_CENTRO" = v_prestamo."ID_CENTRO",
      "ID_ALUMNO" = v_id_alumno,
      "ID_PROFESOR" = v_id_profesor,
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
    "ID_ALUMNO",
    "ID_PROFESOR",
    "ID_PRESTAMO",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    v_prestamo."ID_CLIENTE",
    v_prestamo."ID_CENTRO",
    v_id_alumno,
    v_id_profesor,
    p_id_prestamo,
    v_tipo,
    v_mensaje,
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_aviso_prestamo_material()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."ESTADO_DEVOLUCION" IS NOT DISTINCT FROM NEW."ESTADO_DEVOLUCION" THEN
    RETURN NEW;
  END IF;

  PERFORM public.fn_sync_aviso_prestamo_material(NEW."ID_PRESTAMO");
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_aviso_prestamo_material ON public."PRESTAMOS_MATERIAL";

CREATE TRIGGER tr_aviso_prestamo_material
  AFTER INSERT OR UPDATE OF "ESTADO_DEVOLUCION" ON public."PRESTAMOS_MATERIAL"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_prestamo_material();

DROP POLICY IF EXISTS "Profesor_Select_Avisos_Prestamo" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Select_Avisos_Prestamo"
  ON public."AVISOS_INTERNOS"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "TIPO" = 'Préstamo material'
    AND "ID_PROFESOR" = public.get_my_teacher_id()
  );

DROP POLICY IF EXISTS "Profesor_Update_Avisos_Prestamo" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Update_Avisos_Prestamo"
  ON public."AVISOS_INTERNOS"
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "TIPO" = 'Préstamo material'
    AND "ID_PROFESOR" = public.get_my_teacher_id()
  )
  WITH CHECK (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "TIPO" = 'Préstamo material'
    AND "ID_PROFESOR" = public.get_my_teacher_id()
  );
