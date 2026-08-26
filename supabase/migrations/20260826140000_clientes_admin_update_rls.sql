-- Fix CLIENTES UPDATE RLS: ADMIN via PERFILES (get_my_rol / get_my_tenant_id), not JWT app_metadata.

DROP POLICY IF EXISTS "Allow_admin_update_clientes" ON public."CLIENTES";

CREATE POLICY "Allow_admin_update_clientes"
  ON public."CLIENTES"
  FOR UPDATE
  USING (
    (get_my_rol() = 'MASTER'::text)
    OR (
      get_my_rol() = 'ADMIN'::text
      AND "ID_CLIENTE" = get_my_tenant_id()
    )
  )
  WITH CHECK (
    (get_my_rol() = 'MASTER'::text)
    OR (
      get_my_rol() = 'ADMIN'::text
      AND "ID_CLIENTE" = get_my_tenant_id()
    )
  );
