import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  isAdminRole,
  isMasterRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";
import { centerFilterQueryKey } from "@/lib/centroFilter";
import type { UUID } from "@/types/database";

export interface HorarioData {
  ID_HORARIO: UUID;
  ID_CLIENTE: UUID;
  DIA_SEMANA: string;
  ABRE_MAÑANA: string | null;
  CIERRA_MAÑANA: string | null;
  ABRE_TARDE: string | null;
  CIERRA_TARDE: string | null;
  TFNO_DESVIO: string | null;
  SEG_ESPERA: number | null;
}

export type HorarioCreateInput = Omit<HorarioData, "ID_HORARIO">;
export type HorarioUpdateInput = Partial<Omit<HorarioData, "ID_HORARIO">>;

const ADMIN_UPDATE_KEYS = [
  "ABRE_MAÑANA",
  "CIERRA_MAÑANA",
  "ABRE_TARDE",
  "CIERRA_TARDE",
] as const;

function assertCanUpdate(
  rol: string | null | undefined,
  tenantId: string,
  targetIdCliente: string,
) {
  if (isMasterRole(rol)) return;
  if (isAdminRole(rol) && targetIdCliente === tenantId) return;
  throw new Error("No tienes permiso para modificar este horario.");
}

function assertMasterCreate(rol: string | null | undefined) {
  if (!isMasterRole(rol)) {
    throw new Error("Solo Master puede crear horarios comerciales.");
  }
}

function assertMasterDelete(rol: string | null | undefined) {
  if (!isMasterRole(rol)) {
    throw new Error("Solo Master puede eliminar horarios comerciales.");
  }
}

function adminOnlyPatch(patch: HorarioUpdateInput): HorarioUpdateInput {
  const safe: HorarioUpdateInput = {};
  for (const key of ADMIN_UPDATE_KEYS) {
    if (key in patch) {
      safe[key] = patch[key];
    }
  }
  return safe;
}

const DIA_SEMANA_ORDEN: Record<string, number> = {
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  LUNES: 1,
  MARTES: 2,
  MIERCOLES: 3,
  MIÉRCOLES: 3,
  JUEVES: 4,
  VIERNES: 5,
  SABADO: 6,
  SÁBADO: 6,
  DOMINGO: 7,
};

/** Maps numeric (1–7) or Spanish day names to chronological order (Lunes = 1 … Domingo = 7). */
export function diaSemanaSortKey(dia: string): number {
  const trimmed = dia.trim();
  const asNum = parseInt(trimmed, 10);
  if (!Number.isNaN(asNum) && asNum >= 1 && asNum <= 7) return asNum;

  const normalized = trimmed
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  return DIA_SEMANA_ORDEN[normalized] ?? DIA_SEMANA_ORDEN[trimmed.toUpperCase()] ?? 99;
}

/** Group by school (ID_CLIENTE), then order days Monday → Sunday. */
export function sortHorarios(rows: HorarioData[]): HorarioData[] {
  return [...rows].sort((a, b) => {
    const byCliente = a.ID_CLIENTE.localeCompare(b.ID_CLIENTE, "es", { sensitivity: "base" });
    if (byCliente !== 0) return byCliente;
    return diaSemanaSortKey(a.DIA_SEMANA) - diaSemanaSortKey(b.DIA_SEMANA);
  });
}

function invalidateHorarioList(qc: ReturnType<typeof useQueryClient>, queryKey: readonly unknown[]) {
  void qc.invalidateQueries({ queryKey, refetchType: "active" });
}

export function useHorarioComercial(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("horario-comercial", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<HorarioData[]> => {
      // HORARIO_COMERCIAL is tenant-wide (no ID_CENTRO) — center filter not applied.
      void filterCenterId;
      let query = supabase.from("HORARIO_COMERCIAL").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query
        .order("ID_CLIENTE", { ascending: true })
        .order("DIA_SEMANA", { ascending: true });
      if (error) throw error;
      return sortHorarios((data ?? []) as HorarioData[]);
    },
  });

  const create = useMutation({
    mutationFn: async (input: HorarioCreateInput) => {
      assertMasterCreate(rol);
      const { data, error } = await supabase
        .from("HORARIO_COMERCIAL")
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as HorarioData;
    },
    onSuccess: () => invalidateHorarioList(qc, queryKey),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: HorarioUpdateInput }) => {
      const { data: existing, error: fetchErr } = await supabase
        .from("HORARIO_COMERCIAL")
        .select("ID_CLIENTE")
        .eq("ID_HORARIO", id)
        .single();
      if (fetchErr) throw fetchErr;

      assertCanUpdate(rol, tenantId, existing.ID_CLIENTE);

      const finalPatch = isMasterRole(rol) ? patch : adminOnlyPatch(patch);

      const { data, error } = await supabase
        .from("HORARIO_COMERCIAL")
        .update(finalPatch)
        .eq("ID_HORARIO", id)
        .select()
        .single();
      if (error) throw error;
      return data as HorarioData;
    },
    onSuccess: () => invalidateHorarioList(qc, queryKey),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertMasterDelete(rol);
      const { error } = await supabase.from("HORARIO_COMERCIAL").delete().eq("ID_HORARIO", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidateHorarioList(qc, queryKey),
  });

  return { list, create, update, remove };
}
