-- AUSENCIAS_PERMISOS: sustituir policy_testing_ausencias_permisos por RLS alineada con useAusencias.
-- No modifica get_my_tenant_id, get_my_center_id, get_my_rol ni get_my_teacher_id.

DROP POLICY IF EXISTS policy_testing_ausencias_permisos ON public."AUSENCIAS_PERMISOS";

DROP POLICY IF EXISTS "Ausencias_Select" ON public."AUSENCIAS_PERMISOS";
CREATE POLICY "Ausencias_Select"
  ON public."AUSENCIAS_PERMISOS"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = 'PROFESOR'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND nullif(trim(coalesce(public.get_my_teacher_id(), '')), '') IS NOT NULL
      AND "ID_PROFESOR" = public.get_my_teacher_id()
    )
    OR (
      public.get_my_rol() = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text])
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND (
        nullif(trim(coalesce(public.get_my_center_id(), '')), '') IS NULL
        OR EXISTS (
          SELECT 1
          FROM public."PERFILES" pf
          WHERE pf."ID_CLIENTE" = public.get_my_tenant_id()
            AND pf."ID_CENTRO" = public.get_my_center_id()
            AND pf."ID_PROFESOR" IS NOT NULL
            AND trim(pf."ID_PROFESOR") <> ''
            AND pf."ID_PROFESOR" = "AUSENCIAS_PERMISOS"."ID_PROFESOR"
        )
      )
    )
  );

DROP POLICY IF EXISTS "Ausencias_Insert" ON public."AUSENCIAS_PERMISOS";
CREATE POLICY "Ausencias_Insert"
  ON public."AUSENCIAS_PERMISOS"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = ANY (ARRAY['PROFESOR'::text, 'DIRECCION'::text])
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND nullif(trim(coalesce(public.get_my_teacher_id(), '')), '') IS NOT NULL
      AND "ID_PROFESOR" = public.get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "Ausencias_Update" ON public."AUSENCIAS_PERMISOS";
CREATE POLICY "Ausencias_Update"
  ON public."AUSENCIAS_PERMISOS"
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
  )
  WITH CHECK (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
  );

DROP POLICY IF EXISTS "Ausencias_Delete" ON public."AUSENCIAS_PERMISOS";
CREATE POLICY "Ausencias_Delete"
  ON public."AUSENCIAS_PERMISOS"
  FOR DELETE
  TO authenticated
  USING (
    public.get_my_rol() = 'MASTER'
  );
