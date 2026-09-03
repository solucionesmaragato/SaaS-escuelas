import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { sortAlphabetic } from "@/lib/alumnosMatriculasUtils";
import { resolveProfileListCenterId, scopeDirectCentroTableQuery } from "@/lib/centroFilter";
import { scopeTenantQuery, workspaceListKey } from "@/lib/tenantQuery";
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

const ALUMNOS_MATRICULAS_SELECT =
  "ID_ALUMNO, ID_CLIENTE, ID_CENTRO, NOMBRE_ALUMNO, TLF_COMUNICACION, MAIL, DNI, TLF_ALUMNO, NOMBRE_MADRE, TLF_MADRE, NOMBRE_PADRE, TLF_PADRE, DIRECCION, CP, MUNICIPIO, PROVINCIA, NACIMIENTO, DTO_HERMANOS_PORCENTAJE, ESTADO_MATRICULA, MES_DEVOLUCION_RESERVA, ESTADO_RESERVA, AJUSTE_MANUAL_EUR, MOTIVO_AJUSTE, METODO_PAGO, IBAN, TITULAR_CUENTA, TLF_BIZUM, MANDATO, TARJETA, STRIPE_ID, KOREFACTU_ID, TOTAL_MENSUAL, NOTAS, AUT_MEDIOS, AUT_INSTALACIONES, AUT_WEB, AUT_RRSS, AUT_COMUNICACION_TOTAL, ESTADO_ALUMNO, FOTO" as const;

const MATRICULAS_MATRICULAS_SELECT =
  "ID_MATRICULA, ID_CLIENTE, ID_CENTRO, ID_ALUMNO, ID_TARIFA, ESPECIALIDAD, ESTADO, FECHA_ALTA, FECHA_BAJA, ID_PROFESOR, ALERTA_SUBPROGRAMADO" as const;

type IncidenciaAlumnoRef = { ID_ALUMNO: string };
type ProfesorNombreRef = { ID_PROFESOR: string; NOMBRE_PROFESOR: string };
type TarifaServicioRef = { ID_TARIFA: string; SERVICIO: string };
type EspecialidadRef = { ID_ESPECIALIDAD: string; ESPECIALIDAD: string };

export function useAlumnosMatriculas() {
  const { tenantId, centerId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const effectiveCenterId = resolveProfileListCenterId(rol, centerId);
  const queryKey = workspaceListKey(
    "alumnos_matriculas_dashboard",
    tenantId,
    effectiveCenterId ?? "all",
  );

  const data = useQuery<AlumnosMatriculasData>({
    queryKey,
    queryFn: async (): Promise<AlumnosMatriculasData> => {
      let aluQ = supabase.from("ALUMNOS").select(ALUMNOS_MATRICULAS_SELECT);
      aluQ = scopeDirectCentroTableQuery(aluQ, rol, tenantId, centerId);
      let matQ = supabase.from("MATRICULAS").select(MATRICULAS_MATRICULAS_SELECT);
      matQ = scopeDirectCentroTableQuery(matQ, rol, tenantId, centerId);
      let incQ = supabase.from("INCIDENCIAS").select("ID_ALUMNO");
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

      const incidenciasCountByAlumno = new Map<string, number>();
      for (const inc of incidenciasRows) {
        incidenciasCountByAlumno.set(
          inc.ID_ALUMNO,
          (incidenciasCountByAlumno.get(inc.ID_ALUMNO) ?? 0) + 1,
        );
      }

      const alumnosById = new Map(alumnosRows.map((alu) => [alu.ID_ALUMNO, alu]));
      const profesoresById = new Map(profesoresRows.map((p) => [p.ID_PROFESOR, p]));
      const tarifasById = new Map(tarifasRows.map((t) => [t.ID_TARIFA, t]));
      const especialidadesById = new Map(especialidadesRows.map((e) => [e.ID_ESPECIALIDAD, e]));

      const listaAlumnos = sortAlphabetic<AlumnoMatriculasRow>(
        alumnosRows.map((alu) => ({
          ...alu,
          TOTAL_INCIDENCIAS: incidenciasCountByAlumno.get(alu.ID_ALUMNO) ?? 0,
        })),
        (a) => a.NOMBRE_ALUMNO ?? "",
      );

      const listaMatriculas = sortAlphabetic<MatriculaMatriculasRow>(
        matriculasRows.map((mat) => {
          const alu = alumnosById.get(mat.ID_ALUMNO);
          const prof = mat.ID_PROFESOR ? profesoresById.get(mat.ID_PROFESOR) : undefined;
          const tar = mat.ID_TARIFA ? tarifasById.get(mat.ID_TARIFA) : undefined;
          const esp = mat.ESPECIALIDAD ? especialidadesById.get(mat.ESPECIALIDAD) : undefined;

          return {
            ...mat,
            TEXTO_ALUMNO: alu?.NOMBRE_ALUMNO || "S/A",
            TEXTO_PROFESOR: prof?.NOMBRE_PROFESOR || "No asignado",
            TEXTO_TARIFA: tar?.SERVICIO || "Sin tarifa",
            TEXTO_ESPECIALIDAD: esp?.ESPECIALIDAD || mat.ESPECIALIDAD || "General",
            TOTAL_INCIDENCIAS: incidenciasCountByAlumno.get(mat.ID_ALUMNO) ?? 0,
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
