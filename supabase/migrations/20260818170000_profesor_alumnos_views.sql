-- Vistas de lectura para /app/alumnos (PROFESOR).
-- Filtran por get_my_teacher_id() + horarios activos; exponen solo columnas mínimas.
-- security_invoker=false: permite resolver nombres de tutores (MATRICULAS.ID_PROFESOR) sin ampliar RLS de PROFESOR.

CREATE OR REPLACE VIEW public."VISTA_PROFESOR_ALUMNOS_LISTA"
WITH (security_invoker = false)
AS
SELECT
  a."ID_ALUMNO",
  a."ID_CLIENTE",
  a."NOMBRE_ALUMNO",
  a."NACIMIENTO",
  CASE
    WHEN a."NACIMIENTO" IS NOT NULL
    THEN EXTRACT(YEAR FROM age(current_date, a."NACIMIENTO"))::integer
    ELSE NULL
  END AS "EDAD",
  (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'ID_PROFESOR', t."ID_PROFESOR",
          'NOMBRE_PROFESOR', t."NOMBRE_PROFESOR"
        )
        ORDER BY t."NOMBRE_PROFESOR"
      ),
      '[]'::json
    )
    FROM (
      SELECT DISTINCT
        p."ID_PROFESOR",
        p."NOMBRE_PROFESOR"
      FROM public."MATRICULAS" m
      INNER JOIN public."PROFESOR" p ON p."ID_PROFESOR" = m."ID_PROFESOR"
      WHERE m."ID_ALUMNO" = a."ID_ALUMNO"
        AND m."ID_CLIENTE" = a."ID_CLIENTE"
        AND lower(trim(coalesce(m."ESTADO", ''))) <> 'inactivo'
        AND nullif(trim(coalesce(m."ID_PROFESOR", '')), '') IS NOT NULL
    ) t
  ) AS "TUTORES"
FROM public."ALUMNOS" a
WHERE a."ID_CLIENTE" = public.get_my_tenant_id()
  AND public.get_my_rol() = 'PROFESOR'
  AND nullif(trim(coalesce(public.get_my_teacher_id(), '')), '') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public."HORARIOS_MATRICULAS" hm
    WHERE hm."ID_ALUMNO" = a."ID_ALUMNO"
      AND hm."ID_CLIENTE" = a."ID_CLIENTE"
      AND hm."ID_PROFESOR" = public.get_my_teacher_id()
      AND trim(coalesce(hm."ESTADO", '')) = 'Activo'
  );

CREATE OR REPLACE VIEW public."VISTA_PROFESOR_ALUMNOS_HORARIOS"
WITH (security_invoker = false)
AS
SELECT
  hm."ID_HORARIO",
  hm."ID_CLIENTE",
  hm."ID_ALUMNO",
  hm."ID_MATRICULA",
  hm."ID_CENTRO",
  c."NOMBRE_CENTRO",
  hm."ID_ESPECIALIDAD",
  e."ESPECIALIDAD",
  hm."ID_PROFESOR",
  p."NOMBRE_PROFESOR",
  hm."DIA"::text AS "DIA",
  hm."HORA_INICIO",
  hm."HORA_FIN",
  hm."ID_AULA",
  hm."TIPO_CLASE",
  hm."ESTADO"
FROM public."HORARIOS_MATRICULAS" hm
LEFT JOIN public."CENTROS" c ON c."ID_CENTRO" = hm."ID_CENTRO"
LEFT JOIN public."ESPECIALIDADES" e ON e."ID_ESPECIALIDAD" = hm."ID_ESPECIALIDAD"
LEFT JOIN public."PROFESOR" p ON p."ID_PROFESOR" = hm."ID_PROFESOR"
WHERE hm."ID_CLIENTE" = public.get_my_tenant_id()
  AND trim(coalesce(hm."ESTADO", '')) = 'Activo'
  AND public.get_my_rol() = 'PROFESOR'
  AND nullif(trim(coalesce(public.get_my_teacher_id(), '')), '') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public."HORARIOS_MATRICULAS" mine
    WHERE mine."ID_CLIENTE" = hm."ID_CLIENTE"
      AND mine."ID_ALUMNO" = hm."ID_ALUMNO"
      AND mine."ID_PROFESOR" = public.get_my_teacher_id()
      AND trim(coalesce(mine."ESTADO", '')) = 'Activo'
      AND mine."ID_CENTRO" IS NOT DISTINCT FROM hm."ID_CENTRO"
  );

GRANT SELECT ON public."VISTA_PROFESOR_ALUMNOS_LISTA" TO authenticated;
GRANT SELECT ON public."VISTA_PROFESOR_ALUMNOS_HORARIOS" TO authenticated;
