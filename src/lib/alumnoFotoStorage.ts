import { supabase } from "@/integrations/supabase/client";
import { compressImageFile } from "@/lib/compressImage";

export const ALUMNOS_FOTOS_BUCKET = "alumnos-fotos" as const;

const ALLOWED_INPUT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

export function buildAlumnoFotoPath(tenantId: string, alumnoId: string): string {
  const tid = tenantId.trim();
  const aid = alumnoId.trim();
  if (!tid || !aid) {
    throw new Error("Faltan datos para guardar la foto del alumno.");
  }
  return `${tid}/${aid}.jpg`;
}

export function isAlumnoFotoStorageUrl(url: string | null | undefined): boolean {
  const value = url?.trim();
  if (!value) return false;
  return value.includes(`/storage/v1/object/public/${ALUMNOS_FOTOS_BUCKET}/`);
}

export function extractAlumnoFotoPathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${ALUMNOS_FOTOS_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const rawPath = url.slice(index + marker.length).split("?")[0];
  return decodeURIComponent(rawPath);
}

function validateInputFile(file: File): void {
  if (!ALLOWED_INPUT_TYPES.has(file.type)) {
    throw new Error("Formato no permitido. Usa JPG, PNG, WEBP o GIF.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("La imagen supera el límite de 10 MB.");
  }
}

export async function uploadAlumnoFoto(
  tenantId: string,
  alumnoId: string,
  file: File,
): Promise<string> {
  validateInputFile(file);

  const compressed = await compressImageFile(file);
  const path = buildAlumnoFotoPath(tenantId, alumnoId);

  const { error } = await supabase.storage.from(ALUMNOS_FOTOS_BUCKET).upload(path, compressed, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(ALUMNOS_FOTOS_BUCKET).getPublicUrl(path);

  return `${publicUrl}?v=${Date.now()}`;
}

export async function deleteAlumnoFoto(urlOrPath: string | null | undefined): Promise<void> {
  const value = urlOrPath?.trim();
  if (!value) return;

  const path = value.includes("http")
    ? extractAlumnoFotoPathFromUrl(value)
    : value;

  if (!path) return;

  const { error } = await supabase.storage.from(ALUMNOS_FOTOS_BUCKET).remove([path]);
  if (error) throw error;
}
