import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

export type GenerarRemesaMensualInput = {
  p_id_cliente: string;
  p_id_centro: string;
  p_id_curso: string;
  p_mes_periodo: string;
};

export type EnviarRemesaBloqueInput = GenerarRemesaMensualInput;

export type GenerarRemesaMensualResult = {
  recibos_generados?: number;
  [key: string]: unknown;
};

const GENERAR_REMESA_RPC_PARAMS = [
  "p_id_cliente",
  "p_id_centro",
  "p_id_curso",
  "p_mes_periodo",
] as const satisfies ReadonlyArray<keyof GenerarRemesaMensualInput>;

function isMissingRpcValue(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

export function buildGenerarRemesaRpcPayload(values: {
  id_cliente: string;
  id_centro: string;
  id_curso: string;
  mes_periodo: string;
}): GenerarRemesaMensualInput {
  return {
    p_id_cliente: String(values.id_cliente ?? "").trim(),
    p_id_centro: String(values.id_centro ?? "").trim(),
    p_id_curso: String(values.id_curso ?? "").trim(),
    p_mes_periodo: String(values.mes_periodo ?? "").trim(),
  };
}

export function buildEnviarRemesaRpcPayloadFromRow(row: {
  ID_CLIENTE?: string | null;
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
  MES_PERIODO?: string | null;
}): EnviarRemesaBloqueInput {
  return buildGenerarRemesaRpcPayload({
    id_cliente: row.ID_CLIENTE ?? "",
    id_centro: row.ID_CENTRO ?? "",
    id_curso: row.ID_CURSO ?? "",
    mes_periodo: row.MES_PERIODO ?? "",
  });
}

export function assertGenerarRemesaRpcPayload(
  payload: GenerarRemesaMensualInput,
): GenerarRemesaMensualInput {
  for (const key of GENERAR_REMESA_RPC_PARAMS) {
    if (isMissingRpcValue(payload[key])) {
      console.error(`[generar_remesa_mensual] Missing required RPC parameter: ${key}`);
      throw new Error(`Falta el parámetro requerido: ${key}`);
    }
  }
  return payload;
}

export type RemesaEnvioValidationRow = {
  MES_PERIODO?: string | null;
  ID_CURSO?: string | null;
  ID_CENTRO?: string | null;
};

type ReciboBankingRow = {
  RECEPTOR_NOMBRE?: string | null;
  CIF_DNI?: string | null;
  IBAN?: string | null;
  ID_ALUMNO?: string | null;
  ALUMNOS?:
    | { NOMBRE_ALUMNO?: string | null }
    | { NOMBRE_ALUMNO?: string | null }[]
    | null;
};

function isMissingBankingField(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function isReciboBankingIncomplete(recibo: ReciboBankingRow): boolean {
  return (
    isMissingBankingField(recibo.IBAN) ||
    isMissingBankingField(recibo.RECEPTOR_NOMBRE) ||
    isMissingBankingField(recibo.CIF_DNI)
  );
}

function resolveIncompleteBankingDisplayName(recibo: ReciboBankingRow): string {
  const receptor = recibo.RECEPTOR_NOMBRE?.trim();
  if (receptor) return receptor;

  const alumnos = recibo.ALUMNOS;
  const alumnoNombre = Array.isArray(alumnos)
    ? alumnos[0]?.NOMBRE_ALUMNO?.trim()
    : alumnos?.NOMBRE_ALUMNO?.trim();
  if (alumnoNombre) return alumnoNombre;

  return "Sin nombre";
}

export function formatRemesaBankingValidationMessage(names: string[]): string {
  return `No se puede enviar la remesa. Los siguientes alumnos o tutores no tienen sus datos bancarios completos: ${names.join(", ")}.`;
}

export async function fetchIncompleteRemesaBankingNames(
  tenantId: string,
  rol: string | null | undefined,
  row: RemesaEnvioValidationRow,
): Promise<string[]> {
  const mesPeriodo = row.MES_PERIODO?.trim();
  if (!mesPeriodo) return [];

  let query = supabase
    .from("RECIBOS_MENSUALES")
    .select("RECEPTOR_NOMBRE, CIF_DNI, IBAN, ID_ALUMNO, ALUMNOS(NOMBRE_ALUMNO)")
    .eq("MES_PERIODO", mesPeriodo);
  query = scopeTenantQuery(query, rol, tenantId);

  const idCurso = row.ID_CURSO?.trim();
  if (idCurso) {
    query = query.eq("ID_CURSO", idCurso);
  }

  const idCentro = row.ID_CENTRO?.trim();
  if (idCentro) {
    const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, idCentro);
    if (alumnoIds && alumnoIds.length === 0) return [];
    const scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
    if (scoped === "empty") return [];
    query = scoped;
  }

  const { data, error } = await query;
  if (error) throw error;

  const names = new Set<string>();
  for (const recibo of (data ?? []) as ReciboBankingRow[]) {
    if (!isReciboBankingIncomplete(recibo)) continue;
    names.add(resolveIncompleteBankingDisplayName(recibo));
  }

  return [...names].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

export function useRemesas(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("remesas", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      // CONTROL_REMESAS is tenant-wide (no ID_CENTRO) — center filter not applied.
      void filterCenterId;
      // Leemos tu tabla CONTROL_REMESAS mapeada rigurosamente
      let query = supabase.from("CONTROL_REMESAS").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query.order("MES_PERIODO", { ascending: false });
        
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (input: any) => {
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase.from("CONTROL_REMESAS").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { data, error } = await supabase.from("CONTROL_REMESAS").update(patch).eq("ID_REMESA", id).eq("ID_CLIENTE", tenantId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("CONTROL_REMESAS").delete().eq("ID_REMESA", id).eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const generarRemesaMensual = useMutation({
    mutationFn: async (input: GenerarRemesaMensualInput) => {
      const payload = assertGenerarRemesaRpcPayload({
        p_id_cliente: input.p_id_cliente,
        p_id_centro: input.p_id_centro,
        p_id_curso: input.p_id_curso,
        p_mes_periodo: input.p_mes_periodo,
      });

      console.log("PAYLOAD BEING SENT TO RPC:", payload);

      const { data, error } = await supabase.rpc("generar_remesa_mensual", payload);
      if (error) throw error;
      return data as GenerarRemesaMensualResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: tenantListKey("recibos", rol, tenantId) });
    },
  });

  const enviarRemesaBloque = useMutation({
    mutationFn: async (input: EnviarRemesaBloqueInput) => {
      const payload = assertGenerarRemesaRpcPayload({
        p_id_cliente: input.p_id_cliente,
        p_id_centro: input.p_id_centro,
        p_id_curso: input.p_id_curso,
        p_mes_periodo: input.p_mes_periodo,
      });

      const { data, error } = await supabase.rpc("enviar_remesa_bloque", payload);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: tenantListKey("recibos", rol, tenantId) });
    },
  });

  return { list, create, update, remove, generarRemesaMensual, enviarRemesaBloque };
}
