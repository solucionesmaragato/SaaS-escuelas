-- LEADS: SECRETARIA y DIRECCION solo ven filas de su centro (ID_CENTRO).
-- SECRETARIA: lectura + escritura en su centro. DIRECCION: solo lectura. ADMIN/MASTER: sin cambio.

DROP POLICY IF EXISTS "Leads_Access_V2" ON public."LEADS";
CREATE POLICY "Leads_Access_V2"
  ON public."LEADS"
  FOR SELECT
  TO authenticated
  USING (
    "ID_CLIENTE" = public.get_my_tenant_id()
    AND (
      public.get_my_rol() = ANY (ARRAY['MASTER'::text, 'ADMIN'::text])
      OR (
        public.get_my_rol() = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text])
        AND "ID_CENTRO" = public.get_my_center_id()
      )
    )
  );

DROP POLICY IF EXISTS "Leads_Insert_V2" ON public."LEADS";
CREATE POLICY "Leads_Insert_V2"
  ON public."LEADS"
  FOR INSERT
  TO authenticated
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

DROP POLICY IF EXISTS "Leads_Update_V2" ON public."LEADS";
CREATE POLICY "Leads_Update_V2"
  ON public."LEADS"
  FOR UPDATE
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

DROP POLICY IF EXISTS "Leads_Delete_V2" ON public."LEADS";
CREATE POLICY "Leads_Delete_V2"
  ON public."LEADS"
  FOR DELETE
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
  );
