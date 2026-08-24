-- Avisos internos: RLS por rol (SECRETARIA centro, ADMIN cliente, MASTER todo) y vista invoker.

DROP POLICY IF EXISTS "Admin_Todo_Avisos" ON public."AVISOS_INTERNOS";
DROP POLICY IF EXISTS "Master_Todo_Avisos" ON public."AVISOS_INTERNOS";

CREATE POLICY "Master_Todo_Avisos"
  ON public."AVISOS_INTERNOS"
  FOR ALL
  USING (public.get_my_rol() = 'MASTER');

CREATE POLICY "Admin_Todo_Avisos"
  ON public."AVISOS_INTERNOS"
  FOR ALL
  USING (
    public.get_my_rol() = 'ADMIN'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
  )
  WITH CHECK ("ID_CLIENTE" = public.get_my_tenant_id());

CREATE POLICY "Secretaria_Select_Avisos"
  ON public."AVISOS_INTERNOS"
  FOR SELECT
  USING (
    public.get_my_rol() = 'SECRETARIA'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_CENTRO" = public.get_my_center_id()
  );

CREATE POLICY "Secretaria_Update_Avisos"
  ON public."AVISOS_INTERNOS"
  FOR UPDATE
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
  a."ID_ESPECIALIDAD",
  a."TIPO",
  a."MENSAJE",
  a."FECHA",
  a."LEIDO",
  l."NOMBRE" AS "NOMBRE_LEAD"
FROM public."AVISOS_INTERNOS" a
LEFT JOIN public."LEADS" l ON a."ID_ALUMNO" = l."ID_LEAD";

GRANT SELECT ON public."VISTA_AVISOS_INTERNOS" TO authenticated;
