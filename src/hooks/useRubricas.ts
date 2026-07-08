import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";
import {
  buildEstructuraFromCriterionNames,
  isRubricaActiva,
} from "@/lib/rubricStructure";

const RUBRICA_SELECT_COLUMNS =
  "ID_RUBRICA, ID_CLIENTE, NOMBRE, DESCRIPCION, ESTADO, ESTRUCTURA, CREATED_AT, UPDATED_AT" as const;

export interface RubricaData {
  ID_RUBRICA: string;
  ID_CLIENTE: string;
  NOMBRE: string;
  DESCRIPCION: string | null;
  ESTADO: string | null;
  ESTRUCTURA: Record<string, unknown> | unknown[] | null;
  CREATED_AT: string | null;
  UPDATED_AT: string | null;
}

export const RUBRICA_ESTADO_VALUES = ["Activa", "Inactiva"] as const;
export type RubricaEstadoValue = (typeof RUBRICA_ESTADO_VALUES)[number];

export function isRubricaEstadoValue(
  value: string | null | undefined,
): value is RubricaEstadoValue {
  return RUBRICA_ESTADO_VALUES.includes(value as RubricaEstadoValue);
}

export type RubricaUpsertInput = {
  ID_RUBRICA?: string;
  NOMBRE: string;
  DESCRIPCION?: string | null;
  ESTADO: string;
  criterios?: string[];
};

export type RubricaCreateInput = Omit<RubricaUpsertInput, "ID_RUBRICA">;

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
}

function normalizeEstado(value: string): RubricaEstadoValue {
  const trimmed = value.trim();
  if (isRubricaEstadoValue(trimmed)) return trimmed;
  throw new Error(`ESTADO inválido: "${value}". Solo se permite Activa o Inactiva.`);
}

function buildUpsertPayload(
  input: RubricaUpsertInput,
  tenantId: string,
): Record<string, unknown> {
  const nombre = input.NOMBRE.trim();
  if (!nombre) throw new Error("NOMBRE es obligatorio.");

  const estructura = buildEstructuraFromCriterionNames(input.criterios ?? []);
  const payload: Record<string, unknown> = {
    ID_CLIENTE: tenantId,
    NOMBRE: nombre,
    DESCRIPCION: input.DESCRIPCION?.trim() || null,
    ESTADO: normalizeEstado(input.ESTADO),
    ESTRUCTURA: estructura,
  };

  const id = input.ID_RUBRICA?.trim();
  if (id) payload.ID_RUBRICA = id;

  return payload;
}

export function useRubricas() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("rubricas", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<RubricaData[]> => {
      let query = supabase.from("RUBRICAS").select(RUBRICA_SELECT_COLUMNS);
      query = scopeTenantQuery(query, rol, tenantId);

      const { data, error } = await query.order("NOMBRE", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RubricaData[];
    },
  });

  const saveRubrica = async (input: RubricaUpsertInput) => {
    const payload = buildUpsertPayload(input, tenantId);
    const isUpdate = Boolean(input.ID_RUBRICA?.trim());
    console.log(
      `PAYLOAD SENT TO SUPABASE (RUBRICA ${isUpdate ? "UPDATE" : "CREATE"}):`,
      payload,
    );

    const { data, error } = await supabase
      .from("RUBRICAS")
      .upsert(payload, isUpdate ? { onConflict: "ID_RUBRICA" } : undefined)
      .select(RUBRICA_SELECT_COLUMNS)
      .single();

    if (error) {
      logSupabaseError(`RUBRICA ${isUpdate ? "UPDATE" : "CREATE"}`, error);
      throw error;
    }
    return data as RubricaData;
  };

  const upsert = useMutation({
    mutationFn: saveRubrica,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const create = useMutation({
    mutationFn: async (input: RubricaCreateInput) => saveRubrica(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  return { list, upsert, create, tenantId };
}

export function filterActiveRubricas(rubricas: RubricaData[]): RubricaData[] {
  return rubricas.filter((r) => isRubricaActiva(r.ESTADO));
}
