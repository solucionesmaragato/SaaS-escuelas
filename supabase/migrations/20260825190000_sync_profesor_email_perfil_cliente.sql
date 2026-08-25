-- Sincroniza PERFILES.EMAIL (y CLIENTES.EMAIL_CLIENTE en ADMIN DEMO-*)
-- cuando cambia PROFESOR.EMAIL_PROFESORES. Seed clonado sin email (NULL) no se pisa.

CREATE OR REPLACE FUNCTION public.trg_sync_profesor_email_to_perfil()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_email text;
BEGIN
  IF NEW."EMAIL_PROFESORES" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."EMAIL_PROFESORES" IS NOT DISTINCT FROM OLD."EMAIL_PROFESORES" THEN
    RETURN NEW;
  END IF;

  v_email := lower(btrim(NEW."EMAIL_PROFESORES"));

  UPDATE public."PERFILES" pf
  SET "EMAIL" = v_email
  WHERE pf."ID_PROFESOR" = NEW."ID_PROFESOR"
    AND pf."ID_CLIENTE" = NEW."ID_CLIENTE";

  IF NEW."ID_CLIENTE" LIKE 'DEMO-%'
     AND EXISTS (
       SELECT 1
       FROM public."PERFILES" pf
       WHERE pf."ID_PROFESOR" = NEW."ID_PROFESOR"
         AND pf."ID_CLIENTE" = NEW."ID_CLIENTE"
         AND pf."ROL" = 'ADMIN'
     ) THEN
    UPDATE public."CLIENTES" c
    SET "EMAIL_CLIENTE" = v_email
    WHERE c."ID_CLIENTE" = NEW."ID_CLIENTE";
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_sync_profesor_email_to_perfil ON public."PROFESOR";

CREATE TRIGGER tr_sync_profesor_email_to_perfil
  AFTER INSERT OR UPDATE OF "EMAIL_PROFESORES" ON public."PROFESOR"
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_profesor_email_to_perfil();
