-- Fail-loud: sync PROFESOR.EMAIL_PROFESORES → PERFILES.EMAIL with SECURITY DEFINER.
-- Nombre sync stays in sincronizar_profesor_a_perfil (no duplicate email writes).

CREATE OR REPLACE FUNCTION public.trg_sync_profesor_email_to_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_count int;
  v_has_perfil boolean;
BEGIN
  IF NEW."EMAIL_PROFESORES" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."EMAIL_PROFESORES" IS NOT DISTINCT FROM OLD."EMAIL_PROFESORES" THEN
    RETURN NEW;
  END IF;

  v_email := lower(btrim(NEW."EMAIL_PROFESORES"));

  SELECT EXISTS (
    SELECT 1
    FROM public."PERFILES" pf
    WHERE pf."ID_PROFESOR" = NEW."ID_PROFESOR"
      AND pf."ID_CLIENTE" = NEW."ID_CLIENTE"
  ) INTO v_has_perfil;

  IF NOT v_has_perfil THEN
    RETURN NEW;
  END IF;

  BEGIN
    UPDATE public."PERFILES" pf
    SET "EMAIL" = v_email
    WHERE pf."ID_PROFESOR" = NEW."ID_PROFESOR"
      AND pf."ID_CLIENTE" = NEW."ID_CLIENTE";

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count = 0 THEN
      RAISE EXCEPTION 'profesor_email_sync_failed: No se pudo actualizar el email en Usuarios.';
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'profesor_email_duplicate: Ese email ya está en uso por otro usuario del mismo centro.';
  END;

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

CREATE OR REPLACE FUNCTION public.sincronizar_profesor_a_perfil()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD."NOMBRE_PROFESOR" IS DISTINCT FROM NEW."NOMBRE_PROFESOR" THEN
    UPDATE public."PERFILES" pf
    SET "NOMBRE" = NEW."NOMBRE_PROFESOR"
    WHERE pf."ID_PROFESOR" = NEW."ID_PROFESOR"
      AND pf."ID_CLIENTE" = NEW."ID_CLIENTE";
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';
