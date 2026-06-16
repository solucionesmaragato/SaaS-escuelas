import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey, isProfesorRole } from "@/lib/tenantQuery";

export type ColorIncidencia = "rojo" | "verde" | null;

export type FilterOption = { id: string; name: string };

export interface SesionData {
  ID_SESION: string;
  ID_CLIENTE: string;
  ID_MATRICULA: string | null;
  ID_HORARIO: string | null;
  ID_ALUMNO: string | null;
  FECHA_EXACTA: string;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR: string | null;
  ID_AULA: string | null;
  ESPECIALIDAD: string | null;
  ESTADO: string | null;
  NOTAS: string | null;
  TITULO_CALENDARIO: string | null;
  COLOR_INCIDENCIA: ColorIncidencia;
  TEXTO_ALUMNO: string;
  TEXTO_PROFESOR: string;
  TEXTO_AULA: string;
  TEXTO_ESPECIALIDAD: string;
}

export interface AlumnoGrupo {
  ID_ALUMNO: string | null;
  TEXTO_ALUMNO: string;
  ESTADO: string | null;
  TITULO_CALENDARIO: string | null;
  COLOR_INCIDENCIA: ColorIncidencia;
}

export interface GroupedSession {
  GROUP_KEY: string;
  FECHA_EXACTA: string;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR: string | null;
  ID_AULA: string | null;
  ESPECIALIDAD: string | null;
  TEXTO_PROFESOR: string;
  TEXTO_AULA: string;
  TEXTO_ESPECIALIDAD: string;
  TITULO_BLOQUE: string;
  COLOR_INCIDENCIA: ColorIncidencia;
  ESTADO: string | null;
  ALUMNOS_GRUPO: AlumnoGrupo[];
}

export type SesionesQueryData = {
  sesiones: GroupedSession[];
  filters: {
    uniqueAlumnos: FilterOption[];
    uniqueProfesores: FilterOption[];
    uniqueAulas: FilterOption[];
    uniqueEspecialidades: FilterOption[];
  };
};

type SesionRow = {
  ID_SESION: string;
  ID_CLIENTE: string;
  ID_MATRICULA: string | null;
  ID_HORARIO: string | null;
  ID_ALUMNO: string | null;
  FECHA_EXACTA: string;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR: string | null;
  ID_AULA: string | null;
  ESPECIALIDAD: string | null;
  ESTADO: string | null;
  NOTAS: string | null;
  TITULO_CALENDARIO: string | null;
};

type LookupRow = { id: string; name: string };

function normalizeTitulo(titulo: string | null | undefined): string {
  return (titulo ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function resolveColorIncidencia(
  estado: string | null | undefined,
  titulo: string | null | undefined,
): ColorIncidencia {
  if (estado !== "Incidencia") return null;
  const normalized = normalizeTitulo(titulo);
  if (normalized.includes("falta")) return "rojo";
  if (normalized.includes("recuperacion")) return "verde";
  return "verde";
}

function buildUniqueOptions(rows: LookupRow[]): FilterOption[] {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.id && row.name && row.name !== "—") {
      map.set(row.id, row.name);
    }
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

function mapSesiones(
  rows: SesionRow[],
  alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string }[],
  profesores: { ID_PROFESOR: string; NOMBRE_PROFESOR: string }[],
  aulas: { ID_AULA: string; NOMBRE_AULA: string }[],
  especialidades: { ID_ESPECIALIDAD: string; ESPECIALIDAD: string }[],
): SesionData[] {
  const aluById = new Map(alumnos.map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO]));
  const profById = new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR]));
  const aulaById = new Map(aulas.map((a) => [a.ID_AULA, a.NOMBRE_AULA]));
  const espById = new Map(especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]));

  return rows.map((s) => ({
    ID_SESION: s.ID_SESION,
    ID_CLIENTE: s.ID_CLIENTE,
    ID_MATRICULA: s.ID_MATRICULA,
    ID_HORARIO: s.ID_HORARIO,
    ID_ALUMNO: s.ID_ALUMNO,
    FECHA_EXACTA: s.FECHA_EXACTA,
    HORA_INICIO: s.HORA_INICIO,
    HORA_FIN: s.HORA_FIN,
    ID_PROFESOR: s.ID_PROFESOR,
    ID_AULA: s.ID_AULA,
    ESPECIALIDAD: s.ESPECIALIDAD,
    ESTADO: s.ESTADO,
    NOTAS: s.NOTAS,
    TITULO_CALENDARIO: s.TITULO_CALENDARIO,
    COLOR_INCIDENCIA: resolveColorIncidencia(s.ESTADO, s.TITULO_CALENDARIO),
    TEXTO_ALUMNO: (s.ID_ALUMNO && aluById.get(s.ID_ALUMNO)) || s.ID_ALUMNO || "—",
    TEXTO_PROFESOR: (s.ID_PROFESOR && profById.get(s.ID_PROFESOR)) || s.ID_PROFESOR || "—",
    TEXTO_AULA: (s.ID_AULA && aulaById.get(s.ID_AULA)) || s.ID_AULA || "—",
    TEXTO_ESPECIALIDAD:
      (s.ESPECIALIDAD && espById.get(s.ESPECIALIDAD)) || s.ESPECIALIDAD || "—",
  }));
}

function buildGroupKey(s: SesionData): string {
  const fecha = s.FECHA_EXACTA?.split("T")[0] ?? s.FECHA_EXACTA ?? "";
  return `${fecha}|${s.HORA_INICIO ?? ""}|${s.ID_PROFESOR ?? ""}|${s.ID_AULA ?? ""}`;
}

function deriveBlockColorIncidencia(alumnos: AlumnoGrupo[]): ColorIncidencia {
  if (alumnos.some((a) => a.COLOR_INCIDENCIA === "rojo")) return "rojo";
  if (alumnos.some((a) => a.COLOR_INCIDENCIA === "verde")) return "verde";
  return null;
}

function deriveBlockEstado(alumnos: AlumnoGrupo[]): string | null {
  if (alumnos.some((a) => a.COLOR_INCIDENCIA === "rojo")) return "Incidencia";
  if (alumnos.some((a) => a.ESTADO === "Incidencia")) return "Incidencia";
  if (alumnos.some((a) => a.ESTADO === "Lead")) return "Lead";
  if (alumnos.some((a) => a.ESTADO === "Matricula")) return "Matricula";
  return alumnos[0]?.ESTADO ?? null;
}

function buildTituloBloque(alumnos: AlumnoGrupo[], textoEspecialidad: string): string {
  if (alumnos.length === 1) {
    return `${alumnos[0].TEXTO_ALUMNO} - ${textoEspecialidad}`;
  }
  return `${textoEspecialidad} (${alumnos.length} alumnos)`;
}

function groupSesiones(mapped: SesionData[]): GroupedSession[] {
  const groups = new Map<string, SesionData[]>();

  for (const s of mapped) {
    const key = buildGroupKey(s);
    const existing = groups.get(key);
    if (existing) {
      existing.push(s);
    } else {
      groups.set(key, [s]);
    }
  }

  return Array.from(groups.entries()).map(([groupKey, rows]) => {
    const first = rows[0];
    const alumnosGrupo: AlumnoGrupo[] = rows.map((s) => ({
      ID_ALUMNO: s.ID_ALUMNO,
      TEXTO_ALUMNO: s.TEXTO_ALUMNO,
      ESTADO: s.ESTADO,
      TITULO_CALENDARIO: s.TITULO_CALENDARIO,
      COLOR_INCIDENCIA: s.COLOR_INCIDENCIA,
    }));

    return {
      GROUP_KEY: groupKey,
      FECHA_EXACTA: first.FECHA_EXACTA,
      HORA_INICIO: first.HORA_INICIO,
      HORA_FIN: first.HORA_FIN,
      ID_PROFESOR: first.ID_PROFESOR,
      ID_AULA: first.ID_AULA,
      ESPECIALIDAD: first.ESPECIALIDAD,
      TEXTO_PROFESOR: first.TEXTO_PROFESOR,
      TEXTO_AULA: first.TEXTO_AULA,
      TEXTO_ESPECIALIDAD: first.TEXTO_ESPECIALIDAD,
      TITULO_BLOQUE: buildTituloBloque(alumnosGrupo, first.TEXTO_ESPECIALIDAD),
      COLOR_INCIDENCIA: deriveBlockColorIncidencia(alumnosGrupo),
      ESTADO: deriveBlockEstado(alumnosGrupo),
      ALUMNOS_GRUPO: alumnosGrupo,
    };
  });
}

export type SesionesDateRange = {
  startDate: string;
  endDate: string;
};

function formatDateKey(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Bounds SESIONES fetch to the visible calendar period — never load full history. */
export function getSesionesDateRange(
  view: "day" | "week" | "month",
  currentDate: Date,
): SesionesDateRange {
  if (view === "day") {
    const key = formatDateKey(currentDate);
    return { startDate: key, endDate: key };
  }

  if (view === "week") {
    const monday = getMondayOfWeek(currentDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: formatDateKey(monday), endDate: formatDateKey(sunday) };
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return { startDate: formatDateKey(start), endDate: formatDateKey(end) };
}

const EMPTY_SESIONES_QUERY: SesionesQueryData = {
  sesiones: [],
  filters: {
    uniqueAlumnos: [],
    uniqueProfesores: [],
    uniqueAulas: [],
    uniqueEspecialidades: [],
  },
};

export function useSesiones(
  dateRange: SesionesDateRange,
  filterCenterId?: string | null,
) {
  const { tenantId, rol, perfil } = useActiveTenant();
  const queryKey = [
    ...tenantListKey("sesiones", rol, tenantId),
    dateRange.startDate,
    dateRange.endDate,
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<SesionesQueryData> => {
      let sesiones: SesionRow[];
      let alumnoIds: string[] | null = null;

      if (isProfesorRole(rol)) {
        if (!perfil?.ID_PROFESOR) return EMPTY_SESIONES_QUERY;

        let query = supabase.from("SESIONES").select("*");
        query = scopeTenantQuery(query, rol, tenantId);
        query = query
          .eq("ID_PROFESOR", perfil.ID_PROFESOR)
          .gte("FECHA_EXACTA", dateRange.startDate)
          .lte("FECHA_EXACTA", dateRange.endDate);

        const { data, error } = await query.order("FECHA_EXACTA", { ascending: true });
        if (error) throw error;
        sesiones = (data ?? []) as SesionRow[];
      } else {
        // ADMIN, SECRETARIA, DIRECCION — scope by ALUMNOS.ID_CENTRO via ID_ALUMNO.
        alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);
        if (alumnoIds && alumnoIds.length === 0) return EMPTY_SESIONES_QUERY;

        let query = supabase.from("SESIONES").select("*");
        query = scopeTenantQuery(query, rol, tenantId);
        query = query
          .gte("FECHA_EXACTA", dateRange.startDate)
          .lte("FECHA_EXACTA", dateRange.endDate);
        const scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
        if (scoped === "empty") return EMPTY_SESIONES_QUERY;

        const { data, error } = await scoped.order("FECHA_EXACTA", { ascending: true });
        if (error) throw error;
        sesiones = (data ?? []) as SesionRow[];
      }

      let targetIds: string[] | null = alumnoIds;
      if (targetIds == null) {
        const uniqueSessionAlumnoIds = Array.from(
          new Set(sesiones.map((s) => s.ID_ALUMNO).filter(Boolean)),
        ) as string[];
        targetIds = uniqueSessionAlumnoIds;
      }

      let alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string }[];
      if (targetIds.length > 0) {
        let alumnosQuery = supabase.from("ALUMNOS").select("ID_ALUMNO, NOMBRE_ALUMNO");
        alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);
        alumnosQuery = alumnosQuery.in("ID_ALUMNO", targetIds);
        const { data } = await alumnosQuery;
        alumnos = data ?? [];
      } else if (isProfesorRole(rol)) {
        alumnos = [];
      } else {
        let alumnosQuery = supabase.from("ALUMNOS").select("ID_ALUMNO, NOMBRE_ALUMNO");
        alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);
        const { data } = await alumnosQuery;
        alumnos = data ?? [];
      }

      let profesoresQuery = supabase.from("PROFESOR").select("ID_PROFESOR, NOMBRE_PROFESOR");
      profesoresQuery = scopeTenantQuery(profesoresQuery, rol, tenantId);
      const { data: profesores } = await profesoresQuery;

      let aulasQuery = supabase.from("AULA").select("ID_AULA, NOMBRE_AULA");
      aulasQuery = scopeTenantQuery(aulasQuery, rol, tenantId);
      const { data: aulas } = await aulasQuery;

      let espQuery = supabase.from("ESPECIALIDADES").select("ID_ESPECIALIDAD, ESPECIALIDAD");
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);
      const { data: esp } = await espQuery;

      const mapped = mapSesiones(
        sesiones,
        alumnos,
        profesores ?? [],
        aulas ?? [],
        esp ?? [],
      );

      const grouped = groupSesiones(mapped);

      return {
        sesiones: grouped,
        filters: {
          uniqueAlumnos: buildUniqueOptions(
            mapped
              .filter((s) => s.ID_ALUMNO)
              .map((s) => ({ id: s.ID_ALUMNO!, name: s.TEXTO_ALUMNO })),
          ),
          uniqueProfesores: buildUniqueOptions(
            mapped
              .filter((s) => s.ID_PROFESOR)
              .map((s) => ({ id: s.ID_PROFESOR!, name: s.TEXTO_PROFESOR })),
          ),
          uniqueAulas: buildUniqueOptions(
            mapped
              .filter((s) => s.ID_AULA)
              .map((s) => ({ id: s.ID_AULA!, name: s.TEXTO_AULA })),
          ),
          uniqueEspecialidades: buildUniqueOptions(
            mapped
              .filter((s) => s.ESPECIALIDAD)
              .map((s) => ({ id: s.ESPECIALIDAD!, name: s.TEXTO_ESPECIALIDAD })),
          ),
        },
      };
    },
  });

  return { list };
}
