-- Bucket público para fotos de alumnos (JPEG comprimido en cliente).
-- Lectura pública vía URL; escritura solo staff con permiso de alumnos.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'alumnos-fotos',
  'alumnos-fotos',
  true,
  524288,
  ARRAY['image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Storage_Select_Policy" ON storage.objects;
CREATE POLICY "Storage_Select_Policy"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id NOT IN ('archivos-profesor', 'alumnos-fotos')
    AND (storage.foldername(name))[1] = get_my_tenant_id()
  );

DROP POLICY IF EXISTS "Storage_Insert_Policy" ON storage.objects;
CREATE POLICY "Storage_Insert_Policy"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id NOT IN ('archivos-profesor', 'alumnos-fotos')
    AND (storage.foldername(name))[1] = get_my_tenant_id()
  );

DROP POLICY IF EXISTS "Storage_Delete_Policy" ON storage.objects;
CREATE POLICY "Storage_Delete_Policy"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id NOT IN ('archivos-profesor', 'alumnos-fotos')
    AND (storage.foldername(name))[1] = get_my_tenant_id()
    AND get_my_rol() = ANY (ARRAY['MASTER'::text, 'ADMIN'::text, 'SECRETARIA'::text, 'DIRECCION'::text])
  );

DROP POLICY IF EXISTS "AlumnosFotos_Master_All" ON storage.objects;
CREATE POLICY "AlumnosFotos_Master_All"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'alumnos-fotos'
    AND get_my_rol() = 'MASTER'
  )
  WITH CHECK (
    bucket_id = 'alumnos-fotos'
    AND get_my_rol() = 'MASTER'
  );

DROP POLICY IF EXISTS "AlumnosFotos_Staff_Write" ON storage.objects;
CREATE POLICY "AlumnosFotos_Staff_Write"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'alumnos-fotos'
    AND get_my_rol() = ANY (ARRAY['ADMIN'::text, 'SECRETARIA'::text, 'DIRECCION'::text])
    AND (storage.foldername(name))[1] = get_my_tenant_id()
  )
  WITH CHECK (
    bucket_id = 'alumnos-fotos'
    AND get_my_rol() = ANY (ARRAY['ADMIN'::text, 'SECRETARIA'::text, 'DIRECCION'::text])
    AND (storage.foldername(name))[1] = get_my_tenant_id()
  );
