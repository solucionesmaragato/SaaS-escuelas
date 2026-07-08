import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { appendCenterFilter } from "@/lib/centroFilter";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
  scopeTenantQuery,
  tenantListKey,
  workspaceListKey,
  workspaceScopeFields,
} from "@/lib/tenantQuery";

const GRUPO_HORARIOS_EMBED = `
  GRUPOS_HORARIOS (
    *,
    PROFESOR ( NOMBRE_PROFESOR ),
    AULA ( NOMBRE_AULA )
  )
` as const;

const GRUPO_SELECT_COLUMNS = `
  *,
  ${GRUPO_HORARIOS_EMBED}
` as const;

const GRUPO_SELECT_COLUMNS_PROFESOR = `
  *,
  GRUPOS_HORARIOS!inner (
    *,
    PROFESOR ( NOMBRE_PROFESOR ),
    AULA ( NOMBRE_AULA )
  )
` as const;

export type GrupoHorarioData = {
  ID_GRUPO_HORARIO: string;
  DIA_SEMANA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR: string | null;
  ID_AULA: string | null;
  PROFESOR: { NOMBRE_PROFESOR: string } | null;
  AULA: { NOMBRE_AULA: string } | null;
};

export interface GrupoData {
  ID_GRUPO: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  ID_CURSO: string | null;
  ID_TARIFA: string | null;
  ID_ESPECIALIDAD: string | null;
  ID_PROFESOR: string | null;
  ID_AULA: string | null;
  ID_ALUMNOS: string[];
  ESTADO: string | null;
  NOMBRE_GRUPO: string;
  DIA_SEMANA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  NIVEL_ETAPA: string | null;
  PLAZAS_MAXIMAS: number | null;
  GRUPOS_HORARIOS: GrupoHorarioData[];
  TEXTO_HORARIO: string;
  TEXTO_PROFESOR: string;
  TEXTO_AULA: string;
  TEXTO_ESPECIALIDAD: string;
  NOMBRES_ALUMNOS: string[];
}

export type GrupoHorarioCreateInput = {
  DIA_SEMANA: string;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR?: string | null;
  ID_AULA?: string | null;
};

export type GrupoCreateInput = {
  ID_GRUPO?: string;
  NOMBRE_GRUPO: string;
  ID_CENTRO: string;
  ID_CURSO: string;
  ID_TARIFA?: string | null;
  ID_ESPECIALIDAD?: string | null;
  ID_ALUMNOS?: string[];
  PLAZAS_MAXIMAS?: number | null;
  NIVEL_ETAPA?: string | null;
  ESTADO?: string | null;
  horarios?: GrupoHorarioCreateInput[];
};

export type AlumnoLookup = {
  ID_ALUMNO: string;
  NOMBRE_ALUMNO: string;
  ID_CENTRO: string | null;
  MATRICULAS?: { ID_TARIFA: string | null }[];
};

export type ProfesorLookup = {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  FECHA_BAJA?: string | null;
};

export type AulaLookup = {
  ID_AULA: string;
  NOMBRE_AULA: string;
};

export type EspecialidadLookup = {
  ID_ESPECIALIDAD: string;
  ESPECIALIDAD: string;
};

export type GruposQueryData = {
  grupos: GrupoData[];
  diccionarioAlumnos: AlumnoLookup[];
  diccionarioProfesores: ProfesorLookup[];
  diccionarioAulas: AulaLookup[];
  diccionarioEspecialidades: EspecialidadLookup[];
};

export type GrupoUpdateInput = Partial<
  Pick<
    GrupoData,
    | "NOMBRE_GRUPO"
    | "ID_ESPECIALIDAD"
    | "ID_ALUMNOS"
    | "PLAZAS_MAXIMAS"
    | "NIVEL_ETAPA"
    | "ESTADO"
    | "ID_CLIENTE"
    | "ID_CENTRO"
    | "ID_CURSO"
    | "ID_TARIFA"
  >
>;

export type GrupoHorarioUpdateInput = {
  ID_GRUPO_HORARIO: string;
  DIA_SEMANA?: string | null;
  HORA_INICIO?: string | null;
  HORA_FIN?: string | null;
  ID_PROFESOR?: string | null;
  ID_AULA?: string | null;
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
};

type GrupoHorarioRow = {
  ID_GRUPO_HORARIO: string;
  DIA_SEMANA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR: string | null;
  ID_AULA: string | null;
  PROFESOR: { NOMBRE_PROFESOR: string } | null;
  AULA: { NOMBRE_AULA: string } | null;
};

type GrupoRow = {
  ID_GRUPO: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  ID_CURSO: string | null;
  ID_TARIFA: string | null;
  ID_ESPECIALIDAD: string | null;
  ID_PROFESOR: string | null;
  ID_AULA: string | null;
  ID_ALUMNOS: unknown;
  ESTADO: string | null;
  NOMBRE_GRUPO: string;
  DIA_SEMANA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  NIVEL_ETAPA: string | null;
  PLAZAS_MAXIMAS: number | string | null;
  GRUPOS_HORARIOS?: GrupoHorarioRow[] | null;
};

const HORARIO_DAY_ORDER: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  Miercoles: 3,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sabado: 6,
  Sábado: 6,
  Domingo: 7,
};

function normalizeHorarioDayKey(dia: string | null | undefined): string {
  if (!dia) return "";
  return dia.normalize("NFD").replace(/\p{M}/gu, "");
}

function getHorarioDaySortKey(dia: string | null | undefined): number {
  if (!dia) return 99;
  const normalized = normalizeHorarioDayKey(dia);
  return HORARIO_DAY_ORDER[normalized] ?? HORARIO_DAY_ORDER[dia] ?? 99;
}

function normalizeHorarioRows(
  raw: GrupoHorarioRow[] | GrupoHorarioRow | null | undefined,
): GrupoHorarioRow[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function scopeGruposListQuery<Q extends { eq: (column: string, value: string) => Q }>(
  query: Q,
  rol: string | null | undefined,
  tenantId: string,
  filterCenterId: string | null | undefined,
): Q {
  const scoped = isMasterRole(rol)
    ? scopeTenantQuery(query, rol, tenantId)
    : query.eq("ID_CLIENTE", tenantId);
  return appendCenterFilter(scoped, filterCenterId);
}

function sortHorarioRows(horarios: GrupoHorarioRow[]): GrupoHorarioRow[] {
  return [...horarios].sort((a, b) => {
    const dayDiff =
      getHorarioDaySortKey(a.DIA_SEMANA) - getHorarioDaySortKey(b.DIA_SEMANA);
    if (dayDiff !== 0) return dayDiff;
    return (a.HORA_INICIO ?? "").localeCompare(b.HORA_INICIO ?? "");
  });
}

function formatHorarioSlotLabel(horario: GrupoHorarioRow): string {
  const dia = horario.DIA_SEMANA ?? "—";
  const inicio = horario.HORA_INICIO?.slice(0, 5) ?? "—";
  const fin = horario.HORA_FIN?.slice(0, 5) ?? "—";
  if (inicio === "—" && fin === "—") return dia;
  return `${dia} ${inicio} - ${fin}`;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function nullIfEmptyId(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

function sanitizeHorarioMutationPatch(
  patch: Omit<GrupoHorarioUpdateInput, "ID_GRUPO_HORARIO">,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (patch.DIA_SEMANA !== undefined) {
    payload.DIA_SEMANA = patch.DIA_SEMANA?.trim() || null;
  }
  if (patch.HORA_INICIO !== undefined) payload.HORA_INICIO = patch.HORA_INICIO;
  if (patch.HORA_FIN !== undefined) payload.HORA_FIN = patch.HORA_FIN;
  if (patch.ID_PROFESOR !== undefined) {
    payload.ID_PROFESOR = nullIfEmptyId(patch.ID_PROFESOR);
  }
  if (patch.ID_AULA !== undefined) {
    payload.ID_AULA = nullIfEmptyId(patch.ID_AULA);
  }
  if (patch.ID_CENTRO !== undefined) {
    payload.ID_CENTRO = nullIfEmptyId(patch.ID_CENTRO);
  }
  if (patch.ID_CURSO !== undefined) {
    payload.ID_CURSO = nullIfEmptyId(patch.ID_CURSO);
  }
  return payload;
}

function buildGrupoUpdatePayload(
  patch: GrupoUpdateInput,
  rol: string | null | undefined,
): Record<string, unknown> {
  const allowed: GrupoUpdateInput = isMasterRole(rol)
    ? patch
    : {
        NOMBRE_GRUPO: patch.NOMBRE_GRUPO,
        ID_ESPECIALIDAD: patch.ID_ESPECIALIDAD,
        ID_ALUMNOS: patch.ID_ALUMNOS,
        PLAZAS_MAXIMAS: patch.PLAZAS_MAXIMAS,
        NIVEL_ETAPA: patch.NIVEL_ETAPA,
        ESTADO: patch.ESTADO,
        ID_CENTRO: patch.ID_CENTRO,
        ID_CURSO: patch.ID_CURSO,
        ID_TARIFA: patch.ID_TARIFA,
      };

  const payload: Record<string, unknown> = {};
  if (allowed.NOMBRE_GRUPO !== undefined) payload.NOMBRE_GRUPO = allowed.NOMBRE_GRUPO;
  if (allowed.ID_ESPECIALIDAD !== undefined) {
    payload.ID_ESPECIALIDAD = nullIfEmptyId(allowed.ID_ESPECIALIDAD);
  }
  if (allowed.ID_ALUMNOS !== undefined) payload.ID_ALUMNOS = allowed.ID_ALUMNOS;
  if (allowed.PLAZAS_MAXIMAS !== undefined) payload.PLAZAS_MAXIMAS = allowed.PLAZAS_MAXIMAS;
  if (allowed.NIVEL_ETAPA !== undefined) {
    payload.NIVEL_ETAPA =
      typeof allowed.NIVEL_ETAPA === "string"
        ? allowed.NIVEL_ETAPA.trim() || null
        : allowed.NIVEL_ETAPA;
  }
  if (allowed.ESTADO !== undefined) payload.ESTADO = allowed.ESTADO;
  if (allowed.ID_CLIENTE !== undefined) payload.ID_CLIENTE = allowed.ID_CLIENTE;
  if (allowed.ID_CENTRO !== undefined) payload.ID_CENTRO = nullIfEmptyId(allowed.ID_CENTRO);
  if (allowed.ID_CURSO !== undefined) payload.ID_CURSO = nullIfEmptyId(allowed.ID_CURSO);
  if (allowed.ID_TARIFA !== undefined) payload.ID_TARIFA = nullIfEmptyId(allowed.ID_TARIFA);
  return payload;
}

function parseAlumnoIds(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      return trimmed ? [trimmed] : [];
    }
  }
  return [];
}

function normalizePlazas(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
}

function isActiveGroup(estado: string | null | undefined): boolean {
  if (!estado) return true;
  const u = estado.toUpperCase();
  return u !== "INACTIVO" && u !== "BAJA";
}

export function isGrupoEstadoActivo(estado: string | null | undefined): boolean {
  return isActiveGroup(estado);
}

export function nextGrupoEstadoToggleValue(
  estado: string | null | undefined,
): "ACTIVO" | "INACTIVO" {
  return isActiveGroup(estado) ? "INACTIVO" : "ACTIVO";
}

function assertCanWrite(rol: string | null | undefined) {
  if (
    isMasterRole(rol) ||
    isAdminRole(rol) ||
    isDireccionRole(rol) ||
    isSecretariaRole(rol)
  ) {
    return;
  }
  throw new Error("No tienes permiso para gestionar grupos.");
}

function assertCanUpdate(
  rol: string | null | undefined,
  tenantId: string,
  targetIdCliente: string,
) {
  assertCanWrite(rol);
  if (isMasterRole(rol)) return;
  if (targetIdCliente !== tenantId) {
    throw new Error("No tienes permiso para modificar este grupo.");
  }
}

function assertCanDelete(rol: string | null | undefined) {
  if (isMasterRole(rol) || isAdminRole(rol)) return;
  throw new Error("No tienes permiso para eliminar grupos.");
}

export function generateGrupoId(customId?: string | null): string {
  const trimmed = customId?.trim();
  if (trimmed) return trimmed;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `GRU_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
  return `GRU_${Math.random().toString(36).substring(2, 11)}`;
}

function mapGrupos(
  rows: GrupoRow[],
  profesores: { ID_PROFESOR: string; NOMBRE_PROFESOR: string }[],
  aulas: { ID_AULA: string; NOMBRE_AULA: string }[],
  especialidades: { ID_ESPECIALIDAD: string; ESPECIALIDAD: string }[],
  alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string }[],
): GrupoData[] {
  const profById = new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR]));
  const aulaById = new Map(aulas.map((a) => [a.ID_AULA, a.NOMBRE_AULA]));
  const espById = new Map(especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]));
  const aluById = new Map(alumnos.map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO]));

  return rows.map((row) => {
    const ids = parseAlumnoIds(row.ID_ALUMNOS);
    const nombres = ids.map((id) => aluById.get(id) ?? "—").filter((n) => n !== "—");
    const horarios = sortHorarioRows(normalizeHorarioRows(row.GRUPOS_HORARIOS));
    const primary = horarios[0];

    const grupoHorarios: GrupoHorarioData[] = horarios.map((horario) => ({
      ID_GRUPO_HORARIO: horario.ID_GRUPO_HORARIO,
      DIA_SEMANA: horario.DIA_SEMANA,
      HORA_INICIO: horario.HORA_INICIO,
      HORA_FIN: horario.HORA_FIN,
      ID_PROFESOR: horario.ID_PROFESOR,
      ID_AULA: horario.ID_AULA,
      PROFESOR: horario.PROFESOR,
      AULA: horario.AULA,
    }));

    const profesorNames = uniqueNonEmpty(
      horarios.map(
        (horario) =>
          horario.PROFESOR?.NOMBRE_PROFESOR ??
          (horario.ID_PROFESOR ? profById.get(horario.ID_PROFESOR) : null),
      ),
    );
    const aulaNames = uniqueNonEmpty(
      horarios.map(
        (horario) =>
          horario.AULA?.NOMBRE_AULA ??
          (horario.ID_AULA ? aulaById.get(horario.ID_AULA) : null),
      ),
    );

    return {
      ID_GRUPO: row.ID_GRUPO,
      ID_CLIENTE: row.ID_CLIENTE,
      ID_CENTRO: row.ID_CENTRO,
      ID_CURSO: row.ID_CURSO,
      ID_TARIFA: row.ID_TARIFA,
      ID_ESPECIALIDAD: row.ID_ESPECIALIDAD,
      ID_PROFESOR: primary?.ID_PROFESOR ?? row.ID_PROFESOR,
      ID_AULA: primary?.ID_AULA ?? row.ID_AULA,
      ID_ALUMNOS: ids,
      ESTADO: row.ESTADO,
      NOMBRE_GRUPO: row.NOMBRE_GRUPO,
      DIA_SEMANA: primary?.DIA_SEMANA ?? row.DIA_SEMANA,
      HORA_INICIO: primary?.HORA_INICIO ?? row.HORA_INICIO,
      HORA_FIN: primary?.HORA_FIN ?? row.HORA_FIN,
      NIVEL_ETAPA: row.NIVEL_ETAPA,
      PLAZAS_MAXIMAS: normalizePlazas(row.PLAZAS_MAXIMAS),
      GRUPOS_HORARIOS: grupoHorarios,
      TEXTO_HORARIO:
        horarios.length > 0
          ? horarios.map(formatHorarioSlotLabel).join(", ")
          : "—",
      TEXTO_PROFESOR: profesorNames.length > 0 ? profesorNames.join(", ") : "—",
      TEXTO_AULA: aulaNames.length > 0 ? aulaNames.join(", ") : "—",
      TEXTO_ESPECIALIDAD:
        (row.ID_ESPECIALIDAD && espById.get(row.ID_ESPECIALIDAD)) || "—",
      NOMBRES_ALUMNOS: nombres,
    };
  });
}

const EMPTY_GRUPOS_DATA: GruposQueryData = {
  grupos: [],
  diccionarioAlumnos: [],
  diccionarioProfesores: [],
  diccionarioAulas: [],
  diccionarioEspecialidades: [],
};

export function hasAssignedGrupos(
  grupos: GrupoData[],
  profesorId: string | null | undefined,
): boolean {
  if (!profesorId) return false;
  return grupos.some(
    (g) =>
      g.ID_PROFESOR === profesorId ||
      (g.GRUPOS_HORARIOS ?? []).some((horario) => horario.ID_PROFESOR === profesorId),
  );
}

export function canViewGruposNav(
  rol: string | null | undefined,
  grupos: GrupoData[],
  profesorId: string | null | undefined,
): boolean {
  if (
    isMasterRole(rol) ||
    isAdminRole(rol) ||
    isDireccionRole(rol) ||
    isSecretariaRole(rol)
  ) {
    return true;
  }
  if (isProfesorRole(rol)) {
    return hasAssignedGrupos(grupos, profesorId);
  }
  return false;
}

export function useGrupos(
  filterCenterId?: string | null,
  alumnoId?: string | null,
  profesorId?: string | null,
) {
  const { tenantId, centerId, rol, perfil } = useActiveTenant();
  const qc = useQueryClient();
  const resolvedCenterId =
    filterCenterId !== undefined ? filterCenterId : centerId;
  const centerKey = resolvedCenterId ?? "all";
  // A specific profesorId targets a single professor's full academic picture
  // (e.g. the Profesores detail overlay), which must span every center they
  // teach at — not just whichever center happens to be active in the
  // dashboard's global filter. Scoping by resolvedCenterId here was silently
  // hiding groups/alumnos outside the active center, producing empty tabs.
  const effectiveCenterId = profesorId ? null : resolvedCenterId;
  const queryKey = isProfesorRole(rol)
    ? ([
        ...workspaceListKey("grupos", tenantId, centerKey),
        perfil.ID_PROFESOR ?? "none",
        alumnoId ?? "all",
        profesorId ?? "all",
      ] as const)
    : ([
        ...workspaceListKey("grupos", tenantId, centerKey),
        alumnoId ?? "all",
        profesorId ?? "all",
      ] as const);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<GruposQueryData> => {
      if (isProfesorRole(rol)) {
        const profesorId = perfil.ID_PROFESOR;
        if (!profesorId) return EMPTY_GRUPOS_DATA;

        let gruposQuery = supabase
          .from("GRUPOS")
          .select(GRUPO_SELECT_COLUMNS_PROFESOR)
          .eq("GRUPOS_HORARIOS.ID_PROFESOR", profesorId)
          .order("NOMBRE_GRUPO", { ascending: true });
        gruposQuery = scopeGruposListQuery(gruposQuery, rol, tenantId, resolvedCenterId);
        if (alumnoId) gruposQuery = gruposQuery.contains("ID_ALUMNOS", [alumnoId]);

        let aluQuery = supabase
          .from("ALUMNOS")
          .select("ID_ALUMNO, NOMBRE_ALUMNO, ID_CENTRO, MATRICULAS(ID_TARIFA)");
        aluQuery = scopeTenantQuery(aluQuery, rol, tenantId);
        aluQuery = appendCenterFilter(aluQuery, resolvedCenterId);

        let profQuery = supabase
          .from("PROFESOR")
          .select("ID_PROFESOR, NOMBRE_PROFESOR, FECHA_BAJA")
          .eq("ID_PROFESOR", profesorId);
        profQuery = scopeTenantQuery(profQuery, rol, tenantId);

        let aulaQuery = supabase.from("AULA").select("ID_AULA, NOMBRE_AULA");
        aulaQuery = scopeTenantQuery(aulaQuery, rol, tenantId);

        let espQuery = supabase.from("ESPECIALIDADES").select("ID_ESPECIALIDAD, ESPECIALIDAD");
        espQuery = scopeTenantQuery(espQuery, rol, tenantId);

        const [
          { data: grupos, error },
          { data: alumnos, error: aluError },
          { data: profesores, error: profError },
          { data: aulas, error: aulaError },
          { data: especialidades, error: espError },
        ] = await Promise.all([
          gruposQuery,
          aluQuery.order("NOMBRE_ALUMNO", { ascending: true }),
          profQuery,
          aulaQuery,
          espQuery,
        ]);

        if (error) throw error;
        if (aluError) throw aluError;
        if (profError) throw profError;
        if (aulaError) throw aulaError;
        if (espError) throw espError;

        const alumnosRows = (alumnos ?? []) as AlumnoLookup[];
        const profesoresRows = (profesores ?? []) as ProfesorLookup[];
        const aulasRows = (aulas ?? []) as AulaLookup[];
        const especialidadesRows = (especialidades ?? []) as EspecialidadLookup[];

        return {
          grupos: mapGrupos(
            (grupos ?? []) as GrupoRow[],
            profesoresRows,
            aulasRows,
            especialidadesRows,
            alumnosRows,
          ),
          diccionarioAlumnos: alumnosRows,
          diccionarioProfesores: profesoresRows,
          diccionarioAulas: aulasRows,
          diccionarioEspecialidades: especialidadesRows,
        };
      }

      // Switching to the `!inner` embed is required so PostgREST allows
      // filtering parent GRUPOS rows by the embedded GRUPOS_HORARIOS.ID_PROFESOR column.
      let gruposQuery = supabase
        .from("GRUPOS")
        .select(profesorId ? GRUPO_SELECT_COLUMNS_PROFESOR : GRUPO_SELECT_COLUMNS);
      gruposQuery = scopeGruposListQuery(gruposQuery, rol, tenantId, effectiveCenterId);
      if (alumnoId) gruposQuery = gruposQuery.contains("ID_ALUMNOS", [alumnoId]);
      if (profesorId) gruposQuery = gruposQuery.eq("GRUPOS_HORARIOS.ID_PROFESOR", profesorId);

      let profQuery = supabase
        .from("PROFESOR")
        .select("ID_PROFESOR, NOMBRE_PROFESOR, FECHA_BAJA")
        .order("NOMBRE_PROFESOR", { ascending: true });
      profQuery = scopeTenantQuery(profQuery, rol, tenantId);

      let aulaQuery = supabase.from("AULA").select("ID_AULA, NOMBRE_AULA");
      aulaQuery = scopeTenantQuery(aulaQuery, rol, tenantId);

      let aluQuery = supabase
        .from("ALUMNOS")
        .select("ID_ALUMNO, NOMBRE_ALUMNO, ID_CENTRO, MATRICULAS(ID_TARIFA)");
      aluQuery = scopeTenantQuery(aluQuery, rol, tenantId);
      aluQuery = appendCenterFilter(aluQuery, effectiveCenterId);

      let espQuery = supabase.from("ESPECIALIDADES").select("ID_ESPECIALIDAD, ESPECIALIDAD");
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);

      const runGruposQuery = isMasterRole(rol)
        ? gruposQuery
            .order("ID_CLIENTE", { ascending: true })
            .order("NOMBRE_GRUPO", { ascending: true })
        : gruposQuery.order("NOMBRE_GRUPO", { ascending: true });

      const [
        { data: grupos, error },
        { data: profesores, error: profError },
        { data: aulas, error: aulaError },
        { data: alumnos, error: aluError },
        { data: especialidades, error: espError },
      ] = await Promise.all([
        runGruposQuery,
        profQuery,
        aulaQuery,
        aluQuery.order("NOMBRE_ALUMNO", { ascending: true }),
        espQuery,
      ]);

      if (error) throw error;
      if (profError) throw profError;
      if (aulaError) throw aulaError;
      if (aluError) throw aluError;
      if (espError) throw espError;

      const alumnosRows = (alumnos ?? []) as AlumnoLookup[];
      const profesoresRows = (profesores ?? []) as ProfesorLookup[];
      const aulasRows = (aulas ?? []) as AulaLookup[];
      const especialidadesRows = (especialidades ?? []) as EspecialidadLookup[];

      return {
        grupos: mapGrupos(
          (grupos ?? []) as GrupoRow[],
          profesoresRows,
          aulasRows,
          especialidadesRows,
          alumnosRows,
        ),
        diccionarioAlumnos: alumnosRows,
        diccionarioProfesores: profesoresRows,
        diccionarioAulas: aulasRows,
        diccionarioEspecialidades: especialidadesRows,
      };
    },
  });

  const create = useMutation({
    mutationFn: async (input: GrupoCreateInput) => {
      assertCanWrite(rol);
      if (!tenantId) throw new Error("No hay un tenant activo.");
      if (!input.ID_CENTRO?.trim()) {
        throw new Error("El centro es obligatorio.");
      }
      if (!input.ID_CURSO?.trim()) {
        throw new Error("El curso escolar es obligatorio.");
      }

      const selectedCenterId = input.ID_CENTRO.trim();
      const selectedCursoId = input.ID_CURSO.trim();
      const groupPayload: Record<string, unknown> = {
        NOMBRE_GRUPO: input.NOMBRE_GRUPO,
        ID_CLIENTE: tenantId,
        ID_CENTRO: selectedCenterId,
        ID_CURSO: selectedCursoId,
        ID_TARIFA: input.ID_TARIFA ?? null,
        ID_ESPECIALIDAD: nullIfEmptyId(input.ID_ESPECIALIDAD ?? null),
        ID_ALUMNOS: parseAlumnoIds(input.ID_ALUMNOS),
        PLAZAS_MAXIMAS: input.PLAZAS_MAXIMAS ?? null,
        NIVEL_ETAPA: input.NIVEL_ETAPA ?? null,
        ESTADO: input.ESTADO ?? "ACTIVO",
      };

      const customId = input.ID_GRUPO?.trim();
      if (customId) {
        groupPayload.ID_GRUPO = customId;
      }

      const { data: newGroup, error: groupError } = await supabase
        .from("GRUPOS")
        .insert(groupPayload)
        .select("ID_GRUPO")
        .single();
      if (groupError) throw groupError;

      const horarios = input.horarios ?? [];
      if (horarios.length > 0) {
        const schedulesPayload = horarios.map((h) => ({
          ID_CLIENTE: tenantId,
          ID_CENTRO: selectedCenterId,
          ID_CURSO: selectedCursoId,
          ID_GRUPO: newGroup.ID_GRUPO,
          DIA_SEMANA: h.DIA_SEMANA,
          HORA_INICIO: h.HORA_INICIO ?? null,
          HORA_FIN: h.HORA_FIN ?? null,
          ID_PROFESOR: nullIfEmptyId(h.ID_PROFESOR ?? null),
          ID_AULA: nullIfEmptyId(h.ID_AULA ?? null),
        }));
        for (const row of schedulesPayload) {
          if (row.ID_PROFESOR === "") row.ID_PROFESOR = null;
          if (row.ID_AULA === "") row.ID_AULA = null;
        }

        const { error: schedulesError } = await supabase
          .from("GRUPOS_HORARIOS")
          .insert(schedulesPayload);
        if (schedulesError) throw schedulesError;
      }

      return newGroup as Pick<GrupoRow, "ID_GRUPO">;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: tenantListKey("gruposHorarios", rol, tenantId) });
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
      horarios,
    }: {
      id: string;
      patch: GrupoUpdateInput;
      horarios?: GrupoHorarioUpdateInput[];
    }) => {
      const { data: existing, error: fetchErr } = await supabase
        .from("GRUPOS")
        .select("ID_CLIENTE")
        .eq("ID_GRUPO", id)
        .single();
      if (fetchErr) throw fetchErr;

      assertCanUpdate(rol, tenantId, existing.ID_CLIENTE);

      const grupoPatch = buildGrupoUpdatePayload(patch, rol);
      if (Object.keys(grupoPatch).length > 0) {
        let query = supabase.from("GRUPOS").update(grupoPatch).eq("ID_GRUPO", id);
        if (!isMasterRole(rol)) {
          query = query.eq("ID_CLIENTE", tenantId);
        }

        const { error } = await query;
        if (error) throw error;
      }

      for (const horario of horarios ?? []) {
        const { ID_GRUPO_HORARIO, ...horarioPatch } = horario;
        const sanitizedPatch = sanitizeHorarioMutationPatch(horarioPatch);
        if (sanitizedPatch.ID_PROFESOR === "") sanitizedPatch.ID_PROFESOR = null;
        if (sanitizedPatch.ID_AULA === "") sanitizedPatch.ID_AULA = null;
        if (Object.keys(sanitizedPatch).length === 0) continue;

        let horarioQuery = supabase
          .from("GRUPOS_HORARIOS")
          .update(sanitizedPatch)
          .eq("ID_GRUPO_HORARIO", ID_GRUPO_HORARIO)
          .eq("ID_GRUPO", id);
        if (!isMasterRole(rol)) {
          horarioQuery = horarioQuery.eq("ID_CLIENTE", tenantId);
        }

        const { error: horarioError } = await horarioQuery;
        if (horarioError) throw horarioError;
      }

      let fetchQuery = supabase
        .from("GRUPOS")
        .select(GRUPO_SELECT_COLUMNS)
        .eq("ID_GRUPO", id);
      if (!isMasterRole(rol)) {
        fetchQuery = fetchQuery.eq("ID_CLIENTE", tenantId);
      }

      const { data, error } = await fetchQuery.single();
      if (error) throw error;
      return data as GrupoRow;
    },
    onMutate: async ({ id, patch }) => {
      if (patch.ESTADO === undefined) return undefined;
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<GruposQueryData>(queryKey);
      if (previous) {
        qc.setQueryData<GruposQueryData>(queryKey, {
          ...previous,
          grupos: previous.grupos.map((grupo) =>
            grupo.ID_GRUPO === id ? { ...grupo, ESTADO: patch.ESTADO ?? grupo.ESTADO } : grupo,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKey, context.previous);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: tenantListKey("gruposHorarios", rol, tenantId) });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertCanDelete(rol);

      let query = supabase.from("GRUPOS").delete().eq("ID_GRUPO", id);
      if (!isMasterRole(rol)) {
        query = query.eq("ID_CLIENTE", tenantId);
      }

      const { error } = await query;
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
