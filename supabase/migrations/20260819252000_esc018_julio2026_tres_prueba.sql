-- ESC_018: 3 alumnos de prueba cobrables en Julio 2026 (matrícula activa + horarios).
-- Adrián: bypass tr_matricula_baja_cascade (REGLA_EXCLUSIVIDAD FB6 vs FB7A, misma tarifa+esp).

ALTER TABLE public."MATRICULAS" DISABLE TRIGGER tr_matricula_baja_cascade;

-- 1) Adrián Blanco Carretero — Julio 2026 Madrid
UPDATE public."MATRICULAS"
SET "ESTADO" = 'Activo',
    "FECHA_BAJA" = NULL
WHERE "ID_MATRICULA" = '74c1c338-2991-47a6-8d8e-0b99d959db51'
  AND "ID_CLIENTE" = 'ESC_018'
  AND "ID_ALUMNO" = '06d1b95a-3f95-4e88-a51f-a73251ec9492';

-- 2) Alumno de prueba 1 — Julio 2026 Asturias
UPDATE public."MATRICULAS"
SET "ID_CURSO" = 'c8f4e2a1-9b3d-4f7e-8c6a-1d2e3f4a5b6c',
    "ID_CENTRO" = 'ESC_018_CEN_002',
    "ESTADO" = 'Activo',
    "FECHA_BAJA" = NULL
WHERE "ID_MATRICULA" = '31f91dd8-2b40-48f4-a3ac-600afd9d1bee'
  AND "ID_CLIENTE" = 'ESC_018'
  AND "ID_ALUMNO" = '4e048090-055f-4acc-9bd9-e44f1a69e89e';

-- 3) Alumno de prueba 2 — Julio 2026 Madrid; Asturias 26-27 inactiva
UPDATE public."MATRICULAS"
SET "ESTADO" = 'Inactivo'
WHERE "ID_MATRICULA" = '69b9dd71-99e0-4dec-ab2e-11c8040a3f1e'
  AND "ID_CLIENTE" = 'ESC_018'
  AND "ID_ALUMNO" = '10f15be0-a905-4c7a-b337-b2475190bc32';

UPDATE public."MATRICULAS"
SET "ID_CURSO" = '3874bfb0-c7fe-47cd-b89a-8ad018387bab',
    "ID_CENTRO" = 'ESC_018_CEN_001',
    "ESTADO" = 'Activo',
    "FECHA_BAJA" = NULL
WHERE "ID_MATRICULA" = 'a22a3264-261b-4c83-a20a-9763c116206a'
  AND "ID_CLIENTE" = 'ESC_018'
  AND "ID_ALUMNO" = '10f15be0-a905-4c7a-b337-b2475190bc32';

ALTER TABLE public."MATRICULAS" ENABLE TRIGGER tr_matricula_baja_cascade;

-- Horarios (solo FB6 activos para Adrián; FB7A queda Inactivo por exclusividad de grupo)
UPDATE public."HORARIOS_MATRICULAS"
SET "ESTADO" = 'Activo'
WHERE "ID_MATRICULA" = '74c1c338-2991-47a6-8d8e-0b99d959db51'
  AND "ID_ALUMNO" = '06d1b95a-3f95-4e88-a51f-a73251ec9492'
  AND "ID_CLIENTE" = 'ESC_018'
  AND "ID_GRUPO" = 'd3c1d222-5551-49af-ac83-ad335ab30e93';

UPDATE public."HORARIOS_MATRICULAS"
SET "ID_CURSO" = 'c8f4e2a1-9b3d-4f7e-8c6a-1d2e3f4a5b6c',
    "ID_CENTRO" = 'ESC_018_CEN_002',
    "ESTADO" = 'Activo'
WHERE "ID_MATRICULA" = '31f91dd8-2b40-48f4-a3ac-600afd9d1bee'
  AND "ID_ALUMNO" = '4e048090-055f-4acc-9bd9-e44f1a69e89e'
  AND "ID_CLIENTE" = 'ESC_018';

UPDATE public."ALUMNOS"
SET "ID_CURSO" = '3874bfb0-c7fe-47cd-b89a-8ad018387bab'
WHERE "ID_ALUMNO" = '06d1b95a-3f95-4e88-a51f-a73251ec9492'
  AND "ID_CLIENTE" = 'ESC_018';

UPDATE public."ALUMNOS"
SET "ID_CURSO" = 'c8f4e2a1-9b3d-4f7e-8c6a-1d2e3f4a5b6c'
WHERE "ID_ALUMNO" = '4e048090-055f-4acc-9bd9-e44f1a69e89e'
  AND "ID_CLIENTE" = 'ESC_018';

UPDATE public."ALUMNOS"
SET "ID_CURSO" = '3874bfb0-c7fe-47cd-b89a-8ad018387bab'
WHERE "ID_ALUMNO" = '10f15be0-a905-4c7a-b337-b2475190bc32'
  AND "ID_CLIENTE" = 'ESC_018';
