import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { isProfesorRole } from "@/lib/tenantQuery";

export type ProfesorAlumnoTutor = {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
};

export type ProfesorAlumnoLista = {
  ID_ALUMNO: string;
  ID_CLIENTE: string;
  NOMBRE_ALUMNO: string;
  NACIMIENTO: string | null;
  EDAD: number | null;
  TUTORES: ProfesorAlumnoTutor[];
};

export type ProfesorAlumnoHorario = {
  ID_HORARIO: string;
  ID_CLIENTE: string;
  ID_ALUMNO: string;
  ID_MATRICULA: string | null;
  ID_CENTRO: string | null;
  NOMBRE_CENTRO: string | null;
  ID_ESPECIALIDAD: string | null;
  ESPECIALIDAD: string | null;
  ID_PROFESOR: string | null;
  NOMBRE_PROFESOR: string | null;
  DIA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_AULA: string | null;
  TIPO_CLASE: string | null;
  ESTADO: string | null;
};

function parseTutores(value: unknown): ProfesorAlumnoTutor[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = typeof row.ID_PROFESOR === "string" ? row.ID_PROFESOR.trim() : "";
      const nombre =
        typeof row.NOMBRE_PROFESOR === "string" ? row.NOMBRE_PROFESOR.trim() : "";
      if (!id || !nombre) return null;
      return { ID_PROFESOR: id, NOMBRE_PROFESOR: nombre };
    })
    .filter(Boolean) as ProfesorAlumnoTutor[];
}

export function useAlumnosProfesor() {
  const { tenantId, centerId, rol, perfil } = useActiveTenant();
  const profesorId = perfil.ID_PROFESOR?.trim() ?? "";
  const enabled = isProfesorRole(rol) && !!tenantId && !!profesorId;

  const list = useQuery({
    queryKey: ["profesor-alumnos-lista", tenantId, centerId, profesorId] as const,
    enabled,
    queryFn: async (): Promise<ProfesorAlumnoLista[]> => {
      const { data, error } = await supabase
        .from("VISTA_PROFESOR_ALUMNOS_LISTA")
        .select("ID_ALUMNO, ID_CLIENTE, NOMBRE_ALUMNO, NACIMIENTO, EDAD, TUTORES")
        .order("NOMBRE_ALUMNO", { ascending: true });
      if (error) throw error;

      return (data ?? []).map((row) => ({
        ID_ALUMNO: row.ID_ALUMNO,
        ID_CLIENTE: row.ID_CLIENTE,
        NOMBRE_ALUMNO: row.NOMBRE_ALUMNO ?? "",
        NACIMIENTO: row.NACIMIENTO ?? null,
        EDAD: typeof row.EDAD === "number" ? row.EDAD : row.EDAD != null ? Number(row.EDAD) : null,
        TUTORES: parseTutores(row.TUTORES),
      }));
    },
  });

  const horarios = useQuery({
    queryKey: ["profesor-alumnos-horarios", tenantId, centerId, profesorId] as const,
    enabled,
    queryFn: async (): Promise<ProfesorAlumnoHorario[]> => {
      const { data, error } = await supabase
        .from("VISTA_PROFESOR_ALUMNOS_HORARIOS")
        .select(
          "ID_HORARIO, ID_CLIENTE, ID_ALUMNO, ID_MATRICULA, ID_CENTRO, NOMBRE_CENTRO, ID_ESPECIALIDAD, ESPECIALIDAD, ID_PROFESOR, NOMBRE_PROFESOR, DIA, HORA_INICIO, HORA_FIN, ID_AULA, TIPO_CLASE, ESTADO",
        );
      if (error) throw error;
      return (data ?? []) as ProfesorAlumnoHorario[];
    },
  });

  return { list, horarios, enabled };
}
