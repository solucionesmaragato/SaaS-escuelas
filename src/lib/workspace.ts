import type { Perfil, Rol } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceMetadata = {
  current_client_id: string;
  current_center_id: string | null;
};

export async function syncWorkspaceMetadata(perfil: Perfil): Promise<void> {
  const { error } = await supabase.auth.updateUser({
    data: {
      current_client_id: perfil.ID_CLIENTE,
      current_center_id: perfil.ID_CENTRO ?? null,
    },
  });
  if (error) throw error;
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
