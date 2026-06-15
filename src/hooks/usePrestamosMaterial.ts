import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
  fetchProfesorIdsForCenter,
  resolveCenterFilterId,
} from "@/lib/centroFilter";
import {
  isMasterRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";

const PRESTAMO_SELECT_COLUMNS =
  "ID_PRESTAMO, ID_CLIENTE, ID_CENTRO, ID_RECEPTOR, ELEMENTO, CATEGORIA, NUM_SERIE, FECHA_PRESTAMO, FECHA_FIN_PRESTAMO, FECHA_DEVOLUCION, ESTADO_DEVOLUCION, ESTADO_MATERIAL, NOTAS, CREADO_POR, RECOGIDO_POR, CREATED_AT, UPDATED_AT" as const;

export interface PrestamoMaterialData {
  ID_PRESTAMO: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  ID_RECEPTOR: string | null;
  ELEMENTO: string | null;
  CATEGORIA: string | null;
  NUM_SERIE: string | null;
  FECHA_PRESTAMO: string | null;
  FECHA_FIN_PRESTAMO: string | null;
  FECHA_DEVOLUCION: string | null;
  ESTADO_DEVOLUCION: string | null;
  ESTADO_MATERIAL: string | null;
  NOTAS: string | null;
  CREADO_POR: string | null;
  RECOGIDO_POR: string | null;
  CREATED_AT: string | null;
  UPDATED_AT: string | null;
}

export const PRESTAMO_CATEGORIA_VALUES = ["ALUMNO", "PROFESOR"] as const;
export type PrestamoCategoria = (typeof PRESTAMO_CATEGORIA_VALUES)[number];

export function isPrestamoCategoria(value: string | null | undefined): value is PrestamoCategoria {
  return value === "ALUMNO" || value === "PROFESOR";
}

export type PrestamoMaterialCreateInput = {
  ELEMENTO: string;
  CATEGORIA: PrestamoCategoria;
  ID_RECEPTOR: string;
  ID_CENTRO: string;
  ESTADO_MATERIAL: string;
  NUM_SERIE?: string | null;
  FECHA_PRESTAMO: string;
  FECHA_FIN_PRESTAMO?: string | null;
  FECHA_DEVOLUCION?: string | null;
  ESTADO_DEVOLUCION?: string | null;
  NOTAS?: string | null;
  CREADO_POR?: string | null;
  RECOGIDO_POR?: string | null;
};

export type PrestamoMaterialUpdateInput = Partial<PrestamoMaterialCreateInput>;

type PrestamoMaterialRow = PrestamoMaterialData;

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export function formatSupabaseError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error ?? "Error desconocido");
  }

  const e = error as SupabaseErrorLike;
  const parts = [
    e.message,
    e.details,
    e.hint,
    e.code ? `[${e.code}]` : null,
  ].filter((part) => part && String(part).trim());

  return parts.length > 0 ? parts.join(" — ") : "Error desconocido";
}

function logSupabaseError(context: string, error: unknown) {
  console.error(`SUPABASE ${context} ERROR:`, error);
  if (error && typeof error === "object") {
    const e = error as SupabaseErrorLike;
    console.error(`SUPABASE ${context} DETAILS:`, {
      message: e.message,
      details: e.details,
      hint: e.hint,
      code: e.code,
    });
  }
}

function normalizeCategoria(value: string): PrestamoCategoria {
  const trimmed = value.trim();
  if (isPrestamoCategoria(trimmed)) return trimmed;
  throw new Error(
    `CATEGORIA inválida: "${value}". Solo se permite ALUMNO o PROFESOR.`,
  );
}

function generatePrestamoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `PRE_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildCreatePayload(input: PrestamoMaterialCreateInput) {
  const categoria = normalizeCategoria(input.CATEGORIA);
  const idReceptor = input.ID_RECEPTOR.trim();
  const estadoMaterial = input.ESTADO_MATERIAL.trim();

  if (!idReceptor) {
    throw new Error("ID_RECEPTOR es obligatorio.");
  }
  if (!estadoMaterial) {
    throw new Error("ESTADO_MATERIAL es obligatorio.");
  }
  const idCentro = input.ID_CENTRO.trim();
  if (!idCentro) {
    throw new Error("ID_CENTRO es obligatorio.");
  }

  const payload: Record<string, string | null> = {
    ELEMENTO: input.ELEMENTO.trim(),
    CATEGORIA: categoria,
    ID_RECEPTOR: idReceptor,
    ID_CENTRO: idCentro,
    ESTADO_MATERIAL: estadoMaterial,
    NUM_SERIE: input.NUM_SERIE?.trim() || null,
    FECHA_PRESTAMO: input.FECHA_PRESTAMO,
    FECHA_FIN_PRESTAMO: input.FECHA_FIN_PRESTAMO?.trim() || null,
    FECHA_DEVOLUCION: input.FECHA_DEVOLUCION || null,
    NOTAS: input.NOTAS?.trim() || null,
  };

  const estado = input.ESTADO_DEVOLUCION?.trim();
  if (estado) {
    payload.ESTADO_DEVOLUCION = estado;
  }
  if (input.CREADO_POR !== undefined) {
    payload.CREADO_POR = input.CREADO_POR?.trim() || null;
  }
  if (input.RECOGIDO_POR !== undefined) {
    payload.RECOGIDO_POR = input.RECOGIDO_POR?.trim() || null;
  }

  return payload;
}

function buildUpdatePayload(patch: PrestamoMaterialUpdateInput): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  if (patch.ELEMENTO !== undefined) result.ELEMENTO = patch.ELEMENTO.trim();
  if (patch.CATEGORIA !== undefined) {
    result.CATEGORIA = normalizeCategoria(patch.CATEGORIA);
  }
  if (patch.ID_RECEPTOR !== undefined) {
    const idReceptor = patch.ID_RECEPTOR.trim();
    if (!idReceptor) throw new Error("ID_RECEPTOR es obligatorio.");
    result.ID_RECEPTOR = idReceptor;
  }
  if (patch.ID_CENTRO !== undefined) {
    const idCentro = patch.ID_CENTRO.trim();
    if (!idCentro) throw new Error("ID_CENTRO es obligatorio.");
    result.ID_CENTRO = idCentro;
  }
  if (patch.ESTADO_MATERIAL !== undefined) {
    const estadoMaterial = patch.ESTADO_MATERIAL.trim();
    if (!estadoMaterial) throw new Error("ESTADO_MATERIAL es obligatorio.");
    result.ESTADO_MATERIAL = estadoMaterial;
  }
  if (patch.NUM_SERIE !== undefined) result.NUM_SERIE = patch.NUM_SERIE?.trim() || null;
  if (patch.FECHA_PRESTAMO !== undefined) result.FECHA_PRESTAMO = patch.FECHA_PRESTAMO;
  if (patch.FECHA_FIN_PRESTAMO !== undefined) {
    result.FECHA_FIN_PRESTAMO = patch.FECHA_FIN_PRESTAMO?.trim() || null;
  }
  if (patch.FECHA_DEVOLUCION !== undefined) {
    result.FECHA_DEVOLUCION = patch.FECHA_DEVOLUCION || null;
  }
  if (patch.ESTADO_DEVOLUCION !== undefined) {
    result.ESTADO_DEVOLUCION = patch.ESTADO_DEVOLUCION?.trim() || null;
  }
  if (patch.NOTAS !== undefined) result.NOTAS = patch.NOTAS?.trim() || null;
  if (patch.CREADO_POR !== undefined) {
    result.CREADO_POR = patch.CREADO_POR?.trim() || null;
  }
  if (patch.RECOGIDO_POR !== undefined) {
    result.RECOGIDO_POR = patch.RECOGIDO_POR?.trim() || null;
  }
  return result;
}

function matchesCenterReceptor(
  row: PrestamoMaterialRow,
  alumnoIds: Set<string>,
  profesorIds: Set<string>,
): boolean {
  const receptor = row.ID_RECEPTOR?.trim();
  if (!receptor) return false;
  const categoria = row.CATEGORIA?.trim().toUpperCase();
  if (categoria === "ALUMNO") return alumnoIds.has(receptor);
  if (categoria === "PROFESOR") return profesorIds.has(receptor);
  return false;
}

export function usePrestamosMaterial(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("prestamosMaterial", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<PrestamoMaterialData[]> => {
      // PRESTAMOS_MATERIAL has no ID_CENTRO — scope by receptor (ALUMNO/PROFESOR) centro.
      const centerId = resolveCenterFilterId(filterCenterId);
      const [alumnoIdsList, profesorIdsList] = centerId
        ? await Promise.all([
            fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId),
            fetchProfesorIdsForCenter(tenantId, filterCenterId),
          ])
        : [null, null];

      if (
        centerId &&
        (alumnoIdsList?.length === 0) &&
        (profesorIdsList?.length === 0)
      ) {
        return [];
      }

      let query = supabase.from("PRESTAMOS_MATERIAL").select(PRESTAMO_SELECT_COLUMNS);
      query = scopeTenantQuery(query, rol, tenantId);

      const runQuery = isMasterRole(rol)
        ? query
            .order("ID_CLIENTE", { ascending: true })
            .order("FECHA_PRESTAMO", { ascending: false })
        : query.order("FECHA_PRESTAMO", { ascending: false });

      const { data, error } = await runQuery;
      if (error) {
        logSupabaseError("LIST", error);
        throw error;
      }

      let rows = (data ?? []) as PrestamoMaterialRow[];
      if (centerId) {
        const alumnoIds = new Set(alumnoIdsList ?? []);
        const profesorIds = new Set(profesorIdsList ?? []);
        rows = rows.filter((row) => matchesCenterReceptor(row, alumnoIds, profesorIds));
      }

      return rows;
    },
  });

  const create = useMutation({
    mutationFn: async (input: PrestamoMaterialCreateInput) => {
      const payload = buildCreatePayload(input);
      payload.ID_PRESTAMO = generatePrestamoId();
      payload.ID_CLIENTE = tenantId;
      console.log("PAYLOAD SENT TO SUPABASE (CREATE):", payload);

      const { data, error } = await supabase
        .from("PRESTAMOS_MATERIAL")
        .insert([payload])
        .select(PRESTAMO_SELECT_COLUMNS)
        .maybeSingle();

      if (error) {
        logSupabaseError("CREATE", error);
        throw error;
      }

      return data as PrestamoMaterialRow | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: PrestamoMaterialUpdateInput;
    }) => {
      const finalPatch = buildUpdatePayload(patch);
      console.log("PAYLOAD SENT TO SUPABASE (UPDATE):", finalPatch);

      let query = supabase
        .from("PRESTAMOS_MATERIAL")
        .update(finalPatch)
        .eq("ID_PRESTAMO", id);

      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { data, error } = await query.select(PRESTAMO_SELECT_COLUMNS).maybeSingle();
      if (error) {
        logSupabaseError("UPDATE", error);
        throw error;
      }

      return data as PrestamoMaterialRow | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      let query = supabase.from("PRESTAMOS_MATERIAL").delete().eq("ID_PRESTAMO", id);

      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { error } = await query;
      if (error) {
        logSupabaseError("DELETE", error);
        throw error;
      }
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
