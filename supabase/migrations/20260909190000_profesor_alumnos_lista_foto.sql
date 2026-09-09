-- Exponer FOTO en la lista de alumnos del profesor (/app/alumnos), solo lectura.

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
  ) AS "TUTORES",
  a."FOTO"
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

GRANT SELECT ON public."VISTA_PROFESOR_ALUMNOS_LISTA" TO authenticated;
