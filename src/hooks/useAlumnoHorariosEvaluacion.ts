import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

const HORARIO_EVALUACION_SELECT = "ID_ESPECIALIDAD, ID_PROFESOR" as const;

type HorarioEvaluacionRow = {
  ID_ESPECIALIDAD: string | null;
  ID_PROFESOR: string | null;
};

export type AlumnoEspecialidadEvaluacion = {
  ID_ESPECIALIDAD: string;
  ID_PROFESOR: string | null;
  nombreEspecialidad: string;
};

function buildUniqueSpecialties(
  rows: HorarioEvaluacionRow[],
  especialidadById: Map<string, string>,
): AlumnoEspecialidadEvaluacion[] {
  const byEspecialidad = new Map<string, AlumnoEspecialidadEvaluacion>();

  for (const row of rows) {
    const idEspecialidad = row.ID_ESPECIALIDAD?.trim();
    if (!idEspecialidad) continue;

    const existing = byEspecialidad.get(idEspecialidad);
    const idProfesor = row.ID_PROFESOR?.trim() || null;

    if (!existing) {
      byEspecialidad.set(idEspecialidad, {
        ID_ESPECIALIDAD: idEspecialidad,
        ID_PROFESOR: idProfesor,
        nombreEspecialidad: especialidadById.get(idEspecialidad) ?? "Especialidad",
      });
      continue;
    }

    if (!existing.ID_PROFESOR && idProfesor) {
      byEspecialidad.set(idEspecialidad, { ...existing, ID_PROFESOR: idProfesor });
    }
  }

  return [...byEspecialidad.values()].sort((a, b) =>
    a.nombreEspecialidad.localeCompare(b.nombreEspecialidad, "es", { sensitivity: "base" }),
  );
}

export function useAlumnoHorariosEvaluacion(
  idAlumno: string | null | undefined,
  idCurso: string | null | undefined,
) {
  const { tenantId, rol } = useActiveTenant();
  const alumnoId = idAlumno?.trim() ?? "";
  const cursoId = idCurso?.trim() ?? "";
  const queryKey = [
    ...tenantListKey("alumnoHorariosEvaluacion", rol, tenantId),
    alumnoId || "none",
    cursoId || "none",
  ] as const;

  return useQuery({
    queryKey,
    enabled: !!alumnoId && !!cursoId,
    queryFn: async (): Promise<AlumnoEspecialidadEvaluacion[]> => {
      let horariosQuery = supabase
        .from("HORARIOS_MATRICULAS")
        .select(HORARIO_EVALUACION_SELECT)
        .eq("ID_ALUMNO", alumnoId)
        .eq("ID_CURSO", cursoId);
      horariosQuery = scopeTenantQuery(horariosQuery, rol, tenantId);

      let espQuery = supabase.from("ESPECIALIDADES").select("ID_ESPECIALIDAD, ESPECIALIDAD");
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);

      const [{ data: horarios, error: horariosError }, { data: especialidades, error: espError }] =
        await Promise.all([horariosQuery, espQuery]);

      if (horariosError) throw horariosError;
      if (espError) throw espError;

      const especialidadById = new Map(
        (especialidades ?? []).map((row) => [
          String(row.ID_ESPECIALIDAD),
          String(row.ESPECIALIDAD),
        ]),
      );

      return buildUniqueSpecialties(
        (horarios ?? []) as HorarioEvaluacionRow[],
        especialidadById,
      );
    },
  });
}
