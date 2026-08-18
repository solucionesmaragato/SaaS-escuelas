-- get_my_teacher_id: align with active workspace (tenant + center from JWT metadata).
-- Fixes RLS on FICHAJES when a user has multiple PERFILES in the same school.
-- Previously LIMIT 1 without center preference could return a different ID_PROFESOR
-- than perfil.ID_PROFESOR on the frontend.

CREATE OR REPLACE FUNCTION public.get_my_teacher_id()
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET row_security TO 'off'
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT p."ID_PROFESOR"
      FROM public."PERFILES" p
      WHERE p."ID" = auth.uid()
        AND p."ID_CLIENTE" = public.get_my_tenant_id()
      ORDER BY
        CASE
          WHEN p."ID_CENTRO" IS NOT DISTINCT FROM public.get_my_center_id() THEN 0
          WHEN p."ID_CENTRO" IS NULL THEN 1
          ELSE 2
        END
      LIMIT 1
    ),
    (
      SELECT p."ID_PROFESOR"
      FROM public."PERFILES" p
      WHERE p."ID" = auth.uid()
      LIMIT 1
    )
  );
$function$;
