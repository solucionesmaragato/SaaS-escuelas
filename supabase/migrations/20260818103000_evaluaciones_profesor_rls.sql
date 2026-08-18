-- EVALUACIONES: RLS profesor vía horario activo (HORARIOS_MATRICULAS).
-- No modifica get_my_tenant_id, get_my_center_id, get_my_rol ni get_my_teacher_id.
-- Funciones eval_*: solo políticas de EVALUACIONES.
-- Trigger auxiliar eval_*: solo rellena ID_CENTRO en INSERT de EVALUACIONES.

CREATE OR REPLACE FUNCTION public.eval_prof_tiene_horario_activo(
  p_id_alumno text,
  p_id_especialidad text,
  p_id_curso text,
  p_id_profesor text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."HORARIOS_MATRICULAS" hm
    WHERE hm."ID_CLIENTE" = public.get_my_tenant_id()
      AND hm."ID_ALUMNO" = p_id_alumno
      AND hm."ID_ESPECIALIDAD" = p_id_especialidad
      AND hm."ID_PROFESOR" = p_id_profesor
      AND lower(trim(hm."ESTADO")) = 'activo'
      AND (
        p_id_curso IS NULL
        OR trim(p_id_curso) = ''
        OR hm."ID_CURSO" = p_id_curso
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.eval_prof_puede_escribir(
  p_id_cliente text,
  p_id_alumno text,
  p_id_especialidad text,
  p_id_curso text,
  p_id_profesor text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    public.get_my_rol() = 'PROFESOR'
    AND p_id_cliente = public.get_my_tenant_id()
    AND p_id_profesor IS NOT NULL
    AND trim(p_id_profesor) <> ''
    AND p_id_profesor = public.get_my_teacher_id()
    AND public.eval_prof_tiene_horario_activo(
      p_id_alumno,
      p_id_especialidad,
      p_id_curso,
      p_id_profesor
    );
$$;

CREATE OR REPLACE FUNCTION public.eval_resolve_centro_from_horario(
  p_id_cliente text,
  p_id_alumno text,
  p_id_especialidad text,
  p_id_profesor text,
  p_id_curso text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT hm."ID_CENTRO"
  FROM public."HORARIOS_MATRICULAS" hm
  WHERE hm."ID_CLIENTE" = p_id_cliente
    AND hm."ID_ALUMNO" = p_id_alumno
    AND hm."ID_ESPECIALIDAD" = p_id_especialidad
    AND hm."ID_PROFESOR" = p_id_profesor
    AND lower(trim(hm."ESTADO")) = 'activo'
    AND (
      p_id_curso IS NULL
      OR trim(p_id_curso) = ''
      OR hm."ID_CURSO" = p_id_curso
    )
  ORDER BY hm."ID_HORARIO"
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.tg_evaluaciones_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW."ID_EVALUACION" IS NULL THEN
    NEW."ID_EVALUACION" := 'EVA_' || substring(gen_random_uuid()::text from 1 for 8);
  END IF;

  -- Ya no calculamos la media aquí, confiamos en lo que envíe el frontend.

  IF NEW."ID_CENTRO" IS NULL OR trim(NEW."ID_CENTRO") = '' THEN
    NEW."ID_CENTRO" := public.eval_resolve_centro_from_horario(
      NEW."ID_CLIENTE",
      NEW."ID_ALUMNO",
      NEW."ID_ESPECIALIDAD",
      NEW."ID_PROFESOR",
      NEW."ID_CURSO"
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Profesores pueden insertar/editar si son los autores" ON public."EVALUACIONES";
DROP POLICY IF EXISTS "Profesores y Admins pueden ver evaluaciones de su escuela" ON public."EVALUACIONES";

DROP POLICY IF EXISTS "Eval_Prof_Insert" ON public."EVALUACIONES";
CREATE POLICY "Eval_Prof_Insert"
  ON public."EVALUACIONES"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.eval_prof_puede_escribir(
      "ID_CLIENTE",
      "ID_ALUMNO",
      "ID_ESPECIALIDAD",
      "ID_CURSO",
      "ID_PROFESOR"
    )
  );

DROP POLICY IF EXISTS "Eval_Prof_Update" ON public."EVALUACIONES";
CREATE POLICY "Eval_Prof_Update"
  ON public."EVALUACIONES"
  FOR UPDATE
  TO authenticated
  USING (
    public.eval_prof_puede_escribir(
      "ID_CLIENTE",
      "ID_ALUMNO",
      "ID_ESPECIALIDAD",
      "ID_CURSO",
      "ID_PROFESOR"
    )
  )
  WITH CHECK (
    public.eval_prof_puede_escribir(
      "ID_CLIENTE",
      "ID_ALUMNO",
      "ID_ESPECIALIDAD",
      "ID_CURSO",
      "ID_PROFESOR"
    )
  );

DROP POLICY IF EXISTS "Eval_Prof_Select" ON public."EVALUACIONES";
CREATE POLICY "Eval_Prof_Select"
  ON public."EVALUACIONES"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND public.eval_prof_tiene_horario_activo(
      "ID_ALUMNO",
      "ID_ESPECIALIDAD",
      "ID_CURSO",
      public.get_my_teacher_id()
    )
  );
