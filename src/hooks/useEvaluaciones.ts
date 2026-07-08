import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  "ID_EVALUACION, ID_CLIENTE, ID_PROFESOR, TRIMESTRE, ID_CURSO, ID_ALUMNO, ID_ESPECIALIDAD, NOTA_MEDIA, COMENTARIOS, ID_RUBRICA, RESULTADOS_RUBRICA, ESTADO" as const;

export interface EvaluacionData {
  ID_EVALUACION: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string | null;
  TRIMESTRE: string;
  ID_CURSO: string | null;
  ID_ALUMNO: string;
  ID_ESPECIALIDAD: string;
  NOTA_MEDIA: number | string | null;
  COMENTARIOS: string | null;
  ID_RUBRICA: string | null;
  RESULTADOS_RUBRICA: Record<string, unknown> | null;
  ESTADO: string | null;
}

export const TRIMESTRE_VALUES = ["1", "2", "3", "FINAL"] as const;
export type TrimestreValue = (typeof TRIMESTRE_VALUES)[number];

export const EVALUACION_ESTADO_BORRADOR = "Borrador" as const;

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
  idCurso: string,
): Map<string, EvaluacionData> {
  const map = new Map<string, EvaluacionData>();
  for (const ev of evaluaciones) {
    if ((ev.ID_CURSO ?? "") !== idCurso) continue;
    map.set(
      evaluationLookupKey(ev.TRIMESTRE, ev.ID_ALUMNO, ev.ID_ESPECIALIDAD),
      ev,
    );
  }
  return map;
}

export type EvaluacionBatchUpsertInput = {
  ID_EVALUACION?: string;
  ID_ALUMNO: string;
  ID_CURSO: string;
  TRIMESTRE: string;
  ID_ESPECIALIDAD: string;
  ID_PROFESOR: string | null;
  NOTA_MEDIA: number | string;
  ID_RUBRICA: string | null;
  COMENTARIOS: string | null;
  RESULTADOS_RUBRICA?: Record<string, string | number> | null;
};

/** @deprecated Use EvaluacionBatchUpsertInput for new flows */
export type EvaluacionUpsertItem = {
  id?: string;
  input: EvaluacionCreateInput;
};

/** @deprecated Teacher dashboard legacy shape — prefer EvaluacionBatchUpsertInput */
export type EvaluacionCreateInput = {
  TRIMESTRE: string;
  ID_ALUMNO: string;
  ID_ESPECIALIDAD: string;
  NOTA_MEDIA: number | string;
  COMENTARIOS?: string | null;
  ID_PROFESOR?: string | null;
  ID_RUBRICA?: string | null;
  RESULTADOS_RUBRICA?: Record<string, string | number> | null;
  ID_CURSO?: string;
  ESTADO?: string;
};

export type EvaluacionUpdateInput = Partial<EvaluacionCreateInput>;

type EvaluacionPayloadValue = string | number | null | Record<string, unknown>;

type SupabaseErrorLike = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

export const EVALUACION_DUPLICATE_TITLE = "Evaluación Duplicada";
export const EVALUACION_DUPLICATE_DESCRIPTION =
  "Ya se ha registrado una evaluación para este alumno en esta asignatura durante este trimestre.";

export class EvaluacionDuplicateError extends Error {
  readonly title = EVALUACION_DUPLICATE_TITLE;
  readonly description = EVALUACION_DUPLICATE_DESCRIPTION;

  constructor() {
    super(EVALUACION_DUPLICATE_DESCRIPTION);
    this.name = "EvaluacionDuplicateError";
  }
}

export function isEvaluacionDuplicateError(error: unknown): boolean {
  if (error instanceof EvaluacionDuplicateError) return true;
  return (
    error != null &&
    typeof error === "object" &&
    (error as SupabaseErrorLike).code === "23505"
  );
}

export function showEvaluacionSaveError(error: unknown): void {
  if (isEvaluacionDuplicateError(error)) {
    toast.error(EVALUACION_DUPLICATE_TITLE, {
      description: EVALUACION_DUPLICATE_DESCRIPTION,
    });
    return;
  }
  toast.error(formatSupabaseError(error));
}

function rethrowEvaluacionSupabaseError(error: unknown): never {
  if (isEvaluacionDuplicateError(error)) {
    throw new EvaluacionDuplicateError();
  }
  throw error;
}

function logSupabaseError(context: string, error: unknown) {
  console.error(`SUPABASE ${context} ERROR:`, error);
}

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

function normalizeTrimestre(value: string): TrimestreValue {
  const trimmed = value.trim();
  if (isTrimestreValue(trimmed)) return trimmed;
  throw new Error(`TRIMESTRE inválido: "${value}". Solo se permite 1, 2, 3 o FINAL.`);
}

function normalizeNotaMedia(value: number | string): number | string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("NOTA_MEDIA debe ser un número válido.");
    }
    if (value < 0 || value > 10) {
      throw new Error("NOTA_MEDIA debe estar entre 0 y 10.");
    }
    return Math.round(value * 100) / 100;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("NOTA_MEDIA es obligatoria.");
  }

  const num = Number(trimmed);
  if (Number.isFinite(num)) {
    if (num < 0 || num > 10) {
      throw new Error("NOTA_MEDIA debe estar entre 0 y 10.");
    }
    return Math.round(num * 100) / 100;
  }

  return trimmed;
}

export function buildEvaluacionUpsertPayload(
  input: EvaluacionBatchUpsertInput,
  tenantId: string,
): Record<string, EvaluacionPayloadValue> {
  const idAlumno = input.ID_ALUMNO.trim();
  const idCurso = input.ID_CURSO.trim();
  const idEspecialidad = input.ID_ESPECIALIDAD.trim();

  if (!idAlumno) throw new Error("ID_ALUMNO es obligatorio.");
  if (!idCurso) throw new Error("ID_CURSO es obligatorio.");
  if (!idEspecialidad) throw new Error("ID_ESPECIALIDAD es obligatorio.");

  const payload: Record<string, EvaluacionPayloadValue> = {
    ID_CLIENTE: tenantId,
    ID_ALUMNO: idAlumno,
    ID_CURSO: idCurso,
    TRIMESTRE: normalizeTrimestre(input.TRIMESTRE),
    ID_ESPECIALIDAD: idEspecialidad,
    ID_PROFESOR: input.ID_PROFESOR?.trim() || null,
    NOTA_MEDIA: normalizeNotaMedia(input.NOTA_MEDIA),
    ID_RUBRICA: input.ID_RUBRICA?.trim() || null,
    COMENTARIOS: input.COMENTARIOS?.trim() || null,
    ESTADO: EVALUACION_ESTADO_BORRADOR,
    RESULTADOS_RUBRICA: input.RESULTADOS_RUBRICA ?? null,
  };

  const idEvaluacion = input.ID_EVALUACION?.trim();
  if (idEvaluacion) payload.ID_EVALUACION = idEvaluacion;

  return payload;
}

function buildTeacherCreatePayload(
  input: EvaluacionCreateInput,
  tenantId: string,
): Record<string, EvaluacionPayloadValue> {
  const idAlumno = input.ID_ALUMNO.trim();
  const idEspecialidad = input.ID_ESPECIALIDAD.trim();
  const idCurso = input.ID_CURSO?.trim();

  if (!idAlumno) throw new Error("ID_ALUMNO es obligatorio.");
  if (!idEspecialidad) throw new Error("ID_ESPECIALIDAD es obligatorio.");
  if (!idCurso) throw new Error("ID_CURSO es obligatorio.");

  const payload: Record<string, EvaluacionPayloadValue> = {
    ID_CLIENTE: tenantId,
    ID_ALUMNO: idAlumno,
    ID_CURSO: idCurso,
    TRIMESTRE: normalizeTrimestre(input.TRIMESTRE),
    ID_ESPECIALIDAD: idEspecialidad,
    NOTA_MEDIA: normalizeNotaMedia(input.NOTA_MEDIA),
    COMENTARIOS: input.COMENTARIOS?.trim() || null,
    ESTADO: input.ESTADO?.trim() || EVALUACION_ESTADO_BORRADOR,
    RESULTADOS_RUBRICA: input.RESULTADOS_RUBRICA ?? null,
  };

  if (input.ID_PROFESOR !== undefined) {
    payload.ID_PROFESOR = input.ID_PROFESOR?.trim() || null;
  }
  if (input.ID_RUBRICA !== undefined) {
    payload.ID_RUBRICA = input.ID_RUBRICA?.trim() || null;
  }

  return payload;
}

function buildUpdatePayload(patch: EvaluacionUpdateInput): Record<string, EvaluacionPayloadValue> {
  const result: Record<string, EvaluacionPayloadValue> = {};

  if (patch.ID_CURSO !== undefined) {
    const idCurso = patch.ID_CURSO.trim();
    if (!idCurso) throw new Error("ID_CURSO es obligatorio.");
    result.ID_CURSO = idCurso;
  }
  if (patch.TRIMESTRE !== undefined) {
    result.TRIMESTRE = normalizeTrimestre(patch.TRIMESTRE);
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
  if (patch.ESTADO !== undefined) {
    result.ESTADO = patch.ESTADO?.trim() || EVALUACION_ESTADO_BORRADOR;
  }

  return result;
}

export function useEvaluaciones(
  filterCenterId?: string | null,
  alumnoId?: string | null,
  profesorId?: string | null,
) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("evaluaciones", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
    alumnoId ?? "all",
    profesorId ?? "all",
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<EvaluacionData[]> => {
      const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);
      if (alumnoIds && alumnoIds.length === 0) return [];

      let query = supabase
        .from("EVALUACIONES")
        .select(EVALUACION_SELECT_COLUMNS);
      query = scopeTenantQuery(query, rol, tenantId);
      const scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
      if (scoped === "empty") return [];
      let finalQuery = alumnoId ? scoped.eq("ID_ALUMNO", alumnoId) : scoped;
      if (profesorId) finalQuery = finalQuery.eq("ID_PROFESOR", profesorId);

      const { data, error } = await finalQuery
        .order("ID_CURSO", { ascending: false })
        .order("TRIMESTRE", { ascending: true });

      if (error) throw error;
      return (data ?? []) as EvaluacionData[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: EvaluacionCreateInput) => {
      const payload = buildTeacherCreatePayload(input, tenantId);
      console.log("PAYLOAD SENT TO SUPABASE (EVALUACION CREATE):", payload);

      const { data, error } = await supabase
        .from("EVALUACIONES")
        .insert(payload)
        .select(EVALUACION_SELECT_COLUMNS)
        .single();

      if (error) {
        logSupabaseError("EVALUACION CREATE", error);
        rethrowEvaluacionSupabaseError(error);
      }
      return data as EvaluacionData;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const upsertEvaluaciones = useMutation({
    mutationFn: async (inputs: EvaluacionBatchUpsertInput[]) => {
      if (inputs.length === 0) {
        throw new Error("No hay evaluaciones para guardar.");
      }

      const payloads = inputs.map((input) => buildEvaluacionUpsertPayload(input, tenantId));
      console.log("PAYLOAD SENT TO SUPABASE (EVALUACIONES UPSERT):", payloads);

      const { data, error } = await supabase
        .from("EVALUACIONES")
        .upsert(payloads)
        .select(EVALUACION_SELECT_COLUMNS);

      if (error) {
        logSupabaseError("EVALUACIONES UPSERT", error);
        rethrowEvaluacionSupabaseError(error);
      }
      return (data ?? []) as EvaluacionData[];
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
        rethrowEvaluacionSupabaseError(error);
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
            rethrowEvaluacionSupabaseError(error);
          }
          if (!data) {
            throw new Error("No se pudo actualizar una evaluación del lote.");
          }
          results.push(data as EvaluacionData);
        } else {
          const payload = buildTeacherCreatePayload(item.input, tenantId);
          const { data, error } = await supabase
            .from("EVALUACIONES")
            .insert(payload)
            .select(EVALUACION_SELECT_COLUMNS)
            .single();

          if (error) {
            logSupabaseError("EVALUACION BATCH CREATE", error);
            rethrowEvaluacionSupabaseError(error);
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

  return { list, create, upsertEvaluaciones, update, batchUpsert };
}
