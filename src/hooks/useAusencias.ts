import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchProfesorIdsForCenter,
} from "@/lib/centroFilter";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";

const AUSENCIA_SELECT_COLUMNS =
  "ID_PERMISO, ID_CLIENTE, ID_PROFESOR, TIPO, FECHA_INICIO, FECHA_FIN, ESTADO, JUSTIFICANTE" as const;

const PROFESOR_LOOKUP_COLUMNS =
  "ID_PROFESOR, NOMBRE_PROFESOR, FECHA_BAJA, SALDO_VACACIONES, SALDO_AP" as const;

export interface ProfesorLookup {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  FECHA_BAJA?: string | null;
  SALDO_VACACIONES: number | null;
  SALDO_AP: number | null;
}

export interface AusenciaData {
  ID_PERMISO: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  TIPO: string;
  FECHA_INICIO: string;
  FECHA_FIN: string;
  ESTADO: string | null;
  JUSTIFICANTE: string | null;
  NOMBRE_PROFESOR: string;
}

export type AusenciaCreateInput = {
  ID_PROFESOR: string;
  TIPO: string;
  FECHA_INICIO: string;
  FECHA_FIN: string;
  ESTADO?: string | null;
  JUSTIFICANTE?: string | null;
  ID_CLIENTE?: string;
};

export type AusenciaUpdateInput = Partial<AusenciaCreateInput>;

export type AusenciasQueryData = {
  ausencias: AusenciaData[];
  profesores: ProfesorLookup[];
};

type AusenciaRow = {
  ID_PERMISO: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  TIPO: string;
  FECHA_INICIO: string;
  FECHA_FIN: string;
  ESTADO: string | null;
  JUSTIFICANTE: string | null;
};

function normalizeSaldo(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
}

function assertCanUpdate(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para modificar permisos.");
}

function assertCanDelete(rol: string | null | undefined) {
  if (!isMasterRole(rol)) {
    throw new Error("Solo Master puede eliminar permisos.");
  }
}

/** Admin DB rules: only ESTADO and/or JUSTIFICANTE; omit undefined keys entirely. */
function buildAdminUpdatePatch(patch: AusenciaUpdateInput): AusenciaUpdateInput {
  const result: AusenciaUpdateInput = {};
  if (patch.ESTADO !== undefined) result.ESTADO = patch.ESTADO;
  if (patch.JUSTIFICANTE !== undefined) result.JUSTIFICANTE = patch.JUSTIFICANTE;
  return result;
}

function mapAusencias(
  rows: AusenciaRow[],
  profesores: ProfesorLookup[],
): AusenciaData[] {
  const profById = new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR]));

  return rows.map((row) => ({
    ...row,
    NOMBRE_PROFESOR: profById.get(row.ID_PROFESOR) ?? row.ID_PROFESOR,
  }));
}

function isEstadoPendiente(estado: string | null | undefined): boolean {
  return (estado ?? "").trim().toLowerCase() === "pendiente";
}

/** Pendiente first; within each status group, preserve Supabase fetch order via original index. */
function sortAusencias(rows: AusenciaData[]): AusenciaData[] {
  const indexed = rows.map((row, originalIndex) => ({ row, originalIndex }));

  indexed.sort((a, b) => {
    const pendienteRankA = isEstadoPendiente(a.row.ESTADO) ? 0 : 1;
    const pendienteRankB = isEstadoPendiente(b.row.ESTADO) ? 0 : 1;

    if (pendienteRankA !== pendienteRankB) {
      return pendienteRankA - pendienteRankB;
    }

    return a.originalIndex - b.originalIndex;
  });

  return indexed.map(({ row }) => row);
}

export function useAusencias(filterCenterId?: string | null) {
  const { tenantId, rol, perfil } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("ausencias", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<AusenciasQueryData> => {
      // AUSENCIAS_PERMISOS has no ID_CENTRO — scope by PERFILES.ID_CENTRO via ID_PROFESOR.
      const profesorIds = await fetchProfesorIdsForCenter(tenantId, filterCenterId);
      if (profesorIds && profesorIds.length === 0) {
        return { ausencias: [], profesores: [] };
      }

      let ausenciaQuery = supabase.from("AUSENCIAS_PERMISOS").select(AUSENCIA_SELECT_COLUMNS);
      ausenciaQuery = scopeTenantQuery(ausenciaQuery, rol, tenantId);

      if (isProfesorRole(rol) && perfil?.ID_PROFESOR) {
        ausenciaQuery = ausenciaQuery.eq("ID_PROFESOR", perfil.ID_PROFESOR);
      } else {
        const scoped = appendIdInFilter(ausenciaQuery, "ID_PROFESOR", profesorIds);
        if (scoped === "empty") {
          return { ausencias: [], profesores: [] };
        }
        ausenciaQuery = scoped;
      }

      let profesorQuery = supabase.from("PROFESOR").select(PROFESOR_LOOKUP_COLUMNS);
      profesorQuery = scopeTenantQuery(profesorQuery, rol, tenantId);
      if (profesorIds) {
        profesorQuery = profesorQuery.in("ID_PROFESOR", profesorIds);
      }

      const [{ data: ausencias, error }, { data: profesores, error: profError }] =
        await Promise.all([ausenciaQuery, profesorQuery.order("NOMBRE_PROFESOR", { ascending: true })]);

      if (error) throw error;
      if (profError) throw profError;

      const profesoresMapped: ProfesorLookup[] = (profesores ?? []).map((p) => ({
        ID_PROFESOR: p.ID_PROFESOR,
        NOMBRE_PROFESOR: p.NOMBRE_PROFESOR,
        SALDO_VACACIONES: normalizeSaldo(p.SALDO_VACACIONES),
        SALDO_AP: normalizeSaldo(p.SALDO_AP),
      }));

      const mappedAusencias = mapAusencias(
        (ausencias ?? []) as AusenciaRow[],
        profesoresMapped,
      );

      return {
        ausencias: sortAusencias(mappedAusencias),
        profesores: profesoresMapped,
      };
    },
  });

  const create = useMutation({
    mutationFn: async (input: AusenciaCreateInput) => {
      const idCliente = isMasterRole(rol) ? (input.ID_CLIENTE ?? tenantId) : tenantId;
      if (!idCliente) {
        throw new Error("Debes indicar un ID_CLIENTE.");
      }

      let idProfesor = input.ID_PROFESOR;
      if (isProfesorRole(rol) || isDireccionRole(rol)) {
        if (!perfil?.ID_PROFESOR) {
          throw new Error("Tu perfil no tiene un trabajador asociado.");
        }
        idProfesor = perfil.ID_PROFESOR;
      }

      if (!idProfesor) {
        throw new Error("Debes seleccionar un trabajador.");
      }

      const payload = {
        ID_CLIENTE: idCliente,
        ID_PROFESOR: idProfesor,
        TIPO: input.TIPO,
        FECHA_INICIO: input.FECHA_INICIO,
        FECHA_FIN: input.FECHA_FIN,
        ESTADO: input.ESTADO ?? "Pendiente",
        JUSTIFICANTE: input.JUSTIFICANTE ?? null,
      };

      const { data, error } = await supabase
        .from("AUSENCIAS_PERMISOS")
        .insert(payload)
        .select(AUSENCIA_SELECT_COLUMNS)
        .single();
      if (error) throw error;
      return data as AusenciaRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: AusenciaUpdateInput }) => {
      assertCanUpdate(rol);

      const finalPatch = isMasterRole(rol) ? patch : buildAdminUpdatePatch(patch);

      console.log("PAYLOAD SENT TO SUPABASE:", finalPatch);

      let query = supabase
        .from("AUSENCIAS_PERMISOS")
        .update(finalPatch)
        .eq("ID_PERMISO", id);

      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { data, error } = await query.select(AUSENCIA_SELECT_COLUMNS).single();
      if (error) {
        console.error("SUPABASE ERROR DETAILS:", error);
        throw error;
      }
      return data as AusenciaRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertCanDelete(rol);
      const { error } = await supabase
        .from("AUSENCIAS_PERMISOS")
        .delete()
        .eq("ID_PERMISO", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
