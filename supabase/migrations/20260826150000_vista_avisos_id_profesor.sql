-- VISTA_AVISOS_INTERNOS: exponer ID_PROFESOR (misma definición que avisos_internos_rbac + columna).

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
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  l."NOMBRE" AS "NOMBRE_LEAD"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;
