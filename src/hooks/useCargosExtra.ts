import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { appendCenterFilter, centerFilterQueryKey } from "@/lib/centroFilter";
import { isMasterRole, scopeTenantQuery } from "@/lib/tenantQuery";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge";

export const CARGOS_EXTRA_SELECT =
  "ID_CARGO, ID_CLIENTE, ID_CENTRO, ID_ALUMNO, CONCEPTO, CANTIDAD, PRECIO_UNITARIO, PORCENTAJE_IVA, FECHA_CARGO, ESTADO, ID_RECIBO_VINCULADO, CREADO_POR, created_at" as const;

export type CargoExtraRow = {
  ID_CARGO: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  ID_ALUMNO: string | null;
  CONCEPTO: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  PORCENTAJE_IVA: number;
  FECHA_CARGO: string | null;
  ESTADO: string | null;
  ID_RECIBO_VINCULADO: string | null;
  CREADO_POR: string | null;
  created_at: string | null;
};

export type CargoExtraListRow = CargoExtraRow & {
  ALUMNOS?: { NOMBRE_ALUMNO: string | null } | null;
};

export type CargoExtraCreateInput = {
  ID_ALUMNO: string;
  ID_CENTRO: string;
  CONCEPTO: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  PORCENTAJE_IVA: number;
  FECHA_CARGO?: string;
};

export type CargoExtraUpdateInput = {
  ID_CARGO: string;
  CONCEPTO: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  PORCENTAJE_IVA: number;
};

export type CargosExtraListFilters = {
  centerId?: string | null;
  estado?: string | null;
};

export function calcCargoExtraTotal(
  cantidad: string | number,
  precioUnitario: string | number,
  porcentajeIva: string | number,
): number | null {
  const qty = Number(cantidad);
  const unit = Number(precioUnitario);
  const iva = Number(porcentajeIva);
  if (!Number.isFinite(qty) || !Number.isFinite(unit) || !Number.isFinite(iva)) return null;
  return qty * unit * (1 + iva / 100);
}

export function calcCargoExtraRowTotal(
  row: Pick<CargoExtraRow, "CANTIDAD" | "PRECIO_UNITARIO" | "PORCENTAJE_IVA">,
): number {
  return (
    Number(row.CANTIDAD) *
    Number(row.PRECIO_UNITARIO) *
    (1 + Number(row.PORCENTAJE_IVA) / 100)
  );
}

export function isCargoExtraPendiente(estado: string | null | undefined): boolean {
  return (estado ?? "").trim().toLowerCase() === "pendiente";
}

export function canEditCargoExtraRole(rol: string | null | undefined): boolean {
  return rol === "MASTER" || rol === "ADMIN" || rol === "SECRETARIA" || rol === "DIRECCION";
}

export function cargoExtraEstadoStatus(estado: string | null | undefined): StatusBadgeVariant {
  if (estado === "Procesado") return "success";
  if (estado === "Pendiente") return "pending";
  return "neutral";
}

export function formatCargoExtraFecha(row: CargoExtraRow): string {
  const raw = row.FECHA_CARGO?.trim() || row.created_at?.trim() || "";
  if (!raw) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

export function cargosExtraByAlumnoKey(alumnoId: string) {
  return ["cargosExtra", "byAlumno", alumnoId] as const;
}

export function cargosExtraListKey(
  rol: string | null | undefined,
  tenantId: string,
  filters: CargosExtraListFilters,
) {
  return [
    "cargosExtra",
    "list",
    isMasterRole(rol) ? "MASTER" : tenantId,
    centerFilterQueryKey(filters.centerId),
    filters.estado?.trim() || "all",
  ] as const;
}

function validateCargoExtraFields(input: {
  CONCEPTO: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  PORCENTAJE_IVA: number;
}) {
  const concepto = input.CONCEPTO.trim();
  if (!concepto) throw new Error("El concepto es obligatorio.");
  if (!Number.isFinite(input.CANTIDAD) || input.CANTIDAD <= 0) {
    throw new Error("La cantidad debe ser mayor que 0.");
  }
  if (!Number.isFinite(input.PRECIO_UNITARIO)) {
    throw new Error("El precio unitario es obligatorio.");
  }
  if (!Number.isFinite(input.PORCENTAJE_IVA)) {
    throw new Error("El porcentaje de IVA es obligatorio.");
  }
  return {
    CONCEPTO: concepto,
    CANTIDAD: input.CANTIDAD,
    PRECIO_UNITARIO: input.PRECIO_UNITARIO,
    PORCENTAJE_IVA: input.PORCENTAJE_IVA,
  };
}

function generateCargoId(): string {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `CARGO_${suffix}`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function attachAlumnosToCargos(
  rows: CargoExtraRow[],
  tenantId: string,
  rol: string | null | undefined,
): Promise<CargoExtraListRow[]> {
  if (rows.length === 0) return [];

  const alumnoIds = [...new Set(rows.map((row) => row.ID_ALUMNO).filter(Boolean))] as string[];
  if (alumnoIds.length === 0) {
    return rows.map((row) => ({ ...row, ALUMNOS: null }));
  }

  let alumnosQuery = supabase.from("ALUMNOS").select("ID_ALUMNO, NOMBRE_ALUMNO");
  alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);
  alumnosQuery = alumnosQuery.in("ID_ALUMNO", alumnoIds);

  const { data: alumnos, error } = await alumnosQuery;
  if (error) throw error;

  const alumnoById = new Map(
    (alumnos ?? []).map((row) => [row.ID_ALUMNO as string, row.NOMBRE_ALUMNO as string | null]),
  );

  return rows.map((row) => ({
    ...row,
    ALUMNOS: row.ID_ALUMNO
      ? { NOMBRE_ALUMNO: alumnoById.get(row.ID_ALUMNO) ?? null }
      : null,
  }));
}

function invalidateCargosExtraQueries(
  qc: ReturnType<typeof useQueryClient>,
  alumnoId?: string | null,
) {
  qc.invalidateQueries({ queryKey: ["cargosExtra"] });
  if (alumnoId?.trim()) {
    qc.invalidateQueries({ queryKey: cargosExtraByAlumnoKey(alumnoId.trim()) });
  }
  qc.invalidateQueries({
    predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "alumnosTree",
  });
}

export function useCargosExtra(options?: {
  alumnoId?: string | null;
  listFilters?: CargosExtraListFilters;
}) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const alumnoId = options?.alumnoId?.trim() || null;
  const listFilters = options?.listFilters;

  const listByAlumno = useQuery({
    queryKey: cargosExtraByAlumnoKey(alumnoId ?? ""),
    enabled: Boolean(alumnoId),
    queryFn: async (): Promise<CargoExtraRow[]> => {
      let query = supabase
        .from("CARGOS_EXTRA")
        .select(CARGOS_EXTRA_SELECT)
        .eq("ID_ALUMNO", alumnoId!);
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CargoExtraRow[];
    },
  });

  const list = useQuery({
    queryKey: cargosExtraListKey(rol, tenantId, listFilters ?? {}),
    enabled: listFilters !== undefined,
    queryFn: async (): Promise<CargoExtraListRow[]> => {
      let query = supabase.from("CARGOS_EXTRA").select(CARGOS_EXTRA_SELECT);
      query = scopeTenantQuery(query, rol, tenantId);
      query = appendCenterFilter(query, listFilters?.centerId);

      const estado = listFilters?.estado?.trim();
      if (estado && estado !== "__all__") {
        query = query.eq("ESTADO", estado);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return attachAlumnosToCargos((data ?? []) as CargoExtraRow[], tenantId, rol);
    },
  });

  const create = useMutation({
    mutationFn: async (input: CargoExtraCreateInput) => {
      const idAlumno = input.ID_ALUMNO.trim();
      const idCentro = input.ID_CENTRO.trim();

      if (!idAlumno) throw new Error("Falta el alumno.");
      if (!idCentro) throw new Error("Falta el centro del alumno.");

      const fields = validateCargoExtraFields(input);

      const payload = {
        ID_CARGO: generateCargoId(),
        ID_CLIENTE: tenantId,
        ID_CENTRO: idCentro,
        ID_ALUMNO: idAlumno,
        CONCEPTO: fields.CONCEPTO,
        CANTIDAD: fields.CANTIDAD,
        PRECIO_UNITARIO: fields.PRECIO_UNITARIO,
        PORCENTAJE_IVA: fields.PORCENTAJE_IVA,
        FECHA_CARGO: input.FECHA_CARGO?.trim() || todayIsoDate(),
        ESTADO: "Pendiente",
        ID_RECIBO_VINCULADO: null,
      };

      const { data, error } = await supabase.from("CARGOS_EXTRA").insert(payload).select().single();
      if (error) throw error;
      return data as CargoExtraRow;
    },
    onSuccess: (_data, variables) => {
      invalidateCargosExtraQueries(qc, variables.ID_ALUMNO);
    },
  });

  const update = useMutation({
    mutationFn: async (input: CargoExtraUpdateInput) => {
      const idCargo = input.ID_CARGO.trim();
      if (!idCargo) throw new Error("Falta el identificador del cargo.");

      let fetchQuery = supabase
        .from("CARGOS_EXTRA")
        .select(CARGOS_EXTRA_SELECT)
        .eq("ID_CARGO", idCargo);
      fetchQuery = scopeTenantQuery(fetchQuery, rol, tenantId);

      const { data: current, error: fetchError } = await fetchQuery.single();
      if (fetchError) throw fetchError;
      if (!current) throw new Error("Cargo extra no encontrado.");
      if (!isCargoExtraPendiente(current.ESTADO)) {
        throw new Error("No se puede editar un cargo que ya no está pendiente.");
      }

      const fields = validateCargoExtraFields(input);

      let updateQuery = supabase
        .from("CARGOS_EXTRA")
        .update({
          CONCEPTO: fields.CONCEPTO,
          CANTIDAD: fields.CANTIDAD,
          PRECIO_UNITARIO: fields.PRECIO_UNITARIO,
          PORCENTAJE_IVA: fields.PORCENTAJE_IVA,
        })
        .eq("ID_CARGO", idCargo)
        .eq("ESTADO", "Pendiente");
      updateQuery = scopeTenantQuery(updateQuery, rol, tenantId);

      const { data, error } = await updateQuery.select().single();
      if (error) throw error;
      if (!data) {
        throw new Error("No se puede editar un cargo que ya no está pendiente.");
      }
      return data as CargoExtraRow;
    },
    onSuccess: (data) => {
      invalidateCargosExtraQueries(qc, data.ID_ALUMNO);
    },
  });

  return { create, update, listByAlumno, list };
}
