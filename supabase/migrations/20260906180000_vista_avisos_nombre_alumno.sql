-- VISTA_AVISOS_INTERNOS: exponer NOMBRE_ALUMNO para avisos con ID_ALUMNO real (matrícula, incidencias, etc.).
-- Requiere columnas de avisos de matrícula/grupo (20260906170000); se añaden aquí si faltan.

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
  l."NOMBRE" AS "NOMBRE_LEAD",
  al."NOMBRE_ALUMNO" AS "NOMBRE_ALUMNO"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD"
LEFT JOIN public."ALUMNOS" al ON a."ID_ALUMNO" = al."ID_ALUMNO";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;
