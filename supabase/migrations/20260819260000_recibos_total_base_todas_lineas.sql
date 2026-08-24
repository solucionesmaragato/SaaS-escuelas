-- TOTAL_BASE = suma de (CANTIDAD × PRECIO_UNITARIO) de todas las VENTAS_LINEAS
-- (incluye dto. hermanos y ajuste). IVA y TOTAL_DOC sin cambios.

CREATE OR REPLACE FUNCTION public.recalcular_recibo_desde_lineas(p_id_recibo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_estado text;
    v_total_doc numeric;
    v_suma_iva numeric;
    v_total_base numeric;
    v_dto_euros numeric;
BEGIN
    SELECT LOWER(TRIM(COALESCE("ESTADO_PAGO", '')))
    INTO v_estado
    FROM public."RECIBOS_MENSUALES"
    WHERE "ID_RECIBO" = p_id_recibo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Recibo no encontrado: %', p_id_recibo;
    END IF;

    IF v_estado <> 'borrador' THEN
        RAISE EXCEPTION 'Solo se pueden recalcular recibos en estado Borrador.';
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
    WHERE vl."ID_RECIBO" = p_id_recibo;

    SELECT COALESCE(ABS(SUM(vl."SUBTOTAL")), 0)
    INTO v_dto_euros
    FROM public."VENTAS_LINEAS" vl
    WHERE vl."ID_RECIBO" = p_id_recibo
      AND vl."CONCEPTO" LIKE 'Dto. hermanos%';

    PERFORM set_config('harmony.allow_recibo_totals_write', 'on', true);

    UPDATE public."RECIBOS_MENSUALES"
    SET
        "TOTAL_BASE" = v_total_base,
        "DESCUENTO" = v_dto_euros,
        "TOTAL_IVA" = v_suma_iva,
        "TOTAL_DOC" = ROUND(v_total_doc, 2)
    WHERE "ID_RECIBO" = p_id_recibo;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalcular_recibo_desde_lineas(text) TO authenticated;

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

    v_aviso_tipo text;
    v_aviso_mensaje text;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public."RECIBOS_MENSUALES"
        WHERE "ID_CLIENTE" = p_id_cliente
          AND "ID_CENTRO" = p_id_centro
          AND "MES_PERIODO" = p_mes_periodo
          AND "ID_CURSO" = p_id_curso
    ) THEN
        RAISE EXCEPTION 'RESTRICT_VETO: Los borradores para el período "%" ya han sido generados en este centro para el curso actual.', p_mes_periodo;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public."CONTROL_REMESAS"
        WHERE "ID_CLIENTE" = p_id_cliente
          AND "MES_PERIODO" = p_mes_periodo
          AND "ID_CURSO" = p_id_curso
          AND "ID_CENTRO" = p_id_centro
    ) THEN
        INSERT INTO public."CONTROL_REMESAS" ("ID_REMESA", "ID_CLIENTE", "MES_PERIODO", "ESTADO", "ID_CURSO", "ID_CENTRO")
        VALUES ('REM_' || lower(substr(md5(random()::text), 1, 12)), p_id_cliente, p_mes_periodo, 'Generada', p_id_curso, p_id_centro);
    END IF;

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

        v_receptor := COALESCE(r_alumno."NOMBRE_PADRE", r_alumno."NOMBRE_MADRE", r_alumno."NOMBRE_ALUMNO", 'Receptor Desconocido');
        v_direccion_completa := COALESCE(r_alumno."DIRECCION", '') || CASE WHEN r_alumno."CP" IS NOT NULL THEN ' | ' || r_alumno."CP" ELSE '' END;

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
                r_cargo."CANTIDAD"::bigint, r_cargo."PRECIO_UNITARIO", 0, r_cargo."PORCENTAJE_IVA", ROUND(v_linea_base + v_linea_iva, 2)
            );

            v_tiene_lineas := true;

            UPDATE public."CARGOS_EXTRA"
            SET "ESTADO" = 'Procesado',
                "ID_RECIBO_VINCULADO" = v_id_recibo
            WHERE "ID_CARGO" = r_cargo."ID_CARGO";
        END LOOP;

        IF v_tiene_lineas OR v_ajuste_manual <> 0 THEN

            v_dto_euros := ROUND(v_suma_base_formacion * (COALESCE(r_alumno."DTO_HERMANOS_PORCENTAJE", 0) / 100.0), 2);

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
                v_receptor, r_alumno."DNI", v_direccion_completa, r_alumno."MAIL", r_alumno."TLF_COMUNICACION", r_alumno."METODO_PAGO",
                p_mes_periodo, CURRENT_DATE, 'Recibo', 'Borrador',
                v_total_base, v_dto_euros, v_suma_iva, ROUND(v_total_doc, 2)
            );

            v_contador_recibos := v_contador_recibos + 1;

            IF v_ajuste_manual <> 0 THEN
                v_aviso_tipo := 'ELIMINADO AJUSTE MANUAL DEL ' || UPPER(p_mes_periodo) || ' AL ALUMNO ' || UPPER(r_alumno."NOMBRE_ALUMNO");
                v_aviso_mensaje := '«Cierre Mensual: Se ha procesado y limpiado el ajuste manual de ' ||
                                   v_ajuste_manual || '€ (Motivo: ' || COALESCE(r_alumno."MOTIVO_AJUSTE", 'Sin especificar') ||
                                   ') para el alumno ' || r_alumno."NOMBRE_ALUMNO" || '.»';

                INSERT INTO public."AVISOS_INTERNOS" (
                    "ID_CLIENTE", "ID_CENTRO", "ID_CURSO", "ID_ALUMNO", "TIPO", "MENSAJE", "LEIDO", "FECHA"
                ) VALUES (
                    p_id_cliente, p_id_centro, p_id_curso, r_alumno."ID_ALUMNO", v_aviso_tipo, v_aviso_mensaje, false, NOW()
                );
            END IF;

            UPDATE public."ALUMNOS"
            SET "AJUSTE_MANUAL_EUR" = 0,
                "MOTIVO_AJUSTE" = NULL
            WHERE "ID_ALUMNO" = r_alumno."ID_ALUMNO";

            PERFORM public.recalcular_total_mensual(r_alumno."ID_ALUMNO");

        END IF;

    END LOOP;

    RETURN jsonb_build_object(
        'status', 'success',
        'recibos_generados', v_contador_recibos,
        'mensaje', 'Lote de centro completado con éxito.'
    );
END;
$function$;
