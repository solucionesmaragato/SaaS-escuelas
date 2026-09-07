-- Avisos internos: mandato SEPA pendiente / firmado (solo alumnos con METODO_PAGO = SEPA).

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_MANDATO" text NULL;

DROP VIEW IF EXISTS public."VISTA_AVISOS_INTERNOS";

CREATE VIEW public."VISTA_AVISOS_INTERNOS"
WITH (security_invoker = true)
AS
SELECT
  a."ID_AVISO",
  a."ID_CLIENTE",
  a."ID_CENTRO",
  a."ID_CURSO",
  a."ID_HORARIO",
  a."ID_ALUMNO",
  a."ID_PROFESOR",
  a."ID_ESPECIALIDAD",
  a."ID_MANDATO",
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  l."NOMBRE" AS "NOMBRE_LEAD"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_aviso_mandato_sepa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_nombre text;
  v_metodo text;
BEGIN
  SELECT "NOMBRE_ALUMNO", "METODO_PAGO"
  INTO v_nombre, v_metodo
  FROM public."ALUMNOS"
  WHERE "ID_ALUMNO" = NEW."ID_ALUMNO";

  IF v_metodo IS DISTINCT FROM 'SEPA' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW."ESTADO" = 'pendiente' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public."AVISOS_INTERNOS"
      WHERE "ID_MANDATO" = NEW."ID_MANDATO"
        AND "TIPO" = 'Mandato SEPA pendiente'
        AND "LEIDO" = false
    ) THEN
      INSERT INTO public."AVISOS_INTERNOS" (
        "ID_CLIENTE",
        "ID_CENTRO",
        "ID_ALUMNO",
        "ID_MANDATO",
        "TIPO",
        "MENSAJE",
        "LEIDO"
      ) VALUES (
        NEW."ID_CLIENTE",
        NEW."ID_CENTRO",
        NEW."ID_ALUMNO",
        NEW."ID_MANDATO",
        'Mandato SEPA pendiente',
        'Mandato SEPA pendiente de firma para ' || COALESCE(v_nombre, 'el alumno') || '.',
        false
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."ESTADO" IS DISTINCT FROM 'firmado'
     AND NEW."ESTADO" = 'firmado' THEN
    UPDATE public."AVISOS_INTERNOS"
    SET "LEIDO" = true
    WHERE "ID_MANDATO" = NEW."ID_MANDATO"
      AND "TIPO" = 'Mandato SEPA pendiente'
      AND "LEIDO" = false;

    INSERT INTO public."AVISOS_INTERNOS" (
      "ID_CLIENTE",
      "ID_CENTRO",
      "ID_ALUMNO",
      "ID_MANDATO",
      "TIPO",
      "MENSAJE",
      "LEIDO"
    ) VALUES (
      NEW."ID_CLIENTE",
      NEW."ID_CENTRO",
      NEW."ID_ALUMNO",
      NEW."ID_MANDATO",
      'Mandato SEPA firmado',
      'Mandato SEPA firmado por ' || COALESCE(v_nombre, 'el alumno') || '.',
      false
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."ESTADO" = 'revocado'
     AND OLD."ESTADO" = 'pendiente' THEN
    UPDATE public."AVISOS_INTERNOS"
    SET "LEIDO" = true
    WHERE "ID_MANDATO" = OLD."ID_MANDATO"
      AND "TIPO" = 'Mandato SEPA pendiente'
      AND "LEIDO" = false;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_aviso_mandato_sepa ON public."MANDATOS_SEPA";

CREATE TRIGGER tr_aviso_mandato_sepa
  AFTER INSERT OR UPDATE OF "ESTADO" ON public."MANDATOS_SEPA"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_mandato_sepa();

CREATE OR REPLACE FUNCTION public.tg_cerrar_avisos_mandato_sepa_alumno()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF NEW."METODO_PAGO" IS DISTINCT FROM 'SEPA' AND OLD."METODO_PAGO" = 'SEPA' THEN
    UPDATE public."AVISOS_INTERNOS"
    SET "LEIDO" = true
    WHERE "ID_ALUMNO" = NEW."ID_ALUMNO"
      AND "TIPO" = 'Mandato SEPA pendiente'
      AND "LEIDO" = false;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_cerrar_avisos_mandato_sepa_alumno ON public."ALUMNOS";

CREATE TRIGGER tr_cerrar_avisos_mandato_sepa_alumno
  AFTER UPDATE OF "METODO_PAGO" ON public."ALUMNOS"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_cerrar_avisos_mandato_sepa_alumno();
