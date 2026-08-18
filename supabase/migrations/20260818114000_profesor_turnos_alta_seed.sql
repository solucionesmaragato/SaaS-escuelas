-- TURNOS_PROFESORES: sembrar 7 días al INSERT en PROFESOR.
-- Reutiliza la misma lógica que la reactivación tras baja.
-- No modifica get_my_tenant_id, get_my_center_id, get_my_rol ni get_my_teacher_id.

CREATE OR REPLACE FUNCTION public.turnos_seed_semana_profesor(
  p_id_cliente text,
  p_id_profesor text,
  p_id_centro text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_centro text;
  v_inserted integer := 0;
BEGIN
  IF p_id_cliente IS NULL OR trim(p_id_cliente) = '' THEN
    RETURN 0;
  END IF;
  IF p_id_profesor IS NULL OR trim(p_id_profesor) = '' THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."TURNOS_PROFESORES" t
    WHERE t."ID_PROFESOR" = p_id_profesor
      AND t."ID_CLIENTE" = p_id_cliente
  ) THEN
    RETURN 0;
  END IF;

  v_centro := nullif(trim(coalesce(p_id_centro, '')), '');

  IF v_centro IS NULL THEN
    BEGIN
      v_centro := public.tenant_single_active_center_id(p_id_cliente);
    EXCEPTION
      WHEN undefined_function THEN
        v_centro := NULL;
    END;
  END IF;

  INSERT INTO public."TURNOS_PROFESORES" (
    "ID_TURNO",
    "ID_CLIENTE",
    "ID_PROFESOR",
    "DIA_SEMANA",
    "ID_CENTRO"
  )
  VALUES
    (gen_random_uuid()::text, p_id_cliente, p_id_profesor, 'Lunes', v_centro),
    (gen_random_uuid()::text, p_id_cliente, p_id_profesor, 'Martes', v_centro),
    (gen_random_uuid()::text, p_id_cliente, p_id_profesor, 'Miércoles', v_centro),
    (gen_random_uuid()::text, p_id_cliente, p_id_profesor, 'Jueves', v_centro),
    (gen_random_uuid()::text, p_id_cliente, p_id_profesor, 'Viernes', v_centro),
    (gen_random_uuid()::text, p_id_cliente, p_id_profesor, 'Sábado', v_centro),
    (gen_random_uuid()::text, p_id_cliente, p_id_profesor, 'Domingo', v_centro);

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_profesor_turnos_alta_automatica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW."FECHA_BAJA" IS NULL THEN
    PERFORM public.turnos_seed_semana_profesor(
      NEW."ID_CLIENTE",
      NEW."ID_PROFESOR",
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profesor_turnos_alta_automatica ON public."PROFESOR";

CREATE TRIGGER tr_profesor_turnos_alta_automatica
  AFTER INSERT ON public."PROFESOR"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_profesor_turnos_alta_automatica();

CREATE OR REPLACE FUNCTION public.tg_gestion_turnos_por_baja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF OLD."FECHA_BAJA" IS NULL AND NEW."FECHA_BAJA" IS NOT NULL THEN
    DELETE FROM public."TURNOS_PROFESORES"
    WHERE "ID_PROFESOR" = NEW."ID_PROFESOR";

  ELSIF OLD."FECHA_BAJA" IS NOT NULL AND NEW."FECHA_BAJA" IS NULL THEN
    PERFORM public.turnos_seed_semana_profesor(
      NEW."ID_CLIENTE",
      NEW."ID_PROFESOR",
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;
