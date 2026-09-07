-- Matrícula incompleta: aviso unificado cuando horarios activos < SESIONES_SEMANALES de la tarifa.
-- Reemplaza avisos ad hoc de grupos; se dispara vía tg_calcular_alerta_subprogramado.

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_matricula_incompleta(p_id_matricula text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_id_cliente text;
  v_id_centro text;
  v_id_curso text;
  v_id_alumno text;
  v_id_especialidad text;
  v_estado text;
  v_sesiones_tarifa int;
  v_horarios_activos int;
  v_nombre_alumno text;
BEGIN
  IF p_id_matricula IS NULL OR p_id_matricula = '' THEN
    RETURN;
  END IF;

  SELECT
    m."ID_CLIENTE",
    m."ID_CENTRO",
    m."ID_CURSO",
    m."ID_ALUMNO",
    m."ESPECIALIDAD",
    m."ESTADO",
    COALESCE(t."SESIONES_SEMANALES", 0)
  INTO
    v_id_cliente,
    v_id_centro,
    v_id_curso,
    v_id_alumno,
    v_id_especialidad,
    v_estado,
    v_sesiones_tarifa
  FROM public."MATRICULAS" m
  LEFT JOIN public."TARIFAS" t ON m."ID_TARIFA" = t."ID_TARIFA"
  WHERE m."ID_MATRICULA" = p_id_matricula;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF LOWER(COALESCE(v_estado, '')) NOT IN ('activo', 'activa') THEN
    RETURN;
  END IF;

  IF v_sesiones_tarifa <= 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int
  INTO v_horarios_activos
  FROM public."HORARIOS_MATRICULAS"
  WHERE "ID_MATRICULA" = p_id_matricula
    AND LOWER(COALESCE("ESTADO", '')) IN ('activo', 'activa');

  IF v_horarios_activos >= v_sesiones_tarifa THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."AVISOS_INTERNOS"
    WHERE "ID_MATRICULA" = p_id_matricula
      AND "TIPO" = 'Matrícula incompleta'
      AND "LEIDO" = false
  ) THEN
    RETURN;
  END IF;

  SELECT "NOMBRE_ALUMNO"
  INTO v_nombre_alumno
  FROM public."ALUMNOS"
  WHERE "ID_ALUMNO" = v_id_alumno
  LIMIT 1;

  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_CURSO",
    "ID_ALUMNO",
    "ID_ESPECIALIDAD",
    "ID_MATRICULA",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    v_id_cliente,
    v_id_centro,
    v_id_curso,
    v_id_alumno,
    v_id_especialidad,
    p_id_matricula,
    'Matrícula incompleta',
    COALESCE(v_nombre_alumno, 'El alumno')
      || ' tiene '
      || v_horarios_activos::text
      || ' de '
      || v_sesiones_tarifa::text
      || ' horarios semanales requeridos por su tarifa. Pendiente de completar.',
    false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_calcular_alerta_subprogramado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
    v_id_matricula text;
    v_sesiones_tarifa int;
    v_horarios_activos int;
    v_estado_matricula text;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_id_matricula := OLD."ID_MATRICULA";
    ELSE
        v_id_matricula := NEW."ID_MATRICULA";
    END IF;

    IF v_id_matricula IS NOT NULL THEN
        SELECT m."ESTADO", COALESCE(t."SESIONES_SEMANALES", 0)
        INTO v_estado_matricula, v_sesiones_tarifa
        FROM public."MATRICULAS" m
        LEFT JOIN public."TARIFAS" t ON m."ID_TARIFA" = t."ID_TARIFA"
        WHERE m."ID_MATRICULA" = v_id_matricula;

        IF LOWER(COALESCE(v_estado_matricula, '')) NOT IN ('activo', 'activa') THEN
            UPDATE public."MATRICULAS"
            SET "ALERTA_SUBPROGRAMADO" = FALSE
            WHERE "ID_MATRICULA" = v_id_matricula;
        ELSE
            SELECT COUNT(*)::int INTO v_horarios_activos
            FROM public."HORARIOS_MATRICULAS"
            WHERE "ID_MATRICULA" = v_id_matricula
              AND LOWER(COALESCE("ESTADO", '')) IN ('activo', 'activa');

            UPDATE public."MATRICULAS"
            SET "ALERTA_SUBPROGRAMADO" = (v_horarios_activos < v_sesiones_tarifa)
            WHERE "ID_MATRICULA" = v_id_matricula;

            IF v_horarios_activos < v_sesiones_tarifa AND v_sesiones_tarifa > 0 THEN
                PERFORM public.fn_sync_aviso_matricula_incompleta(v_id_matricula);
            END IF;
        END IF;
    END IF;

    RETURN NULL;
END;
$function$;

-- Grupos: sin aviso directo; lo genera tg_calcular_alerta_subprogramado tras sincronizar horarios.
CREATE OR REPLACE FUNCTION public.tg_sincronizar_alumnos_nuevo_horario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
    v_grupo RECORD;
    v_id_alumno text;
    v_id_matricula text;
    v_id_centro_alumno text;
BEGIN
    SELECT * INTO v_grupo FROM public."GRUPOS" WHERE "ID_GRUPO" = NEW."ID_GRUPO";

    IF v_grupo."ID_ALUMNOS" IS NULL OR cardinality(v_grupo."ID_ALUMNOS") = 0 THEN
        RETURN NEW;
    END IF;

    FOR v_id_alumno IN SELECT unnest(v_grupo."ID_ALUMNOS") LOOP
        SELECT m."ID_MATRICULA" INTO v_id_matricula
        FROM public."MATRICULAS" m
        WHERE m."ID_ALUMNO" = v_id_alumno
          AND (v_grupo."ID_TARIFA" IS NULL OR m."ID_TARIFA" = v_grupo."ID_TARIFA")
          AND LOWER(m."ESTADO") IN ('activa', 'activo')
        ORDER BY m."FECHA_ALTA" DESC
        LIMIT 1;

        IF v_id_matricula IS NULL THEN
            v_id_matricula := gen_random_uuid()::text;

            SELECT "ID_CENTRO" INTO v_id_centro_alumno
            FROM public."ALUMNOS"
            WHERE "ID_ALUMNO" = v_id_alumno;

            INSERT INTO public."MATRICULAS" (
                "ID_MATRICULA", "ID_CLIENTE", "ID_ALUMNO", "ID_CENTRO", "ID_CURSO",
                "ID_TARIFA", "ESPECIALIDAD", "ESTADO", "FECHA_ALTA"
            ) VALUES (
                v_id_matricula, v_grupo."ID_CLIENTE", v_id_alumno,
                COALESCE(v_id_centro_alumno, v_grupo."ID_CENTRO"), v_grupo."ID_CURSO",
                v_grupo."ID_TARIFA", v_grupo."ID_ESPECIALIDAD", 'Activo', CURRENT_DATE
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public."HORARIOS_MATRICULAS"
            WHERE "ID_MATRICULA" = v_id_matricula
              AND "ID_GRUPO_HORARIO" = NEW."ID_GRUPO_HORARIO"
        ) THEN
            INSERT INTO public."HORARIOS_MATRICULAS" (
                "ID_HORARIO", "ID_CLIENTE", "ID_CENTRO", "ID_CURSO", "ID_MATRICULA", "ID_ALUMNO",
                "ID_GRUPO", "ID_GRUPO_HORARIO", "DIA", "HORA_INICIO", "HORA_FIN",
                "ID_PROFESOR", "ID_AULA", "ID_ESPECIALIDAD", "ID_TARIFA", "ESTADO"
            ) VALUES (
                gen_random_uuid()::text, NEW."ID_CLIENTE", NEW."ID_CENTRO", NEW."ID_CURSO",
                v_id_matricula, v_id_alumno, NEW."ID_GRUPO", NEW."ID_GRUPO_HORARIO",
                NEW."DIA_SEMANA"::text::public.dia_semana_enum,
                NEW."HORA_INICIO", NEW."HORA_FIN", NEW."ID_PROFESOR", NEW."ID_AULA",
                v_grupo."ID_ESPECIALIDAD", v_grupo."ID_TARIFA", 'Activo'
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_auto_crear_horarios_desde_grupo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
    v_id_alumno text;
    v_id_matricula text;
    v_slot RECORD;
    v_id_centro_alumno text;
BEGIN
    FOR v_id_alumno IN
        SELECT unnest(NEW."ID_ALUMNOS")
        EXCEPT
        SELECT unnest(COALESCE(OLD."ID_ALUMNOS", '{}'::text[]))
    LOOP
        SELECT m."ID_MATRICULA" INTO v_id_matricula
        FROM public."MATRICULAS" m
        WHERE m."ID_ALUMNO" = v_id_alumno
          AND (NEW."ID_TARIFA" IS NULL OR m."ID_TARIFA" = NEW."ID_TARIFA")
          AND LOWER(m."ESTADO") IN ('activa', 'activo')
        ORDER BY m."FECHA_ALTA" DESC
        LIMIT 1;

        IF v_id_matricula IS NULL AND NEW."ID_TARIFA" IS NULL THEN
            v_id_matricula := gen_random_uuid()::text;

            SELECT "ID_CENTRO" INTO v_id_centro_alumno
            FROM public."ALUMNOS"
            WHERE "ID_ALUMNO" = v_id_alumno;

            INSERT INTO public."MATRICULAS" (
                "ID_MATRICULA", "ID_CLIENTE", "ID_ALUMNO", "ID_CENTRO", "ID_CURSO",
                "ID_TARIFA", "ESPECIALIDAD", "ESTADO", "FECHA_ALTA"
            ) VALUES (
                v_id_matricula, NEW."ID_CLIENTE", v_id_alumno,
                COALESCE(v_id_centro_alumno, NEW."ID_CENTRO"), NEW."ID_CURSO",
                NULL, NEW."ID_ESPECIALIDAD", 'Activo', CURRENT_DATE
            );
        END IF;

        IF v_id_matricula IS NOT NULL THEN
            FOR v_slot IN
                SELECT gh.* FROM public."GRUPOS_HORARIOS" gh
                WHERE gh."ID_GRUPO" = NEW."ID_GRUPO"
            LOOP
                IF NOT EXISTS (
                    SELECT 1 FROM public."HORARIOS_MATRICULAS"
                    WHERE "ID_MATRICULA" = v_id_matricula
                      AND "ID_GRUPO_HORARIO" = v_slot."ID_GRUPO_HORARIO"
                ) THEN
                    INSERT INTO public."HORARIOS_MATRICULAS" (
                        "ID_HORARIO", "ID_CLIENTE", "ID_CENTRO", "ID_CURSO", "ID_MATRICULA", "ID_ALUMNO",
                        "ID_GRUPO", "ID_GRUPO_HORARIO", "DIA", "HORA_INICIO", "HORA_FIN",
                        "ID_PROFESOR", "ID_AULA", "ID_ESPECIALIDAD", "ID_TARIFA", "ESTADO"
                    ) VALUES (
                        gen_random_uuid()::text, NEW."ID_CLIENTE", NEW."ID_CENTRO", NEW."ID_CURSO",
                        v_id_matricula, v_id_alumno, NEW."ID_GRUPO", v_slot."ID_GRUPO_HORARIO",
                        v_slot."DIA_SEMANA"::text::public.dia_semana_enum,
                        v_slot."HORA_INICIO", v_slot."HORA_FIN", v_slot."ID_PROFESOR", v_slot."ID_AULA",
                        NEW."ID_ESPECIALIDAD", NEW."ID_TARIFA", 'Activo'
                    );
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.fn_crear_aviso_matricula_grupo_pendiente(
  text, text, text, text, text, text, text, text
);
