-- Fix: sincronizar ESTADO_FIRMA en UPDATE de REQUIERE_FIRMA y corregir clasificación de avisos.

CREATE OR REPLACE FUNCTION public.tg_documentos_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_estado text;
BEGIN
  v_estado := lower(trim(COALESCE(NEW."ESTADO_FIRMA", '')));

  IF NEW."REQUIERE_FIRMA" IS DISTINCT FROM OLD."REQUIERE_FIRMA" THEN
    IF COALESCE(NEW."REQUIERE_FIRMA", false) = true THEN
      IF v_estado <> 'firmado' THEN
        NEW."ESTADO_FIRMA" := 'Pendiente';
      END IF;
    ELSIF v_estado <> 'firmado' THEN
      NEW."ESTADO_FIRMA" := 'No Requerida';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_documentos_before_update ON public."DOCUMENTOS_LEGALES_V2";

CREATE TRIGGER tr_documentos_before_update
  BEFORE UPDATE OF "REQUIERE_FIRMA", "FECHA_CADUCIDAD"
  ON public."DOCUMENTOS_LEGALES_V2"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documentos_before_update();

CREATE OR REPLACE FUNCTION public.fn_sync_aviso_documento(p_id_documento text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_doc RECORD;
  v_nombre_profesor text;
  v_mensaje text;
  v_tipo text;
  v_id_aviso uuid;
  v_existente_leido boolean;
  v_estado text;
  v_caducidad_activa boolean;
BEGIN
  IF p_id_documento IS NULL OR trim(p_id_documento) = '' THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_doc
  FROM public."DOCUMENTOS_LEGALES_V2"
  WHERE "ID_DOCUMENTO" = p_id_documento;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT a."ID_AVISO", a."LEIDO"
  INTO v_id_aviso, v_existente_leido
  FROM public."AVISOS_INTERNOS" a
  WHERE a."ID_DOCUMENTO" = p_id_documento
  LIMIT 1;

  v_estado := lower(trim(COALESCE(v_doc."ESTADO_FIRMA", '')));

  IF v_estado = 'firmado' AND COALESCE(v_existente_leido, false) = true THEN
    RETURN;
  END IF;

  SELECT "NOMBRE_PROFESOR"
  INTO v_nombre_profesor
  FROM public."PROFESOR"
  WHERE "ID_PROFESOR" = v_doc."ID_PROFESOR"
    AND "ID_CLIENTE" = v_doc."ID_CLIENTE"
  LIMIT 1;

  v_nombre_profesor := COALESCE(v_nombre_profesor, v_doc."ID_PROFESOR", 'Profesor');

  v_caducidad_activa := v_doc."FECHA_CADUCIDAD" IS NOT NULL
    AND v_doc."FECHA_CADUCIDAD" <= (current_date + 30)
    AND (
      v_estado <> 'firmado'
      OR COALESCE(v_existente_leido, false) = false
    );

  IF v_estado = 'firmado' THEN
    v_tipo := 'Documento firmado por profesor';
    v_mensaje := 'El profesor ' || v_nombre_profesor || ' ha firmado el documento «'
      || COALESCE(v_doc."CATEGORIA", 'Documento legal') || '».';
  ELSIF v_caducidad_activa AND v_estado <> 'firmado' THEN
    v_tipo := 'Documento próximo a caducar';
    v_mensaje := 'Documento «' || COALESCE(v_doc."CATEGORIA", 'Documento legal')
      || '» de ' || v_nombre_profesor || ' caduca el '
      || to_char(v_doc."FECHA_CADUCIDAD", 'DD/MM/YYYY') || '.';
  ELSIF COALESCE(v_doc."REQUIERE_FIRMA", false) = true AND v_estado <> 'firmado' THEN
    v_tipo := 'Documento pendiente de firma';
    v_mensaje := 'Documento «' || COALESCE(v_doc."CATEGORIA", 'Documento legal')
      || '» de ' || v_nombre_profesor || ' pendiente de firma.';
  ELSIF COALESCE(v_doc."REQUIERE_FIRMA", false) = false THEN
    v_tipo := 'Documento nuevo';
    v_mensaje := 'Nuevo documento «' || COALESCE(v_doc."CATEGORIA", 'Documento legal')
      || '» disponible para consulta.';
  ELSE
    IF v_id_aviso IS NOT NULL THEN
      DELETE FROM public."AVISOS_INTERNOS" WHERE "ID_AVISO" = v_id_aviso;
    END IF;
    RETURN;
  END IF;

  IF v_id_aviso IS NOT NULL THEN
    UPDATE public."AVISOS_INTERNOS"
    SET
      "ID_CLIENTE" = v_doc."ID_CLIENTE",
      "ID_CENTRO" = v_doc."ID_CENTRO",
      "ID_PROFESOR" = v_doc."ID_PROFESOR",
      "TIPO" = v_tipo,
      "MENSAJE" = v_mensaje,
      "LEIDO" = false,
      "FECHA" = now()
    WHERE "ID_AVISO" = v_id_aviso;

    RETURN;
  END IF;

  INSERT INTO public."AVISOS_INTERNOS" (
    "ID_CLIENTE",
    "ID_CENTRO",
    "ID_PROFESOR",
    "ID_DOCUMENTO",
    "TIPO",
    "MENSAJE",
    "LEIDO"
  ) VALUES (
    v_doc."ID_CLIENTE",
    v_doc."ID_CENTRO",
    v_doc."ID_PROFESOR",
    p_id_documento,
    v_tipo,
    v_mensaje,
    false
  );
END;
$function$;

-- Corregir filas legacy con REQUIERE_FIRMA=true y ESTADO_FIRMA desincronizado.
UPDATE public."DOCUMENTOS_LEGALES_V2"
SET "ESTADO_FIRMA" = 'Pendiente'
WHERE COALESCE("REQUIERE_FIRMA", false) = true
  AND lower(trim(COALESCE("ESTADO_FIRMA", ''))) NOT IN ('firmado', 'pendiente');

DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT "ID_DOCUMENTO"
    FROM public."DOCUMENTOS_LEGALES_V2"
    WHERE lower(trim(COALESCE("ESTADO_FIRMA", ''))) <> 'firmado'
  LOOP
    PERFORM public.fn_sync_aviso_documento(v_row."ID_DOCUMENTO");
  END LOOP;
END;
$$;
