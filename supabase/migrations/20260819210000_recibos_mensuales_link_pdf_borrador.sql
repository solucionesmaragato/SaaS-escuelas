-- LINK_PDF_BORRADOR: PDF borrador del recibo (pre-factura).
-- LINK_PDF_RECIBO: PDF de la factura/recibo oficial.

ALTER TABLE public."RECIBOS_MENSUALES"
    ADD COLUMN IF NOT EXISTS "LINK_PDF_BORRADOR" text NULL;

COMMENT ON COLUMN public."RECIBOS_MENSUALES"."LINK_PDF_BORRADOR" IS
    'URL del PDF borrador del recibo. LINK_PDF_RECIBO almacena el PDF de la factura oficial.';
