import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  canViewMiPerfilNav,
  isAdminRole,
  isMasterRole,
  isProfesorRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";
import type { Rol } from "@/types/database";

export class ProfesorPerfilAssignError extends Error {
  readonly profesorId: string;

  constructor(profesorId: string) {
    super(
      "El profesor se creó correctamente, pero hubo un error al asignar su perfil y rol en el sistema.",
    );
    this.name = "ProfesorPerfilAssignError";
    this.profesorId = profesorId;
  }
}

export class ProfesorPerfilRolUpdateError extends Error {
  readonly profesorId: string;

  constructor(profesorId: string) {
    super(
      "Los datos del profesor se actualizaron correctamente, pero hubo un error al actualizar su rol en el sistema.",
    );
    this.name = "ProfesorPerfilRolUpdateError";
    this.profesorId = profesorId;
  }
}

export class ProfesorEmailSyncError extends Error {
  readonly profesorId: string;

  constructor(profesorId: string, message: string) {
    super(message);
    this.name = "ProfesorEmailSyncError";
    this.profesorId = profesorId;
  }
}

export type AulaLookup = {
  ID_AULA: string;
  NOMBRE_AULA: string;
};

export type EspecialidadLookup = {
  ID_ESPECIALIDAD: string;
  ESPECIALIDAD: string;
};

export type ProfesorData = {
  ID_PROFESOR: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  NOMBRE_PROFESOR: string;
  TELEFONO: string | null;
  ESPECIALIDAD: string[] | null;
  AULA: string[] | null;
  EMAIL_PROFESORES: string | null;
  DNI: string | null;
  N_SEG_SOCIAL: string | null;
  DOMICILIO: string | null;
  NACIMIENTO: string | null;
  FECHA_ALTA: string | null;
  SALDO_VACACIONES: number | null;
  SALDO_AP: number | null;
  FECHA_BAJA: string | null;
  TEXTO_ESPECIALIDADES: string;
  TEXTO_AULAS: string;
};

export type ProfesoresQueryData = {
  profesores: ProfesorData[];
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
};

export type ProfesorCreateInput = {
  NOMBRE_PROFESOR: string;
  ROL?: Rol;
  ID_CENTRO?: string | null;
  TELEFONO?: string | null;
  ESPECIALIDAD?: string[] | null;
  AULA?: string[] | null;
  EMAIL_PROFESORES?: string | null;
  DNI?: string | null;
  N_SEG_SOCIAL?: string | null;
  DOMICILIO?: string | null;
  NACIMIENTO?: string | null;
  SALDO_VACACIONES?: number | null;
  SALDO_AP?: number | null;
  FECHA_BAJA?: string | null;
};

export type ProfesorUpdateInput = Partial<ProfesorCreateInput> & {
  FECHA_ALTA?: string | null;
};

const SELF_PROFILE_UPDATE_KEYS = [
  "TELEFONO",
  "EMAIL_PROFESORES",
  "DOMICILIO",
  "NACIMIENTO",
] as const satisfies readonly (keyof ProfesorUpdateInput)[];

export function findProfesorByPerfilId(
  profesores: ProfesorData[],
  profesorId: string | null | undefined,
): ProfesorData | null {
  if (!profesorId) return null;
  return profesores.find((p) => p.ID_PROFESOR === profesorId) ?? null;
}

function restrictSelfProfilePatch(patch: ProfesorUpdateInput): ProfesorUpdateInput {
  const restricted: ProfesorUpdateInput = {};
  for (const key of SELF_PROFILE_UPDATE_KEYS) {
    if (key in patch) {
      restricted[key] = patch[key] as never;
    }
  }
  return restricted;
}

type ProfesorRow = {
  ID_PROFESOR: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  NOMBRE_PROFESOR: string;
  TELEFONO: string | null;
  ESPECIALIDAD: unknown;
  AULA: unknown;
  EMAIL_PROFESORES: string | null;
  DNI: string | null;
  N_SEG_SOCIAL: string | null;
  DOMICILIO: string | null;
  NACIMIENTO: string | null;
  FECHA_ALTA: string | null;
  SALDO_VACACIONES: number | string | null;
  SALDO_AP: number | string | null;
  FECHA_BAJA: string | null;
};

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeProfesorEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function rethrowProfesorEmailSyncError(error: unknown, profesorId: string): never {
  const message = extractErrorMessage(error);
  if (
    message.includes("profesor_email_duplicate") ||
    message.includes("PERFILES_EMAIL_CLIENTE_CENTRO_ROL_key")
  ) {
    throw new ProfesorEmailSyncError(
      profesorId,
      "Ese email ya está en uso por otro usuario del mismo centro.",
    );
  }
  if (message.includes("profesor_email_sync_failed")) {
    throw new ProfesorEmailSyncError(profesorId, "No se pudo sincronizar el email con Usuarios.");
  }
  if (message.includes("PGRST116") || message.includes("multiple (or no) rows returned")) {
    throw new ProfesorEmailSyncError(
      profesorId,
      "No se pudo verificar la sincronización del email con Usuarios.",
    );
  }
  throw error instanceof Error ? error : new Error(message);
}

async function fetchProfesorEmail(
  profesorId: string,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("PROFESOR")
    .select("EMAIL_PROFESORES")
    .eq("ID_PROFESOR", profesorId)
    .eq("ID_CLIENTE", tenantId)
    .maybeSingle();
  if (error) throw error;
  return normalizeProfesorEmail(data?.EMAIL_PROFESORES);
}

async function assertProfesorEmailSynced(
  profesorId: string,
  tenantId: string,
  expectedEmail: string | null | undefined,
): Promise<void> {
  const normalizedExpected = normalizeProfesorEmail(expectedEmail);
  if (!normalizedExpected) return;

  const { data: perfiles, error } = await supabase
    .from("PERFILES")
    .select("EMAIL")
    .eq("ID_PROFESOR", profesorId)
    .eq("ID_CLIENTE", tenantId);

  if (error) rethrowProfesorEmailSyncError(error, profesorId);
  if (!perfiles?.length) return;

  const mismatch = perfiles.some(
    (perfil) => normalizeProfesorEmail(perfil.EMAIL) !== normalizedExpected,
  );
  if (mismatch) {
    throw new ProfesorEmailSyncError(profesorId, "No se pudo sincronizar el email con Usuarios.");
  }
}

function nullIfEmptyNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
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

/** Postgres array columns reject "" — coerce empty/invalid values to null. */
function normalizeJsonArrayField(value: unknown): string[] | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          const cleaned = parsed.map((item) => String(item).trim()).filter(Boolean);
          return cleaned.length > 0 ? cleaned : null;
        }
      } catch {
        return null;
      }
    }
    return [trimmed];
  }
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  }
  return null;
}

function sanitizeProfesorPayload(
  input: ProfesorCreateInput | ProfesorUpdateInput,
  mode: "create" | "update",
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if ("NOMBRE_PROFESOR" in input && input.NOMBRE_PROFESOR !== undefined) {
    payload.NOMBRE_PROFESOR = input.NOMBRE_PROFESOR.trim();
  }
  if ("EMAIL_PROFESORES" in input) {
    payload.EMAIL_PROFESORES = nullIfEmpty(input.EMAIL_PROFESORES);
  }
  if ("TELEFONO" in input) {
    payload.TELEFONO = nullIfEmpty(input.TELEFONO);
  }
  if ("DNI" in input) {
    payload.DNI = nullIfEmpty(input.DNI);
  }
  if ("N_SEG_SOCIAL" in input) {
    payload.N_SEG_SOCIAL = nullIfEmpty(input.N_SEG_SOCIAL);
  }
  if ("DOMICILIO" in input) {
    payload.DOMICILIO = nullIfEmpty(input.DOMICILIO);
  }
  if ("NACIMIENTO" in input) {
    payload.NACIMIENTO = nullIfEmpty(input.NACIMIENTO);
  }
  if ("ID_CENTRO" in input) {
    payload.ID_CENTRO = nullIfEmpty(input.ID_CENTRO);
  }
  if ("FECHA_BAJA" in input) {
    payload.FECHA_BAJA = nullIfEmpty(input.FECHA_BAJA);
  }
  if ("SALDO_VACACIONES" in input) {
    payload.SALDO_VACACIONES = nullIfEmptyNumber(input.SALDO_VACACIONES);
  }
  if ("SALDO_AP" in input) {
    payload.SALDO_AP = nullIfEmptyNumber(input.SALDO_AP);
  }
  if ("ESPECIALIDAD" in input) {
    payload.ESPECIALIDAD = normalizeJsonArrayField(input.ESPECIALIDAD);
    if (payload.ESPECIALIDAD === ("" as unknown)) payload.ESPECIALIDAD = null;
  }
  if ("AULA" in input) {
    payload.AULA = normalizeJsonArrayField(input.AULA);
    if (payload.AULA === ("" as unknown)) payload.AULA = null;
  }

  if (mode === "update" && "FECHA_ALTA" in input) {
    payload.FECHA_ALTA = nullIfEmpty(input.FECHA_ALTA);
  }

  return payload;
}

function mapProfesores(
  rows: ProfesorRow[],
  especialidades: EspecialidadLookup[],
  aulas: AulaLookup[],
): ProfesorData[] {
  const espById = new Map(especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]));
  const aulaById = new Map(aulas.map((a) => [a.ID_AULA, a.NOMBRE_AULA]));

  return rows.map((row) => {
    const espIds = parseIdArray(row.ESPECIALIDAD);
    const aulaIds = parseIdArray(row.AULA);
    const espNames = espIds.map((id) => espById.get(id) ?? id).filter(Boolean);
    const aulaNames = aulaIds.map((id) => aulaById.get(id) ?? id).filter(Boolean);

    return {
      ID_PROFESOR: row.ID_PROFESOR,
      ID_CLIENTE: row.ID_CLIENTE,
      ID_CENTRO: row.ID_CENTRO ?? null,
      NOMBRE_PROFESOR: row.NOMBRE_PROFESOR,
      TELEFONO: row.TELEFONO,
      ESPECIALIDAD: espIds.length > 0 ? espIds : null,
      AULA: aulaIds.length > 0 ? aulaIds : null,
      EMAIL_PROFESORES: row.EMAIL_PROFESORES,
      DNI: row.DNI,
      N_SEG_SOCIAL: row.N_SEG_SOCIAL,
      DOMICILIO: row.DOMICILIO,
      NACIMIENTO: row.NACIMIENTO,
      FECHA_ALTA: row.FECHA_ALTA,
      SALDO_VACACIONES: nullIfEmptyNumber(row.SALDO_VACACIONES),
      SALDO_AP: nullIfEmptyNumber(row.SALDO_AP),
      FECHA_BAJA: row.FECHA_BAJA,
      TEXTO_ESPECIALIDADES: espNames.length > 0 ? espNames.join(", ") : "—",
      TEXTO_AULAS: aulaNames.length > 0 ? aulaNames.join(", ") : "—",
    };
  });
}

export function useProfesores() {
  const { tenantId, rol, perfil } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = isProfesorRole(rol)
    ? ([...tenantListKey("profesores", rol, tenantId), perfil?.ID_PROFESOR ?? "none"] as const)
    : tenantListKey("profesores", rol, tenantId);
  const perfilesQueryKey = tenantListKey("perfiles", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<ProfesoresQueryData> => {
      // PROFESOR rows are tenant-wide — never filter by ID_CENTRO on list fetch.
      let profQuery = supabase.from("PROFESOR").select("*");
      profQuery = scopeTenantQuery(profQuery, rol, tenantId);
      if (isProfesorRole(rol)) {
        const profesorId = perfil?.ID_PROFESOR?.trim();
        if (profesorId) {
          profQuery = profQuery.eq("ID_PROFESOR", profesorId);
        }
      }

      let espQuery = supabase
        .from("ESPECIALIDADES")
        .select("ID_ESPECIALIDAD, ESPECIALIDAD")
        .order("ESPECIALIDAD", { ascending: true });
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);

      let aulaQuery = supabase
        .from("AULA")
        .select("ID_AULA, NOMBRE_AULA")
        .order("NOMBRE_AULA", { ascending: true });
      aulaQuery = scopeTenantQuery(aulaQuery, rol, tenantId);

      const profesorId = perfil?.ID_PROFESOR?.trim();
      const skipProfesorQuery = isProfesorRole(rol) && !profesorId;
      const profQueryPromise = skipProfesorQuery
        ? Promise.resolve({ data: [] as ProfesorRow[], error: null })
        : profQuery.order("NOMBRE_PROFESOR", { ascending: true });

      const [
        { data: profs, error },
        { data: esp, error: espError },
        { data: aul, error: aulaError },
      ] = await Promise.all([profQueryPromise, espQuery, aulaQuery]);

      if (error) throw error;
      if (espError) throw espError;
      if (aulaError) throw aulaError;

      const especialidadesRows = (esp ?? []) as EspecialidadLookup[];
      const aulasRows = (aul ?? []) as AulaLookup[];
      const profRows = (profs ?? []) as ProfesorRow[];

      return {
        profesores: mapProfesores(profRows, especialidadesRows, aulasRows),
        aulas: aulasRows,
        especialidades: especialidadesRows,
      };
    },
  });

  const create = useMutation({
    mutationFn: async (input: ProfesorCreateInput) => {
      if (!isMasterRole(rol) && !isAdminRole(rol)) {
        throw new Error("No tienes permiso para crear profesores.");
      }

      const { ROL: selectedRol = "PROFESOR", ...profesorInput } = input;
      const payload: Record<string, unknown> = {
        ...sanitizeProfesorPayload(profesorInput, "create"),
        ID_CLIENTE: tenantId,
      };
      if (payload.ESPECIALIDAD === ("" as unknown)) payload.ESPECIALIDAD = null;
      if (payload.AULA === ("" as unknown)) payload.AULA = null;

      const { data: profesor, error } = await supabase
        .from("PROFESOR")
        .insert(payload)
        .select()
        .single();
      if (error) rethrowProfesorEmailSyncError(error, "new");

      const { error: perfilError } = await supabase.from("PERFILES").insert({
        NOMBRE: input.NOMBRE_PROFESOR.trim(),
        EMAIL: nullIfEmpty(input.EMAIL_PROFESORES) ?? "",
        ROL: selectedRol,
        ID_PROFESOR: profesor.ID_PROFESOR,
        ID_CLIENTE: tenantId,
        ID_CENTRO: nullIfEmpty(input.ID_CENTRO),
        ESTADO: "ACTIVO",
      });

      if (perfilError) {
        await qc.invalidateQueries({ queryKey });
        try {
          rethrowProfesorEmailSyncError(perfilError, profesor.ID_PROFESOR);
        } catch (mappedError) {
          if (mappedError instanceof ProfesorEmailSyncError) throw mappedError;
        }
        throw new ProfesorPerfilAssignError(profesor.ID_PROFESOR);
      }

      if ("EMAIL_PROFESORES" in input) {
        await assertProfesorEmailSynced(profesor.ID_PROFESOR, tenantId, input.EMAIL_PROFESORES);
      }

      return profesor;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: perfilesQueryKey });
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
      selfProfile,
    }: {
      id: string;
      patch: ProfesorUpdateInput;
      selfProfile?: boolean;
    }) => {
      let effectivePatch = patch;

      if (selfProfile) {
        if (!canViewMiPerfilNav(rol, perfil.ID_PROFESOR) || id !== perfil.ID_PROFESOR) {
          throw new Error("No tienes permiso para modificar este perfil.");
        }
        effectivePatch = restrictSelfProfilePatch(patch);
      }

      const { ROL: _ignoredRol, ...profesorPatch } = effectivePatch;
      const payload = sanitizeProfesorPayload(profesorPatch, "update");
      if (payload.ESPECIALIDAD === ("" as unknown)) payload.ESPECIALIDAD = null;
      if (payload.AULA === ("" as unknown)) payload.AULA = null;

      let emailChanged = false;
      if ("EMAIL_PROFESORES" in payload) {
        const currentEmail = await fetchProfesorEmail(id, tenantId);
        const nextEmail = normalizeProfesorEmail(payload.EMAIL_PROFESORES as string | null);
        emailChanged = currentEmail !== nextEmail;
      }

      const { data, error } = await supabase
        .from("PROFESOR")
        .update(payload)
        .eq("ID_PROFESOR", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) rethrowProfesorEmailSyncError(error, id);

      if (emailChanged) {
        await assertProfesorEmailSynced(id, tenantId, payload.EMAIL_PROFESORES as string | null);
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: perfilesQueryKey });
    },
  });

  const avisosQueryKey = tenantListKey("avisos-internos", rol, tenantId);

  const toggleEstado = useMutation({
    mutationFn: async ({ id, deactivate }: { id: string; deactivate: boolean }) => {
      if (!isMasterRole(rol) && !isAdminRole(rol)) {
        throw new Error("No tienes permiso para cambiar el estado del profesor.");
      }

      const fechaBaja = deactivate ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("PROFESOR")
        .update({ FECHA_BAJA: fechaBaja })
        .eq("ID_PROFESOR", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return { id, fechaBaja, deactivate };
    },
    onMutate: async ({ id, deactivate }) => {
      const fechaBaja = deactivate ? new Date().toISOString() : null;
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ProfesoresQueryData>(queryKey);
      qc.setQueryData<ProfesoresQueryData>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          profesores: old.profesores.map((p) =>
            p.ID_PROFESOR === id ? { ...p, FECHA_BAJA: fechaBaja } : p,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: perfilesQueryKey });
      if (variables.deactivate) {
        qc.invalidateQueries({ queryKey: avisosQueryKey });
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!isMasterRole(rol) && !isAdminRole(rol)) {
        throw new Error("No tienes permiso para eliminar profesores.");
      }
      const { error } = await supabase
        .from("PROFESOR")
        .delete()
        .eq("ID_PROFESOR", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove, toggleEstado };
}
