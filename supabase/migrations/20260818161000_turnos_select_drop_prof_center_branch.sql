-- TURNOS_PROFESORES: quitar rama PROFESOR+ID_CENTRO de Turnos_Select_Policy.
-- El profesor sigue viendo sus turnos vía Turnos_Prof_Select (turnos_prof_puede_ver).
-- No modifica Turnos_Prof_Select, turnos_prof_puede_ver ni get_my_*.

DROP POLICY IF EXISTS "Turnos_Select_Policy" ON public."TURNOS_PROFESORES";
CREATE POLICY "Turnos_Select_Policy"
  ON public."TURNOS_PROFESORES"
  FOR SELECT
  TO authenticated
  USING (
    (get_my_rol() = 'MASTER'::text)
    OR (
      get_my_rol() = 'ADMIN'::text
      AND "ID_CLIENTE" = get_my_tenant_id()
    )
    OR (
      get_my_rol() = ANY (ARRAY['SECRETARIA'::text, 'DIRECCION'::text])
      AND "ID_CENTRO" = get_my_center_id()
    )
  );
