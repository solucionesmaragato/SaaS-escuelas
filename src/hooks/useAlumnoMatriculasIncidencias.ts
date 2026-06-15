import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import type { HorarioMatricula, Incidencia, Matricula } from "@/types/database";

const ALUMNO_MATRICULA_DETAIL_SELECT = `
  *,
  TARIFAS (
    ID_TARIFA,
    SERVICIO
  ),
  HORARIOS_MATRICULAS (
    *
  )
` as const;

export type MatriculaWithHorarios = Matricula & {
  HORARIOS_MATRICULAS: HorarioMatricula[];
  TARIFAS: { ID_TARIFA: string; SERVICIO: string } | null;
};

export function useAlumnoMatriculasIncidencias(alumnoId: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const queryKey = [
    ...tenantListKey("alumno-matriculas-incidencias", rol, tenantId),
    alumnoId,
  ] as const;

  return useQuery({
    queryKey,
    enabled: !!alumnoId,
    queryFn: async () => {
      let matQuery = supabase
        .from("MATRICULAS")
        .select(ALUMNO_MATRICULA_DETAIL_SELECT)
        .eq("ID_ALUMNO", alumnoId!);
      matQuery = scopeTenantQuery(matQuery, rol, tenantId);

      let incQuery = supabase
        .from("INCIDENCIAS")
        .select("*")
        .eq("ID_ALUMNO", alumnoId!);
      incQuery = scopeTenantQuery(incQuery, rol, tenantId);

      const [matRes, incRes] = await Promise.all([
        matQuery.order("FECHA_ALTA", { ascending: false }),
        incQuery.order("FECHA_EXACTA", { ascending: false }),
      ]);

      if (matRes.error) throw matRes.error;
      if (incRes.error) throw incRes.error;

      return {
        matriculas: (matRes.data ?? []).map((mat) => ({
          ...mat,
          HORARIOS_MATRICULAS: mat.HORARIOS_MATRICULAS ?? [],
        })) as MatriculaWithHorarios[],
        incidencias: (incRes.data ?? []) as Incidencia[],
      };
    },
  });
}
