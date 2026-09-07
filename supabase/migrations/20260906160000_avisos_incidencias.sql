-- Incidencias: avisos internos con ID_INCIDENCIA, trigger dedicado (patrón SEPA/leads).
-- Quita la emisión de avisos de tg_incidencias_procesar_automatizacion (solo automatización de sesiones).

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_INCIDENCIA" text NULL;

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
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  l."NOMBRE" AS "NOMBRE_LEAD"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_aviso_incidencias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_rol text;
  v_alumno_nombre text;
  v_especialidad_nombre text;
  v_tipo_aviso text;
  v_mensaje text;
  v_id_profesor_aviso text;
BEGIN
  SELECT "NOMBRE_ALUMNO"
  INTO v_alumno_nombre
  FROM public."ALUMNOS"
  WHERE "ID_ALUMNO" = NEW."ID_ALUMNO"
  LIMIT 1;

  SELECT "ESPECIALIDAD"
  INTO v_especialidad_nombre
  FROM public."ESPECIALIDADES"
  WHERE "ID_ESPECIALIDAD" = NEW."ID_ESPECIALIDAD"
  LIMIT 1;

  v_alumno_nombre := COALESCE(v_alumno_nombre, 'Alumno');
  v_especialidad_nombre := COALESCE(v_especialidad_nombre, 'Clase');
  v_rol := COALESCE(public.get_my_rol(), '');

  IF TG_OP = 'INSERT' THEN
    IF LOWER(COALESCE(NEW."TIPO_INCIDENCIA", '')) = 'consulta' THEN
      v_tipo_aviso := 'Incidencia consulta';
      v_mensaje := 'Consulta del alumno ' || v_alumno_nombre
        || ' (' || v_especialidad_nombre || ').';
    ELSIF LOWER(COALESCE(NEW."TIPO_INCIDENCIA", '')) LIKE '%falta%' THEN
      v_tipo_aviso := 'Incidencia falta';
      v_mensaje := 'El alumno ' || v_alumno_nombre || ' faltará el día '
        || to_char(COALESCE(NEW."FECHA_EXACTA", CURRENT_DATE), 'DD/MM/YYYY')
        || ' (' || v_especialidad_nombre || ').';
    ELSIF LOWER(COALESCE(NEW."TIPO_INCIDENCIA", '')) LIKE '%recupera%' THEN
      v_tipo_aviso := 'Incidencia recuperación';
      v_mensaje := 'El alumno ' || v_alumno_nombre || ' ha agendado una recuperación el día '
        || to_char(NEW."FECHA_EXACTA", 'DD/MM/YYYY')
        || ' (' || v_especialidad_nombre || ').';
    ELSE
      RETURN NEW;
    END IF;

    IF v_rol = 'PROFESOR' THEN
      v_id_profesor_aviso := NULL;
    ELSE
      v_id_profesor_aviso := NULLIF(NEW."ID_PROFESOR", '');
    END IF;

    INSERT INTO public."AVISOS_INTERNOS" (
      "ID_CLIENTE",
      "ID_CENTRO",
      "ID_CURSO",
      "ID_HORARIO",
      "ID_ALUMNO",
      "ID_ESPECIALIDAD",
      "ID_PROFESOR",
      "ID_INCIDENCIA",
      "TIPO",
      "MENSAJE",
      "LEIDO"
    ) VALUES (
      NEW."ID_CLIENTE",
      NEW."ID_CENTRO",
      NEW."ID_CURSO",
      NEW."ID_HORARIO",
      NEW."ID_ALUMNO",
      NEW."ID_ESPECIALIDAD",
      v_id_profesor_aviso,
      NEW."ID_INCIDENCIA",
      v_tipo_aviso,
      v_mensaje,
      false
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD."ESTADO_CONSULTA" IS NOT DISTINCT FROM NEW."ESTADO_CONSULTA" THEN
      RETURN NEW;
    END IF;

    IF LOWER(COALESCE(NEW."TIPO_INCIDENCIA", '')) <> 'consulta' THEN
      RETURN NEW;
    END IF;

    v_tipo_aviso := 'Incidencia estado actualizado';
    v_mensaje := 'La consulta del alumno ' || v_alumno_nombre
      || ' ha pasado a estado ' || COALESCE(NEW."ESTADO_CONSULTA", 'Pendiente') || '.';

    IF v_rol = 'PROFESOR' THEN
      v_id_profesor_aviso := NULL;
    ELSE
      v_id_profesor_aviso := NULLIF(NEW."ID_PROFESOR", '');
    END IF;

    INSERT INTO public."AVISOS_INTERNOS" (
      "ID_CLIENTE",
      "ID_CENTRO",
      "ID_CURSO",
      "ID_HORARIO",
      "ID_ALUMNO",
      "ID_ESPECIALIDAD",
      "ID_PROFESOR",
      "ID_INCIDENCIA",
      "TIPO",
      "MENSAJE",
      "LEIDO"
    ) VALUES (
      NEW."ID_CLIENTE",
      NEW."ID_CENTRO",
      NEW."ID_CURSO",
      NEW."ID_HORARIO",
      NEW."ID_ALUMNO",
      NEW."ID_ESPECIALIDAD",
      v_id_profesor_aviso,
      NEW."ID_INCIDENCIA",
      v_tipo_aviso,
      v_mensaje,
      false
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_aviso_incidencias ON public."INCIDENCIAS";

CREATE TRIGGER tr_aviso_incidencias
  AFTER INSERT OR UPDATE OF "ESTADO_CONSULTA" ON public."INCIDENCIAS"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_incidencias();

-- Automatización de incidencias: sin emisión de avisos (movida a tg_aviso_incidencias).
CREATE OR REPLACE FUNCTION public.tg_incidencias_procesar_automatizacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
    v_alumno_nombre text;
    v_especialidad_nombre text;
    v_new_id_sesion text;
    v_id_matricula text;
    v_id_horario text;
    v_id_grupo_horario text;
    v_id_centro text;
    v_id_curso text;
    v_id_aula_def text;
    v_id_profesor_def text;
    v_resultado_choques jsonb;
BEGIN
    SELECT "NOMBRE_ALUMNO" INTO v_alumno_nombre FROM public."ALUMNOS" WHERE "ID_ALUMNO" = NEW."ID_ALUMNO" LIMIT 1;
    SELECT "ESPECIALIDAD" INTO v_especialidad_nombre FROM public."ESPECIALIDADES" WHERE "ID_ESPECIALIDAD" = NEW."ID_ESPECIALIDAD" LIMIT 1;

    v_alumno_nombre       := COALESCE(v_alumno_nombre, 'Alumno Registrado');
    v_especialidad_nombre := COALESCE(v_especialidad_nombre, 'Clase Común');

    IF LOWER(NEW."TIPO_INCIDENCIA") LIKE '%falta%' THEN
        NEW."TIPO_FALTA" := COALESCE(NEW."TIPO_FALTA", 'recuperable');
    END IF;

    IF NEW."ID_SESION" IS NOT NULL AND NEW."ID_SESION" <> '' THEN
        SELECT "ID_MATRICULA", "ID_HORARIO", "ID_CENTRO", "ID_CURSO", "ID_AULA", "ID_PROFESOR"
        INTO v_id_matricula, v_id_horario, v_id_centro, v_id_curso, v_id_aula_def, v_id_profesor_def
        FROM public."SESIONES" WHERE "ID_SESION" = NEW."ID_SESION" LIMIT 1;
    END IF;

    IF v_id_horario IS NULL THEN
        SELECT "ID_MATRICULA", "ID_HORARIO", "ID_GRUPO_HORARIO", "ID_CENTRO", "ID_CURSO", "ID_AULA", "ID_PROFESOR"
        INTO v_id_matricula, v_id_horario, v_id_grupo_horario, v_id_centro, v_id_curso, v_id_aula_def, v_id_profesor_def
        FROM public."HORARIOS_MATRICULAS"
        WHERE "ID_ALUMNO" = NEW."ID_ALUMNO" AND "ID_ESPECIALIDAD" = NEW."ID_ESPECIALIDAD" AND "ESTADO" = 'Activo' LIMIT 1;
    END IF;

    NEW."ID_MATRICULA"        := COALESCE(NEW."ID_MATRICULA", v_id_matricula);
    NEW."ID_HORARIO"          := COALESCE(NEW."ID_HORARIO", v_id_horario);
    NEW."ID_CENTRO"           := COALESCE(NEW."ID_CENTRO", v_id_centro);
    NEW."ID_CURSO"            := COALESCE(NEW."ID_CURSO", v_id_curso);
    NEW."ID_AULA"             := COALESCE(NEW."ID_AULA", v_id_aula_def);
    NEW."ID_PROFESOR"         := COALESCE(NEW."ID_PROFESOR", v_id_profesor_def);
    NEW."ULTIMA_MODIFICACION" := now();

    IF LOWER(NEW."TIPO_INCIDENCIA") LIKE '%falta%' THEN
        UPDATE public."SESIONES"
        SET "ESTADO" = 'Incidencia',
            "TITULO_CALENDARIO" = '🔴 FALTA: ' || v_alumno_nombre || ' - ' || v_especialidad_nombre,
            "ULTIMA_MODIFICACION" = now()
        WHERE "ID_ALUMNO" = NEW."ID_ALUMNO"
          AND "ID_HORARIO" = NEW."ID_HORARIO"
          AND "FECHA_EXACTA" = NEW."FECHA_EXACTA";

    ELSIF LOWER(NEW."TIPO_INCIDENCIA") LIKE '%recupera%' THEN
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
            v_new_id_sesion := 'SES_' || to_char(NEW."FECHA_EXACTA", 'YYYYMMDD') || '_' || to_char(NEW."HORA_INICIO", 'HH24MI') || '_' || NEW."ID_ALUMNO";
            NEW."ID_SESION" := v_new_id_sesion;
        ELSE
            v_new_id_sesion := NEW."ID_SESION";
        END IF;

        INSERT INTO public."SESIONES" (
            "ID_SESION", "ID_CLIENTE", "ID_ALUMNO", "FECHA_EXACTA", "HORA_INICIO", "HORA_FIN", "ID_PROFESOR", "ID_AULA", "ESPECIALIDAD",
            "ESTADO", "NOTAS", "TITULO_CALENDARIO", "ID_MATRICULA", "ID_HORARIO", "ID_GRUPO_HORARIO", "ID_CENTRO", "ID_CURSO", "FECHA_CREACION", "ULTIMA_MODIFICACION"
        ) VALUES (
            v_new_id_sesion, NEW."ID_CLIENTE", NEW."ID_ALUMNO", NEW."FECHA_EXACTA", NEW."HORA_INICIO", NEW."HORA_FIN", NEW."ID_PROFESOR", NEW."ID_AULA", NEW."ID_ESPECIALIDAD",
            'Incidencia', NEW."NOTAS", '🟢 RECUPERACIÓN: ' || v_alumno_nombre || ' - ' || v_especialidad_nombre, NEW."ID_MATRICULA", NEW."ID_HORARIO", v_id_grupo_horario, NEW."ID_CENTRO", NEW."ID_CURSO", now(), now()
        );
    END IF;

    RETURN NEW;
END;
$function$;
