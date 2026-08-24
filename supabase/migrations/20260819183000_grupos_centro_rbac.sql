-- GRUPOS: SECRETARIA y DIRECCION solo ven filas de su centro (ID_CENTRO).
-- SECRETARIA: CRUD en su centro. DIRECCION: solo lectura. ADMIN/MASTER/PROFESOR: sin cambio.

DROP POLICY IF EXISTS "Grupos_Lectura" ON public."GRUPOS";
CREATE POLICY "Grupos_Lectura"
  ON public."GRUPOS"
  FOR SELECT
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
      AND "ID_GRUPO" IN (
        SELECT gh."ID_GRUPO"
        FROM public."GRUPOS_HORARIOS" gh
        WHERE gh."ID_PROFESOR" = public.get_my_teacher_id()
          AND gh."ID_CLIENTE" = public.get_my_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS "Grp_Admin_All" ON public."GRUPOS";
CREATE POLICY "Grp_Admin_All"
  ON public."GRUPOS"
  FOR ALL
  TO authenticated
  USING (
    (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = 'SECRETARIA'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_CENTRO" = public.get_my_center_id()
    )
  )
  WITH CHECK (
    (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = 'SECRETARIA'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_CENTRO" = public.get_my_center_id()
    )
  );

-- Política legacy: UPDATE sin filtro de tenant/centro; anula el alcance por centro.
DROP POLICY IF EXISTS "Grp_Staff_Update" ON public."GRUPOS";
