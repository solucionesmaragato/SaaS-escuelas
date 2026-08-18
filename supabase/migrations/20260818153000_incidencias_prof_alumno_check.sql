-- INCIDENCIAS: restringir escritura PROFESOR a alumnos en HORARIOS_MATRICULAS o SESIONES.
-- No modifica get_my_tenant_id, get_my_center_id, get_my_rol ni get_my_teacher_id.
-- Incidencias_Select_Unified: sin cambios.

CREATE OR REPLACE FUNCTION public.incidencias_prof_alumno_pertenece(
  p_id_cliente text,
  p_id_alumno text,
  p_id_profesor text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    p_id_cliente IS NOT NULL
    AND trim(p_id_cliente) <> ''
    AND p_id_alumno IS NOT NULL
    AND trim(p_id_alumno) <> ''
    AND p_id_profesor IS NOT NULL
    AND trim(p_id_profesor) <> ''
    AND (
      EXISTS (
        SELECT 1
        FROM public."HORARIOS_MATRICULAS" hm
        WHERE hm."ID_CLIENTE" = p_id_cliente
          AND hm."ID_ALUMNO" = p_id_alumno
          AND hm."ID_PROFESOR" = p_id_profesor
      )
      OR EXISTS (
        SELECT 1
        FROM public."SESIONES" s
        WHERE s."ID_CLIENTE" = p_id_cliente
          AND s."ID_ALUMNO" = p_id_alumno
          AND s."ID_PROFESOR" = p_id_profesor
      )
    );
$$;

DROP POLICY IF EXISTS "Incidencias_Write_Unified" ON public."INCIDENCIAS";

DROP POLICY IF EXISTS "Incidencias_Insert" ON public."INCIDENCIAS";
CREATE POLICY "Incidencias_Insert"
  ON public."INCIDENCIAS"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text])
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_CENTRO" = public.get_my_center_id()
    )
    OR (
      public.get_my_rol() = 'PROFESOR'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_PROFESOR" = public.get_my_teacher_id()
      AND public.incidencias_prof_alumno_pertenece(
        "ID_CLIENTE",
        "ID_ALUMNO",
        "ID_PROFESOR"
      )
    )
  );

DROP POLICY IF EXISTS "Incidencias_Update" ON public."INCIDENCIAS";
CREATE POLICY "Incidencias_Update"
  ON public."INCIDENCIAS"
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text])
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_CENTRO" = public.get_my_center_id()
    )
    OR (
      public.get_my_rol() = 'PROFESOR'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_PROFESOR" = public.get_my_teacher_id()
      AND public.incidencias_prof_alumno_pertenece(
        "ID_CLIENTE",
        "ID_ALUMNO",
        "ID_PROFESOR"
      )
    )
  )
  WITH CHECK (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text])
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_CENTRO" = public.get_my_center_id()
    )
    OR (
      public.get_my_rol() = 'PROFESOR'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_PROFESOR" = public.get_my_teacher_id()
      AND public.incidencias_prof_alumno_pertenece(
        "ID_CLIENTE",
        "ID_ALUMNO",
        "ID_PROFESOR"
      )
    )
  );

DROP POLICY IF EXISTS "Incidencias_Delete" ON public."INCIDENCIAS";
CREATE POLICY "Incidencias_Delete"
  ON public."INCIDENCIAS"
  FOR DELETE
  TO authenticated
  USING (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text])
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_CENTRO" = public.get_my_center_id()
    )
    OR (
      public.get_my_rol() = 'PROFESOR'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_PROFESOR" = public.get_my_teacher_id()
      AND public.incidencias_prof_alumno_pertenece(
        "ID_CLIENTE",
        "ID_ALUMNO",
        "ID_PROFESOR"
      )
    )
  );
