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

const AULA_SELECT_COLUMNS =
  "ID_AULA, ID_CLIENTE, NOMBRE_AULA, CAPACIDAD, ESPECIALIDAD" as const;

const ESPECIALIDAD_LOOKUP_COLUMNS = "ID_ESPECIALIDAD, ESPECIALIDAD" as const;

export interface AulaData {
  ID_AULA: string;
  ID_CLIENTE: string;
  NOMBRE_AULA: string;
  CAPACIDAD: number | null;
  ESPECIALIDAD: string[];
  TEXTO_ESPECIALIDADES: string;
}

export type AulaCreateInput = {
  NOMBRE_AULA: string;
  ESPECIALIDAD: string[];
  CAPACIDAD?: number | null;
  ID_CLIENTE?: string;
};

export type AulaUpdateInput = Partial<
  Pick<AulaData, "NOMBRE_AULA" | "ID_CLIENTE" | "CAPACIDAD" | "ESPECIALIDAD">
>;

type AulaRow = {
  ID_AULA: string;
  ID_CLIENTE: string;
  NOMBRE_AULA: string;
  CAPACIDAD: number | string | null;
  ESPECIALIDAD: string[] | string | null;
};

type EspecialidadLookup = {
  ID_ESPECIALIDAD: string;
  ESPECIALIDAD: string;
};

function normalizeEspecialidadIds(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  return [];
}

function normalizeCapacidad(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

function assertCanCreate(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para crear aulas.");
}

function assertCanUpdate(
  rol: string | null | undefined,
  tenantId: string,
  targetIdCliente: string,
) {
  if (isMasterRole(rol)) return;
  if (isAdminRole(rol) && targetIdCliente === tenantId) return;
  throw new Error("No tienes permiso para modificar esta aula.");
}

function assertCanDelete(rol: string | null | undefined) {
  if (!isMasterRole(rol)) {
    throw new Error("Solo Master puede eliminar aulas.");
  }
}

function mapAulasWithEspecialidad(
  rows: AulaRow[],
  especialidades: EspecialidadLookup[],
): AulaData[] {
  const espById = new Map(
    especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]),
  );

  return rows.map((row) => {
    const ids = normalizeEspecialidadIds(row.ESPECIALIDAD);
    const nombres = ids.map((id) => espById.get(id) ?? id);
    return {
      ID_AULA: row.ID_AULA,
      ID_CLIENTE: row.ID_CLIENTE,
      NOMBRE_AULA: row.NOMBRE_AULA,
      CAPACIDAD: normalizeCapacidad(row.CAPACIDAD),
      ESPECIALIDAD: ids,
      TEXTO_ESPECIALIDADES: nombres.length > 0 ? nombres.join(", ") : "—",
    };
  });
}

export function useAulas() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("aulas", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<AulaData[]> => {
      if (isProfesorRole(rol)) return [];

      let aulaQuery = supabase.from("AULA").select(AULA_SELECT_COLUMNS);
      aulaQuery = scopeTenantQuery(aulaQuery, rol, tenantId);

      let espQuery = supabase.from("ESPECIALIDADES").select(ESPECIALIDAD_LOOKUP_COLUMNS);
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);

      const runAulaQuery = isMasterRole(rol)
        ? aulaQuery
            .order("ID_CLIENTE", { ascending: true })
            .order("NOMBRE_AULA", { ascending: true })
        : aulaQuery.order("NOMBRE_AULA", { ascending: true });

      const [{ data: aulas, error }, { data: especialidades, error: espError }] =
        await Promise.all([runAulaQuery, espQuery]);

      if (error) throw error;
      if (espError) throw espError;

      return mapAulasWithEspecialidad(
        (aulas ?? []) as AulaRow[],
        (especialidades ?? []) as EspecialidadLookup[],
      );
    },
  });

  const create = useMutation({
    mutationFn: async (input: AulaCreateInput) => {
      assertCanCreate(rol);
      const idCliente = isMasterRole(rol) ? (input.ID_CLIENTE ?? "") : tenantId;
      if (!idCliente) {
        throw new Error("Debes indicar un ID_CLIENTE.");
      }
      if (!input.ESPECIALIDAD.length) {
        throw new Error("Debes seleccionar al menos una especialidad.");
      }
      const payload = {
        NOMBRE_AULA: input.NOMBRE_AULA,
        ID_CLIENTE: idCliente,
        ESPECIALIDAD: input.ESPECIALIDAD,
        CAPACIDAD: input.CAPACIDAD ?? null,
      };
      const { data, error } = await supabase
        .from("AULA")
        .insert(payload)
        .select(AULA_SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as AulaRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: AulaUpdateInput }) => {
      const { data: existing, error: fetchErr } = await supabase
        .from("AULA")
        .select("ID_CLIENTE")
        .eq("ID_AULA", id)
        .single();
      if (fetchErr) throw fetchErr;

      assertCanUpdate(rol, tenantId, existing.ID_CLIENTE);

      const finalPatch = isMasterRole(rol)
        ? patch
        : {
            NOMBRE_AULA: patch.NOMBRE_AULA,
            ESPECIALIDAD: patch.ESPECIALIDAD,
            CAPACIDAD: patch.CAPACIDAD,
          };

      let query = supabase.from("AULA").update(finalPatch).eq("ID_AULA", id);

      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { data, error } = await query.select(AULA_SELECT_COLUMNS).single();
      if (error) throw error;
      return data as AulaRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertCanDelete(rol);
      const { error } = await supabase.from("AULA").delete().eq("ID_AULA", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
