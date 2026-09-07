-- LEADS: avisos al cambiar ESTADO y al crear sesión de prueba en UPDATE (rama C).
-- El aviso de lead nuevo en INSERT sigue en tg_leads_crear_sesion_prueba.

CREATE OR REPLACE FUNCTION public.tg_leads_actualizar_sesion_prueba()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
    v_id_sesion_old text;
    v_id_sesion_new text;
    v_exists boolean;
BEGIN
    IF OLD."ESTADO" IS DISTINCT FROM NEW."ESTADO" THEN
        INSERT INTO public."AVISOS_INTERNOS" (
            "ID_CLIENTE",
            "ID_CENTRO",
            "ID_CURSO",
            "ID_ESPECIALIDAD",
            "ID_ALUMNO",
            "TIPO",
            "MENSAJE",
            "LEIDO"
        ) VALUES (
            NEW."ID_CLIENTE",
            NEW."ID_CENTRO",
            NEW."ID_CURSO",
            NEW."ESPECIALIDAD",
            NEW."ID_LEAD",
            'Lead estado actualizado',
            'El lead ' || COALESCE(NEW."NOMBRE", 'Sin nombre')
                || ' ha pasado a estado ' || COALESCE(NEW."ESTADO", 'Pendiente') || '.',
            false
        );
    END IF;

    IF OLD."DIA" IS NOT NULL AND OLD."HORA_INICIO" IS NOT NULL THEN
        v_id_sesion_old := 'SES_' || to_char(OLD."DIA", 'DDMMYYYY') || to_char(OLD."HORA_INICIO", 'HH24MISS');

        SELECT EXISTS(
            SELECT 1
            FROM public."SESIONES"
            WHERE "ID_SESION" = v_id_sesion_old
              AND "ID_CLIENTE" = OLD."ID_CLIENTE"
        ) INTO v_exists;
    ELSE
        v_exists := false;
    END IF;

    IF v_exists THEN
        IF NEW."DIA" IS NOT NULL AND NEW."HORA_INICIO" IS NOT NULL AND NEW."HORA_FIN" IS NOT NULL THEN
            v_id_sesion_new := 'SES_' || to_char(NEW."DIA", 'DDMMYYYY') || to_char(NEW."HORA_INICIO", 'HH24MISS');

            UPDATE public."SESIONES" s SET
                "ID_SESION" = v_id_sesion_new,
                "ID_ALUMNO" = NEW."NOMBRE",
                "FECHA_EXACTA" = NEW."DIA",
                "HORA_INICIO" = NEW."HORA_INICIO",
                "HORA_FIN" = NEW."HORA_FIN",
                "ID_PROFESOR" = COALESCE(NEW."ID_PROFESOR", s."ID_PROFESOR"),
                "ID_AULA" = COALESCE(NEW."ID_AULA", s."ID_AULA"),
                "ESPECIALIDAD" = COALESCE(NEW."ESPECIALIDAD", s."ESPECIALIDAD"),
                "NOTAS" = COALESCE(NEW."RESUMEN", s."NOTAS"),
                "TITULO_CALENDARIO" = '🟡 Prueba: ' || COALESCE(NEW."NOMBRE", '') || ' - ' || COALESCE(NEW."ESPECIALIDAD", s."ESPECIALIDAD"),
                "ID_CENTRO" = NEW."ID_CENTRO",
                "ID_CURSO" = NEW."ID_CURSO"
            WHERE s."ID_SESION" = v_id_sesion_old
              AND s."ID_CLIENTE" = OLD."ID_CLIENTE";
        ELSE
            DELETE FROM public."SESIONES"
            WHERE "ID_SESION" = v_id_sesion_old
              AND "ID_CLIENTE" = OLD."ID_CLIENTE";
        END IF;

    ELSIF NEW."DIA" IS NOT NULL AND NEW."HORA_INICIO" IS NOT NULL AND NEW."HORA_FIN" IS NOT NULL THEN
        v_id_sesion_new := 'SES_' || to_char(NEW."DIA", 'DDMMYYYY') || to_char(NEW."HORA_INICIO", 'HH24MISS');

        INSERT INTO public."SESIONES" (
            "ID_SESION",
            "ID_CLIENTE",
            "ID_MATRICULA",
            "ID_HORARIO",
            "ID_ALUMNO",
            "FECHA_EXACTA",
            "HORA_INICIO",
            "HORA_FIN",
            "ID_PROFESOR",
            "ID_AULA",
            "ESPECIALIDAD",
            "ESTADO",
            "NOTAS",
            "TITULO_CALENDARIO",
            "ID_GRUPO_HORARIO",
            "ID_CENTRO",
            "ID_CURSO"
        ) VALUES (
            v_id_sesion_new,
            NEW."ID_CLIENTE",
            NULL,
            NULL,
            NEW."NOMBRE",
            NEW."DIA",
            NEW."HORA_INICIO",
            NEW."HORA_FIN",
            NEW."ID_PROFESOR",
            NEW."ID_AULA",
            NEW."ESPECIALIDAD",
            'Lead',
            NEW."RESUMEN",
            '🟡 Prueba: ' || COALESCE(NEW."NOMBRE", '') || ' - ' || COALESCE(NEW."ESPECIALIDAD", ''),
            NULL,
            NEW."ID_CENTRO",
            NEW."ID_CURSO"
        );

        INSERT INTO public."AVISOS_INTERNOS" (
            "ID_CLIENTE",
            "ID_CENTRO",
            "ID_CURSO",
            "ID_ESPECIALIDAD",
            "ID_ALUMNO",
            "TIPO",
            "MENSAJE",
            "LEIDO"
        ) VALUES (
            NEW."ID_CLIENTE",
            NEW."ID_CENTRO",
            NEW."ID_CURSO",
            NEW."ESPECIALIDAD",
            NEW."ID_LEAD",
            'Lead sesión de prueba',
            'Sesión de prueba programada para el lead '
                || COALESCE(NEW."NOMBRE", 'Sin nombre')
                || ' el '
                || to_char(NEW."DIA", 'DD/MM/YYYY')
                || ' de '
                || to_char(NEW."HORA_INICIO", 'HH24:MI')
                || ' a '
                || to_char(NEW."HORA_FIN", 'HH24:MI')
                || '.',
            false
        );
    END IF;

    RETURN NEW;
END;
$function$;
