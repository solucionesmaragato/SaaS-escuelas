-- Profesor: ver y marcar como leídos sus avisos URGENTE de fichaje (entrada/salida/tarde).

DROP POLICY IF EXISTS "Profesor_Select_Avisos_Fichaje" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Select_Avisos_Fichaje"
  ON public."AVISOS_INTERNOS"
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND "TIPO" = 'URGENTE'
    AND "MENSAJE" LIKE '[FICHAJE_ALERT:%'
  );

DROP POLICY IF EXISTS "Profesor_Update_Avisos_Fichaje" ON public."AVISOS_INTERNOS";
CREATE POLICY "Profesor_Update_Avisos_Fichaje"
  ON public."AVISOS_INTERNOS"
  FOR UPDATE
  TO authenticated
  USING (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND "TIPO" = 'URGENTE'
    AND "MENSAJE" LIKE '[FICHAJE_ALERT:%'
  )
  WITH CHECK (
    public.get_my_rol() = 'PROFESOR'
    AND "ID_CLIENTE" = public.get_my_tenant_id()
    AND "ID_PROFESOR" = public.get_my_teacher_id()
    AND "TIPO" = 'URGENTE'
    AND "MENSAJE" LIKE '[FICHAJE_ALERT:%'
  );
