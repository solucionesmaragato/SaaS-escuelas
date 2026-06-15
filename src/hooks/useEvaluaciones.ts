import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import {
  isMasterRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";

const EVALUACION_SELECT_COLUMNS =
  "ID_EVALUACION, ID_CLIENTE, ANO, TRIMESTRE, CURSO, ID_ALUMNO, ID_ESPECIALIDAD, ID_PROFESOR, ID_RUBRICA, NOTA_MEDIA, COMENTARIOS, RESULTADOS_RUBRICA, CREADO_POR, MODIFICADO_POR, CREATED_AT, UPDATED_AT" as const;

export interface EvaluacionData {
  ID_EVALUACION: string;
  ID_CLIENTE: string;
  ANO: string;
  TRIMESTRE: string;
  CURSO: string;
  ID_ALUMNO: string;
  ID_ESPECIALIDAD: string;
  ID_PROFESOR: string | null;
  ID_RUBRICA: string | null;
  NOTA_MEDIA: number | null;
  COMENTARIOS: string | null;
  RESULTADOS_RUBRICA: Record<string, unknown> | null;
  CREADO_POR: string | null;
  MODIFICADO_POR: string | null;
  CREATED_AT: string | null;
  UPDATED_AT: string | null;
}

export const TRIMESTRE_VALUES = ["1", "2", "3", "FINAL"] as const;
export type TrimestreValue = (typeof TRIMESTRE_VALUES)[number];

export function isTrimestreValue(value: string | null | undefined): value is TrimestreValue {
  return TRIMESTRE_VALUES.includes(value as TrimestreValue);
}

export function currentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

export function evaluationLookupKey(
  trimestre: string,
  idAlumno: string,
  idEspecialidad: string,
): string {
  return `${trimestre}::${idAlumno}::${idEspecialidad}`;
}

export function buildEvaluationIndex(
  evaluaciones: EvaluacionData[],
  ano: string,
): Map<string, EvaluacionData> {
  const map = new Map<string, EvaluacionData>();
  for (const ev of evaluaciones) {
    if (ev.ANO !== ano) continue;
    map.set(
      evaluationLookupKey(ev.TRIMESTRE, ev.ID_ALUMNO, ev.ID_ESPECIALIDAD),
      ev,
    );
  }
  return map;
}

export type EvaluacionUpsertItem = {
  id?: string;
  input: EvaluacionCreateInput;
};

export type EvaluacionCreateInput = {
  ANO: string;
  TRIMESTRE: string;
  CURSO: string;
  ID_ALUMNO: string;
  ID_ESPECIALIDAD: string;
  NOTA_MEDIA: number;
  COMENTARIOS?: string | null;
  ID_PROFESOR?: string | null;
  ID_RUBRICA?: string | null;
  RESULTADOS_RUBRICA?: Record<string, unknown> | null;
};

type EvaluacionPayloadValue = string | number | null | Record<string, unknown>;

export type EvaluacionUpdateInput = Partial<EvaluacionCreateInput>;

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

function normalizeTrimestre(value: string): TrimestreValue {
  const trimmed = value.trim();
  if (isTrimestreValue(trimmed)) return trimmed;
  throw new Error(`TRIMESTRE inválido: "${value}". Solo se permite 1, 2, 3 o FINAL.`);
}

function normalizeNotaMedia(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("NOTA_MEDIA debe ser un número válido.");
  }
  if (value < 0 || value > 10) {
    throw new Error("NOTA_MEDIA debe estar entre 0 y 10.");
  }
  return Math.round(value * 100) / 100;
}

function buildCreatePayload(input: EvaluacionCreateInput): Record<string, EvaluacionPayloadValue> {
  const idAlumno = input.ID_ALUMNO.trim();
  const idEspecialidad = input.ID_ESPECIALIDAD.trim();
  const curso = input.CURSO.trim();
  const ano = input.ANO.trim();

  if (!ano) throw new Error("ANO es obligatorio.");
  if (!curso) throw new Error("CURSO es obligatorio.");
  if (!idAlumno) throw new Error("ID_ALUMNO es obligatorio.");
  if (!idEspecialidad) throw new Error("ID_ESPECIALIDAD es obligatorio.");

  const payload: Record<string, EvaluacionPayloadValue> = {
    ANO: ano,
    TRIMESTRE: normalizeTrimestre(input.TRIMESTRE),
    CURSO: curso,
    ID_ALUMNO: idAlumno,
    ID_ESPECIALIDAD: idEspecialidad,
    NOTA_MEDIA: normalizeNotaMedia(input.NOTA_MEDIA),
    COMENTARIOS: input.COMENTARIOS?.trim() || null,
  };

  if (input.ID_PROFESOR !== undefined) {
    payload.ID_PROFESOR = input.ID_PROFESOR?.trim() || null;
  }
  if (input.ID_RUBRICA !== undefined) {
    payload.ID_RUBRICA = input.ID_RUBRICA?.trim() || null;
  }
  if (input.RESULTADOS_RUBRICA !== undefined) {
    payload.RESULTADOS_RUBRICA = input.RESULTADOS_RUBRICA;
  }

  return payload;
}

function buildUpdatePayload(patch: EvaluacionUpdateInput): Record<string, EvaluacionPayloadValue> {
  const result: Record<string, EvaluacionPayloadValue> = {};

  if (patch.ANO !== undefined) {
    const ano = patch.ANO.trim();
    if (!ano) throw new Error("ANO es obligatorio.");
    result.ANO = ano;
  }
  if (patch.TRIMESTRE !== undefined) {
    result.TRIMESTRE = normalizeTrimestre(patch.TRIMESTRE);
  }
  if (patch.CURSO !== undefined) {
    const curso = patch.CURSO.trim();
    if (!curso) throw new Error("CURSO es obligatorio.");
    result.CURSO = curso;
  }
  if (patch.ID_ALUMNO !== undefined) {
    const idAlumno = patch.ID_ALUMNO.trim();
    if (!idAlumno) throw new Error("ID_ALUMNO es obligatorio.");
    result.ID_ALUMNO = idAlumno;
  }
  if (patch.ID_ESPECIALIDAD !== undefined) {
    const idEspecialidad = patch.ID_ESPECIALIDAD.trim();
    if (!idEspecialidad) throw new Error("ID_ESPECIALIDAD es obligatorio.");
    result.ID_ESPECIALIDAD = idEspecialidad;
  }
  if (patch.NOTA_MEDIA !== undefined) {
    result.NOTA_MEDIA = normalizeNotaMedia(patch.NOTA_MEDIA);
  }
  if (patch.COMENTARIOS !== undefined) {
    result.COMENTARIOS = patch.COMENTARIOS?.trim() || null;
  }
  if (patch.ID_PROFESOR !== undefined) {
    result.ID_PROFESOR = patch.ID_PROFESOR?.trim() || null;
  }
  if (patch.ID_RUBRICA !== undefined) {
    result.ID_RUBRICA = patch.ID_RUBRICA?.trim() || null;
  }
  if (patch.RESULTADOS_RUBRICA !== undefined) {
    result.RESULTADOS_RUBRICA = patch.RESULTADOS_RUBRICA;
  }

  return result;
}

export function useEvaluaciones(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("evaluaciones", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<EvaluacionData[]> => {
      // EVALUACIONES has no ID_CENTRO — scope by ALUMNOS.ID_CENTRO via ID_ALUMNO.
      const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);
      if (alumnoIds && alumnoIds.length === 0) return [];

      let query = supabase
        .from("EVALUACIONES")
        .select(EVALUACION_SELECT_COLUMNS);
      query = scopeTenantQuery(query, rol, tenantId);
      const scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
      if (scoped === "empty") return [];

      const { data, error } = await scoped
        .order("ANO", { ascending: false })
        .order("TRIMESTRE", { ascending: true })
        .order("CURSO", { ascending: true });

      if (error) throw error;
      return (data ?? []) as EvaluacionData[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: EvaluacionCreateInput) => {
      const payload = buildCreatePayload(input);
      console.log("PAYLOAD SENT TO SUPABASE (EVALUACION CREATE):", payload);

      const { data, error } = await supabase
        .from("EVALUACIONES")
        .insert(payload)
        .select(EVALUACION_SELECT_COLUMNS)
        .single();

      if (error) {
        logSupabaseError("EVALUACION CREATE", error);
        throw error;
      }
      return data as EvaluacionData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: EvaluacionUpdateInput;
    }) => {
      const finalPatch = buildUpdatePayload(patch);
      console.log("PAYLOAD SENT TO SUPABASE (EVALUACION UPDATE):", finalPatch);

      let query = supabase
        .from("EVALUACIONES")
        .update(finalPatch)
        .eq("ID_EVALUACION", id);

      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { data, error } = await query
        .select(EVALUACION_SELECT_COLUMNS)
        .maybeSingle();

      if (error) {
        logSupabaseError("EVALUACION UPDATE", error);
        throw error;
      }
      if (!data) {
        throw new Error("No se encontró la evaluación o no tienes permiso para modificarla.");
      }
      return data as EvaluacionData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const batchUpsert = useMutation({
    mutationFn: async (items: EvaluacionUpsertItem[]) => {
      const results: EvaluacionData[] = [];

      for (const item of items) {
        if (item.id) {
          const finalPatch = buildUpdatePayload(item.input);
          let query = supabase
            .from("EVALUACIONES")
            .update(finalPatch)
            .eq("ID_EVALUACION", item.id);

          if (!isMasterRole(rol)) {
            query = query.eq("ID_CLIENTE", tenantId);
          }

          const { data, error } = await query
            .select(EVALUACION_SELECT_COLUMNS)
            .maybeSingle();

          if (error) {
            logSupabaseError("EVALUACION BATCH UPDATE", error);
            throw error;
          }
          if (!data) {
            throw new Error("No se pudo actualizar una evaluación del lote.");
          }
          results.push(data as EvaluacionData);
        } else {
          const payload = buildCreatePayload(item.input);
          const { data, error } = await supabase
            .from("EVALUACIONES")
            .insert(payload)
            .select(EVALUACION_SELECT_COLUMNS)
            .single();

          if (error) {
            logSupabaseError("EVALUACION BATCH CREATE", error);
            throw error;
          }
          results.push(data as EvaluacionData);
        }
      }

      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  return { list, create, update, batchUpsert };
}
