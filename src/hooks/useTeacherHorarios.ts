import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

// NOTE: the status column on HORARIOS_MATRICULAS itself is named `ESTADO`
// (not `ESTADO_MATRICULA` — that name only applies to the parent MATRICULAS
// row). Selecting the wrong name throws a Postgres "column does not exist"
// error and crashes this query.
const HORARIO_SELECT_COLUMNS =
  "ID_HORARIO, ID_CLIENTE, ID_MATRICULA, ID_ALUMNO, ID_ESPECIALIDAD, ID_GRUPO, ID_PROFESOR, TIPO_CLASE, ESTADO, DIA, HORA_INICIO, HORA_FIN, MATRICULAS(ID_ALUMNO, ALUMNOS(NOMBRE_ALUMNO))" as const;

type TeacherHorarioAlumnoEmbed = { NOMBRE_ALUMNO: string };

type TeacherHorarioMatriculaEmbed = {
  ID_ALUMNO: string;
  ALUMNOS: TeacherHorarioAlumnoEmbed | TeacherHorarioAlumnoEmbed[] | null;
};

export interface TeacherHorarioRow {
  ID_HORARIO: string;
  ID_CLIENTE: string;
  ID_MATRICULA: string;
  ID_ALUMNO: string;
  ID_ESPECIALIDAD: string | null;
  ID_GRUPO: string | null;
  ID_PROFESOR: string | null;
  TIPO_CLASE: string | null;
  ESTADO: string | null;
  DIA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  // PostgREST embed cardinality isn't statically known here (no generated
  // Database types for this table), so this may arrive as an object or a
  // single-item array depending on the FK relationship metadata.
  MATRICULAS: TeacherHorarioMatriculaEmbed | TeacherHorarioMatriculaEmbed[] | null;
}

function resolveNombreAlumnoFromMatricula(
  matriculas: TeacherHorarioRow["MATRICULAS"],
): string | null {
  const matricula = Array.isArray(matriculas) ? matriculas[0] : matriculas;
  if (!matricula) return null;
  const alumno = Array.isArray(matricula.ALUMNOS) ? matricula.ALUMNOS[0] : matricula.ALUMNOS;
  return alumno?.NOMBRE_ALUMNO ?? null;
}

export interface TeacherHorarioSlot {
  dia: string;
  horaInicio: string;
  horaFin: string;
}

export interface TeacherHorarioStudent {
  idAlumno: string;
  idEspecialidad: string;
  nombreAlumno: string;
  nombreEspecialidad: string;
  horarioIds: string[];
  horarios: TeacherHorarioSlot[];
}

const DIA_LABELS: Record<string, string> = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  MIÉRCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
  SÁBADO: "Sábado",
  DOMINGO: "Domingo",
};

export function formatDiaSemana(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (!trimmed) return "—";
  const upper = trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
  return DIA_LABELS[upper] ?? (trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase());
}

export function formatHoraSlot(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 5);
}

export function formatHorarioSlotLabel(slot: TeacherHorarioSlot): string {
  const inicio = formatHoraSlot(slot.horaInicio);
  const fin = formatHoraSlot(slot.horaFin);
  const dia = formatDiaSemana(slot.dia);
  if (inicio === "—" && fin === "—") return dia;
  return `${dia} ${inicio} - ${fin}`;
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

function slotKey(slot: TeacherHorarioSlot): string {
  return `${slot.dia ?? ""}::${slot.horaInicio ?? ""}::${slot.horaFin ?? ""}`;
}

function addSlot(student: TeacherHorarioStudent, row: TeacherHorarioRow) {
  if (!row.DIA && !row.HORA_INICIO && !row.HORA_FIN) return;
  const slot: TeacherHorarioSlot = {
    dia: row.DIA ?? "",
    horaInicio: row.HORA_INICIO ?? "",
    horaFin: row.HORA_FIN ?? "",
  };
  const key = slotKey(slot);
  if (student.horarios.some((s) => slotKey(s) === key)) return;
  student.horarios.push(slot);
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
  const nombreAlumno =
    resolveNombreAlumnoFromMatricula(row.MATRICULAS) ?? alumnoById.get(row.ID_ALUMNO) ?? "Alumno";

  const existing = map.get(key);
  if (existing) {
    existing.horarioIds.push(row.ID_HORARIO);
    addSlot(existing, row);
    return;
  }

  const student: TeacherHorarioStudent = {
    idAlumno: row.ID_ALUMNO,
    idEspecialidad,
    nombreAlumno,
    nombreEspecialidad: especialidadById.get(idEspecialidad) ?? "Especialidad",
    horarioIds: [row.ID_HORARIO],
    horarios: [],
  };
  addSlot(student, row);
  map.set(key, student);
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
