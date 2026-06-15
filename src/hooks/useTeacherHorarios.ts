import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

const HORARIO_SELECT_COLUMNS =
  "ID_HORARIO, ID_CLIENTE, ID_MATRICULA, ID_ALUMNO, ID_ESPECIALIDAD, ID_GRUPO, ID_PROFESOR, TIPO_CLASE, ESTADO_MATRICULA" as const;

export interface TeacherHorarioRow {
  ID_HORARIO: string;
  ID_CLIENTE: string;
  ID_MATRICULA: string;
  ID_ALUMNO: string;
  ID_ESPECIALIDAD: string | null;
  ID_GRUPO: string | null;
  ID_PROFESOR: string | null;
  TIPO_CLASE: string | null;
  ESTADO_MATRICULA: string | null;
}

export interface TeacherHorarioStudent {
  idAlumno: string;
  idEspecialidad: string;
  nombreAlumno: string;
  nombreEspecialidad: string;
  horarioIds: string[];
}

export interface TeacherHorarioGroup {
  idGrupo: string;
  nombreGrupo: string;
  nombreEspecialidad: string;
  label: string;
  students: TeacherHorarioStudent[];
}

function isIndividualHorario(row: TeacherHorarioRow): boolean {
  return (row.TIPO_CLASE ?? "").trim().toLowerCase() === "individual";
}

function isGrupoHorario(row: TeacherHorarioRow): boolean {
  return (row.TIPO_CLASE ?? "").trim().toLowerCase() === "grupo";
}

function studentKey(idAlumno: string, idEspecialidad: string): string {
  return `${idAlumno}::${idEspecialidad}`;
}

function upsertStudent(
  map: Map<string, TeacherHorarioStudent>,
  row: TeacherHorarioRow,
  alumnoById: Map<string, string>,
  especialidadById: Map<string, string>,
) {
  const idEspecialidad = row.ID_ESPECIALIDAD?.trim();
  if (!row.ID_ALUMNO?.trim() || !idEspecialidad) return;

  const key = studentKey(row.ID_ALUMNO, idEspecialidad);
  const existing = map.get(key);
  if (existing) {
    existing.horarioIds.push(row.ID_HORARIO);
    return;
  }

  map.set(key, {
    idAlumno: row.ID_ALUMNO,
    idEspecialidad,
    nombreAlumno: alumnoById.get(row.ID_ALUMNO) ?? "Alumno",
    nombreEspecialidad: especialidadById.get(idEspecialidad) ?? "Especialidad",
    horarioIds: [row.ID_HORARIO],
  });
}

export function buildTeacherRoster(
  horarios: TeacherHorarioRow[],
  alumnoById: Map<string, string>,
  especialidadById: Map<string, string>,
  grupoById: Map<string, { nombreGrupo: string; nombreEspecialidad: string }>,
): {
  individuales: TeacherHorarioStudent[];
  grupos: TeacherHorarioGroup[];
} {
  const individualMap = new Map<string, TeacherHorarioStudent>();
  const groupStudentMaps = new Map<string, Map<string, TeacherHorarioStudent>>();

  for (const row of horarios) {
    if (isIndividualHorario(row)) {
      upsertStudent(individualMap, row, alumnoById, especialidadById);
      continue;
    }

    if (!isGrupoHorario(row) || !row.ID_GRUPO) continue;

    let groupMap = groupStudentMaps.get(row.ID_GRUPO);
    if (!groupMap) {
      groupMap = new Map();
      groupStudentMaps.set(row.ID_GRUPO, groupMap);
    }
    upsertStudent(groupMap, row, alumnoById, especialidadById);
  }

  const individuales = [...individualMap.values()].sort((a, b) =>
    a.nombreAlumno.localeCompare(b.nombreAlumno, "es", { sensitivity: "base" }),
  );

  const grupos: TeacherHorarioGroup[] = [...groupStudentMaps.entries()]
    .map(([idGrupo, studentsMap]) => {
      const meta = grupoById.get(idGrupo);
      const nombreGrupo = meta?.nombreGrupo ?? idGrupo;
      const nombreEspecialidad = meta?.nombreEspecialidad ?? "Grupo";
      const students = [...studentsMap.values()].sort((a, b) =>
        a.nombreAlumno.localeCompare(b.nombreAlumno, "es", { sensitivity: "base" }),
      );

      return {
        idGrupo,
        nombreGrupo,
        nombreEspecialidad,
        label: `${nombreEspecialidad} — ${nombreGrupo}`,
        students,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

  return { individuales, grupos };
}

export function useTeacherHorarios(profesorId: string | null | undefined) {
  const { tenantId, rol } = useActiveTenant();
  const queryKey = [
    ...tenantListKey("teacherHorarios", rol, tenantId),
    profesorId ?? "none",
  ] as const;

  const list = useQuery({
    queryKey,
    enabled: !!profesorId,
    queryFn: async (): Promise<TeacherHorarioRow[]> => {
      let query = supabase
        .from("HORARIOS_MATRICULAS")
        .select(HORARIO_SELECT_COLUMNS)
        .eq("ID_PROFESOR", profesorId!);
      query = scopeTenantQuery(query, rol, tenantId);

      const { data, error } = await query.order("ID_ALUMNO", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TeacherHorarioRow[];
    },
  });

  return { list };
}
