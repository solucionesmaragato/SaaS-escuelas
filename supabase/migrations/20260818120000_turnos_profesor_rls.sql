-- TURNOS_PROFESORES: RLS profesor sin depender de ID_CENTRO fijo en perfil.
-- Funciones turnos_prof_*: solo políticas de TURNOS_PROFESORES.
-- No modifica get_my_tenant_id, get_my_center_id, get_my_rol ni get_my_teacher_id.
-- Staff (SECRETARIA/DIRECCION): Turnos_*_Policy existentes sin cambios.

CREATE OR REPLACE FUNCTION public.turnos_prof_es_mio(p_id_profesor text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    p_id_profesor IS NOT NULL
    AND trim(p_id_profesor) <> ''
    AND trim(p_id_profesor) = public.get_my_teacher_id();
$$;

CREATE OR REPLACE FUNCTION public.turnos_prof_puede_ver(
  p_id_cliente text,
  p_id_profesor text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT
    public.get_my_rol() = 'PROFESOR'
    AND p_id_cliente = public.get_my_tenant_id()
    AND public.turnos_prof_es_mio(p_id_profesor);
$$;

DROP POLICY IF EXISTS "Turnos_Prof_Select" ON public."TURNOS_PROFESORES";
CREATE POLICY "Turnos_Prof_Select"
  ON public."TURNOS_PROFESORES"
  FOR SELECT
  TO authenticated
  USING (
    public.turnos_prof_puede_ver("ID_CLIENTE", "ID_PROFESOR")
  );
