-- Profesor: solo lectura en TURNOS_PROFESORES (sin UPDATE).
-- Quita la política dedicada y el acceso PROFESOR de Turnos_Update_Policy.

DROP POLICY IF EXISTS "Turnos_Prof_Update" ON public."TURNOS_PROFESORES";

DROP FUNCTION IF EXISTS public.turnos_prof_puede_escribir(text, text);

DROP POLICY IF EXISTS "Turnos_Update_Policy" ON public."TURNOS_PROFESORES";
CREATE POLICY "Turnos_Update_Policy"
  ON public."TURNOS_PROFESORES"
  FOR UPDATE
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
  )
  WITH CHECK (
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
