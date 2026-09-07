-- Vista acotada de datos de empresa para /escuela (PG 15: filtro en WHERE, sin RLS en vistas).

DROP VIEW IF EXISTS public."VISTA_EMPRESA_CLIENTE";

CREATE VIEW public."VISTA_EMPRESA_CLIENTE"
WITH (security_invoker = false)
AS
SELECT
  c."ID_CLIENTE",
  c."NOMBRE_ESCUELA",
  c."TLF_REAL",
  c."URL_WEB",
  c."EMAIL_CLIENTE",
  c."APP_LOGO",
  c."CIF",
  c."DIRECCION",
  c."TEXTO_REGIMEN_INTERNO",
  c."TEXTO_AUT_MEDIOS",
  c."TEXTO_AUT_INSTALACIONES",
  c."TEXTO_AUT_WEB",
  c."TEXTO_AUT_RRSS",
  c."TEXTO_AUT_COMUNICACION"
FROM public."CLIENTES" c
WHERE
  c."ID_CLIENTE" = public.get_my_tenant_id()
  OR public.get_my_rol() = 'MASTER'::text
  OR c."ID_CLIENTE" IN (
    SELECT p."ID_CLIENTE"
    FROM public."PERFILES" p
    WHERE p."ID" = auth.uid()
  );

GRANT SELECT, UPDATE ON public."VISTA_EMPRESA_CLIENTE" TO authenticated;
