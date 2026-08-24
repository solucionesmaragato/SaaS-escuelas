-- MATRICULAS / HORARIOS_MATRICULAS: SECRETARIA y DIRECCION solo ven filas de su centro (ID_CENTRO).
-- SECRETARIA: lectura + escritura en su centro. DIRECCION: solo lectura. ADMIN/MASTER/PROFESOR: sin cambio.

DROP POLICY IF EXISTS "Matriculas_Lectura" ON public."MATRICULAS";
CREATE POLICY "Matriculas_Lectura"
  ON public."MATRICULAS"
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
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_PROFESOR"::text = public.get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "Matriculas_Escritura" ON public."MATRICULAS";
CREATE POLICY "Matriculas_Escritura"
  ON public."MATRICULAS"
  FOR ALL
  TO authenticated
  USING (
    public.get_my_rol() = 'MASTER'
    OR (
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
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = 'SECRETARIA'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_CENTRO" = public.get_my_center_id()
    )
  );

DROP POLICY IF EXISTS "Horarios_Lectura" ON public."HORARIOS_MATRICULAS";
CREATE POLICY "Horarios_Lectura"
  ON public."HORARIOS_MATRICULAS"
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
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_PROFESOR" = public.get_my_teacher_id()
    )
  );

DROP POLICY IF EXISTS "Horarios_Escritura" ON public."HORARIOS_MATRICULAS";
CREATE POLICY "Horarios_Escritura"
  ON public."HORARIOS_MATRICULAS"
  FOR ALL
  TO authenticated
  USING (
    public.get_my_rol() = 'MASTER'
    OR (
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
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = 'SECRETARIA'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND "ID_CENTRO" = public.get_my_center_id()
    )
  );
