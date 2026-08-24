-- PROFESOR: SECRETARIA/DIRECCION ven profesores de su centro o que imparten allí (criterio 1-C).
-- ADMIN/MASTER/PROFESOR: sin cambio. Mutaciones: sin cambio.

CREATE OR REPLACE FUNCTION public.profesor_imparte_en_centro(p_id_profesor text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    p_id_profesor IS NOT NULL
    AND trim(p_id_profesor) <> ''
    AND (
      EXISTS (
        SELECT 1
        FROM public."HORARIOS_MATRICULAS" hm
        WHERE hm."ID_PROFESOR" = p_id_profesor
          AND hm."ID_CLIENTE" = public.get_my_tenant_id()
          AND hm."ID_CENTRO" = public.get_my_center_id()
          AND trim(coalesce(hm."ESTADO", '')) = 'Activo'
      )
      OR EXISTS (
        SELECT 1
        FROM public."GRUPOS_HORARIOS" gh
        WHERE gh."ID_PROFESOR" = p_id_profesor
          AND gh."ID_CLIENTE" = public.get_my_tenant_id()
          AND gh."ID_CENTRO" = public.get_my_center_id()
      )
      OR EXISTS (
        SELECT 1
        FROM public."SESIONES" s
        WHERE s."ID_PROFESOR" = p_id_profesor
          AND s."ID_CLIENTE" = public.get_my_tenant_id()
          AND s."ID_CENTRO" = public.get_my_center_id()
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.profesor_imparte_en_centro(text) TO authenticated;

DROP POLICY IF EXISTS "Profesor_Select_Policy" ON public."PROFESOR";
CREATE POLICY "Profesor_Select_Policy"
  ON public."PROFESOR"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'MASTER'
    OR (
      public.get_my_rol() = 'ADMIN'
      AND "ID_CLIENTE" = public.get_my_tenant_id()
    )
    OR (
      public.get_my_rol() = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text])
      AND "ID_CLIENTE" = public.get_my_tenant_id()
      AND (
        "ID_CENTRO" = public.get_my_center_id()
        OR public.profesor_imparte_en_centro("ID_PROFESOR")
      )
    )
    OR (
      public.get_my_rol() = 'PROFESOR'
      AND "ID_PROFESOR" = (
        SELECT p."ID_PROFESOR"
        FROM public."PERFILES" p
        WHERE p."ID" = auth.uid()
          AND p."ID_CLIENTE" = public.get_my_tenant_id()
        LIMIT 1
      )
    )
  );
