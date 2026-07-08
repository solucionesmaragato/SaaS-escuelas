import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { appendCenterFilter } from "@/lib/centroFilter";
import {
  scopeTenantQuery,
  workspaceListKey,
  workspaceScopeFields,
} from "@/lib/tenantQuery";
import type { HorarioMatricula, Matricula } from "@/types/database";

const MATRICULAS_LIST_SELECT = `
  *,
  ALUMNOS (
    NOMBRE_ALUMNO
  ),
  HORARIOS_MATRICULAS (
    *
  )
` as const;

export type MatriculaRow = Matricula & {
  ID_CURSO?: string | null;
  ALUMNOS: { NOMBRE_ALUMNO: string } | null;
  CENTROS: { NOMBRE_CENTRO: string } | null;
  CURSO_ESCOLAR: { NOMBRE_CURSO: string } | null;
  ESPECIALIDADES: { ESPECIALIDAD: string } | null;
  PROFESOR: { NOMBRE_PROFESOR: string } | null;
  HORARIOS_MATRICULAS: HorarioMatricula[];
};

export type MatriculasListResult = {
  rows: MatriculaRow[];
  especialidadById: Map<string, string>;
};

export type HorarioMatriculaRowInput = {
  ID_HORARIO?: string;
  ID_PROFESOR: string | null;
  DIA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  SALDO: number | null;
};

export type HorarioMatriculaSyncInput = {
  matriculaId: string;
  idCentro: string | null;
  idCurso: string | null;
  rows: HorarioMatriculaRowInput[];
  deletedIds: string[];
};

/** Exact columns accepted by HORARIOS_MATRICULAS (POST / PATCH). */
export type HorarioMatriculaDbPayload = {
  ID_HORARIO: string;
  ID_MATRICULA: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  ID_CENTRO: string;
  ID_CURSO: string;
  DIA: string;
  HORA_INICIO: string;
  HORA_FIN: string;
  SALDO: number | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isExistingHorarioId(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

function normalizeHorarioTime(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function buildHorarioDbPayload(
  row: HorarioMatriculaRowInput,
  ctx: {
    tenantId: string;
    matriculaId: string;
    idCentro: string | null;
    idCurso: string | null;
  },
): HorarioMatriculaDbPayload {
  if (!ctx.tenantId || !ctx.matriculaId) {
    throw new Error(
      "Faltan ID_CLIENTE o ID_MATRICULA para sincronizar el horario.",
    );
  }

  const idHorario = isExistingHorarioId(row.ID_HORARIO)
    ? row.ID_HORARIO
    : crypto.randomUUID();

  return {
    ID_HORARIO: idHorario,
    ID_MATRICULA: ctx.matriculaId,
    ID_CLIENTE: ctx.tenantId,
    ID_PROFESOR: row.ID_PROFESOR?.trim() ?? "",
    ID_CENTRO: ctx.idCentro?.trim() ?? "",
    ID_CURSO: ctx.idCurso?.trim() ?? "",
    DIA: row.DIA?.trim() ?? "",
    HORA_INICIO: normalizeHorarioTime(row.HORA_INICIO),
    HORA_FIN: normalizeHorarioTime(row.HORA_FIN),
    SALDO: row.SALDO,
  };
}

function hasHorarioRowContent(row: HorarioMatriculaRowInput): boolean {
  return Boolean(
    row.ID_PROFESOR?.trim() ||
      row.DIA?.trim() ||
      row.HORA_INICIO ||
      row.HORA_FIN ||
      row.SALDO != null,
  );
}

export function useMatriculas(filterCenterId?: string | null, alumnoId?: string | null) {
  const { tenantId, centerId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const resolvedCenterId =
    filterCenterId !== undefined ? filterCenterId : centerId;
  const queryKey = [
    ...workspaceListKey("matriculas", tenantId, resolvedCenterId ?? "all"),
    alumnoId ?? "all",
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<MatriculasListResult> => {
      let query = supabase.from("MATRICULAS").select(MATRICULAS_LIST_SELECT);
      query = scopeTenantQuery(query, rol, tenantId);
      query = appendCenterFilter(query, resolvedCenterId);
      if (alumnoId) query = query.eq("ID_ALUMNO", alumnoId);
      const { data: mats, error } = await query.order("FECHA_ALTA", { ascending: false });

      if (error) throw error;

      let espQuery = supabase.from("ESPECIALIDADES").select("*");
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);
      const { data: esp } = await espQuery;

      let profsQuery = supabase.from("PROFESOR").select("*");
      profsQuery = scopeTenantQuery(profsQuery, rol, tenantId);
      const { data: profs } = await profsQuery;

      let centrosQuery = supabase.from("CENTROS").select("ID_CENTRO, NOMBRE_CENTRO");
      centrosQuery = scopeTenantQuery(centrosQuery, rol, tenantId);
      const { data: centros, error: centrosError } = await centrosQuery;
      if (centrosError) throw centrosError;

      let cursosQuery = supabase.from("CURSO_ESCOLAR").select("ID_CURSO, NOMBRE_CURSO");
      cursosQuery = scopeTenantQuery(cursosQuery, rol, tenantId);
      const { data: cursos, error: cursosError } = await cursosQuery;
      if (cursosError) throw cursosError;

      const especialidadById = new Map(
        (esp ?? []).map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]),
      );
      const centroById = new Map(
        (centros ?? []).map((c) => [c.ID_CENTRO, c.NOMBRE_CENTRO]),
      );
      const cursoById = new Map(
        (cursos ?? []).map((c) => [c.ID_CURSO, c.NOMBRE_CURSO]),
      );

      const rows = (mats || [])
        .map((m: MatriculaRow) => {
          const espFound = esp?.find((e) => e.ID_ESPECIALIDAD === m.ESPECIALIDAD);
          const profFound = profs?.find((p) => p.ID_PROFESOR === m.ID_PROFESOR);
          const centroNombre = m.ID_CENTRO ? centroById.get(m.ID_CENTRO) : undefined;
          const cursoNombre = m.ID_CURSO ? cursoById.get(m.ID_CURSO) : undefined;

          return {
            ...m,
            ALUMNOS: m.ALUMNOS ?? null,
            HORARIOS_MATRICULAS: m.HORARIOS_MATRICULAS ?? [],
            CENTROS: centroNombre ? { NOMBRE_CENTRO: centroNombre } : null,
            CURSO_ESCOLAR: cursoNombre ? { NOMBRE_CURSO: cursoNombre } : null,
            ESPECIALIDADES: espFound ? { ESPECIALIDAD: espFound.ESPECIALIDAD } : null,
            PROFESOR: profFound ? { NOMBRE_PROFESOR: profFound.NOMBRE_PROFESOR } : null,
          };
        })
        .sort((a, b) =>
          (a.ALUMNOS?.NOMBRE_ALUMNO ?? "").localeCompare(
            b.ALUMNOS?.NOMBRE_ALUMNO ?? "",
            "es",
            { sensitivity: "base" },
          ),
        );

      return { rows, especialidadById };
    },
  });

  const create = useMutation({
    mutationFn: async (input: any) => {
      const payload = { ...input, ...workspaceScopeFields(tenantId, centerId) };
      const { data, error } = await supabase.from("MATRICULAS").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { data, error } = await supabase.from("MATRICULAS").update(patch).eq("ID_MATRICULA", id).eq("ID_CLIENTE", tenantId).select().single();
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("MATRICULAS").delete().eq("ID_MATRICULA", id).eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
  });

  const invalidateList = () => qc.invalidateQueries({ queryKey });

  const syncHorarios = useMutation({
    mutationFn: async (input: HorarioMatriculaSyncInput) => {
      const { matriculaId, idCentro, idCurso, rows, deletedIds } = input;

      if (!tenantId) {
        throw new Error("No se pudo determinar el ID_CLIENTE de la sesión activa.");
      }
      if (!matriculaId) {
        throw new Error("No se puede sincronizar horarios sin ID de matrícula.");
      }

      const payloadCtx = {
        tenantId,
        matriculaId,
        idCentro,
        idCurso,
      };

      for (const id of deletedIds) {
        if (!isExistingHorarioId(id)) continue;
        const { error } = await supabase
          .from("HORARIOS_MATRICULAS")
          .delete()
          .eq("ID_HORARIO", id)
          .eq("ID_CLIENTE", tenantId);
        if (error) throw error;
      }

      for (const row of rows) {
        if (isExistingHorarioId(row.ID_HORARIO)) {
          const payload = buildHorarioDbPayload(row, payloadCtx);
          const { error } = await supabase
            .from("HORARIOS_MATRICULAS")
            .update(payload)
            .eq("ID_HORARIO", row.ID_HORARIO)
            .eq("ID_CLIENTE", tenantId);
          if (error) throw error;
          continue;
        }

        if (!hasHorarioRowContent(row)) continue;

        const payload = buildHorarioDbPayload(row, payloadCtx);
        const { error } = await supabase
          .from("HORARIOS_MATRICULAS")
          .insert(payload);
        if (error) throw error;
      }
    },
  });

  return { list, create, update, syncHorarios, remove, invalidateList };
}
