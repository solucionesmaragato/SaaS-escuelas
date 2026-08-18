-- Bucket privado archivos-profesor + RLS por tenant/profesor.
-- Recorta Storage_*_Policy globales para no aplicar a este bucket.
-- No modifica get_my_tenant_id, get_my_center_id, get_my_rol ni get_my_teacher_id.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'archivos-profesor',
  'archivos-profesor',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
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
    bucket_id <> 'archivos-profesor'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
  );

DROP POLICY IF EXISTS "Storage_Insert_Policy" ON storage.objects;
CREATE POLICY "Storage_Insert_Policy"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id <> 'archivos-profesor'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
  );

DROP POLICY IF EXISTS "Storage_Delete_Policy" ON storage.objects;
CREATE POLICY "Storage_Delete_Policy"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id <> 'archivos-profesor'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
    AND get_my_rol() = ANY (ARRAY['MASTER'::text, 'ADMIN'::text, 'SECRETARIA'::text, 'DIRECCION'::text])
  );

DROP POLICY IF EXISTS "ArchivosProfesor_Master_All" ON storage.objects;
CREATE POLICY "ArchivosProfesor_Master_All"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'archivos-profesor'
    AND get_my_rol() = 'MASTER'
  )
  WITH CHECK (
    bucket_id = 'archivos-profesor'
    AND get_my_rol() = 'MASTER'
  );

DROP POLICY IF EXISTS "ArchivosProfesor_Admin_All" ON storage.objects;
CREATE POLICY "ArchivosProfesor_Admin_All"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'archivos-profesor'
    AND get_my_rol() = 'ADMIN'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
  )
  WITH CHECK (
    bucket_id = 'archivos-profesor'
    AND get_my_rol() = 'ADMIN'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
  );

DROP POLICY IF EXISTS "ArchivosProfesor_Prof_All" ON storage.objects;
CREATE POLICY "ArchivosProfesor_Prof_All"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'archivos-profesor'
    AND get_my_rol() = 'PROFESOR'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
    AND nullif(trim(coalesce(get_my_teacher_id(), '')), '') IS NOT NULL
    AND (storage.foldername(name))[2] = get_my_teacher_id()
  )
  WITH CHECK (
    bucket_id = 'archivos-profesor'
    AND get_my_rol() = 'PROFESOR'
    AND (storage.foldername(name))[1] = get_my_tenant_id()
    AND nullif(trim(coalesce(get_my_teacher_id(), '')), '') IS NOT NULL
    AND (storage.foldername(name))[2] = get_my_teacher_id()
  );
