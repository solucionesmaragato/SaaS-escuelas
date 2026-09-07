-- Fase 1 remesas: trazabilidad ID_REMESA/ID_RECIBO en avisos, snapshots por alumno, RPC generar_remesa_mensual.

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_REMESA" text NULL;

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_RECIBO" text NULL;

CREATE INDEX IF NOT EXISTS idx_avisos_remesa
  ON public."AVISOS_INTERNOS" ("ID_REMESA")
  WHERE "ID_REMESA" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_avisos_recibo
  ON public."AVISOS_INTERNOS" ("ID_RECIBO")
  WHERE "ID_RECIBO" IS NOT NULL;

CREATE TABLE IF NOT EXISTS public."REMESA_PROCESO_ALUMNO" (
  "ID" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ID_REMESA" text NOT NULL,
  "ID_ALUMNO" text NOT NULL,
  "ID_RECIBO" text NULL,
  "ID_CLIENTE" text NOT NULL,
  "ID_CENTRO" text NOT NULL,
  "ID_CURSO" text NOT NULL,
  "MES_PERIODO" text NOT NULL,
  "AJUSTE_EUR" numeric NULL,
  "MOTIVO_AJUSTE" text NULL,
  "CARGOS_SNAPSHOT" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "LINEAS_SNAPSHOT" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ESTADO" text NOT NULL DEFAULT 'recibo_ok',
  "ERROR_PDF" text NULL,
  "CREATED_AT" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remesa_proceso_alumno_estado_chk
    CHECK ("ESTADO" IN ('recibo_ok', 'pdf_fallido', 'recibo_no_generado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_remesa_proceso_alumno
  ON public."REMESA_PROCESO_ALUMNO" ("ID_REMESA", "ID_ALUMNO");

CREATE INDEX IF NOT EXISTS idx_remesa_proceso_recibo
  ON public."REMESA_PROCESO_ALUMNO" ("ID_RECIBO")
  WHERE "ID_RECIBO" IS NOT NULL;

ALTER TABLE public."REMESA_PROCESO_ALUMNO" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master_Todo_Remesa_Proceso" ON public."REMESA_PROCESO_ALUMNO";
CREATE POLICY "Master_Todo_Remesa_Proceso"
  ON public."REMESA_PROCESO_ALUMNO"
  FOR ALL
  TO authenticated
  USING (public.get_my_rol() = 'MASTER')
  WITH CHECK (public.get_my_rol() = 'MASTER');

DROP POLICY IF EXISTS "Admin_Remesa_Proceso" ON public."REMESA_PROCESO_ALUMNO";
CREATE POLICY "Admin_Remesa_Proceso"
  ON public."REMESA_PROCESO_ALUMNO"
  FOR ALL
  TO authenticated
  USING (
    public.get_my_rol() = 'ADMIN'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  )
  WITH CHECK (
    public.get_my_rol() = 'ADMIN'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  );

DROP POLICY IF EXISTS "Secretaria_Remesa_Proceso" ON public."REMESA_PROCESO_ALUMNO";
CREATE POLICY "Secretaria_Remesa_Proceso"
  ON public."REMESA_PROCESO_ALUMNO"
  FOR ALL
  TO authenticated
  USING (
    public.get_my_rol() = 'SECRETARIA'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_CENTRO" = public.get_my_center_id()
  )
  WITH CHECK (
    public.get_my_rol() = 'SECRETARIA'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_CENTRO" = public.get_my_center_id()
  );

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
  a."ID_PRESTAMO",
  a."ID_PERMISO",
  a."ID_DOCUMENTO",
  a."ID_FICHAJE",
  a."ID_REMESA",
  a."ID_RECIBO",
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  a."CANTIDAD",
  l."NOMBRE" AS "NOMBRE_LEAD",
  al."NOMBRE_ALUMNO" AS "NOMBRE_ALUMNO"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD"
LEFT JOIN public."ALUMNOS" al ON a."ID_ALUMNO" = al."ID_ALUMNO";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;

GRANT SELECT ON public."REMESA_PROCESO_ALUMNO" TO authenticated;

CREATE OR REPLACE FUNCTION public.generar_remesa_mensual(
    p_id_cliente text,
    p_id_centro text,
    p_id_curso text,
    p_mes_periodo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    r_alumno RECORD;
    r_linea RECORD;
    r_cargo RECORD;
    r_cargo_aviso RECORD;

    v_id_remesa text;
    v_id_recibo text;
    v_receptor text;
    v_direccion_completa text;

    v_suma_base_formacion numeric;
    v_total_base numeric;
    v_suma_iva numeric;
    v_dto_euros numeric;
    v_total_doc numeric;
    v_ajuste_manual numeric;

    v_tiene_lineas boolean;
    v_linea_base numeric;
    v_linea_iva numeric;
    v_contador_recibos integer := 0;

    v_cargos_snapshot jsonb;
    v_lineas_snapshot jsonb;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public."CONTROL_REMESAS"
        WHERE "ID_CLIENTE" = p_id_cliente
          AND "ID_CENTRO" = p_id_centro
          AND "MES_PERIODO" = p_mes_periodo
          AND "ID_CURSO" = p_id_curso
    ) THEN
        RAISE EXCEPTION 'RESTRICT_VETO: Ya existe una remesa para el período "%" en este centro y curso.', p_mes_periodo;
    END IF;

    INSERT INTO public."CONTROL_REMESAS" (
        "ID_REMESA", "ID_CLIENTE", "MES_PERIODO", "ESTADO", "ID_CURSO", "ID_CENTRO"
    ) VALUES (
        'REM_' || lower(substr(md5(random()::text), 1, 12)),
        p_id_cliente,
        p_mes_periodo,
        'Generada',
        p_id_curso,
        p_id_centro
    )
    RETURNING "ID_REMESA" INTO v_id_remesa;

    FOR r_alumno IN (
        SELECT DISTINCT ON (a."ID_ALUMNO")
            a."ID_ALUMNO", a."NOMBRE_PADRE", a."NOMBRE_MADRE", a."NOMBRE_ALUMNO",
            a."DNI", a."DIRECCION", a."CP", a."MAIL", a."TLF_COMUNICACION", a."METODO_PAGO",
            a."DTO_HERMANOS_PORCENTAJE", a."AJUSTE_MANUAL_EUR", a."MOTIVO_AJUSTE"
        FROM public."ALUMNOS" a
        WHERE a."ID_CLIENTE" = p_id_cliente
          AND a."ID_CENTRO" = p_id_centro
          AND LOWER(a."ESTADO_ALUMNO") IN ('activo', 'activa')
          AND EXISTS (
              SELECT 1
              FROM public."MATRICULAS" m
              WHERE m."ID_ALUMNO" = a."ID_ALUMNO"
                AND m."ID_CLIENTE" = p_id_cliente
                AND m."ID_CENTRO" = p_id_centro
                AND m."ID_CURSO" = p_id_curso
                AND LOWER(m."ESTADO") IN ('activo', 'activa')
          )
        ORDER BY a."ID_ALUMNO"
    ) LOOP

        v_id_recibo := 'rec_' || lower(substr(md5(random()::text), 1, 12));
        v_suma_base_formacion := 0;
        v_tiene_lineas := false;
        v_ajuste_manual := COALESCE(r_alumno."AJUSTE_MANUAL_EUR", 0);
        v_cargos_snapshot := '[]'::jsonb;

        v_receptor := COALESCE(r_alumno."NOMBRE_ALUMNO", 'Receptor Desconocido');
        v_direccion_completa := COALESCE(r_alumno."DIRECCION", '')
            || CASE WHEN r_alumno."CP" IS NOT NULL THEN ' | ' || r_alumno."CP" ELSE '' END;

        FOR r_linea IN (
            SELECT m."ID_MATRICULA", t."PRECIO", t."SERVICIO"
            FROM public."MATRICULAS" m
            JOIN public."TARIFAS" t ON m."ID_TARIFA" = t."ID_TARIFA"
            WHERE m."ID_ALUMNO" = r_alumno."ID_ALUMNO"
              AND m."ID_CLIENTE" = p_id_cliente
              AND m."ID_CENTRO" = p_id_centro
              AND m."ID_CURSO" = p_id_curso
              AND LOWER(m."ESTADO") IN ('activo', 'activa')
        ) LOOP
            INSERT INTO public."VENTAS_LINEAS" (
                "ID_LINEA", "ID_CLIENTE", "ID_RECIBO", "CONCEPTO", "ID_MATRICULA",
                "CANTIDAD", "PRECIO_UNITARIO", "DESCUENTO_LINEA", "IVA_PORCENTAJE", "SUBTOTAL"
            ) VALUES (
                'LIN_' || substr(md5(random()::text), 1, 10), p_id_cliente, v_id_recibo,
                'Mensualidad: ' || COALESCE(r_linea."SERVICIO", 'Clase de Formación'), r_linea."ID_MATRICULA",
                1, r_linea."PRECIO", 0, 0, r_linea."PRECIO"
            );
            v_suma_base_formacion := v_suma_base_formacion + r_linea."PRECIO";
            v_tiene_lineas := true;
        END LOOP;

        FOR r_linea IN (
            SELECT hm."ID_MATRICULA", hm."PRECIO", hm."DIA"
            FROM public."HORARIOS_MATRICULAS" hm
            WHERE hm."ID_ALUMNO" = r_alumno."ID_ALUMNO"
              AND hm."ID_CLIENTE" = p_id_cliente
              AND hm."ID_CENTRO" = p_id_centro
              AND hm."ID_CURSO" = p_id_curso
              AND LOWER(hm."ESTADO") IN ('activo', 'activa')
              AND hm."PRECIO" > 0
        ) LOOP
            INSERT INTO public."VENTAS_LINEAS" (
                "ID_LINEA", "ID_CLIENTE", "ID_RECIBO", "CONCEPTO", "ID_MATRICULA",
                "CANTIDAD", "PRECIO_UNITARIO", "DESCUENTO_LINEA", "IVA_PORCENTAJE", "SUBTOTAL"
            ) VALUES (
                'LIN_' || substr(md5(random()::text), 1, 10), p_id_cliente, v_id_recibo,
                'Clase Adicional (' || COALESCE(r_linea."DIA"::text, 'Varios') || ')', r_linea."ID_MATRICULA",
                1, r_linea."PRECIO", 0, 0, r_linea."PRECIO"
            );
            v_suma_base_formacion := v_suma_base_formacion + r_linea."PRECIO";
            v_tiene_lineas := true;
        END LOOP;

        FOR r_cargo IN (
            SELECT "ID_CARGO", "CONCEPTO", "CANTIDAD", "PRECIO_UNITARIO", "PORCENTAJE_IVA"
            FROM public."CARGOS_EXTRA"
            WHERE "ID_ALUMNO" = r_alumno."ID_ALUMNO"
              AND "ESTADO" = 'Pendiente'
        ) LOOP
            v_linea_base := r_cargo."CANTIDAD" * r_cargo."PRECIO_UNITARIO";
            v_linea_iva := v_linea_base * (r_cargo."PORCENTAJE_IVA" / 100.0);

            INSERT INTO public."VENTAS_LINEAS" (
                "ID_LINEA", "ID_CLIENTE", "ID_RECIBO", "CONCEPTO", "ID_MATRICULA",
                "CANTIDAD", "PRECIO_UNITARIO", "DESCUENTO_LINEA", "IVA_PORCENTAJE", "SUBTOTAL"
            ) VALUES (
                'LIN_' || substr(md5(random()::text), 1, 10), p_id_cliente, v_id_recibo,
                r_cargo."CONCEPTO", NULL,
                r_cargo."CANTIDAD"::bigint, r_cargo."PRECIO_UNITARIO", 0, r_cargo."PORCENTAJE_IVA",
                ROUND(v_linea_base + v_linea_iva, 2)
            );

            v_tiene_lineas := true;

            v_cargos_snapshot := v_cargos_snapshot || jsonb_build_array(
                jsonb_build_object(
                    'id_cargo', r_cargo."ID_CARGO",
                    'concepto', r_cargo."CONCEPTO",
                    'cantidad', r_cargo."CANTIDAD",
                    'precio_unitario', r_cargo."PRECIO_UNITARIO",
                    'porcentaje_iva', r_cargo."PORCENTAJE_IVA"
                )
            );

            UPDATE public."CARGOS_EXTRA"
            SET "ESTADO" = 'Procesado',
                "ID_RECIBO_VINCULADO" = v_id_recibo
            WHERE "ID_CARGO" = r_cargo."ID_CARGO";
        END LOOP;

        IF v_tiene_lineas OR v_ajuste_manual <> 0 THEN

            v_dto_euros := ROUND(
                v_suma_base_formacion * (COALESCE(r_alumno."DTO_HERMANOS_PORCENTAJE", 0) / 100.0),
                2
            );

            IF v_dto_euros <> 0 THEN
                INSERT INTO public."VENTAS_LINEAS" (
                    "ID_LINEA", "ID_CLIENTE", "ID_RECIBO", "CONCEPTO", "ID_MATRICULA",
                    "CANTIDAD", "PRECIO_UNITARIO", "DESCUENTO_LINEA", "IVA_PORCENTAJE", "SUBTOTAL"
                ) VALUES (
                    'LIN_' || substr(md5(random()::text), 1, 10), p_id_cliente, v_id_recibo,
                    'Dto. hermanos (' || COALESCE(r_alumno."DTO_HERMANOS_PORCENTAJE", 0)::text || '%)', NULL,
                    1, -v_dto_euros, 0, 0, -v_dto_euros
                );
                v_tiene_lineas := true;
            END IF;

            IF v_ajuste_manual <> 0 THEN
                INSERT INTO public."VENTAS_LINEAS" (
                    "ID_LINEA", "ID_CLIENTE", "ID_RECIBO", "CONCEPTO", "ID_MATRICULA",
                    "CANTIDAD", "PRECIO_UNITARIO", "DESCUENTO_LINEA", "IVA_PORCENTAJE", "SUBTOTAL"
                ) VALUES (
                    'LIN_' || substr(md5(random()::text), 1, 10), p_id_cliente, v_id_recibo,
                    'Ajuste: ' || COALESCE(r_alumno."MOTIVO_AJUSTE", 'Sin especificar'), NULL,
                    1, v_ajuste_manual, 0, 0, v_ajuste_manual
                );
                v_tiene_lineas := true;
            END IF;

            SELECT
                COALESCE(SUM(vl."SUBTOTAL"), 0),
                COALESCE(SUM(
                    CASE
                        WHEN COALESCE(vl."IVA_PORCENTAJE", 0) > 0 THEN
                            ROUND(vl."CANTIDAD" * vl."PRECIO_UNITARIO" * (vl."IVA_PORCENTAJE" / 100.0), 2)
                        ELSE 0
                    END
                ), 0),
                COALESCE(SUM(vl."CANTIDAD" * vl."PRECIO_UNITARIO"), 0)
            INTO v_total_doc, v_suma_iva, v_total_base
            FROM public."VENTAS_LINEAS" vl
            WHERE vl."ID_RECIBO" = v_id_recibo;

            INSERT INTO public."RECIBOS_MENSUALES" (
                "ID_RECIBO", "ID_CLIENTE", "ID_ALUMNO", "ID_CENTRO", "ID_CURSO",
                "RECEPTOR_NOMBRE", "CIF_DNI", "DIRECCION", "MAIL", "TLF", "METODO_PAGO",
                "MES_PERIODO", "FECHA", "TIPO_DOC", "ESTADO_PAGO",
                "TOTAL_BASE", "DESCUENTO", "TOTAL_IVA", "TOTAL_DOC"
            ) VALUES (
                v_id_recibo, p_id_cliente, r_alumno."ID_ALUMNO", p_id_centro, p_id_curso,
                v_receptor, r_alumno."DNI", v_direccion_completa, r_alumno."MAIL",
                r_alumno."TLF_COMUNICACION", r_alumno."METODO_PAGO",
                p_mes_periodo, CURRENT_DATE, 'Recibo', 'Borrador',
                v_total_base, v_dto_euros, v_suma_iva, ROUND(v_total_doc, 2)
            );

            v_contador_recibos := v_contador_recibos + 1;

            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'concepto', vl."CONCEPTO",
                        'cantidad', vl."CANTIDAD",
                        'precio_unitario', vl."PRECIO_UNITARIO",
                        'iva_porcentaje', vl."IVA_PORCENTAJE",
                        'subtotal', vl."SUBTOTAL",
                        'id_matricula', vl."ID_MATRICULA"
                    )
                    ORDER BY vl."CONCEPTO"
                ),
                '[]'::jsonb
            )
            INTO v_lineas_snapshot
            FROM public."VENTAS_LINEAS" vl
            WHERE vl."ID_RECIBO" = v_id_recibo;

            INSERT INTO public."REMESA_PROCESO_ALUMNO" (
                "ID_REMESA",
                "ID_ALUMNO",
                "ID_RECIBO",
                "ID_CLIENTE",
                "ID_CENTRO",
                "ID_CURSO",
                "MES_PERIODO",
                "AJUSTE_EUR",
                "MOTIVO_AJUSTE",
                "CARGOS_SNAPSHOT",
                "LINEAS_SNAPSHOT",
                "ESTADO"
            ) VALUES (
                v_id_remesa,
                r_alumno."ID_ALUMNO",
                v_id_recibo,
                p_id_cliente,
                p_id_centro,
                p_id_curso,
                p_mes_periodo,
                CASE WHEN v_ajuste_manual <> 0 THEN v_ajuste_manual ELSE NULL END,
                CASE WHEN v_ajuste_manual <> 0 THEN r_alumno."MOTIVO_AJUSTE" ELSE NULL END,
                v_cargos_snapshot,
                v_lineas_snapshot,
                'recibo_ok'
            )
            ON CONFLICT ("ID_REMESA", "ID_ALUMNO") DO UPDATE SET
                "ID_RECIBO" = EXCLUDED."ID_RECIBO",
                "AJUSTE_EUR" = EXCLUDED."AJUSTE_EUR",
                "MOTIVO_AJUSTE" = EXCLUDED."MOTIVO_AJUSTE",
                "CARGOS_SNAPSHOT" = EXCLUDED."CARGOS_SNAPSHOT",
                "LINEAS_SNAPSHOT" = EXCLUDED."LINEAS_SNAPSHOT",
                "ESTADO" = EXCLUDED."ESTADO";

            IF v_ajuste_manual <> 0 THEN
                INSERT INTO public."AVISOS_INTERNOS" (
                    "ID_CLIENTE",
                    "ID_CENTRO",
                    "ID_CURSO",
                    "ID_ALUMNO",
                    "ID_REMESA",
                    "ID_RECIBO",
                    "TIPO",
                    "MENSAJE",
                    "LEIDO",
                    "FECHA"
                ) VALUES (
                    p_id_cliente,
                    p_id_centro,
                    p_id_curso,
                    r_alumno."ID_ALUMNO",
                    v_id_remesa,
                    v_id_recibo,
                    'Ajuste manual procesado',
                    'Cierre mensual ' || p_mes_periodo || ': ajuste manual de '
                        || v_ajuste_manual || '€ procesado para '
                        || COALESCE(r_alumno."NOMBRE_ALUMNO", 'alumno')
                        || ' (recibo ' || v_id_recibo || '). Motivo: '
                        || COALESCE(r_alumno."MOTIVO_AJUSTE", 'Sin especificar') || '.',
                    false,
                    NOW()
                );
            END IF;

            FOR r_cargo_aviso IN
                SELECT j.elem
                FROM jsonb_array_elements(v_cargos_snapshot) AS j(elem)
            LOOP
                INSERT INTO public."AVISOS_INTERNOS" (
                    "ID_CLIENTE",
                    "ID_CENTRO",
                    "ID_CURSO",
                    "ID_ALUMNO",
                    "ID_REMESA",
                    "ID_RECIBO",
                    "TIPO",
                    "MENSAJE",
                    "LEIDO",
                    "FECHA"
                ) VALUES (
                    p_id_cliente,
                    p_id_centro,
                    p_id_curso,
                    r_alumno."ID_ALUMNO",
                    v_id_remesa,
                    v_id_recibo,
                    'Cargo extra procesado',
                    'Cierre mensual ' || p_mes_periodo || ': cargo «'
                        || COALESCE(r_cargo_aviso.elem->>'concepto', 'Cargo extra')
                        || '» facturado para '
                        || COALESCE(r_alumno."NOMBRE_ALUMNO", 'alumno')
                        || ' (recibo ' || v_id_recibo
                        || ', cargo ' || COALESCE(r_cargo_aviso.elem->>'id_cargo', '') || ').',
                    false,
                    NOW()
                );
            END LOOP;

            UPDATE public."ALUMNOS"
            SET "AJUSTE_MANUAL_EUR" = 0,
                "MOTIVO_AJUSTE" = NULL
            WHERE "ID_ALUMNO" = r_alumno."ID_ALUMNO";

            PERFORM public.recalcular_total_mensual(r_alumno."ID_ALUMNO");

        END IF;

    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'id_remesa', v_id_remesa,
        'recibos_generados', v_contador_recibos,
        'mensaje', 'Lote de centro completado con éxito.'
    );
END;
$function$;
