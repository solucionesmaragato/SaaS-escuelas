-- Solo validar solapes al cambiar campos de agenda en LEADS (no al marcar Matriculado al firmar).

CREATE OR REPLACE FUNCTION public.tg_leads_check_solapamiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_mi_sesion text := 'SIN_SESION';
BEGIN
    IF TG_OP = 'UPDATE'
       AND (OLD."DIA", OLD."HORA_INICIO", OLD."HORA_FIN", OLD."ID_PROFESOR", OLD."ID_AULA")
           IS NOT DISTINCT FROM
           (NEW."DIA", NEW."HORA_INICIO", NEW."HORA_FIN", NEW."ID_PROFESOR", NEW."ID_AULA") THEN
        RETURN NEW;
    END IF;

    -- Si estamos editando un Lead, reconstruimos el ID de la sesión que él mismo generó al nacer
    IF TG_OP = 'UPDATE' AND OLD."DIA" IS NOT NULL AND OLD."HORA_INICIO" IS NOT NULL THEN
        v_mi_sesion := 'SES_' || to_char(OLD."DIA", 'DDMMYYYY') || to_char(OLD."HORA_INICIO", 'HH24MISS');
    END IF;

    -- Escudo de comprobación de horarios
    IF NEW."DIA" IS NOT NULL AND NEW."HORA_INICIO" IS NOT NULL AND NEW."HORA_FIN" IS NOT NULL THEN

        IF EXISTS (
            SELECT 1 FROM public."SESIONES" s
            WHERE s."ID_CLIENTE" = NEW."ID_CLIENTE"
              AND s."FECHA_EXACTA" = NEW."DIA"
              AND (
                  (NEW."ID_PROFESOR" IS NOT NULL AND s."ID_PROFESOR" = NEW."ID_PROFESOR")
                  OR
                  (NEW."ID_AULA" IS NOT NULL AND s."ID_AULA" = NEW."ID_AULA")
              )
              -- Que se solapen las horas
              AND (NEW."HORA_INICIO" < s."HORA_FIN" AND NEW."HORA_FIN" > s."HORA_INICIO")
              -- Que la sesión existente esté activa
              AND LOWER(s."ESTADO") NOT IN ('cancelada', 'cancelado', 'inactiva', 'inactivo')
              -- Ignorar nuestra propia sesión para no auto-bloquearnos
              AND s."ID_SESION" != v_mi_sesion
        ) THEN
            RAISE EXCEPTION 'RESTRICT_VETO: Imposible agendar. Ya existe una sesión programada en esa misma fecha y horas para el Aula o Profesor seleccionados.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
