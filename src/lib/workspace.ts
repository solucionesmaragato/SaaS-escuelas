import type { Perfil, Rol } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceMetadata = {
  current_client_id: string;
  current_center_id: string | null;
  current_perfil_id: string;
};

export async function syncWorkspaceMetadata(perfil: Perfil): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: {
      current_client_id: perfil.ID_CLIENTE,
      current_center_id: perfil.ID_CENTRO ?? null,
      current_perfil_id: String(perfil.ID_PERFIL),
    },
  });
  if (error) throw error;

  const { data, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw refreshError;
  if (!data.session) {
    throw new Error("No se pudo refrescar la sesión tras cambiar el workspace.");
  }

  const meta = data.session.user.user_metadata;
  if (
    meta.current_perfil_id !== String(perfil.ID_PERFIL) ||
    meta.current_client_id !== perfil.ID_CLIENTE
  ) {
    throw new Error("El JWT no refleja el workspace activo.");
  }
}

const WORKSPACE_SYNC_RETRY_DELAY_MS = 400;

/** True when JWT workspace metadata is missing or does not match the chosen perfil. */
export function needsWorkspaceMetadataSync(
  session: { user: { user_metadata?: Record<string, unknown> } } | null,
  perfil: Perfil,
): boolean {
  if (!session?.user) return true;
  const meta = session.user.user_metadata ?? {};
  const jwtPerfilId = String(meta.current_perfil_id ?? "").trim();
  const jwtClientId = String(meta.current_client_id ?? "").trim();
  const jwtCenterId = meta.current_center_id;
  const perfilCenterId = perfil.ID_CENTRO ?? null;

  if (jwtClientId !== perfil.ID_CLIENTE) return true;
  if (jwtPerfilId !== String(perfil.ID_PERFIL)) return true;
  if ((jwtCenterId ?? null) !== perfilCenterId) return true;
  return false;
}

/** Sync JWT workspace metadata; one retry for transient OAuth/updateUser failures. */
export async function syncWorkspaceMetadataWithRetry(
  perfil: Perfil,
  maxAttempts = 2,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await syncWorkspaceMetadata(perfil);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, WORKSPACE_SYNC_RETRY_DELAY_MS));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("No se pudo sincronizar el workspace.");
}

const AVATAR_PALETTES = [
  "bg-slate-600 text-white",
  "bg-indigo-600 text-white",
  "bg-emerald-600 text-white",
  "bg-sky-600 text-white",
  "bg-violet-600 text-white",
] as const;

export function getSchoolInitials(nombre: string | null | undefined): string {
  const words = (nombre ?? "ME").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "ME";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function getSchoolAvatarClass(nombre: string | null | undefined): string {
  const seed = (nombre ?? "escuela").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
}

export function roleBadgeClass(rol: Rol | string): string {
  switch (rol?.toUpperCase()) {
    case "ADMIN":
      return "bg-blue-600 text-white hover:bg-blue-600";
    case "SECRETARIA":
      return "bg-emerald-600 text-white hover:bg-emerald-600";
    case "DIRECCION":
      return "bg-violet-600 text-white hover:bg-violet-600";
    case "PROFESOR":
      return "bg-amber-600 text-white hover:bg-amber-600";
    case "MASTER":
      return "bg-slate-800 text-white hover:bg-slate-800";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}
