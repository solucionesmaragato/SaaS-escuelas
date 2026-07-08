import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

export const RECIBOS_PAGE_SIZE = 25;

export const ESTADO_PAGO_OPTIONS = ["Cobrado", "Borrador", "Anulado"] as const;
export type EstadoPagoOption = (typeof ESTADO_PAGO_OPTIONS)[number];

export type RecibosListFilters = {
  centerId?: string | null;
  cursoId?: string | null;
  mesPeriodo?: string | null;
  alumnoId?: string | null;
};

export type ReciboRow = {
  ID_RECIBO: string;
  ID_CLIENTE: string;
  REF_RECIBO: string;
  ID_ALUMNO: string;
  ID_CURSO?: string | null;
  MAIL: string | null;
  TLF: string | null;
  FECHA: string | null;
  MES_PERIODO: string | null;
  RECEPTOR_NOMBRE: string | null;
  CIF_DNI: string | null;
  DIRECCION: string | null;
  TIPO_DOC: string | null;
  METODO_PAGO: string | null;
  TOTAL_BASE: number | null;
  DESCUENTO: number | null;
  TOTAL_IVA: number | null;
  TOTAL_DOC: number | null;
  NUM_FACTURA_HOLDED: string | null;
  LINK_FACTURA_HOLDED: string | null;
  HUELLA_HASH: string | null;
  URL_QR: string | null;
  LINK_PDF_RECIBO: string | null;
  ESTADO_PAGO: string | null;
  ALUMNOS: { NOMBRE_ALUMNO: string } | null;
};

async function attachAlumnosToRecibos(
  recibos: Record<string, unknown>[],
  tenantId: string,
  rol: string | null | undefined,
  alumnoIds: string[] | null,
): Promise<ReciboRow[]> {
  if (recibos.length === 0) return [];

  let alumnosQuery = supabase.from("ALUMNOS").select("ID_ALUMNO, NOMBRE_ALUMNO");
  alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);
  if (alumnoIds) {
    alumnosQuery = alumnosQuery.in("ID_ALUMNO", alumnoIds);
  }
  const { data: alumnos, error } = await alumnosQuery;
  if (error) throw error;

  return recibos.map((row) => {
    const aluFound = alumnos?.find((a) => a.ID_ALUMNO === row.ID_ALUMNO);
    return {
      ...(row as Omit<ReciboRow, "ALUMNOS">),
      ALUMNOS: aluFound ? { NOMBRE_ALUMNO: aluFound.NOMBRE_ALUMNO } : null,
    };
  });
}

function buildRecibosQueryKey(
  rol: string | null | undefined,
  tenantId: string,
  filters: RecibosListFilters,
) {
  return [
    ...tenantListKey("recibos", rol, tenantId),
    centerFilterQueryKey(filters.centerId),
    filters.cursoId?.trim() || "all-cursos",
    filters.mesPeriodo?.trim() || "all-meses",
    filters.alumnoId?.trim() || "all-alumnos",
  ] as const;
}

export function useRecibos(filters: RecibosListFilters = {}) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = buildRecibosQueryKey(rol, tenantId, filters);

  const list = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const filterCenterId = filters.centerId;
      const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);
      if (alumnoIds && alumnoIds.length === 0) return [];

      let query = supabase.from("RECIBOS_MENSUALES").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      let scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
      if (scoped === "empty") return [];

      const cursoId = filters.cursoId?.trim();
      if (cursoId) {
        scoped = scoped.eq("ID_CURSO", cursoId);
      }

      const mesPeriodo = filters.mesPeriodo?.trim();
      if (mesPeriodo) {
        scoped = scoped.eq("MES_PERIODO", mesPeriodo);
      }

      const alumnoId = filters.alumnoId?.trim();
      if (alumnoId) {
        scoped = scoped.eq("ID_ALUMNO", alumnoId);
      }

      const from = pageParam * RECIBOS_PAGE_SIZE;
      const to = from + RECIBOS_PAGE_SIZE - 1;

      const { data: recibos, error } = await scoped
        .order("FECHA", { ascending: false })
        .range(from, to);

      if (error) throw error;

      return attachAlumnosToRecibos(recibos ?? [], tenantId, rol, alumnoIds);
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (lastPage.length < RECIBOS_PAGE_SIZE) return undefined;
      return lastPageParam + 1;
    },
  });

  const mesPeriodoOptions = useQuery({
    queryKey: [...tenantListKey("recibos-meses", rol, tenantId)],
    queryFn: async () => {
      let query = supabase.from("RECIBOS_MENSUALES").select("MES_PERIODO");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;

      const unique = [
        ...new Set(
          (data ?? [])
            .map((row) => row.MES_PERIODO?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      ];

      return unique.sort((a, b) => b.localeCompare(a, "es", { sensitivity: "base" }));
    },
  });

  const create = useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase
        .from("RECIBOS_MENSUALES")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: [...tenantListKey("recibos-meses", rol, tenantId)] });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("RECIBOS_MENSUALES")
        .update(patch)
        .eq("ID_RECIBO", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("RECIBOS_MENSUALES")
        .delete()
        .eq("ID_RECIBO", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, mesPeriodoOptions, create, update, remove };
}

export function normalizeEstadoPago(estado: string | null | undefined): EstadoPagoOption {
  const value = estado?.trim().toLowerCase();
  if (value === "cobrado" || value === "pagado") return "Cobrado";
  if (value === "anulado") return "Anulado";
  return "Borrador";
}

export function isEstadoPagoLocked(estado: EstadoPagoOption): boolean {
  return estado === "Anulado";
}

export function getEstadoPagoSelectableOptions(current: EstadoPagoOption): EstadoPagoOption[] {
  switch (current) {
    case "Anulado":
      return ["Anulado"];
    case "Cobrado":
      return ["Cobrado", "Anulado"];
    case "Borrador":
    default:
      return [...ESTADO_PAGO_OPTIONS];
  }
}

export function canTransitionEstadoPago(
  current: EstadoPagoOption,
  next: EstadoPagoOption,
): boolean {
  return getEstadoPagoSelectableOptions(current).includes(next);
}

export function estadoPagoSelectClass(estado: EstadoPagoOption): string {
  switch (estado) {
    case "Cobrado":
      return "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-100/90 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/50 dark:hover:bg-emerald-900/40";
    case "Borrador":
      return "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-100/90 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50 dark:hover:bg-amber-900/40";
    case "Anulado":
      return "bg-red-100 text-red-900 border-red-200 hover:bg-red-100/90 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900/50 dark:hover:bg-red-900/40";
  }
}

export function estadoPagoStatus(estado: EstadoPagoOption): "success" | "pending" | "destructive" {
  switch (estado) {
    case "Cobrado":
      return "success";
    case "Borrador":
      return "pending";
    case "Anulado":
      return "destructive";
  }
}
