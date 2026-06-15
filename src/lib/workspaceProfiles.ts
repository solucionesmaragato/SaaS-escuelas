import { supabase } from "@/integrations/supabase/client";
import type { Centro, Cliente, Perfil } from "@/types/database";

export const PERFIL_WORKSPACE_SELECT = `
  *,
  CLIENTES (
    ID_CLIENTE,
    NOMBRE_ESCUELA,
    APP_LOGO
  ),
  CENTROS (
    ID_CENTRO,
    NOMBRE_CENTRO
  )
` as const;

export type WorkspaceClienteSummary = Pick<Cliente, "ID_CLIENTE" | "NOMBRE_ESCUELA" | "APP_LOGO">;
export type WorkspaceCentroSummary = Pick<Centro, "ID_CENTRO" | "NOMBRE_CENTRO">;

type PerfilWorkspaceRow = Perfil & {
  CLIENTES: WorkspaceClienteSummary | WorkspaceClienteSummary[] | null;
  CENTROS: WorkspaceCentroSummary | WorkspaceCentroSummary[] | null;
};

export type WorkspaceOption = {
  perfil: Perfil;
  cliente: WorkspaceClienteSummary | null;
  centro: WorkspaceCentroSummary | null;
};

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function toWorkspaceOption(row: PerfilWorkspaceRow): WorkspaceOption {
  const { CLIENTES: clienteNode, CENTROS: centroNode, ...perfil } = row;
  return {
    perfil: perfil as Perfil,
    cliente: asSingle(clienteNode),
    centro: asSingle(centroNode),
  };
}

export async function fetchUserWorkspaceProfiles(userId: string): Promise<WorkspaceOption[]> {
  const { data, error } = await supabase
    .from("PERFILES")
    .select(PERFIL_WORKSPACE_SELECT)
    .eq("ID", userId);

  if (error) throw error;
  return ((data ?? []) as PerfilWorkspaceRow[]).map(toWorkspaceOption);
}
