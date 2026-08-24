-- ESC_018 (SINCOPPA): curso verano Asturias, activación de datos y limpieza de remesas huérfanas.

-- Curso verano 2026 en Asturias (mismo calendario que Madrid Julio 2026)
INSERT INTO public."CURSO_ESCOLAR" (
    "ID_CURSO",
    "ID_CLIENTE",
    "ID_CENTRO",
    "NOMBRE_CURSO",
    "FECHA_INICIO",
    "FECHA_FIN",
    "ESTADO"
)
SELECT
    'c8f4e2a1-9b3d-4f7e-8c6a-1d2e3f4a5b6c',
    'ESC_018',
    'ESC_018_CEN_002',
    'Julio 2026',
    DATE '2026-07-01',
    DATE '2026-08-31',
    'Activo'
WHERE NOT EXISTS (
    SELECT 1
    FROM public."CURSO_ESCOLAR" ce
    WHERE ce."ID_CLIENTE" = 'ESC_018'
      AND ce."ID_CENTRO" = 'ESC_018_CEN_002'
      AND ce."NOMBRE_CURSO" = 'Julio 2026'
);

-- Activar alumnos de ESC_018
UPDATE public."ALUMNOS"
SET "ESTADO_ALUMNO" = 'Activo'
WHERE "ID_CLIENTE" = 'ESC_018';

-- Matrículas ya activas: normalizar y quitar baja (no reactivar Inactivas: REGLA_EXCLUSIVIDAD)
UPDATE public."MATRICULAS"
SET "ESTADO" = 'Activo',
    "FECHA_BAJA" = NULL
WHERE "ID_CLIENTE" = 'ESC_018'
  AND lower(trim(coalesce("ESTADO", ''))) IN ('activo', 'activa');

-- Horarios ya activos: normalizar
UPDATE public."HORARIOS_MATRICULAS"
SET "ESTADO" = 'Activo'
WHERE "ID_CLIENTE" = 'ESC_018'
  AND lower(trim(coalesce("ESTADO", ''))) IN ('activo', 'activa');

-- Alinear ID_CURSO de la ficha con matrícula activa (prioriza curso Activo)
UPDATE public."ALUMNOS" a
SET "ID_CURSO" = pick."ID_CURSO"
FROM (
    SELECT DISTINCT ON (m."ID_ALUMNO")
        m."ID_ALUMNO",
        m."ID_CURSO"
    FROM public."MATRICULAS" m
    INNER JOIN public."CURSO_ESCOLAR" ce ON ce."ID_CURSO" = m."ID_CURSO"
    WHERE m."ID_CLIENTE" = 'ESC_018'
      AND lower(trim(coalesce(m."ESTADO", ''))) IN ('activo', 'activa')
    ORDER BY
        m."ID_ALUMNO",
        CASE WHEN lower(trim(coalesce(ce."ESTADO", ''))) = 'activo' THEN 0 ELSE 1 END,
        ce."FECHA_INICIO" DESC
) pick
WHERE a."ID_ALUMNO" = pick."ID_ALUMNO"
  AND a."ID_CLIENTE" = 'ESC_018';

-- Remesas huérfanas (sin recibos del mismo lote)
DELETE FROM public."CONTROL_REMESAS" cr
WHERE cr."ID_CLIENTE" = 'ESC_018'
  AND NOT EXISTS (
      SELECT 1
      FROM public."RECIBOS_MENSUALES" r
      WHERE r."ID_CLIENTE" = cr."ID_CLIENTE"
        AND coalesce(r."ID_CENTRO", '') = coalesce(cr."ID_CENTRO", '')
        AND r."ID_CURSO" = cr."ID_CURSO"
        AND r."MES_PERIODO" = cr."MES_PERIODO"
  );
