import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";

export interface EspecialidadData {
  ID_ESPECIALIDAD: string;
  ID_CLIENTE: string;
  ESPECIALIDAD: string;
}

export type EspecialidadCreateInput = {
  ESPECIALIDAD: string;
  ID_CLIENTE?: string;
};

export type EspecialidadUpdateInput = Partial<
  Pick<EspecialidadData, "ESPECIALIDAD" | "ID_CLIENTE">
>;

function assertCanCreate(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para crear especialidades.");
}

function assertCanUpdate(
  rol: string | null | undefined,
  tenantId: string,
  targetIdCliente: string,
) {
  if (isMasterRole(rol)) return;
  if (isAdminRole(rol) && targetIdCliente === tenantId) return;
  throw new Error("No tienes permiso para modificar esta especialidad.");
}

function assertCanDelete(rol: string | null | undefined) {
  if (!isMasterRole(rol)) {
    throw new Error("Solo Master puede eliminar especialidades.");
  }
}

export function useEspecialidades() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("especialidades", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<EspecialidadData[]> => {
      let query = supabase.from("ESPECIALIDADES").select("*");
      query = scopeTenantQuery(query, rol, tenantId);

      if (isMasterRole(rol)) {
        const { data, error } = await query
          .order("ID_CLIENTE", { ascending: true })
          .order("ESPECIALIDAD", { ascending: true });
        if (error) throw error;
        return (data ?? []) as EspecialidadData[];
      }

      if (
        isAdminRole(rol) ||
        isDireccionRole(rol) ||
        isSecretariaRole(rol) ||
        isProfesorRole(rol)
      ) {
        const { data, error } = await query.order("ESPECIALIDAD", { ascending: true });
        if (error) throw error;
        return (data ?? []) as EspecialidadData[];
      }

      return [];
    },
  });

  const create = useMutation({
    mutationFn: async (input: EspecialidadCreateInput) => {
      assertCanCreate(rol);
      const idCliente = isMasterRole(rol) ? (input.ID_CLIENTE ?? "") : tenantId;
      if (!idCliente) {
        throw new Error("Debes indicar un ID_CLIENTE.");
      }
      const payload = { ESPECIALIDAD: input.ESPECIALIDAD, ID_CLIENTE: idCliente };
      const { data, error } = await supabase
        .from("ESPECIALIDADES")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as EspecialidadData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EspecialidadUpdateInput }) => {
      const { data: existing, error: fetchErr } = await supabase
        .from("ESPECIALIDADES")
        .select("ID_CLIENTE")
        .eq("ID_ESPECIALIDAD", id)
        .single();
      if (fetchErr) throw fetchErr;

      assertCanUpdate(rol, tenantId, existing.ID_CLIENTE);

      const finalPatch = isMasterRole(rol)
        ? patch
        : { ESPECIALIDAD: patch.ESPECIALIDAD };

      let query = supabase
        .from("ESPECIALIDADES")
        .update(finalPatch)
        .eq("ID_ESPECIALIDAD", id);

      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as EspecialidadData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertCanDelete(rol);
      const { error } = await supabase.from("ESPECIALIDADES").delete().eq("ID_ESPECIALIDAD", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
