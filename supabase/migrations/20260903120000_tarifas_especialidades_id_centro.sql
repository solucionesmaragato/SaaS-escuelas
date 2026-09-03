-- TARIFAS / ESPECIALIDADES: centro opcional (nullable; sin backfill en esta fase).
-- RLS existente sin cambios (sigue ID_CLIENTE = get_my_tenant_id()).

ALTER TABLE public."TARIFAS"
  ADD COLUMN IF NOT EXISTS "ID_CENTRO" text NULL;

ALTER TABLE public."ESPECIALIDADES"
  ADD COLUMN IF NOT EXISTS "ID_CENTRO" text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_tarifas_centro'
      AND conrelid = 'public."TARIFAS"'::regclass
  ) THEN
    ALTER TABLE public."TARIFAS"
      ADD CONSTRAINT fk_tarifas_centro
      FOREIGN KEY ("ID_CENTRO") REFERENCES public."CENTROS"("ID_CENTRO") ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_especialidades_centro'
      AND conrelid = 'public."ESPECIALIDADES"'::regclass
  ) THEN
    ALTER TABLE public."ESPECIALIDADES"
      ADD CONSTRAINT fk_especialidades_centro
      FOREIGN KEY ("ID_CENTRO") REFERENCES public."CENTROS"("ID_CENTRO") ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_catalog_centro_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_centro text;
BEGIN
  v_centro := nullif(trim(coalesce(NEW."ID_CENTRO", '')), '');
  NEW."ID_CENTRO" := v_centro;

  IF v_centro IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = v_centro
        AND c."ID_CLIENTE" IS NOT DISTINCT FROM NEW."ID_CLIENTE"
    ) THEN
      RAISE EXCEPTION
        'ID_CENTRO % no pertenece al tenant %',
        v_centro,
        NEW."ID_CLIENTE";
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tg_tarifas_catalog_centro_same_tenant ON public."TARIFAS";
CREATE TRIGGER tg_tarifas_catalog_centro_same_tenant
  BEFORE INSERT OR UPDATE OF "ID_CENTRO", "ID_CLIENTE"
  ON public."TARIFAS"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_catalog_centro_same_tenant();

DROP TRIGGER IF EXISTS tg_especialidades_catalog_centro_same_tenant ON public."ESPECIALIDADES";
CREATE TRIGGER tg_especialidades_catalog_centro_same_tenant
  BEFORE INSERT OR UPDATE OF "ID_CENTRO", "ID_CLIENTE"
  ON public."ESPECIALIDADES"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_catalog_centro_same_tenant();

NOTIFY pgrst, 'reload schema';
