-- H3.1: skip plantilla semanal overlap checks while cloning demo seed (legacy ESC_018 data may overlap).

CREATE OR REPLACE FUNCTION public.tg_horarios_matriculas_plantilla_semanal_solape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF current_setting('app.demo_clone', true) = '1' THEN
        RETURN NEW;
    END IF;

    IF NEW."ESTADO" IS DISTINCT FROM 'Activo' THEN
        RETURN NEW;
    END IF;

    PERFORM public.fn_assert_plantilla_semanal_sin_solape(
        NEW."ID_CLIENTE",
        NEW."DIA"::text,
        NEW."HORA_INICIO",
        NEW."HORA_FIN",
        NEW."ID_ALUMNO",
        NEW."ID_PROFESOR",
        NEW."ID_AULA",
        NEW."ID_HORARIO",
        NULLIF(TRIM(NEW."ID_GRUPO_HORARIO"), '')
    );

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_grupos_horarios_plantilla_semanal_solape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_id_alumno text;
BEGIN
    IF current_setting('app.demo_clone', true) = '1' THEN
        RETURN NEW;
    END IF;

    PERFORM public.fn_assert_plantilla_semanal_sin_solape(
        NEW."ID_CLIENTE",
        NEW."DIA_SEMANA"::text,
        NEW."HORA_INICIO",
        NEW."HORA_FIN",
        NULL,
        NEW."ID_PROFESOR",
        NEW."ID_AULA",
        NULL,
        NEW."ID_GRUPO_HORARIO"
    );

    FOR v_id_alumno IN
        SELECT unnest(g."ID_ALUMNOS")
        FROM public."GRUPOS" g
        WHERE g."ID_GRUPO" = NEW."ID_GRUPO"
          AND g."ID_ALUMNOS" IS NOT NULL
    LOOP
        IF NULLIF(TRIM(v_id_alumno), '') IS NULL THEN
            CONTINUE;
        END IF;

        PERFORM public.fn_assert_plantilla_semanal_sin_solape(
            NEW."ID_CLIENTE",
            NEW."DIA_SEMANA"::text,
            NEW."HORA_INICIO",
            NEW."HORA_FIN",
            v_id_alumno,
            NULL,
            NULL,
            NULL,
            NEW."ID_GRUPO_HORARIO"
        );
    END LOOP;

    RETURN NEW;
END;
$function$;
