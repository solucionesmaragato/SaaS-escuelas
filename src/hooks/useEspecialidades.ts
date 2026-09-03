import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { appendCatalogCenterOrFilter } from "@/lib/catalogCenterFilter";
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
  ID_CENTRO: string | null;
  ESPECIALIDAD: string;
}

export type EspecialidadCreateInput = {
  ESPECIALIDAD: string;
  ID_CLIENTE?: string;
  ID_CENTRO?: string | null;
};

export type EspecialidadUpdateInput = Partial<
  Pick<EspecialidadData, "ESPECIALIDAD" | "ID_CLIENTE" | "ID_CENTRO">
>;

type EspecialidadRow = {
  ID_ESPECIALIDAD: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  ESPECIALIDAD: string;
};

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

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sanitizeIdCentro(value: string | null | undefined): string | null {
  if (value === null) return null;
  return nullIfEmpty(value);
}

function resolveCreateIdCentro(
  rol: string | null | undefined,
  profileCenterId: string | null | undefined,
  inputIdCentro: string | null | undefined,
): string | null {
  if (isMasterRole(rol)) {
    if (inputIdCentro !== undefined) return sanitizeIdCentro(inputIdCentro);
    return sanitizeIdCentro(profileCenterId);
  }
  if (isAdminRole(rol)) {
    if (profileCenterId) return profileCenterId;
    if (inputIdCentro !== undefined) return sanitizeIdCentro(inputIdCentro);
    return null;
  }
  return sanitizeIdCentro(profileCenterId);
}

function shouldScopeCatalogByCenter(rol: string | null | undefined): boolean {
  return isSecretariaRole(rol) || isDireccionRole(rol) || isProfesorRole(rol);
}

function mapEspecialidadRow(row: EspecialidadRow): EspecialidadData {
  return {
    ID_ESPECIALIDAD: row.ID_ESPECIALIDAD,
    ID_CLIENTE: row.ID_CLIENTE,
    ID_CENTRO: sanitizeIdCentro(row.ID_CENTRO),
    ESPECIALIDAD: row.ESPECIALIDAD,
  };
}

export function useEspecialidades() {
  const { tenantId, rol, centerId } = useActiveTenant();
  const qc = useQueryClient();
  const catalogScopeKey =
    isMasterRole(rol) || isAdminRole(rol) ? "tenant-wide" : (centerId ?? "no-center");
  const queryKey = [...tenantListKey("especialidades", rol, tenantId), catalogScopeKey];

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<EspecialidadData[]> => {
      let query = supabase.from("ESPECIALIDADES").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      if (shouldScopeCatalogByCenter(rol)) {
        query = appendCatalogCenterOrFilter(query, centerId);
      }

      if (isMasterRole(rol)) {
        const { data, error } = await query
          .order("ID_CLIENTE", { ascending: true })
          .order("ESPECIALIDAD", { ascending: true });
        if (error) throw error;
        return ((data ?? []) as EspecialidadRow[]).map(mapEspecialidadRow);
      }

      if (
        isAdminRole(rol) ||
        isDireccionRole(rol) ||
        isSecretariaRole(rol) ||
        isProfesorRole(rol)
      ) {
        const { data, error } = await query.order("ESPECIALIDAD", { ascending: true });
        if (error) throw error;
        return ((data ?? []) as EspecialidadRow[]).map(mapEspecialidadRow);
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
      const payload = {
        ESPECIALIDAD: input.ESPECIALIDAD,
        ID_CLIENTE: idCliente,
        ID_CENTRO: resolveCreateIdCentro(rol, centerId, input.ID_CENTRO),
      };
      const { data, error } = await supabase
        .from("ESPECIALIDADES")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return mapEspecialidadRow(data as EspecialidadRow);
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

      let finalPatch: EspecialidadUpdateInput;
      if (isMasterRole(rol)) {
        finalPatch = patch;
      } else if (isAdminRole(rol)) {
        finalPatch = {
          ESPECIALIDAD: patch.ESPECIALIDAD,
          ...(patch.ID_CENTRO !== undefined && !centerId ? { ID_CENTRO: patch.ID_CENTRO } : {}),
        };
      } else {
        finalPatch = { ESPECIALIDAD: patch.ESPECIALIDAD };
      }

      if (finalPatch.ID_CENTRO !== undefined) {
        finalPatch = {
          ...finalPatch,
          ID_CENTRO: sanitizeIdCentro(finalPatch.ID_CENTRO),
        };
      }

      let query = supabase.from("ESPECIALIDADES").update(finalPatch).eq("ID_ESPECIALIDAD", id);

      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { data, error } = await query.select().single();
      if (error) throw error;
      return mapEspecialidadRow(data as EspecialidadRow);
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
