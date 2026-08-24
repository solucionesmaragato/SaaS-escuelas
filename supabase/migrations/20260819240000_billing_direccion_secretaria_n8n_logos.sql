-- F2/F5: DIRECCION fuera de recibos; SECRETARIA remesas por centro.
-- F3: quitar webhooks n8n de remesas/facturas.
-- F4: APP_LOGO relativo → URL pública bucket logos (solo si el fichero existe).

-- F2: Recibos_All_Admin sin DIRECCION
DROP POLICY IF EXISTS "Recibos_All_Admin" ON public."RECIBOS_MENSUALES";

CREATE POLICY "Recibos_All_Admin" ON public."RECIBOS_MENSUALES"
    FOR ALL
    USING (
        (public.get_my_rol() = 'MASTER'::text)
        OR (
            public.get_my_rol() = 'ADMIN'::text
            AND "ID_CLIENTE" = public.get_my_tenant_id()
        )
        OR (
            public.get_my_rol() = 'SECRETARIA'::text
            AND "ID_CENTRO" = public.get_my_center_id()
        )
    )
    WITH CHECK (
        (public.get_my_rol() = 'MASTER'::text)
        OR (
            public.get_my_rol() = 'ADMIN'::text
            AND "ID_CLIENTE" = public.get_my_tenant_id()
        )
        OR (
            public.get_my_rol() = 'SECRETARIA'::text
            AND "ID_CENTRO" = public.get_my_center_id()
        )
    );

-- F2: Recibos_Select_User sin DIRECCION
DROP POLICY IF EXISTS "Recibos_Select_User" ON public."RECIBOS_MENSUALES";

CREATE POLICY "Recibos_Select_User" ON public."RECIBOS_MENSUALES"
    FOR SELECT
    USING (
        (public.get_my_rol() = 'MASTER'::text)
        OR (
            public.get_my_rol() = 'ADMIN'::text
            AND "ID_CLIENTE" = public.get_my_tenant_id()
        )
        OR (
            public.get_my_rol() = 'SECRETARIA'::text
            AND "ID_CENTRO" = public.get_my_center_id()
        )
    );

-- F5: CONTROL_REMESAS para SECRETARIA (tenant + centro)
CREATE POLICY "Secretaria_Ver_Remesas" ON public."CONTROL_REMESAS"
    FOR SELECT
    USING (
        public.get_my_rol() = 'SECRETARIA'::text
        AND "ID_CLIENTE" = public.get_my_tenant_id()
        AND "ID_CENTRO" = public.get_my_center_id()
    );

CREATE POLICY "Secretaria_Crear_Remesas" ON public."CONTROL_REMESAS"
    FOR INSERT
    WITH CHECK (
        public.get_my_rol() = 'SECRETARIA'::text
        AND "ID_CLIENTE" = public.get_my_tenant_id()
        AND "ID_CENTRO" = public.get_my_center_id()
    );

CREATE POLICY "Secretaria_Editar_Remesas" ON public."CONTROL_REMESAS"
    FOR UPDATE
    USING (
        public.get_my_rol() = 'SECRETARIA'::text
        AND "ID_CLIENTE" = public.get_my_tenant_id()
        AND "ID_CENTRO" = public.get_my_center_id()
    )
    WITH CHECK (
        public.get_my_rol() = 'SECRETARIA'::text
        AND "ID_CLIENTE" = public.get_my_tenant_id()
        AND "ID_CENTRO" = public.get_my_center_id()
    );

-- F3: quitar triggers n8n (no tocar WhatsApp Permisos)
DROP TRIGGER IF EXISTS generar_xml_remesa ON public."CONTROL_REMESAS";
DROP TRIGGER IF EXISTS "Webhook_Emitir_Factura" ON public."RECIBOS_MENSUALES";

-- F4: APP_LOGO → URL pública bucket logos
-- Caso comprobado: ESC_002 Logos/LOGO_440.png → 440.png en storage
UPDATE public."CLIENTES"
SET "APP_LOGO" = 'https://dmezghsowluepmuyerxj.supabase.co/storage/v1/object/public/logos/440.png'
WHERE "ID_CLIENTE" = 'ESC_002'
  AND trim(coalesce("APP_LOGO", '')) = 'Logos/LOGO_440.png'
  AND EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = 'logos'
        AND o.name = '440.png'
  );

-- Resto: basename del path relativo coincide con name en logos
UPDATE public."CLIENTES" c
SET "APP_LOGO" = 'https://dmezghsowluepmuyerxj.supabase.co/storage/v1/object/public/logos/' || o.name
FROM storage.objects o
WHERE o.bucket_id = 'logos'
  AND c."APP_LOGO" IS NOT NULL
  AND trim(c."APP_LOGO") <> ''
  AND NOT (trim(c."APP_LOGO") ~* '^https?://')
  AND o.name = regexp_replace(trim(c."APP_LOGO"), '^.*/', '');
