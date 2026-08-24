-- Panel en vivo: filtro opcional por centro (NULL = toda la escuela).

CREATE OR REPLACE FUNCTION public.get_dashboard_live(
  p_id_cliente text,
  p_id_centro text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_alumnos_totales INT;
    v_alumnos_json json;
    v_profesores_ocupados_json json;
    v_profesores_libres_json json;
    v_aulas_ocupadas_json json;
    v_aulas_libres_json json;
    v_result json;
    v_hora_actual time := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::time;
    v_fecha_actual date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
    SELECT COUNT(*)
    INTO v_alumnos_totales
    FROM public."ALUMNOS"
    WHERE "ID_CLIENTE" = p_id_cliente
      AND (p_id_centro IS NULL OR "ID_CENTRO" = p_id_centro);

    SELECT COALESCE(json_agg(
        json_build_object(
            'id', CASE
                    WHEN s."ESTADO" = 'Lead' THEN COALESCE(
                      (
                        SELECT l."ID_LEAD"
                        FROM public."LEADS" l
                        WHERE l."NOMBRE" = s."ID_ALUMNO"
                          AND l."ID_CLIENTE" = p_id_cliente
                        LIMIT 1
                      ),
                      s."ID_ALUMNO"
                    )
                    ELSE s."ID_ALUMNO"
                  END,
            'nombre', CASE
                        WHEN s."ESTADO" = 'Lead' THEN s."ID_ALUMNO" || ' (Lead)'
                        ELSE COALESCE(a."NOMBRE_ALUMNO", s."ID_ALUMNO")
                      END,
            'tipo', CASE WHEN s."ESTADO" = 'Lead' THEN 'lead' ELSE 'alumno' END
        )
    ), '[]'::json)
    INTO v_alumnos_json
    FROM public."SESIONES" s
    LEFT JOIN public."ALUMNOS" a ON s."ID_ALUMNO" = a."ID_ALUMNO"
    WHERE s."ID_CLIENTE" = p_id_cliente
      AND s."FECHA_EXACTA" = v_fecha_actual
      AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
      AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
      AND (s."TITULO_CALENDARIO" NOT ILIKE '%falta%' OR s."TITULO_CALENDARIO" IS NULL)
      AND s."ID_ALUMNO" IS NOT NULL
      AND (p_id_centro IS NULL OR s."ID_CENTRO" = p_id_centro);

    SELECT COALESCE(json_agg(json_build_object('id', p."ID_PROFESOR", 'nombre', p."NOMBRE_PROFESOR")), '[]'::json)
    INTO v_profesores_ocupados_json
    FROM public."PROFESOR" p
    WHERE p."ID_CLIENTE" = p_id_cliente
      AND (
        p_id_centro IS NULL
        OR p."ID_CENTRO" = p_id_centro
        OR EXISTS (
          SELECT 1
          FROM public."PERFILES" pf
          WHERE pf."ID_PROFESOR" = p."ID_PROFESOR"
            AND pf."ID_CLIENTE" = p_id_cliente
            AND pf."ID_CENTRO" = p_id_centro
        )
      )
      AND p."ID_PROFESOR" IN (
          SELECT s."ID_PROFESOR"
          FROM public."SESIONES" s
          WHERE s."ID_CLIENTE" = p_id_cliente
            AND s."FECHA_EXACTA" = v_fecha_actual
            AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
            AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
            AND (s."TITULO_CALENDARIO" NOT ILIKE '%falta%' OR s."TITULO_CALENDARIO" IS NULL)
            AND s."ID_PROFESOR" IS NOT NULL
            AND (p_id_centro IS NULL OR s."ID_CENTRO" = p_id_centro)
      );

    SELECT COALESCE(json_agg(json_build_object('id', p."ID_PROFESOR", 'nombre', p."NOMBRE_PROFESOR")), '[]'::json)
    INTO v_profesores_libres_json
    FROM public."PROFESOR" p
    WHERE p."ID_CLIENTE" = p_id_cliente
      AND (
        p_id_centro IS NULL
        OR p."ID_CENTRO" = p_id_centro
        OR EXISTS (
          SELECT 1
          FROM public."PERFILES" pf
          WHERE pf."ID_PROFESOR" = p."ID_PROFESOR"
            AND pf."ID_CLIENTE" = p_id_cliente
            AND pf."ID_CENTRO" = p_id_centro
        )
      )
      AND p."ID_PROFESOR" NOT IN (
          SELECT s."ID_PROFESOR"
          FROM public."SESIONES" s
          WHERE s."ID_CLIENTE" = p_id_cliente
            AND s."FECHA_EXACTA" = v_fecha_actual
            AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
            AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
            AND (s."TITULO_CALENDARIO" NOT ILIKE '%falta%' OR s."TITULO_CALENDARIO" IS NULL)
            AND s."ID_PROFESOR" IS NOT NULL
            AND (p_id_centro IS NULL OR s."ID_CENTRO" = p_id_centro)
      );

    SELECT COALESCE(json_agg(json_build_object(
        'id', au."ID_AULA",
        'nombre', au."NOMBRE_AULA",
        'id_sesion', (
          SELECT s."ID_SESION"
          FROM public."SESIONES" s
          WHERE s."ID_AULA" = au."ID_AULA"
            AND s."ID_CLIENTE" = p_id_cliente
            AND s."FECHA_EXACTA" = v_fecha_actual
            AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
            AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
            AND (p_id_centro IS NULL OR s."ID_CENTRO" = p_id_centro)
          LIMIT 1
        )
    )), '[]'::json)
    INTO v_aulas_ocupadas_json
    FROM public."AULA" au
    WHERE au."ID_CLIENTE" = p_id_cliente
      AND (p_id_centro IS NULL OR au."ID_CENTRO" = p_id_centro)
      AND au."ID_AULA" IN (
          SELECT s."ID_AULA"
          FROM public."SESIONES" s
          WHERE s."ID_CLIENTE" = p_id_cliente
            AND s."FECHA_EXACTA" = v_fecha_actual
            AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
            AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
            AND s."ID_AULA" IS NOT NULL
            AND (p_id_centro IS NULL OR s."ID_CENTRO" = p_id_centro)
      );

    SELECT COALESCE(json_agg(json_build_object('id', au."ID_AULA", 'nombre', au."NOMBRE_AULA")), '[]'::json)
    INTO v_aulas_libres_json
    FROM public."AULA" au
    WHERE au."ID_CLIENTE" = p_id_cliente
      AND (p_id_centro IS NULL OR au."ID_CENTRO" = p_id_centro)
      AND au."ID_AULA" NOT IN (
          SELECT s."ID_AULA"
          FROM public."SESIONES" s
          WHERE s."ID_CLIENTE" = p_id_cliente
            AND s."FECHA_EXACTA" = v_fecha_actual
            AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
            AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
            AND s."ID_AULA" IS NOT NULL
            AND (p_id_centro IS NULL OR s."ID_CENTRO" = p_id_centro)
      );

    v_result := json_build_object(
        'alumnos', json_build_object(
            'presentes_count', json_array_length(v_alumnos_json),
            'totales_count', v_alumnos_totales,
            'lista_presentes', v_alumnos_json
        ),
        'profesores', json_build_object(
            'ocupados_count', json_array_length(v_profesores_ocupados_json),
            'libres_count', json_array_length(v_profesores_libres_json),
            'lista_ocupados', v_profesores_ocupados_json,
            'lista_libres', v_profesores_libres_json
        ),
        'aulas', json_build_object(
            'ocupadas_count', json_array_length(v_aulas_ocupadas_json),
            'libres_count', json_array_length(v_aulas_libres_json),
            'lista_ocupadas', v_aulas_ocupadas_json,
            'lista_libres', v_aulas_libres_json
        )
    );

    RETURN v_result;
END;
$function$;
