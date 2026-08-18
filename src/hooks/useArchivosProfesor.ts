import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";

const ARCHIVOS_PROFESOR_BUCKET = "archivos-profesor" as const;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ArchivoProfesorFolder = {
  name: string;
  path: string;
};

export type ArchivoProfesorFile = {
  name: string;
  path: string;
  size: number;
  updatedAt: string | null;
};

export type ArchivoProfesorListResult = {
  folders: ArchivoProfesorFolder[];
  files: ArchivoProfesorFile[];
};

type StorageContext = {
  tenantId: string;
  profesorId: string;
};

function requireStorageContext(
  tenantId: string | null | undefined,
  profesorId: string | null | undefined,
): StorageContext | null {
  const tid = tenantId?.trim();
  const pid = profesorId?.trim();
  if (!tid || !pid) return null;
  return { tenantId: tid, profesorId: pid };
}

function sanitizeFolderName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..") || trimmed === ".") {
    throw new Error("Nombre de carpeta inválido.");
  }
  return trimmed;
}

function sanitizeFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
  return base || "archivo";
}

function buildListPrefix(ctx: StorageContext, carpeta: string | null): string {
  const base = `${ctx.tenantId}/${ctx.profesorId}`;
  if (!carpeta) return base;
  return `${base}/${sanitizeFolderName(carpeta)}`;
}

function buildUploadPath(ctx: StorageContext, fileName: string, carpeta: string | null): string {
  const objectName = `${crypto.randomUUID()}_${sanitizeFileName(fileName)}`;
  if (carpeta) {
    return `${ctx.tenantId}/${ctx.profesorId}/${sanitizeFolderName(carpeta)}/${objectName}`;
  }
  return `${ctx.tenantId}/${ctx.profesorId}/${objectName}`;
}

function assertPathOwned(path: string, ctx: StorageContext) {
  const root = `${ctx.tenantId}/${ctx.profesorId}`;
  if (path !== root && !path.startsWith(`${root}/`)) {
    throw new Error("Ruta no permitida.");
  }
}

function validateUploadFile(file: File) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Tipo de archivo no permitido.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("El archivo supera el límite de 10 MB.");
  }
}

async function listArchivos(
  ctx: StorageContext,
  carpeta: string | null,
): Promise<ArchivoProfesorListResult> {
  const prefix = buildListPrefix(ctx, carpeta);
  const { data, error } = await supabase.storage.from(ARCHIVOS_PROFESOR_BUCKET).list(prefix, {
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;

  const folders: ArchivoProfesorFolder[] = [];
  const files: ArchivoProfesorFile[] = [];

  for (const item of data ?? []) {
    if (item.name === ".keep") continue;

    const itemPath = `${prefix}/${item.name}`;

    if (item.id == null) {
      folders.push({ name: item.name, path: itemPath });
      continue;
    }

    files.push({
      name: item.name,
      path: itemPath,
      size: item.metadata?.size ?? 0,
      updatedAt: item.updated_at ?? item.created_at ?? null,
    });
  }

  return { folders, files };
}

export function useArchivosProfesor(carpeta: string | null = null) {
  const { tenantId, perfil } = useActiveTenant();
  const profesorId = perfil.ID_PROFESOR;
  const qc = useQueryClient();
  const storageCtx = requireStorageContext(tenantId, profesorId);

  const queryKey = [
    "archivos-profesor",
    storageCtx?.tenantId ?? "none",
    storageCtx?.profesorId ?? "none",
    carpeta ?? "root",
  ] as const;

  const list = useQuery({
    queryKey,
    enabled: !!storageCtx,
    queryFn: async () => listArchivos(storageCtx!, carpeta),
  });

  const upload = useMutation({
    mutationFn: async ({ file, carpeta: uploadCarpeta }: { file: File; carpeta: string | null }) => {
      const ctx = requireStorageContext(tenantId, profesorId);
      if (!ctx) throw new Error("No hay tenant o profesor asociado.");

      validateUploadFile(file);
      const path = buildUploadPath(ctx, file.name, uploadCarpeta);
      const { error } = await supabase.storage.from(ARCHIVOS_PROFESOR_BUCKET).upload(path, file, {
        upsert: false,
      });
      if (error) throw error;
      return path;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const createFolder = useMutation({
    mutationFn: async (nombre: string) => {
      const ctx = requireStorageContext(tenantId, profesorId);
      if (!ctx) throw new Error("No hay tenant o profesor asociado.");

      const folder = sanitizeFolderName(nombre);
      const keepPath = `${ctx.tenantId}/${ctx.profesorId}/${folder}/.keep`;
      const { error } = await supabase.storage
        .from(ARCHIVOS_PROFESOR_BUCKET)
        .upload(keepPath, new Blob([], { type: "application/pdf" }), {
          contentType: "application/pdf",
          upsert: false,
        });
      if (error) throw error;
      return keepPath;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (path: string) => {
      const ctx = requireStorageContext(tenantId, profesorId);
      if (!ctx) throw new Error("No hay tenant o profesor asociado.");

      assertPathOwned(path, ctx);

      const { data: entries, error: listError } = await supabase.storage
        .from(ARCHIVOS_PROFESOR_BUCKET)
        .list(path);
      if (listError) throw listError;

      if (entries && entries.length > 0) {
        const visibleEntries = entries.filter((entry) => entry.name !== ".keep");
        const hasFiles = visibleEntries.some((entry) => entry.id != null);
        if (hasFiles) {
          throw new Error("La carpeta no está vacía.");
        }

        const pathsToRemove = entries.map((entry) => `${path}/${entry.name}`);
        const { error } = await supabase.storage.from(ARCHIVOS_PROFESOR_BUCKET).remove(pathsToRemove);
        if (error) throw error;
        return pathsToRemove;
      }

      const { error } = await supabase.storage.from(ARCHIVOS_PROFESOR_BUCKET).remove([path]);
      if (error) throw error;
      return [path];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const signedUrl = async (path: string, expiresInSeconds = 3600): Promise<string> => {
    const ctx = requireStorageContext(tenantId, profesorId);
    if (!ctx) throw new Error("No hay tenant o profesor asociado.");

    assertPathOwned(path, ctx);
    const { data, error } = await supabase.storage
      .from(ARCHIVOS_PROFESOR_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    if (!data?.signedUrl) throw new Error("No se pudo generar la URL firmada.");
    return data.signedUrl;
  };

  return { list, upload, createFolder, remove, signedUrl };
}
