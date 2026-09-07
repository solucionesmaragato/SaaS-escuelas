-- Documentos legales: un aviso por ID_DOCUMENTO, sincronizado en cambios relevantes y caducidad (cron).
-- Tipos: Documento pendiente de firma | Documento firmado por profesor | Documento nuevo | Documento próximo a caducar

ALTER TABLE public."AVISOS_INTERNOS"
  ADD COLUMN IF NOT EXISTS "ID_DOCUMENTO" text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_aviso_documento
  ON public."AVISOS_INTERNOS" ("ID_DOCUMENTO")
  WHERE "ID_DOCUMENTO" IS NOT NULL;

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

-- Admin/secretaría no ven avisos solo para profesor (documento sin firma).
DROP POLICY IF EXISTS "Admin_Todo_Avisos" ON public."AVISOS_INTERNOS";

CREATE POLICY "Admin_Todo_Avisos"
  ON public."AVISOS_INTERNOS"
  FOR ALL
  TO authenticated
  USING (
    public.get_my_rol() = 'ADMIN'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND COALESCE("TIPO", '') <> 'Documento nuevo'
  )
  WITH CHECK (
    public.get_my_rol() = 'ADMIN'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND COALESCE("TIPO", '') <> 'Documento nuevo'
  );

DROP POLICY IF EXISTS "Secretaria_Select_Avisos" ON public."AVISOS_INTERNOS";

CREATE POLICY "Secretaria_Select_Avisos"
  ON public."AVISOS_INTERNOS"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'SECRETARIA'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_CENTRO" = public.get_my_center_id()
    AND COALESCE("TIPO", '') <> 'Documento nuevo'
  );

DROP POLICY IF EXISTS "Secretaria_Update_Avisos" ON public."AVISOS_INTERNOS";

CREATE POLICY "Secretaria_Update_Avisos"
  ON public."AVISOS_INTERNOS"
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_rol() = 'SECRETARIA'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_CENTRO" = public.get_my_center_id()
    AND COALESCE("TIPO", '') <> 'Documento nuevo'
  )
  WITH CHECK (
    public.get_my_rol() = 'SECRETARIA'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_CENTRO" = public.get_my_center_id()
    AND COALESCE("TIPO", '') <> 'Documento nuevo'
  );

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
  ELSIF COALESCE(v_doc."REQUIERE_FIRMA", false) = true AND v_estado = 'pendiente' THEN
    v_tipo := 'Documento pendiente de firma';
    v_mensaje := 'Documento «' || COALESCE(v_doc."CATEGORIA", 'Documento legal')
      || '» de ' || v_nombre_profesor || ' pendiente de firma.';
  ELSIF COALESCE(v_doc."REQUIERE_FIRMA", false) = false OR v_estado = 'no requerida' THEN
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

CREATE OR REPLACE FUNCTION public.tg_aviso_documento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  PERFORM public.fn_sync_aviso_documento(NEW."ID_DOCUMENTO");
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_aviso_documento ON public."DOCUMENTOS_LEGALES_V2";

CREATE TRIGGER tr_aviso_documento
  AFTER INSERT OR UPDATE OF
    "ESTADO_FIRMA",
    "URL_FIRMADO",
    "REQUIERE_FIRMA",
    "FECHA_CADUCIDAD",
    "CATEGORIA",
    "ID_PROFESOR",
    "ID_CENTRO"
  ON public."DOCUMENTOS_LEGALES_V2"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_documento();

CREATE OR REPLACE FUNCTION public.tg_aviso_documento_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  DELETE FROM public."AVISOS_INTERNOS"
  WHERE "ID_DOCUMENTO" = OLD."ID_DOCUMENTO";
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS tr_aviso_documento_delete ON public."DOCUMENTOS_LEGALES_V2";

CREATE TRIGGER tr_aviso_documento_delete
  AFTER DELETE ON public."DOCUMENTOS_LEGALES_V2"
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_aviso_documento_delete();

-- Mantener metadatos de firma; el aviso lo gestiona fn_sync_aviso_documento.
CREATE OR REPLACE FUNCTION public.tg_documentos_auto_firma()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW."URL_FIRMADO" IS NOT NULL
     AND (OLD."URL_FIRMADO" IS NULL OR OLD."URL_FIRMADO" IS DISTINCT FROM NEW."URL_FIRMADO") THEN
    NEW."ESTADO_FIRMA" := 'Firmado';
    NEW."FECHA_FIRMA" := now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "Profesor_Select_Avisos_Documento" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Select_Avisos_Documento"
  ON public."AVISOS_INTERNOS"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND "TIPO" IN (
      'Documento pendiente de firma',
      'Documento nuevo',
      'Documento próximo a caducar'
    )
  );

DROP POLICY IF EXISTS "Profesor_Update_Avisos_Documento" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Update_Avisos_Documento"
  ON public."AVISOS_INTERNOS"
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND "TIPO" IN (
      'Documento pendiente de firma',
      'Documento nuevo',
      'Documento próximo a caducar'
    )
  )
  WITH CHECK (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND "TIPO" IN (
      'Documento pendiente de firma',
      'Documento nuevo',
      'Documento próximo a caducar'
    )
  );

CREATE OR REPLACE FUNCTION public.sys_avisos_documentos_caducidad()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT d."ID_DOCUMENTO"
    FROM public."DOCUMENTOS_LEGALES_V2" d
    WHERE d."FECHA_CADUCIDAD" IS NOT NULL
      AND d."FECHA_CADUCIDAD" <= (current_date + 30)
  LOOP
    PERFORM public.fn_sync_aviso_documento(v_row."ID_DOCUMENTO");
  END LOOP;
END;
$function$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'job_avisos_documentos_caducidad';

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'job_avisos_documentos_caducidad',
    '0 8 * * *',
    'SELECT public.sys_avisos_documentos_caducidad()'
  );
END;
$$;

-- Sincronizar documentos existentes (pendientes, nuevos, caducidad próxima).
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

-- Avisos legacy sin ID_DOCUMENTO (trigger antiguo).
DELETE FROM public."AVISOS_INTERNOS"
WHERE "TIPO" = 'Documento firmado por profesor'
  AND "ID_DOCUMENTO" IS NULL;
