import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  isAdminRole,
  isMasterRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";
import type { ISODateTime, Rol, UUID } from "@/types/database";

export interface PerfilData {
  ID_PERFIL: UUID;
  ID: UUID;
  ID_CLIENTE: UUID;
  ID_CENTRO: UUID | null;
  ID_PROFESOR: UUID | null;
  NOMBRE: string;
  ROL: Rol;
  EMAIL: string;
  ESTADO: string | null;
  created_at: ISODateTime;
}

export type PerfilCreateInput = Omit<PerfilData, "ID_PERFIL" | "ID" | "created_at">;
export type PerfilUpdateInput = Partial<
  Omit<PerfilData, "ID_PERFIL" | "ID" | "created_at" | "EMAIL">
>;

function assertCanMutate(
  rol: string | null | undefined,
  tenantId: string,
  targetIdCliente: string,
) {
  if (isMasterRole(rol)) return;
  if (isAdminRole(rol) && targetIdCliente === tenantId) return;
  throw new Error("No tienes permiso para modificar este perfil.");
}

export function usePerfiles() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("perfiles", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<PerfilData[]> => {
      // PERFILES are tenant-wide — never filter by ID_CENTRO on list fetch.
      let query = supabase.from("PERFILES").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query
        .order("ID_CLIENTE", { ascending: true })
        .order("NOMBRE", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PerfilData[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: PerfilCreateInput) => {
      const idCliente = isMasterRole(rol) ? input.ID_CLIENTE : tenantId;
      assertCanMutate(rol, tenantId, idCliente);
      const payload = { ...input, ID_CLIENTE: idCliente };
      const { data, error } = await supabase
        .from("PERFILES")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as PerfilData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: PerfilUpdateInput }) => {
      const { data: existing, error: fetchErr } = await supabase
        .from("PERFILES")
        .select("ID_CLIENTE")
        .eq("ID_PERFIL", id)
        .single();
      if (fetchErr) throw fetchErr;

      const targetCliente = (patch.ID_CLIENTE ?? existing.ID_CLIENTE) as string;
      assertCanMutate(rol, tenantId, targetCliente);

      const { ID_CLIENTE: _omit, ...safePatch } = patch;
      const finalPatch = isMasterRole(rol) ? patch : safePatch;

      const { data, error } = await supabase
        .from("PERFILES")
        .update(finalPatch)
        .eq("ID_PERFIL", id)
        .select()
        .single();
      if (error) throw error;
      return data as PerfilData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data: existing, error: fetchErr } = await supabase
        .from("PERFILES")
        .select("ID_CLIENTE")
        .eq("ID_PERFIL", id)
        .single();
      if (fetchErr) throw fetchErr;

      assertCanMutate(rol, tenantId, existing.ID_CLIENTE);

      const { error } = await supabase.from("PERFILES").delete().eq("ID_PERFIL", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
