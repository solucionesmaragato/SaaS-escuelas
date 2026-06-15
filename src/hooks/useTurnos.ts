import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";

export type ProfesorLookup = {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  FECHA_BAJA?: string | null;
};

export type EspecialidadLookup = {
  ID_ESPECIALIDAD: string;
  ESPECIALIDAD: string;
};

export type TurnoData = {
  ID_TURNO: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  DIA_SEMANA: string;
  ABRE_MAÑANA: string | null;
  CIERRA_MAÑANA: string | null;
  ABRE_TARDE: string | null;
  CIERRA_TARDE: string | null;
  ESPECIALIDAD: string[] | null;
  TEXTO_ESPECIALIDADES: string;
};

export type TurnosQueryData = {
  turnos: TurnoData[];
  profesores: ProfesorLookup[];
  especialidades: EspecialidadLookup[];
};

export type TurnoCreateInput = {
  ID_PROFESOR: string;
  DIA_SEMANA: string;
  ABRE_MAÑANA?: string | null;
  CIERRA_MAÑANA?: string | null;
  ABRE_TARDE?: string | null;
  CIERRA_TARDE?: string | null;
  ESPECIALIDAD?: string[] | null;
};

export type TurnoDayScheduleInput = {
  DIA_SEMANA: string;
  ABRE_MAÑANA?: string | null;
  CIERRA_MAÑANA?: string | null;
  ABRE_TARDE?: string | null;
  CIERRA_TARDE?: string | null;
};

/** Bulk create: one independent row per day entry with its own schedule. */
export type TurnoBulkCreateInput = {
  ID_PROFESOR: string;
  ESPECIALIDAD?: string[] | null;
  registros: TurnoDayScheduleInput[];
};

export type TurnoUpdateInput = Partial<TurnoCreateInput>;

const DAY_INSERT_ORDER: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  Miercoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sabado: 6,
  Domingo: 7,
};

const TIMES_ONLY_UPDATE_KEYS = [
  "ABRE_MAÑANA",
  "CIERRA_MAÑANA",
  "ABRE_TARDE",
  "CIERRA_TARDE",
] as const satisfies readonly (keyof TurnoUpdateInput)[];

function isTimesOnlyEditor(
  rol: string | null | undefined,
  perfilProfesorId: string | null | undefined,
  turnoProfesorId: string | null | undefined,
): boolean {
  if (isProfesorRole(rol)) return true;
  if (isDireccionRole(rol)) {
    return (
      !!perfilProfesorId &&
      !!turnoProfesorId &&
      perfilProfesorId === turnoProfesorId
    );
  }
  return false;
}

function assertCanUpdateTurno(
  rol: string | null | undefined,
  perfilProfesorId: string | null | undefined,
  turnoProfesorId: string | null | undefined,
) {
  assertCanModify(rol);
  if (
    isDireccionRole(rol) &&
    perfilProfesorId &&
    turnoProfesorId &&
    perfilProfesorId !== turnoProfesorId
  ) {
    throw new Error("No puedes modificar la disponibilidad de otro profesor.");
  }
}

function restrictTimesOnlyPatch(patch: TurnoUpdateInput): TurnoUpdateInput {
  const restricted: TurnoUpdateInput = {};
  for (const key of TIMES_ONLY_UPDATE_KEYS) {
    if (key in patch) {
      restricted[key] = patch[key] as never;
    }
  }
  return restricted;
}

type TurnoRow = {
  ID_TURNO: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  DIA_SEMANA: string;
  ABRE_MAÑANA: string | null;
  CIERRA_MAÑANA: string | null;
  ABRE_TARDE: string | null;
  CIERRA_TARDE: string | null;
  ESPECIALIDAD: unknown;
};

function assertCanCreate(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para crear turnos.");
}

function assertCanModify(rol: string | null | undefined) {
  if (
    isMasterRole(rol) ||
    isAdminRole(rol) ||
    isDireccionRole(rol) ||
    isProfesorRole(rol)
  ) {
    return;
  }
  throw new Error("No tienes permiso para modificar turnos.");
}

function assertCanDelete(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para eliminar turnos.");
}

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function nullIfEmptyTime(value: string | null | undefined): string | null {
  return nullIfEmpty(value);
}

function parseIdArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      return [trimmed];
    }
  }
  return [];
}

function normalizeJsonArrayField(ids: string[] | null | undefined): string[] | null {
  if (!ids || ids.length === 0) return null;
  const cleaned = ids.map((id) => id.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeTurnoPayload(
  input: TurnoCreateInput | TurnoUpdateInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("ID_PROFESOR" in input && input.ID_PROFESOR !== undefined) {
    payload.ID_PROFESOR = input.ID_PROFESOR.trim();
  }
  if ("DIA_SEMANA" in input && input.DIA_SEMANA !== undefined) {
    payload.DIA_SEMANA = input.DIA_SEMANA.trim();
  }
  if ("ABRE_MAÑANA" in input) {
    payload.ABRE_MAÑANA = nullIfEmptyTime(input.ABRE_MAÑANA);
  }
  if ("CIERRA_MAÑANA" in input) {
    payload.CIERRA_MAÑANA = nullIfEmptyTime(input.CIERRA_MAÑANA);
  }
  if ("ABRE_TARDE" in input) {
    payload.ABRE_TARDE = nullIfEmptyTime(input.ABRE_TARDE);
  }
  if ("CIERRA_TARDE" in input) {
    payload.CIERRA_TARDE = nullIfEmptyTime(input.CIERRA_TARDE);
  }
  if ("ESPECIALIDAD" in input) {
    payload.ESPECIALIDAD = normalizeJsonArrayField(input.ESPECIALIDAD);
  }

  return payload;
}

function mapTurnos(
  rows: TurnoRow[],
  profesores: ProfesorLookup[],
  especialidades: EspecialidadLookup[],
): TurnoData[] {
  const profById = new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR]));
  const espById = new Map(especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]));

  return rows.map((row) => {
    const espIds = parseIdArray(row.ESPECIALIDAD);
    const espNames = espIds.map((id) => espById.get(id) ?? id).filter(Boolean);

    return {
      ID_TURNO: row.ID_TURNO,
      ID_CLIENTE: row.ID_CLIENTE,
      ID_PROFESOR: row.ID_PROFESOR,
      NOMBRE_PROFESOR: profById.get(row.ID_PROFESOR) ?? row.ID_PROFESOR,
      DIA_SEMANA: row.DIA_SEMANA,
      ABRE_MAÑANA: row.ABRE_MAÑANA,
      CIERRA_MAÑANA: row.CIERRA_MAÑANA,
      ABRE_TARDE: row.ABRE_TARDE,
      CIERRA_TARDE: row.CIERRA_TARDE,
      ESPECIALIDAD: espIds.length > 0 ? espIds : null,
      TEXTO_ESPECIALIDADES: espNames.length > 0 ? espNames.join(", ") : "—",
    };
  });
}

export function useTurnos() {
  const { tenantId, rol, perfil } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("turnos", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<TurnosQueryData> => {
      let turnosQuery = supabase.from("TURNOS_PROFESORES").select("*");
      turnosQuery = scopeTenantQuery(turnosQuery, rol, tenantId);

      let profQuery = supabase
        .from("PROFESOR")
        .select("ID_PROFESOR, NOMBRE_PROFESOR, FECHA_BAJA")
        .order("NOMBRE_PROFESOR", { ascending: true });
      profQuery = scopeTenantQuery(profQuery, rol, tenantId);

      let espQuery = supabase
        .from("ESPECIALIDADES")
        .select("ID_ESPECIALIDAD, ESPECIALIDAD")
        .order("ESPECIALIDAD", { ascending: true });
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);

      const [
        { data: turnos, error },
        { data: profs, error: profError },
        { data: esp, error: espError },
      ] = await Promise.all([
        turnosQuery.order("DIA_SEMANA", { ascending: true }),
        profQuery,
        espQuery,
      ]);

      if (error) throw error;
      if (profError) throw profError;
      if (espError) throw espError;

      const profesoresRows = (profs ?? []) as ProfesorLookup[];
      const especialidadesRows = (esp ?? []) as EspecialidadLookup[];

      return {
        turnos: mapTurnos(
          (turnos ?? []) as TurnoRow[],
          profesoresRows,
          especialidadesRows,
        ),
        profesores: profesoresRows,
        especialidades: especialidadesRows,
      };
    },
  });

  const create = useMutation({
    mutationFn: async (input: TurnoBulkCreateInput) => {
      assertCanCreate(rol);

      const registros = [...input.registros]
        .filter((r) => r.DIA_SEMANA?.trim())
        .sort(
          (a, b) =>
            (DAY_INSERT_ORDER[a.DIA_SEMANA] ?? 99) -
            (DAY_INSERT_ORDER[b.DIA_SEMANA] ?? 99),
        );

      if (registros.length === 0) {
        throw new Error("Selecciona al menos un día de la semana.");
      }

      const payloads = registros.map((registro) =>
        sanitizeTurnoPayload({
          ID_PROFESOR: input.ID_PROFESOR,
          DIA_SEMANA: registro.DIA_SEMANA.trim(),
          ABRE_MAÑANA: registro.ABRE_MAÑANA,
          CIERRA_MAÑANA: registro.CIERRA_MAÑANA,
          ABRE_TARDE: registro.ABRE_TARDE,
          CIERRA_TARDE: registro.CIERRA_TARDE,
          ESPECIALIDAD: input.ESPECIALIDAD,
        }),
      );

      const { data, error } = await supabase
        .from("TURNOS_PROFESORES")
        .insert(payloads)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
      turnoProfesorId,
    }: {
      id: string;
      patch: TurnoUpdateInput;
      turnoProfesorId?: string;
    }) => {
      assertCanUpdateTurno(rol, perfil.ID_PROFESOR, turnoProfesorId);
      const effectivePatch = isTimesOnlyEditor(rol, perfil.ID_PROFESOR, turnoProfesorId)
        ? restrictTimesOnlyPatch(patch)
        : patch;
      const payload = sanitizeTurnoPayload(effectivePatch);
      const { data, error } = await supabase
        .from("TURNOS_PROFESORES")
        .update(payload)
        .eq("ID_TURNO", id)
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
      assertCanDelete(rol);
      const { error } = await supabase
        .from("TURNOS_PROFESORES")
        .delete()
        .eq("ID_TURNO", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
