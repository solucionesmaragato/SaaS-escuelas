-- Plantilla semanal: bloquear solapes en HORARIOS_MATRICULAS y GRUPOS_HORARIOS (sin SESIONES).

CREATE OR REPLACE FUNCTION public.fn_assert_plantilla_semanal_sin_solape(
    p_id_cliente text,
    p_dia text,
    p_hora_inicio time without time zone,
    p_hora_fin time without time zone,
    p_id_alumno text DEFAULT NULL::text,
    p_id_profesor text DEFAULT NULL::text,
    p_id_aula text DEFAULT NULL::text,
    p_id_horario_excluir text DEFAULT NULL::text,
    p_id_grupo_horario_excluir text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_id_alum text := NULLIF(TRIM(p_id_alumno), '');
    v_id_prof text := NULLIF(TRIM(p_id_profesor), '');
    v_id_aula text := NULLIF(TRIM(p_id_aula), '');
    v_id_horario_excluir text := NULLIF(TRIM(p_id_horario_excluir), '');
    v_id_gh_excluir text := NULLIF(TRIM(p_id_grupo_horario_excluir), '');
BEGIN
    IF p_id_cliente IS NULL OR TRIM(p_id_cliente) = '' THEN
        RETURN;
    END IF;
    IF p_dia IS NULL OR TRIM(p_dia) = '' OR p_hora_inicio IS NULL OR p_hora_fin IS NULL THEN
        RETURN;
    END IF;

    IF v_id_alum IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public."HORARIOS_MATRICULAS" hm
            WHERE hm."ID_CLIENTE" = p_id_cliente
              AND hm."ESTADO" = 'Activo'
              AND (
                  LOWER(hm."DIA"::text) = LOWER(p_dia)
                  OR (LOWER(p_dia) = 'miércoles' AND LOWER(hm."DIA"::text) = 'miercoles')
                  OR (LOWER(p_dia) = 'sábado' AND LOWER(hm."DIA"::text) = 'sabado')
              )
              AND hm."ID_ALUMNO" = v_id_alum
              AND hm."HORA_INICIO" < p_hora_fin
              AND p_hora_inicio < hm."HORA_FIN"
              AND (v_id_horario_excluir IS NULL OR hm."ID_HORARIO" IS DISTINCT FROM v_id_horario_excluir)
              AND (
                  v_id_gh_excluir IS NULL
                  OR NULLIF(TRIM(hm."ID_GRUPO_HORARIO"), '') IS NULL
                  OR hm."ID_GRUPO_HORARIO" IS DISTINCT FROM v_id_gh_excluir
              )
        ) THEN
            RAISE EXCEPTION 'El alumno ya tiene otra clase fija en este horario semanal.';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public."GRUPOS_HORARIOS" gh
            INNER JOIN public."GRUPOS" g ON g."ID_GRUPO" = gh."ID_GRUPO"
            WHERE gh."ID_CLIENTE" = p_id_cliente
              AND (
                  LOWER(gh."DIA_SEMANA"::text) = LOWER(p_dia)
                  OR (LOWER(p_dia) = 'miércoles' AND LOWER(gh."DIA_SEMANA"::text) = 'miercoles')
                  OR (LOWER(p_dia) = 'sábado' AND LOWER(gh."DIA_SEMANA"::text) = 'sabado')
              )
              AND g."ID_ALUMNOS" IS NOT NULL
              AND v_id_alum = ANY(g."ID_ALUMNOS")
              AND gh."HORA_INICIO" < p_hora_fin
              AND p_hora_inicio < gh."HORA_FIN"
              AND (v_id_gh_excluir IS NULL OR gh."ID_GRUPO_HORARIO" IS DISTINCT FROM v_id_gh_excluir)
        ) THEN
            RAISE EXCEPTION 'El alumno ya tiene otra clase fija en este horario semanal.';
        END IF;
    END IF;

    IF v_id_prof IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public."HORARIOS_MATRICULAS" hm
            WHERE hm."ID_CLIENTE" = p_id_cliente
              AND hm."ESTADO" = 'Activo'
              AND (
                  LOWER(hm."DIA"::text) = LOWER(p_dia)
                  OR (LOWER(p_dia) = 'miércoles' AND LOWER(hm."DIA"::text) = 'miercoles')
                  OR (LOWER(p_dia) = 'sábado' AND LOWER(hm."DIA"::text) = 'sabado')
              )
              AND hm."ID_PROFESOR" = v_id_prof
              AND hm."HORA_INICIO" < p_hora_fin
              AND p_hora_inicio < hm."HORA_FIN"
              AND (v_id_horario_excluir IS NULL OR hm."ID_HORARIO" IS DISTINCT FROM v_id_horario_excluir)
              AND (
                  v_id_gh_excluir IS NULL
                  OR NULLIF(TRIM(hm."ID_GRUPO_HORARIO"), '') IS NULL
                  OR hm."ID_GRUPO_HORARIO" IS DISTINCT FROM v_id_gh_excluir
              )
        ) THEN
            RAISE EXCEPTION 'El profesor ya imparte una clase fija en este horario semanal.';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public."GRUPOS_HORARIOS" gh
            WHERE gh."ID_CLIENTE" = p_id_cliente
              AND (
                  LOWER(gh."DIA_SEMANA"::text) = LOWER(p_dia)
                  OR (LOWER(p_dia) = 'miércoles' AND LOWER(gh."DIA_SEMANA"::text) = 'miercoles')
                  OR (LOWER(p_dia) = 'sábado' AND LOWER(gh."DIA_SEMANA"::text) = 'sabado')
              )
              AND gh."ID_PROFESOR" = v_id_prof
              AND gh."HORA_INICIO" < p_hora_fin
              AND p_hora_inicio < gh."HORA_FIN"
              AND (v_id_gh_excluir IS NULL OR gh."ID_GRUPO_HORARIO" IS DISTINCT FROM v_id_gh_excluir)
        ) THEN
            RAISE EXCEPTION 'El profesor ya imparte una clase fija en este horario semanal.';
        END IF;
    END IF;

    IF v_id_aula IS NOT NULL THEN
        IF EXISTS (
            SELECT 1
            FROM public."HORARIOS_MATRICULAS" hm
            WHERE hm."ID_CLIENTE" = p_id_cliente
              AND hm."ESTADO" = 'Activo'
              AND (
                  LOWER(hm."DIA"::text) = LOWER(p_dia)
                  OR (LOWER(p_dia) = 'miércoles' AND LOWER(hm."DIA"::text) = 'miercoles')
                  OR (LOWER(p_dia) = 'sábado' AND LOWER(hm."DIA"::text) = 'sabado')
              )
              AND hm."ID_AULA" = v_id_aula
              AND hm."HORA_INICIO" < p_hora_fin
              AND p_hora_inicio < hm."HORA_FIN"
              AND (v_id_horario_excluir IS NULL OR hm."ID_HORARIO" IS DISTINCT FROM v_id_horario_excluir)
              AND (
                  v_id_gh_excluir IS NULL
                  OR NULLIF(TRIM(hm."ID_GRUPO_HORARIO"), '') IS NULL
                  OR hm."ID_GRUPO_HORARIO" IS DISTINCT FROM v_id_gh_excluir
              )
        ) THEN
            RAISE EXCEPTION 'El aula está ocupada por otro grupo fijo semanal.';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM public."GRUPOS_HORARIOS" gh
            WHERE gh."ID_CLIENTE" = p_id_cliente
              AND (
                  LOWER(gh."DIA_SEMANA"::text) = LOWER(p_dia)
                  OR (LOWER(p_dia) = 'miércoles' AND LOWER(gh."DIA_SEMANA"::text) = 'miercoles')
                  OR (LOWER(p_dia) = 'sábado' AND LOWER(gh."DIA_SEMANA"::text) = 'sabado')
              )
              AND gh."ID_AULA" = v_id_aula
              AND gh."HORA_INICIO" < p_hora_fin
              AND p_hora_inicio < gh."HORA_FIN"
              AND (v_id_gh_excluir IS NULL OR gh."ID_GRUPO_HORARIO" IS DISTINCT FROM v_id_gh_excluir)
        ) THEN
            RAISE EXCEPTION 'El aula está ocupada por otro grupo fijo semanal.';
        END IF;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_horarios_matriculas_plantilla_semanal_solape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
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

DROP TRIGGER IF EXISTS tr_horarios_validar_plantilla_semanal_solape ON public."HORARIOS_MATRICULAS";

CREATE TRIGGER tr_horarios_validar_plantilla_semanal_solape
    BEFORE INSERT OR UPDATE ON public."HORARIOS_MATRICULAS"
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_horarios_matriculas_plantilla_semanal_solape();

DROP TRIGGER IF EXISTS tr_grupos_horarios_validar_plantilla_semanal_solape ON public."GRUPOS_HORARIOS";

CREATE TRIGGER tr_grupos_horarios_validar_plantilla_semanal_solape
    BEFORE INSERT OR UPDATE ON public."GRUPOS_HORARIOS"
    FOR EACH ROW
    EXECUTE FUNCTION public.tg_grupos_horarios_plantilla_semanal_solape();
