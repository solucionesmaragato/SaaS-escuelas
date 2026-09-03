-- Fix backfill catálogo: uso operativo solo con centros del mismo ID_CLIENTE.
-- Idempotente: solo filas TARIFAS/ESPECIALIDADES con ID_CENTRO NULL en ESC_018 y DEMO-0015.

-- A) Cristina admin tenant-wide (DEMO-0015).
-- tg_perfiles_proteger_edicion_total revierte NULL → OLD; bypass obligatorio.
SET LOCAL app.bypass_proteger_edicion = 'true';
UPDATE public."PERFILES"
SET "ID_CENTRO" = NULL
WHERE "ID_PERFIL" = 82
  AND "EMAIL" = 'cris.solucionesmaragato@gmail.com'
  AND "ROL" = 'ADMIN'
  AND "ID_CLIENTE" = 'DEMO-0015';
RESET app.bypass_proteger_edicion;

WITH scope_clients AS (
  SELECT unnest(ARRAY['ESC_018', 'DEMO-0015']::text[]) AS id_cliente
),
default_centro AS (
  SELECT 'ESC_018'::text AS id_cliente, 'ESC_018_CEN_001'::text AS id_centro
  UNION ALL
  SELECT 'DEMO-0015'::text, 'DEMO-0015_CEN_001'::text
),
tarifa_usage AS (
  SELECT g."ID_CLIENTE", g."ID_TARIFA" AS id_tarifa, g."ID_CENTRO" AS id_centro
  FROM public."GRUPOS" g
  INNER JOIN scope_clients sc ON sc.id_cliente = g."ID_CLIENTE"
  WHERE nullif(trim(g."ID_TARIFA"), '') IS NOT NULL
    AND nullif(trim(g."ID_CENTRO"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = g."ID_CENTRO"
        AND c."ID_CLIENTE" = g."ID_CLIENTE"
    )

  UNION ALL

  SELECT m."ID_CLIENTE", m."ID_TARIFA", m."ID_CENTRO"
  FROM public."MATRICULAS" m
  INNER JOIN scope_clients sc ON sc.id_cliente = m."ID_CLIENTE"
  WHERE nullif(trim(m."ID_TARIFA"), '') IS NOT NULL
    AND nullif(trim(m."ID_CENTRO"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = m."ID_CENTRO"
        AND c."ID_CLIENTE" = m."ID_CLIENTE"
    )

  UNION ALL

  SELECT hm."ID_CLIENTE", hm."ID_TARIFA", hm."ID_CENTRO"
  FROM public."HORARIOS_MATRICULAS" hm
  INNER JOIN scope_clients sc ON sc.id_cliente = hm."ID_CLIENTE"
  WHERE nullif(trim(hm."ID_TARIFA"), '') IS NOT NULL
    AND nullif(trim(hm."ID_CENTRO"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = hm."ID_CENTRO"
        AND c."ID_CLIENTE" = hm."ID_CLIENTE"
    )
),
tarifa_centro_counts AS (
  SELECT
    tu."ID_CLIENTE" AS id_cliente,
    tu.id_tarifa,
    count(DISTINCT tu.id_centro) AS distinct_centros,
    min(tu.id_centro) AS single_centro
  FROM tarifa_usage tu
  GROUP BY tu."ID_CLIENTE", tu.id_tarifa
),
tarifa_assignment AS (
  SELECT
    t."ID_TARIFA",
    t."ID_CLIENTE",
    CASE
      WHEN COALESCE(tcc.distinct_centros, 0) > 1 THEN NULL
      WHEN COALESCE(tcc.distinct_centros, 0) = 1 THEN tcc.single_centro
      ELSE dc.id_centro
    END AS new_id_centro
  FROM public."TARIFAS" t
  INNER JOIN scope_clients sc ON sc.id_cliente = t."ID_CLIENTE"
  LEFT JOIN tarifa_centro_counts tcc
    ON tcc.id_cliente = t."ID_CLIENTE"
   AND tcc.id_tarifa = t."ID_TARIFA"
  LEFT JOIN default_centro dc ON dc.id_cliente = t."ID_CLIENTE"
  WHERE t."ID_CENTRO" IS NULL
)
UPDATE public."TARIFAS" t
SET "ID_CENTRO" = ta.new_id_centro
FROM tarifa_assignment ta
WHERE t."ID_TARIFA" = ta."ID_TARIFA"
  AND t."ID_CLIENTE" = ta."ID_CLIENTE"
  AND t."ID_CENTRO" IS NULL
  AND ta.new_id_centro IS NOT NULL;

WITH scope_clients AS (
  SELECT unnest(ARRAY['ESC_018', 'DEMO-0015']::text[]) AS id_cliente
),
default_centro AS (
  SELECT 'ESC_018'::text AS id_cliente, 'ESC_018_CEN_001'::text AS id_centro
  UNION ALL
  SELECT 'DEMO-0015'::text, 'DEMO-0015_CEN_001'::text
),
especialidad_usage AS (
  SELECT g."ID_CLIENTE", g."ID_ESPECIALIDAD" AS id_especialidad, g."ID_CENTRO" AS id_centro
  FROM public."GRUPOS" g
  INNER JOIN scope_clients sc ON sc.id_cliente = g."ID_CLIENTE"
  WHERE nullif(trim(g."ID_ESPECIALIDAD"), '') IS NOT NULL
    AND nullif(trim(g."ID_CENTRO"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = g."ID_CENTRO"
        AND c."ID_CLIENTE" = g."ID_CLIENTE"
    )

  UNION ALL

  SELECT m."ID_CLIENTE", m."ESPECIALIDAD", m."ID_CENTRO"
  FROM public."MATRICULAS" m
  INNER JOIN scope_clients sc ON sc.id_cliente = m."ID_CLIENTE"
  WHERE nullif(trim(m."ESPECIALIDAD"), '') IS NOT NULL
    AND nullif(trim(m."ID_CENTRO"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = m."ID_CENTRO"
        AND c."ID_CLIENTE" = m."ID_CLIENTE"
    )

  UNION ALL

  SELECT a."ID_CLIENTE", esp_id AS id_especialidad, a."ID_CENTRO"
  FROM public."AULA" a
  INNER JOIN scope_clients sc ON sc.id_cliente = a."ID_CLIENTE"
  CROSS JOIN LATERAL unnest(COALESCE(a."ESPECIALIDAD", ARRAY[]::text[])) AS esp_id
  WHERE nullif(trim(esp_id), '') IS NOT NULL
    AND nullif(trim(a."ID_CENTRO"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = a."ID_CENTRO"
        AND c."ID_CLIENTE" = a."ID_CLIENTE"
    )

  UNION ALL

  SELECT p."ID_CLIENTE", esp_id AS id_especialidad, p."ID_CENTRO"
  FROM public."PROFESOR" p
  INNER JOIN scope_clients sc ON sc.id_cliente = p."ID_CLIENTE"
  CROSS JOIN LATERAL unnest(COALESCE(p."ESPECIALIDAD", ARRAY[]::text[])) AS esp_id
  WHERE nullif(trim(esp_id), '') IS NOT NULL
    AND nullif(trim(p."ID_CENTRO"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = p."ID_CENTRO"
        AND c."ID_CLIENTE" = p."ID_CLIENTE"
    )

  UNION ALL

  SELECT hm."ID_CLIENTE", hm."ID_ESPECIALIDAD", hm."ID_CENTRO"
  FROM public."HORARIOS_MATRICULAS" hm
  INNER JOIN scope_clients sc ON sc.id_cliente = hm."ID_CLIENTE"
  WHERE nullif(trim(hm."ID_ESPECIALIDAD"), '') IS NOT NULL
    AND nullif(trim(hm."ID_CENTRO"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public."CENTROS" c
      WHERE c."ID_CENTRO" = hm."ID_CENTRO"
        AND c."ID_CLIENTE" = hm."ID_CLIENTE"
    )
),
especialidad_centro_counts AS (
  SELECT
    eu."ID_CLIENTE" AS id_cliente,
    eu.id_especialidad,
    count(DISTINCT eu.id_centro) AS distinct_centros,
    min(eu.id_centro) AS single_centro
  FROM especialidad_usage eu
  GROUP BY eu."ID_CLIENTE", eu.id_especialidad
),
especialidad_assignment AS (
  SELECT
    e."ID_ESPECIALIDAD",
    e."ID_CLIENTE",
    CASE
      WHEN COALESCE(ecc.distinct_centros, 0) > 1 THEN NULL
      WHEN COALESCE(ecc.distinct_centros, 0) = 1 THEN ecc.single_centro
      ELSE dc.id_centro
    END AS new_id_centro
  FROM public."ESPECIALIDADES" e
  INNER JOIN scope_clients sc ON sc.id_cliente = e."ID_CLIENTE"
  LEFT JOIN especialidad_centro_counts ecc
    ON ecc.id_cliente = e."ID_CLIENTE"
   AND ecc.id_especialidad = e."ID_ESPECIALIDAD"
  LEFT JOIN default_centro dc ON dc.id_cliente = e."ID_CLIENTE"
  WHERE e."ID_CENTRO" IS NULL
)
UPDATE public."ESPECIALIDADES" e
SET "ID_CENTRO" = ea.new_id_centro
FROM especialidad_assignment ea
WHERE e."ID_ESPECIALIDAD" = ea."ID_ESPECIALIDAD"
  AND e."ID_CLIENTE" = ea."ID_CLIENTE"
  AND e."ID_CENTRO" IS NULL
  AND ea.new_id_centro IS NOT NULL;

DO $$
DECLARE
  tenant text;
  r record;
  cristina_centro text;
  cross_demo integer;
  cross_esc integer;
BEGIN
  FOREACH tenant IN ARRAY ARRAY['ESC_018', 'DEMO-0015']::text[] LOOP
    RAISE NOTICE '=== TARIFAS % ===', tenant;
    FOR r IN
      SELECT coalesce(t."ID_CENTRO", '(NULL)') AS id_centro, count(*) AS n
      FROM public."TARIFAS" t
      WHERE t."ID_CLIENTE" = tenant
      GROUP BY t."ID_CENTRO"
      ORDER BY 1
    LOOP
      RAISE NOTICE '  %: %', r.id_centro, r.n;
    END LOOP;

    RAISE NOTICE '=== ESPECIALIDADES % ===', tenant;
    FOR r IN
      SELECT coalesce(e."ID_CENTRO", '(NULL)') AS id_centro, count(*) AS n
      FROM public."ESPECIALIDADES" e
      WHERE e."ID_CLIENTE" = tenant
      GROUP BY e."ID_CENTRO"
      ORDER BY 1
    LOOP
      RAISE NOTICE '  %: %', r.id_centro, r.n;
    END LOOP;
  END LOOP;

  SELECT count(*) INTO cross_demo
  FROM (
    SELECT 1
    FROM public."TARIFAS"
    WHERE "ID_CLIENTE" = 'DEMO-0015'
      AND "ID_CENTRO" LIKE 'ESC_%'
    UNION ALL
    SELECT 1
    FROM public."ESPECIALIDADES"
    WHERE "ID_CLIENTE" = 'DEMO-0015'
      AND "ID_CENTRO" LIKE 'ESC_%'
  ) demo_cross;

  SELECT count(*) INTO cross_esc
  FROM (
    SELECT 1
    FROM public."TARIFAS"
    WHERE "ID_CLIENTE" = 'ESC_018'
      AND "ID_CENTRO" LIKE 'DEMO-%'
    UNION ALL
    SELECT 1
    FROM public."ESPECIALIDADES"
    WHERE "ID_CLIENTE" = 'ESC_018'
      AND "ID_CENTRO" LIKE 'DEMO-%'
  ) esc_cross;

  IF cross_demo > 0 THEN
    RAISE NOTICE 'REVISAR: DEMO-0015 con ID_CENTRO ESC_*: % filas', cross_demo;
  ELSE
    RAISE NOTICE 'OK: DEMO-0015 sin ID_CENTRO ESC_*';
  END IF;

  IF cross_esc > 0 THEN
    RAISE NOTICE 'REVISAR: ESC_018 con ID_CENTRO DEMO-*: % filas', cross_esc;
  ELSE
    RAISE NOTICE 'OK: ESC_018 sin ID_CENTRO DEMO-*';
  END IF;

  SELECT p."ID_CENTRO"
  INTO cristina_centro
  FROM public."PERFILES" p
  WHERE p."ID_PERFIL" = 82
    AND p."EMAIL" = 'cris.solucionesmaragato@gmail.com'
    AND p."ROL" = 'ADMIN'
    AND p."ID_CLIENTE" = 'DEMO-0015';

  IF cristina_centro IS NULL THEN
    RAISE NOTICE 'Cristina (ID_PERFIL=82): ID_CENTRO IS NULL — OK';
  ELSE
    RAISE NOTICE 'Cristina (ID_PERFIL=82): ID_CENTRO = % — revisar', cristina_centro;
  END IF;
END $$;
