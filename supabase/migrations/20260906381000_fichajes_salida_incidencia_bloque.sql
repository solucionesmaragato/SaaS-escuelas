-- B: al crear aviso URGENTE de salida, anotar incidencia en la entrada del bloque
-- (ventana fn_fichaje_bloques_profesor; solo hacia adelante, sin tocar cron).

CREATE OR REPLACE FUNCTION public.tg_aviso_fichaje_anotar_incidencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sesion_bloque text;
  v_fecha_madrid date;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_entrada_id text;
BEGIN
  IF NEW."MENSAJE" IS NULL OR trim(NEW."MENSAJE") = '' THEN
    RETURN NEW;
  END IF;

  IF NEW."MENSAJE" LIKE '[FICHAJE_PAUSA_ALERT:%' AND NEW."ID_FICHAJE" IS NOT NULL THEN
    PERFORM public.fn_append_fichaje_nota_if_missing(
      NEW."ID_FICHAJE",
      '[Incidencia: Pausa prolongada sin clase]'
    );
    RETURN NEW;
  END IF;

  IF NEW."MENSAJE" LIKE '[FICHAJE_ALERT:%:salida]%' THEN
    v_sesion_bloque := substring(NEW."MENSAJE" FROM '\[FICHAJE_ALERT:([^:]+):salida\]');
    IF v_sesion_bloque IS NULL OR trim(v_sesion_bloque) = '' THEN
      RETURN NEW;
    END IF;

    SELECT s."FECHA_EXACTA"::date
    INTO v_fecha_madrid
    FROM public."SESIONES" s
    WHERE s."ID_SESION"::text = v_sesion_bloque
      AND s."ID_CLIENTE"::text = NEW."ID_CLIENTE"::text
      AND s."ID_PROFESOR"::text = NEW."ID_PROFESOR"::text
    LIMIT 1;

    IF v_fecha_madrid IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT bl.inicio_tz, bl.fin_tz
    INTO v_inicio, v_fin
    FROM public.fn_fichaje_bloques_profesor(
      NEW."ID_CLIENTE"::text,
      NEW."ID_PROFESOR"::text,
      v_fecha_madrid
    ) bl
    WHERE bl."ID_SESION_BLOQUE" = v_sesion_bloque
    LIMIT 1;

    IF v_inicio IS NULL OR v_fin IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT f."ID_FICHAJE"
    INTO v_entrada_id
    FROM public."FICHAJES" f
    WHERE f."ID_PROFESOR"::text = NEW."ID_PROFESOR"::text
      AND f."ID_CLIENTE"::text = NEW."ID_CLIENTE"::text
      AND COALESCE(f."ESTADO", '') <> 'Anulado por Corrección'
      AND trim(f."TIPO_MOVIMIENTO") IN ('Entrada', 'Fin de Pausa')
      AND f."FECHA_HORA"::timestamptz >= v_inicio - interval '15 minutes'
      AND f."FECHA_HORA"::timestamptz <= v_fin
    ORDER BY f."FECHA_HORA" ASC
    LIMIT 1;

    IF v_entrada_id IS NOT NULL THEN
      PERFORM public.fn_append_fichaje_nota_if_missing(
        v_entrada_id,
        '[Incidencia: No fichó salida del bloque]'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
