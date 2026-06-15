import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { sortAlphabetic } from "@/lib/alumnosMatriculasUtils";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import type { Alumno, Matricula } from "@/types/database";

export type AlumnoMatriculasRow = Alumno & { TOTAL_INCIDENCIAS: number };

export type MatriculaMatriculasRow = Matricula & {
  TEXTO_ALUMNO: string;
  TEXTO_PROFESOR: string;
  TEXTO_TARIFA: string;
  TEXTO_ESPECIALIDAD: string;
  TOTAL_INCIDENCIAS: number;
};

export type AlumnosMatriculasData = {
  alumnos: AlumnoMatriculasRow[];
  matriculas: MatriculaMatriculasRow[];
};

type IncidenciaAlumnoRef = { ID_ALUMNO: string };
type ProfesorNombreRef = { ID_PROFESOR: string; NOMBRE_PROFESOR: string };
type TarifaServicioRef = { ID_TARIFA: string; SERVICIO: string };
type EspecialidadRef = { ID_ESPECIALIDAD: string; ESPECIALIDAD: string };

export function useAlumnosMatriculas() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("alumnos_matriculas_dashboard", rol, tenantId);

  const data = useQuery<AlumnosMatriculasData>({
    queryKey,
    queryFn: async (): Promise<AlumnosMatriculasData> => {
      let aluQ = supabase.from("ALUMNOS").select("*");
      aluQ = scopeTenantQuery(aluQ, rol, tenantId);
      let matQ = supabase.from("MATRICULAS").select("*");
      matQ = scopeTenantQuery(matQ, rol, tenantId);
      let incQ = supabase.from("INCIDENCIAS").select("*");
      incQ = scopeTenantQuery(incQ, rol, tenantId);
      let profQ = supabase.from("PROFESOR").select("ID_PROFESOR, NOMBRE_PROFESOR");
      profQ = scopeTenantQuery(profQ, rol, tenantId);
      let tarQ = supabase.from("TARIFAS").select("ID_TARIFA, SERVICIO");
      tarQ = scopeTenantQuery(tarQ, rol, tenantId);
      let espQ = supabase.from("ESPECIALIDADES").select("ID_ESPECIALIDAD, ESPECIALIDAD");
      espQ = scopeTenantQuery(espQ, rol, tenantId);

      const [
        { data: alumnos, error: errAlu },
        { data: matriculas, error: errMat },
        { data: incidencias, error: errInc },
        { data: profesores, error: errProf },
        { data: tarifas, error: errTar },
        { data: especialidades, error: errEsp },
      ] = await Promise.all([
        aluQ.order("NOMBRE_ALUMNO", { ascending: true }),
        matQ,
        incQ,
        profQ,
        tarQ,
        espQ,
      ]);

      if (errAlu) throw errAlu;
      if (errMat) throw errMat;
      if (errInc) throw errInc;
      if (errProf) throw errProf;
      if (errTar) throw errTar;
      if (errEsp) throw errEsp;

      const alumnosRows = (alumnos ?? []) as Alumno[];
      const matriculasRows = (matriculas ?? []) as Matricula[];
      const incidenciasRows = (incidencias ?? []) as IncidenciaAlumnoRef[];
      const profesoresRows = (profesores ?? []) as ProfesorNombreRef[];
      const tarifasRows = (tarifas ?? []) as TarifaServicioRef[];
      const especialidadesRows = (especialidades ?? []) as EspecialidadRef[];

      const listaAlumnos = sortAlphabetic<AlumnoMatriculasRow>(
        alumnosRows.map((alu) => {
          const incidenciasAlumno = incidenciasRows.filter((i) => i.ID_ALUMNO === alu.ID_ALUMNO);
          return { ...alu, TOTAL_INCIDENCIAS: incidenciasAlumno.length };
        }),
        (a) => a.NOMBRE_ALUMNO ?? "",
      );

      const listaMatriculas = sortAlphabetic<MatriculaMatriculasRow>(
        matriculasRows.map((mat) => {
          const alu = alumnosRows.find((a) => a.ID_ALUMNO === mat.ID_ALUMNO);
          const prof = profesoresRows.find((p) => p.ID_PROFESOR === mat.ID_PROFESOR);
          const tar = tarifasRows.find((t) => t.ID_TARIFA === mat.ID_TARIFA);
          const esp = especialidadesRows.find((e) => e.ID_ESPECIALIDAD === mat.ESPECIALIDAD);
          const incidenciasAlumno = incidenciasRows.filter((i) => i.ID_ALUMNO === mat.ID_ALUMNO);

          return {
            ...mat,
            TEXTO_ALUMNO: alu?.NOMBRE_ALUMNO || "S/A",
            TEXTO_PROFESOR: prof?.NOMBRE_PROFESOR || "No asignado",
            TEXTO_TARIFA: tar?.SERVICIO || "Sin tarifa",
            TEXTO_ESPECIALIDAD: esp?.ESPECIALIDAD || mat.ESPECIALIDAD || "General",
            TOTAL_INCIDENCIAS: incidenciasAlumno.length,
          };
        }),
        (m) => m.TEXTO_ALUMNO ?? "",
      );

      return { alumnos: listaAlumnos, matriculas: listaMatriculas };
    },
  });

  const updateAlumno = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("ALUMNOS")
        .update(patch)
        .eq("ID_ALUMNO", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const updateMatricula = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("MATRICULAS")
        .update(patch)
        .eq("ID_MATRICULA", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { data, updateAlumno, updateMatricula };
}
