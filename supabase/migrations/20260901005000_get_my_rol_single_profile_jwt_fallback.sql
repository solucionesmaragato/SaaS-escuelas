-- get_my_rol / get_my_teacher_id:
-- JWT current_perfil_id si viene y es numérico.
-- Si no viene: un solo PERFILES de ese uid + tenant del JWT.
-- Sin tenant en JWT, o varios perfiles, o perfil_id basura → NULL (fail-closed).

CREATE OR REPLACE FUNCTION public.get_my_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p."ROL"::text
  FROM public."PERFILES" p
  WHERE p."ID" = auth.uid()
    AND p."ID_CLIENTE" IS NOT DISTINCT FROM public.get_my_tenant_id()
    AND (
      CASE
        WHEN nullif(trim(coalesce(
          auth.jwt() -> 'user_metadata' ->> 'current_perfil_id',
          ''
        )), '') ~ '^[0-9]+$'
        THEN p."ID_PERFIL" = (
          nullif(trim(coalesce(
            auth.jwt() -> 'user_metadata' ->> 'current_perfil_id',
            ''
          )), '')
        )::bigint
        WHEN nullif(trim(coalesce(
          auth.jwt() -> 'user_metadata' ->> 'current_perfil_id',
          ''
        )), '') IS NULL
        THEN (
          SELECT count(*)::int
          FROM public."PERFILES" p2
          WHERE p2."ID" = auth.uid()
            AND p2."ID_CLIENTE" IS NOT DISTINCT FROM public.get_my_tenant_id()
        ) = 1
        ELSE false
      END
    )
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_teacher_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT nullif(trim(coalesce(p."ID_PROFESOR", '')), '')
  FROM public."PERFILES" p
  WHERE p."ID" = auth.uid()
    AND p."ID_CLIENTE" IS NOT DISTINCT FROM public.get_my_tenant_id()
    AND (
      CASE
        WHEN nullif(trim(coalesce(
          auth.jwt() -> 'user_metadata' ->> 'current_perfil_id',
          ''
        )), '') ~ '^[0-9]+$'
        THEN p."ID_PERFIL" = (
          nullif(trim(coalesce(
            auth.jwt() -> 'user_metadata' ->> 'current_perfil_id',
            ''
          )), '')
        )::bigint
        WHEN nullif(trim(coalesce(
          auth.jwt() -> 'user_metadata' ->> 'current_perfil_id',
          ''
        )), '') IS NULL
        THEN (
          SELECT count(*)::int
          FROM public."PERFILES" p2
          WHERE p2."ID" = auth.uid()
            AND p2."ID_CLIENTE" IS NOT DISTINCT FROM public.get_my_tenant_id()
        ) = 1
        ELSE false
      END
    )
  LIMIT 1;
$function$;

NOTIFY pgrst, 'reload schema';
