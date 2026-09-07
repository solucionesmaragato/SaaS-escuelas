-- Grupos: avisos de matrícula autogenerada (patrón SEPA/leads/incidencias).
-- Centraliza la emisión en fn_crear_aviso_matricula_grupo_pendiente.

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_MATRICULA" text NULL,
  ADD COLUMN IF NOT EXISTS "ID_GRUPO" text NULL;

DROP VIEW IF EXISTS public."VISTA_AVISOS_INTERNOS";

CREATE VIEW public."VISTA_AVISOS_INTERNOS"
WITH (security_invoker = true)
AS
SELECT
  a."ID_AVISO",
  a."ID_CLIENTE",
  a."ID_CENTRO",
  a."ID_CURSO",
  a."ID_HORARIO",
  a."ID_ALUMNO",
  a."ID_PROFESOR",
  a."ID_ESPECIALIDAD",
  a."ID_MANDATO",
  a."ID_INCIDENCIA",
  a."ID_MATRICULA",
  a."ID_GRUPO",
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  l."NOMBRE" AS "NOMBRE_LEAD"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_crear_aviso_matricula_grupo_pendiente(
  p_id_cliente text,
  p_id_centro text,
  p_id_curso text,
  p_id_alumno text,
  p_id_especialidad text,
  p_id_matricula text,
  p_id_grupo text,
  p_nombre_grupo text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_nombre_alumno text;
BEGIN
  IF p_id_matricula IS NULL OR p_id_matricula = '' OR p_id_grupo IS NULL OR p_id_grupo = '' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."AVISOS_INTERNOS"
    WHERE "ID_MATRICULA" = p_id_matricula
      AND "ID_GRUPO" = p_id_grupo
      AND "TIPO" = 'Matrícula pendiente grupo'
      AND "LEIDO" = false
  ) THEN
    RETURN;
  END IF;

  SELECT "NOMBRE_ALUMNO"
  INTO v_nombre_alumno
  FROM public."ALUMNOS"
  WHERE "ID_ALUMNO" = p_id_alumno
  LIMIT 1;

  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_CURSO",
    "ID_ALUMNO",
    "ID_ESPECIALIDAD",
    "ID_MATRICULA",
    "ID_GRUPO",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    p_id_cliente,
    p_id_centro,
    p_id_curso,
    p_id_alumno,
    p_id_especialidad,
    p_id_matricula,
    p_id_grupo,
    'Matrícula pendiente grupo',
    'Matrícula autogenerada para '
      || COALESCE(v_nombre_alumno, 'el alumno')
      || ' al incorporarlo al grupo "'
      || COALESCE(p_nombre_grupo, 'Sin nombre')
      || '". Pendiente de revisar.',
    false
  );
END;
$function$;

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

            PERFORM public.fn_crear_aviso_matricula_grupo_pendiente(
                v_grupo."ID_CLIENTE",
                COALESCE(v_id_centro_alumno, v_grupo."ID_CENTRO"),
                v_grupo."ID_CURSO",
                v_id_alumno,
                v_grupo."ID_ESPECIALIDAD",
                v_id_matricula,
                v_grupo."ID_GRUPO",
                v_grupo."NOMBRE_GRUPO"
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

            PERFORM public.fn_crear_aviso_matricula_grupo_pendiente(
                NEW."ID_CLIENTE",
                COALESCE(v_id_centro_alumno, NEW."ID_CENTRO"),
                NEW."ID_CURSO",
                v_id_alumno,
                NEW."ID_ESPECIALIDAD",
                v_id_matricula,
                NEW."ID_GRUPO",
                NEW."NOMBRE_GRUPO"
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
