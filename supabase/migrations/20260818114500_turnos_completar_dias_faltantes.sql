-- Completar días faltantes en TURNOS_PROFESORES (idempotente, ignora tildes en DIA_SEMANA).

WITH dias AS (
  SELECT *
  FROM (
    VALUES
      ('Lunes'),
      ('Martes'),
      ('Miercoles'),
      ('Jueves'),
      ('Viernes'),
      ('Sabado'),
      ('Domingo')
  ) AS d(dia)
),
prof_centro AS (
  SELECT
    t."ID_PROFESOR",
    t."ID_CLIENTE",
    max(t."ID_CENTRO") FILTER (
      WHERE t."ID_CENTRO" IS NOT NULL AND trim(t."ID_CENTRO") <> ''
    ) AS id_centro
  FROM public."TURNOS_PROFESORES" t
  GROUP BY t."ID_PROFESOR", t."ID_CLIENTE"
)
INSERT INTO public."TURNOS_PROFESORES" (
  "ID_TURNO",
  "ID_CLIENTE",
  "ID_PROFESOR",
  "DIA_SEMANA",
  "ID_CENTRO"
)
SELECT
  gen_random_uuid()::text,
  p."ID_CLIENTE",
  p."ID_PROFESOR",
  d.dia,
  pc.id_centro
FROM public."PROFESOR" p
JOIN prof_centro pc
  ON pc."ID_PROFESOR" = p."ID_PROFESOR"
 AND pc."ID_CLIENTE" = p."ID_CLIENTE"
CROSS JOIN dias d
WHERE p."FECHA_BAJA" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public."TURNOS_PROFESORES" t
    WHERE t."ID_PROFESOR" = p."ID_PROFESOR"
      AND t."ID_CLIENTE" = p."ID_CLIENTE"
      AND lower(translate(t."DIA_SEMANA", 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
        = lower(translate(d.dia, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
  );
