-- Recuperaciones: incluir SESIONES Incidencia como bloqueo puntual; añadir plantilla GRUPOS_HORARIOS.

CREATE OR REPLACE FUNCTION public.fn_comprobar_solapamientos_fecha_exacta(
    p_id_cliente text,
    p_fecha_exacta date,
    p_hora_inicio time without time zone,
    p_hora_fin time without time zone,
    p_id_alumno text DEFAULT NULL::text,
    p_id_profesor text DEFAULT NULL::text,
    p_id_aula text DEFAULT NULL::text,
    p_id_sesion_excluir text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_conflictos jsonb := '[]'::jsonb;
    v_dia_texto text;
    v_registro record;

    v_id_excluir text := NULLIF(TRIM(p_id_sesion_excluir), '');
    v_id_prof text := NULLIF(TRIM(p_id_profesor), '');
    v_id_aula text := NULLIF(TRIM(p_id_aula), '');
    v_id_alum text := NULLIF(TRIM(p_id_alumno), '');
BEGIN
    v_dia_texto := CASE extract(dow from p_fecha_exacta)
        WHEN 0 THEN 'Domingo'
        WHEN 1 THEN 'Lunes'
        WHEN 2 THEN 'Martes'
        WHEN 3 THEN 'Miércoles'
        WHEN 4 THEN 'Jueves'
        WHEN 5 THEN 'Viernes'
        WHEN 6 THEN 'Sábado'
    END;

    -- CAPA 1: HORARIOS_MATRICULAS (recurrente semanal)
    FOR v_registro IN
        SELECT 'Alumno' AS tipo, 'Recurrente' AS nivel, "DIA"::text, "HORA_INICIO", "HORA_FIN", 'El alumno ya tiene otra clase fija en este horario semanal.' AS motivo
        FROM public."HORARIOS_MATRICULAS"
        WHERE "ID_CLIENTE" = p_id_cliente AND "ESTADO" = 'Activo'
          AND (LOWER("DIA"::text) = LOWER(v_dia_texto) OR (LOWER(v_dia_texto) = 'miércoles' AND LOWER("DIA"::text) = 'miercoles') OR (LOWER(v_dia_texto) = 'sábado' AND LOWER("DIA"::text) = 'sabado'))
          AND v_id_alum IS NOT NULL AND "ID_ALUMNO" = v_id_alum
          AND "HORA_INICIO" < p_hora_fin AND p_hora_inicio < "HORA_FIN"
        UNION ALL
        SELECT 'Profesor' AS tipo, 'Recurrente' AS nivel, "DIA"::text, "HORA_INICIO", "HORA_FIN", 'El profesor ya imparte una clase fija en este horario semanal.' AS motivo
        FROM public."HORARIOS_MATRICULAS"
        WHERE "ID_CLIENTE" = p_id_cliente AND "ESTADO" = 'Activo'
          AND (LOWER("DIA"::text) = LOWER(v_dia_texto) OR (LOWER(v_dia_texto) = 'miércoles' AND LOWER("DIA"::text) = 'miercoles') OR (LOWER(v_dia_texto) = 'sábado' AND LOWER("DIA"::text) = 'sabado'))
          AND v_id_prof IS NOT NULL AND "ID_PROFESOR" = v_id_prof
          AND "HORA_INICIO" < p_hora_fin AND p_hora_inicio < "HORA_FIN"
        UNION ALL
        SELECT 'Aula' AS tipo, 'Recurrente' AS nivel, "DIA"::text, "HORA_INICIO", "HORA_FIN", 'El aula está ocupada por otro grupo fijo semanal.' AS motivo
        FROM public."HORARIOS_MATRICULAS"
        WHERE "ID_CLIENTE" = p_id_cliente AND "ESTADO" = 'Activo'
          AND (LOWER("DIA"::text) = LOWER(v_dia_texto) OR (LOWER(v_dia_texto) = 'miércoles' AND LOWER("DIA"::text) = 'miercoles') OR (LOWER(v_dia_texto) = 'sábado' AND LOWER("DIA"::text) = 'sabado'))
          AND v_id_aula IS NOT NULL AND "ID_AULA" = v_id_aula
          AND "HORA_INICIO" < p_hora_fin AND p_hora_inicio < "HORA_FIN"
    LOOP
        v_conflictos := v_conflictos || jsonb_build_object('tipo', v_registro.tipo, 'nivel', v_registro.nivel, 'motivo', v_registro.motivo, 'dia', v_registro."DIA", 'inicio', v_registro."HORA_INICIO", 'fin', v_registro."HORA_FIN");
    END LOOP;

    -- CAPA 1b: GRUPOS_HORARIOS (recurrente semanal)
    FOR v_registro IN
        SELECT 'Alumno' AS tipo, 'Recurrente' AS nivel, gh."DIA_SEMANA"::text AS "DIA", gh."HORA_INICIO", gh."HORA_FIN", 'El alumno ya tiene otra clase fija en este horario semanal.' AS motivo
        FROM public."GRUPOS_HORARIOS" gh
        INNER JOIN public."GRUPOS" g ON g."ID_GRUPO" = gh."ID_GRUPO"
        WHERE gh."ID_CLIENTE" = p_id_cliente
          AND (LOWER(gh."DIA_SEMANA"::text) = LOWER(v_dia_texto) OR (LOWER(v_dia_texto) = 'miércoles' AND LOWER(gh."DIA_SEMANA"::text) = 'miercoles') OR (LOWER(v_dia_texto) = 'sábado' AND LOWER(gh."DIA_SEMANA"::text) = 'sabado'))
          AND v_id_alum IS NOT NULL
          AND g."ID_ALUMNOS" IS NOT NULL
          AND v_id_alum = ANY(g."ID_ALUMNOS")
          AND gh."HORA_INICIO" < p_hora_fin AND p_hora_inicio < gh."HORA_FIN"
        UNION ALL
        SELECT 'Profesor' AS tipo, 'Recurrente' AS nivel, gh."DIA_SEMANA"::text AS "DIA", gh."HORA_INICIO", gh."HORA_FIN", 'El profesor ya imparte una clase fija en este horario semanal.' AS motivo
        FROM public."GRUPOS_HORARIOS" gh
        WHERE gh."ID_CLIENTE" = p_id_cliente
          AND (LOWER(gh."DIA_SEMANA"::text) = LOWER(v_dia_texto) OR (LOWER(v_dia_texto) = 'miércoles' AND LOWER(gh."DIA_SEMANA"::text) = 'miercoles') OR (LOWER(v_dia_texto) = 'sábado' AND LOWER(gh."DIA_SEMANA"::text) = 'sabado'))
          AND v_id_prof IS NOT NULL AND gh."ID_PROFESOR" = v_id_prof
          AND gh."HORA_INICIO" < p_hora_fin AND p_hora_inicio < gh."HORA_FIN"
        UNION ALL
        SELECT 'Aula' AS tipo, 'Recurrente' AS nivel, gh."DIA_SEMANA"::text AS "DIA", gh."HORA_INICIO", gh."HORA_FIN", 'El aula está ocupada por otro grupo fijo semanal.' AS motivo
        FROM public."GRUPOS_HORARIOS" gh
        WHERE gh."ID_CLIENTE" = p_id_cliente
          AND (LOWER(gh."DIA_SEMANA"::text) = LOWER(v_dia_texto) OR (LOWER(v_dia_texto) = 'miércoles' AND LOWER(gh."DIA_SEMANA"::text) = 'miercoles') OR (LOWER(v_dia_texto) = 'sábado' AND LOWER(gh."DIA_SEMANA"::text) = 'sabado'))
          AND v_id_aula IS NOT NULL AND gh."ID_AULA" = v_id_aula
          AND gh."HORA_INICIO" < p_hora_fin AND p_hora_inicio < gh."HORA_FIN"
    LOOP
        v_conflictos := v_conflictos || jsonb_build_object('tipo', v_registro.tipo, 'nivel', v_registro.nivel, 'motivo', v_registro.motivo, 'dia', v_registro."DIA", 'inicio', v_registro."HORA_INICIO", 'fin', v_registro."HORA_FIN");
    END LOOP;

    -- CAPA 2: SESIONES (puntual en fecha exacta; Incidencia cuenta como ocupación)
    FOR v_registro IN
        SELECT 'Alumno' AS tipo, 'Puntual' AS nivel, to_char("FECHA_EXACTA", 'DD/MM/YYYY') AS dia_str, "HORA_INICIO", "HORA_FIN", COALESCE("TITULO_CALENDARIO", 'Evento agendado para el alumno') AS motivo
        FROM public."SESIONES"
        WHERE "ID_CLIENTE" = p_id_cliente
          AND "FECHA_EXACTA" = p_fecha_exacta
          AND v_id_alum IS NOT NULL AND "ID_ALUMNO" = v_id_alum
          AND "ID_SESION" IS DISTINCT FROM v_id_excluir
          AND "ESTADO" NOT IN ('Festivo', 'Cancelada')
          AND "HORA_INICIO" < p_hora_fin AND p_hora_inicio < "HORA_FIN"
        UNION ALL
        SELECT 'Profesor' AS tipo, 'Puntual' AS nivel, to_char("FECHA_EXACTA", 'DD/MM/YYYY') AS dia_str, "HORA_INICIO", "HORA_FIN", COALESCE("TITULO_CALENDARIO", 'Sesión agendada') AS motivo
        FROM public."SESIONES"
        WHERE "ID_CLIENTE" = p_id_cliente
          AND "FECHA_EXACTA" = p_fecha_exacta
          AND v_id_prof IS NOT NULL AND "ID_PROFESOR" = v_id_prof
          AND "ID_SESION" IS DISTINCT FROM v_id_excluir
          AND "ESTADO" NOT IN ('Festivo', 'Cancelada')
          AND "HORA_INICIO" < p_hora_fin AND p_hora_inicio < "HORA_FIN"
        UNION ALL
        SELECT 'Aula' AS tipo, 'Puntual' AS nivel, to_char("FECHA_EXACTA", 'DD/MM/YYYY') AS dia_str, "HORA_INICIO", "HORA_FIN", COALESCE("TITULO_CALENDARIO", 'Evento en aula') AS motivo
        FROM public."SESIONES"
        WHERE "ID_CLIENTE" = p_id_cliente
          AND "FECHA_EXACTA" = p_fecha_exacta
          AND v_id_aula IS NOT NULL AND "ID_AULA" = v_id_aula
          AND "ID_SESION" IS DISTINCT FROM v_id_excluir
          AND "ESTADO" NOT IN ('Festivo', 'Cancelada')
          AND "HORA_INICIO" < p_hora_fin AND p_hora_inicio < "HORA_FIN"
    LOOP
        v_conflictos := v_conflictos || jsonb_build_object('tipo', v_registro.tipo, 'nivel', v_registro.nivel, 'motivo', v_registro.motivo, 'fecha', v_registro.dia_str, 'inicio', v_registro."HORA_INICIO", 'fin', v_registro."HORA_FIN");
    END LOOP;

    RETURN v_conflictos;
END;
$function$;
