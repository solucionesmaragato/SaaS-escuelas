-- Recuperación: validar solape y sincronizar SESIONES al editar INCIDENCIAS (INSERT sin cambios).

CREATE OR REPLACE FUNCTION public.tg_incidencias_recuperacion_update_solape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_resultado_choques jsonb;
    v_id_sesion text;
    v_alumno_nombre text;
    v_especialidad_nombre text;
    v_id_grupo_horario text;
BEGIN
    IF NOT (LOWER(NEW."TIPO_INCIDENCIA") LIKE '%recupera%') THEN
        RETURN NEW;
    END IF;

    v_resultado_choques := public.fn_comprobar_solapamientos_fecha_exacta(
        NEW."ID_CLIENTE",
        NEW."FECHA_EXACTA",
        NEW."HORA_INICIO",
        NEW."HORA_FIN",
        NEW."ID_ALUMNO",
        NEW."ID_PROFESOR",
        NEW."ID_AULA",
        NEW."ID_SESION"
    );

    IF jsonb_array_length(v_resultado_choques) > 0 THEN
        RAISE EXCEPTION 'CONFLICTO DE HORARIO: %', (v_resultado_choques->0->>'motivo');
    END IF;

    IF NEW."ID_SESION" IS NULL OR NEW."ID_SESION" = '' THEN
        v_id_sesion := 'SES_'
            || to_char(NEW."FECHA_EXACTA", 'YYYYMMDD')
            || '_'
            || to_char(NEW."HORA_INICIO", 'HH24MI')
            || '_'
            || NEW."ID_ALUMNO";
        NEW."ID_SESION" := v_id_sesion;
    ELSE
        v_id_sesion := NEW."ID_SESION";
    END IF;

    UPDATE public."SESIONES"
    SET
        "FECHA_EXACTA" = NEW."FECHA_EXACTA",
        "HORA_INICIO" = NEW."HORA_INICIO",
        "HORA_FIN" = NEW."HORA_FIN",
        "ID_PROFESOR" = NEW."ID_PROFESOR",
        "ID_AULA" = NEW."ID_AULA",
        "ID_ALUMNO" = NEW."ID_ALUMNO",
        "ESPECIALIDAD" = NEW."ID_ESPECIALIDAD",
        "NOTAS" = NEW."NOTAS",
        "ID_CENTRO" = NEW."ID_CENTRO",
        "ID_CURSO" = NEW."ID_CURSO",
        "ID_MATRICULA" = NEW."ID_MATRICULA",
        "ID_HORARIO" = NEW."ID_HORARIO",
        "ULTIMA_MODIFICACION" = now()
    WHERE "ID_SESION" = v_id_sesion
      AND "ID_CLIENTE" = NEW."ID_CLIENTE";

    IF NOT FOUND THEN
        SELECT "NOMBRE_ALUMNO" INTO v_alumno_nombre
        FROM public."ALUMNOS"
        WHERE "ID_ALUMNO" = NEW."ID_ALUMNO"
        LIMIT 1;

        SELECT "ESPECIALIDAD" INTO v_especialidad_nombre
        FROM public."ESPECIALIDADES"
        WHERE "ID_ESPECIALIDAD" = NEW."ID_ESPECIALIDAD"
        LIMIT 1;

        v_alumno_nombre := COALESCE(v_alumno_nombre, 'Alumno Registrado');
        v_especialidad_nombre := COALESCE(v_especialidad_nombre, 'Clase Común');

        SELECT hm."ID_GRUPO_HORARIO" INTO v_id_grupo_horario
        FROM public."HORARIOS_MATRICULAS" hm
        WHERE hm."ID_HORARIO" = NEW."ID_HORARIO"
        LIMIT 1;

        IF v_id_grupo_horario IS NULL THEN
            SELECT hm."ID_GRUPO_HORARIO" INTO v_id_grupo_horario
            FROM public."HORARIOS_MATRICULAS" hm
            WHERE hm."ID_ALUMNO" = NEW."ID_ALUMNO"
              AND hm."ID_ESPECIALIDAD" = NEW."ID_ESPECIALIDAD"
              AND hm."ESTADO" = 'Activo'
            LIMIT 1;
        END IF;

        INSERT INTO public."SESIONES" (
            "ID_SESION",
            "ID_CLIENTE",
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
            "ID_MATRICULA",
            "ID_HORARIO",
            "ID_GRUPO_HORARIO",
            "ID_CENTRO",
            "ID_CURSO",
            "FECHA_CREACION",
            "ULTIMA_MODIFICACION"
        )
        SELECT
            v_id_sesion,
            NEW."ID_CLIENTE",
            NEW."ID_ALUMNO",
            NEW."FECHA_EXACTA",
            NEW."HORA_INICIO",
            NEW."HORA_FIN",
            NEW."ID_PROFESOR",
            NEW."ID_AULA",
            NEW."ID_ESPECIALIDAD",
            'Incidencia',
            NEW."NOTAS",
            '🟢 RECUPERACIÓN: ' || v_alumno_nombre || ' - ' || v_especialidad_nombre,
            NEW."ID_MATRICULA",
            NEW."ID_HORARIO",
            v_id_grupo_horario,
            NEW."ID_CENTRO",
            NEW."ID_CURSO",
            now(),
            now()
        WHERE NOT EXISTS (
            SELECT 1
            FROM public."SESIONES" s
            WHERE s."ID_SESION" = v_id_sesion
        );
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_incidencias_recuperacion_update_solape ON public."INCIDENCIAS";

CREATE TRIGGER tr_incidencias_recuperacion_update_solape
    BEFORE UPDATE ON public."INCIDENCIAS"
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_incidencias_recuperacion_update_solape();
