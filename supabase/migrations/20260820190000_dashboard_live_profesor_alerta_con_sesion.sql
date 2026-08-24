-- Dashboard live: sesión + Salida o sin fichaje → alerta_grave (no ocupados_sin_fichar).
-- Mantiene: en_clase (Entrada|Fin Pausa + sesión), ocupados_sin_fichar (Inicio Pausa + sesión),
-- anulados ignorados, filtro ID_CENTRO, JSON legacy.

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
    v_rol text;
    v_id_cliente text;
    v_id_centro text;
    v_alumnos_totales INT;
    v_alumnos_json json;
    v_prof_en_clase json;
    v_prof_ocupados_sin_fichar json;
    v_prof_libres json;
    v_prof_alerta_grave json;
    v_prof_lista_ocupados json;
    v_aulas_ocupadas_json json;
    v_aulas_libres_json json;
    v_result json;
    v_hora_actual time := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::time;
    v_fecha_actual date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
    v_rol := public.get_my_rol();

    IF v_rol IS DISTINCT FROM 'MASTER'
       AND p_id_cliente IS DISTINCT FROM public.get_my_tenant_id() THEN
        RAISE EXCEPTION 'Acceso denegado: cliente no autorizado';
    END IF;

    v_id_cliente := p_id_cliente;

    IF v_rol = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text]) THEN
        v_id_centro := nullif(trim(coalesce(public.get_my_center_id(), '')), '');
    ELSIF v_rol = ANY (ARRAY['ADMIN'::text, 'MASTER'::text]) THEN
        v_id_centro := nullif(trim(coalesce(p_id_centro, '')), '');
    ELSE
        v_id_centro := nullif(trim(coalesce(public.get_my_center_id(), '')), '');
    END IF;

    SELECT COUNT(*)
    INTO v_alumnos_totales
    FROM public."ALUMNOS"
    WHERE "ID_CLIENTE" = v_id_cliente
      AND (v_id_centro IS NULL OR "ID_CENTRO" = v_id_centro);

    SELECT COALESCE(json_agg(
        json_build_object(
            'id', CASE
                    WHEN s."ESTADO" = 'Lead' THEN COALESCE(
                      (
                        SELECT l."ID_LEAD"
                        FROM public."LEADS" l
                        WHERE l."NOMBRE" = s."ID_ALUMNO"
                          AND l."ID_CLIENTE" = v_id_cliente
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
    WHERE s."ID_CLIENTE" = v_id_cliente
      AND s."FECHA_EXACTA" = v_fecha_actual
      AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
      AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
      AND (s."TITULO_CALENDARIO" NOT ILIKE '%falta%' OR s."TITULO_CALENDARIO" IS NULL)
      AND s."ID_ALUMNO" IS NOT NULL
      AND (v_id_centro IS NULL OR s."ID_CENTRO" = v_id_centro);

    WITH profesores_universo AS (
        SELECT p."ID_PROFESOR", p."NOMBRE_PROFESOR"
        FROM public."PROFESOR" p
        WHERE p."ID_CLIENTE" = v_id_cliente
          AND (
            v_id_centro IS NULL
            OR p."ID_CENTRO" = v_id_centro
            OR EXISTS (
              SELECT 1
              FROM public."PERFILES" pf
              WHERE pf."ID_PROFESOR" = p."ID_PROFESOR"
                AND pf."ID_CLIENTE" = v_id_cliente
                AND pf."ID_CENTRO" = v_id_centro
            )
          )
    ),
    sesiones_activas_prof AS (
        SELECT DISTINCT s."ID_PROFESOR"
        FROM public."SESIONES" s
        WHERE s."ID_CLIENTE" = v_id_cliente
          AND s."FECHA_EXACTA" = v_fecha_actual
          AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
          AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
          AND (s."TITULO_CALENDARIO" NOT ILIKE '%falta%' OR s."TITULO_CALENDARIO" IS NULL)
          AND s."ID_PROFESOR" IS NOT NULL
          AND (v_id_centro IS NULL OR s."ID_CENTRO" = v_id_centro)
    ),
    ultimo_fichaje_reloj AS (
        SELECT DISTINCT ON (f."ID_PROFESOR")
            f."ID_PROFESOR",
            trim(f."TIPO_MOVIMIENTO") AS last_movement
        FROM public."FICHAJES" f
        WHERE f."ID_CLIENTE" = v_id_cliente
          AND (v_id_centro IS NULL OR f."ID_CENTRO" = v_id_centro)
          AND (f."FECHA_HORA"::timestamptz AT TIME ZONE 'Europe/Madrid')::date = v_fecha_actual
          AND trim(f."TIPO_MOVIMIENTO") IN ('Entrada', 'Salida', 'Inicio Pausa', 'Fin de Pausa')
          AND coalesce(f."TIPO_MOVIMIENTO", '') NOT ILIKE '%corrección%'
          AND coalesce(f."ESTADO", '') <> 'Anulado por Corrección'
        ORDER BY f."ID_PROFESOR", f."FECHA_HORA" DESC
    ),
    clasificados AS (
        SELECT
            pu."ID_PROFESOR",
            pu."NOMBRE_PROFESOR",
            EXISTS (
                SELECT 1
                FROM sesiones_activas_prof sap
                WHERE sap."ID_PROFESOR" = pu."ID_PROFESOR"
            ) AS has_active_session,
            ufr.last_movement
        FROM profesores_universo pu
        LEFT JOIN ultimo_fichaje_reloj ufr ON ufr."ID_PROFESOR" = pu."ID_PROFESOR"
    ),
    bucketed AS (
        SELECT
            c."ID_PROFESOR"::text AS id,
            c."NOMBRE_PROFESOR" AS nombre,
            CASE
                WHEN c.has_active_session
                     AND c.last_movement IN ('Entrada', 'Fin de Pausa') THEN 'en_clase'
                WHEN c.has_active_session
                     AND c.last_movement = 'Inicio Pausa' THEN 'ocupados_sin_fichar'
                WHEN c.has_active_session
                     AND (c.last_movement IS NULL OR c.last_movement = 'Salida') THEN 'alerta_grave'
                WHEN NOT c.has_active_session
                     AND c.last_movement IN ('Entrada', 'Inicio Pausa', 'Fin de Pausa') THEN 'alerta_grave'
                ELSE 'libres'
            END AS bucket
        FROM clasificados c
    )
    SELECT
        COALESCE(
            json_agg(json_build_object('id', b.id, 'nombre', b.nombre) ORDER BY b.nombre)
            FILTER (WHERE b.bucket = 'en_clase'),
            '[]'::json
        ),
        COALESCE(
            json_agg(json_build_object('id', b.id, 'nombre', b.nombre) ORDER BY b.nombre)
            FILTER (WHERE b.bucket = 'ocupados_sin_fichar'),
            '[]'::json
        ),
        COALESCE(
            json_agg(json_build_object('id', b.id, 'nombre', b.nombre) ORDER BY b.nombre)
            FILTER (WHERE b.bucket = 'libres'),
            '[]'::json
        ),
        COALESCE(
            json_agg(json_build_object('id', b.id, 'nombre', b.nombre) ORDER BY b.nombre)
            FILTER (WHERE b.bucket = 'alerta_grave'),
            '[]'::json
        ),
        COALESCE(
            json_agg(json_build_object('id', b.id, 'nombre', b.nombre) ORDER BY b.nombre)
            FILTER (WHERE b.bucket IN ('en_clase', 'ocupados_sin_fichar')),
            '[]'::json
        )
    INTO
        v_prof_en_clase,
        v_prof_ocupados_sin_fichar,
        v_prof_libres,
        v_prof_alerta_grave,
        v_prof_lista_ocupados
    FROM bucketed b;

    v_prof_en_clase := coalesce(v_prof_en_clase, '[]'::json);
    v_prof_ocupados_sin_fichar := coalesce(v_prof_ocupados_sin_fichar, '[]'::json);
    v_prof_libres := coalesce(v_prof_libres, '[]'::json);
    v_prof_alerta_grave := coalesce(v_prof_alerta_grave, '[]'::json);
    v_prof_lista_ocupados := coalesce(v_prof_lista_ocupados, '[]'::json);

    SELECT COALESCE(json_agg(json_build_object(
        'id', au."ID_AULA",
        'nombre', au."NOMBRE_AULA",
        'id_sesion', (
          SELECT s."ID_SESION"
          FROM public."SESIONES" s
          WHERE s."ID_AULA" = au."ID_AULA"
            AND s."ID_CLIENTE" = v_id_cliente
            AND s."FECHA_EXACTA" = v_fecha_actual
            AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
            AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
            AND (v_id_centro IS NULL OR s."ID_CENTRO" = v_id_centro)
          LIMIT 1
        )
    )), '[]'::json)
    INTO v_aulas_ocupadas_json
    FROM public."AULA" au
    WHERE au."ID_CLIENTE" = v_id_cliente
      AND (v_id_centro IS NULL OR au."ID_CENTRO" = v_id_centro)
      AND au."ID_AULA" IN (
          SELECT s."ID_AULA"
          FROM public."SESIONES" s
          WHERE s."ID_CLIENTE" = v_id_cliente
            AND s."FECHA_EXACTA" = v_fecha_actual
            AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
            AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
            AND s."ID_AULA" IS NOT NULL
            AND (v_id_centro IS NULL OR s."ID_CENTRO" = v_id_centro)
      );

    SELECT COALESCE(json_agg(json_build_object('id', au."ID_AULA", 'nombre', au."NOMBRE_AULA")), '[]'::json)
    INTO v_aulas_libres_json
    FROM public."AULA" au
    WHERE au."ID_CLIENTE" = v_id_cliente
      AND (v_id_centro IS NULL OR au."ID_CENTRO" = v_id_centro)
      AND au."ID_AULA" NOT IN (
          SELECT s."ID_AULA"
          FROM public."SESIONES" s
          WHERE s."ID_CLIENTE" = v_id_cliente
            AND s."FECHA_EXACTA" = v_fecha_actual
            AND date_trunc('minute', v_hora_actual) >= date_trunc('minute', s."HORA_INICIO")
            AND date_trunc('minute', v_hora_actual) <= date_trunc('minute', s."HORA_FIN")
            AND s."ID_AULA" IS NOT NULL
            AND (v_id_centro IS NULL OR s."ID_CENTRO" = v_id_centro)
      );

    v_result := json_build_object(
        'alumnos', json_build_object(
            'presentes_count', json_array_length(v_alumnos_json),
            'totales_count', v_alumnos_totales,
            'lista_presentes', v_alumnos_json
        ),
        'profesores', json_build_object(
            'en_clase_count', json_array_length(v_prof_en_clase),
            'ocupados_sin_fichar_count', json_array_length(v_prof_ocupados_sin_fichar),
            'libres_count', json_array_length(v_prof_libres),
            'alerta_grave_count', json_array_length(v_prof_alerta_grave),
            'lista_en_clase', v_prof_en_clase,
            'lista_ocupados_sin_fichar', v_prof_ocupados_sin_fichar,
            'lista_libres', v_prof_libres,
            'lista_alerta_grave', v_prof_alerta_grave,
            'ocupados_count', json_array_length(v_prof_lista_ocupados),
            'lista_ocupados', v_prof_lista_ocupados
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
