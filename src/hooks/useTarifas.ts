import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  isAdminRole,
  isMasterRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";

export type TarifaData = {
  ID_TARIFA: string;
  ID_CLIENTE: string;
  SERVICIO: string;
  PRECIO: number | null;
  FORMATO_VENTA: string | null;
  TIPO_COBRO: string | null;
  SESIONES_SEMANALES: number | null;
  TOTAL_HORAS_SEMANALES: number | null;
  DETALLES: string | null;
  COLUMNAS_HORARIOS_MATRICULAS: number | null;
};

export type TarifaCreateInput = {
  SERVICIO: string;
  PRECIO?: number | null;
  FORMATO_VENTA?: string | null;
  TIPO_COBRO?: string | null;
  SESIONES_SEMANALES?: number | null;
  TOTAL_HORAS_SEMANALES?: number | null;
  DETALLES?: string | null;
  COLUMNAS_HORARIOS_MATRICULAS?: number | null;
};

export type TarifaUpdateInput = Partial<TarifaCreateInput>;

type TarifaRow = {
  ID_TARIFA: string;
  ID_CLIENTE: string;
  SERVICIO: string;
  PRECIO: number | string | null;
  FORMATO_VENTA: string | null;
  TIPO_COBRO: string | null;
  SESIONES_SEMANALES: number | string | null;
  TOTAL_HORAS_SEMANALES: number | string | null;
  DETALLES: string | null;
  COLUMNAS_HORARIOS_MATRICULAS: number | string | null;
};

function assertCanWrite(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para gestionar tarifas.");
}

function assertCanDelete(rol: string | null | undefined) {
  if (isMasterRole(rol)) return;
  throw new Error("No tienes permiso para eliminar tarifas.");
}

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function nullIfEmptyNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
}

function nullIfEmptyInt(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

function sanitizeTarifaPayload(
  input: TarifaCreateInput | TarifaUpdateInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("SERVICIO" in input && input.SERVICIO !== undefined) {
    payload.SERVICIO = input.SERVICIO.trim();
  }
  if ("PRECIO" in input) {
    payload.PRECIO = nullIfEmptyNumber(input.PRECIO);
  }
  if ("FORMATO_VENTA" in input) {
    payload.FORMATO_VENTA = nullIfEmpty(input.FORMATO_VENTA);
  }
  if ("TIPO_COBRO" in input) {
    payload.TIPO_COBRO = nullIfEmpty(input.TIPO_COBRO);
  }
  if ("SESIONES_SEMANALES" in input) {
    payload.SESIONES_SEMANALES = nullIfEmptyInt(input.SESIONES_SEMANALES);
  }
  if ("TOTAL_HORAS_SEMANALES" in input) {
    payload.TOTAL_HORAS_SEMANALES = nullIfEmptyNumber(input.TOTAL_HORAS_SEMANALES);
  }
  if ("COLUMNAS_HORARIOS_MATRICULAS" in input) {
    payload.COLUMNAS_HORARIOS_MATRICULAS = nullIfEmptyInt(input.COLUMNAS_HORARIOS_MATRICULAS);
  }
  if ("DETALLES" in input) {
    payload.DETALLES = nullIfEmpty(input.DETALLES);
  }

  return payload;
}

function mapTarifaRow(row: TarifaRow): TarifaData {
  return {
    ID_TARIFA: row.ID_TARIFA,
    ID_CLIENTE: row.ID_CLIENTE,
    SERVICIO: row.SERVICIO,
    PRECIO: nullIfEmptyNumber(row.PRECIO),
    FORMATO_VENTA: row.FORMATO_VENTA,
    TIPO_COBRO: row.TIPO_COBRO,
    SESIONES_SEMANALES: nullIfEmptyInt(row.SESIONES_SEMANALES),
    TOTAL_HORAS_SEMANALES: nullIfEmptyNumber(row.TOTAL_HORAS_SEMANALES),
    DETALLES: row.DETALLES,
    COLUMNAS_HORARIOS_MATRICULAS: nullIfEmptyInt(row.COLUMNAS_HORARIOS_MATRICULAS),
  };
}

export function useTarifas() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("tarifas", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<TarifaData[]> => {
      let query = supabase.from("TARIFAS").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query.order("SERVICIO", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as TarifaRow[]).map(mapTarifaRow);
    },
  });

  const create = useMutation({
    mutationFn: async (input: TarifaCreateInput) => {
      assertCanWrite(rol);
      const payload = sanitizeTarifaPayload(input);
      const { data, error } = await supabase
        .from("TARIFAS")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return mapTarifaRow(data as TarifaRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TarifaUpdateInput }) => {
      assertCanWrite(rol);
      const payload = sanitizeTarifaPayload(patch);
      const { data, error } = await supabase
        .from("TARIFAS")
        .update(payload)
        .eq("ID_TARIFA", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return mapTarifaRow(data as TarifaRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertCanDelete(rol);
      const { error } = await supabase
        .from("TARIFAS")
        .delete()
        .eq("ID_TARIFA", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
