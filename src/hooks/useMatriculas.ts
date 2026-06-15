import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { appendCenterFilter } from "@/lib/centroFilter";
import {
  scopeTenantQuery,
  workspaceListKey,
  workspaceScopeFields,
} from "@/lib/tenantQuery";
import type { HorarioMatricula, Matricula } from "@/types/database";

const MATRICULAS_LIST_SELECT = `
  *,
  ALUMNOS (
    NOMBRE_ALUMNO
  ),
  HORARIOS_MATRICULAS (
    *
  )
` as const;

export type MatriculaRow = Matricula & {
  ALUMNOS: { NOMBRE_ALUMNO: string } | null;
  ESPECIALIDADES: { ESPECIALIDAD: string } | null;
  PROFESOR: { NOMBRE_PROFESOR: string } | null;
  HORARIOS_MATRICULAS: HorarioMatricula[];
};

export type MatriculasListResult = {
  rows: MatriculaRow[];
  especialidadById: Map<string, string>;
};

export function useMatriculas(filterCenterId?: string | null) {
  const { tenantId, centerId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const resolvedCenterId =
    filterCenterId !== undefined ? filterCenterId : centerId;
  const queryKey = workspaceListKey(
    "matriculas",
    tenantId,
    resolvedCenterId ?? "all",
  );

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<MatriculasListResult> => {
      let query = supabase.from("MATRICULAS").select(MATRICULAS_LIST_SELECT);
      query = scopeTenantQuery(query, rol, tenantId);
      query = appendCenterFilter(query, resolvedCenterId);
      const { data: mats, error } = await query.order("FECHA_ALTA", { ascending: false });

      if (error) throw error;

      let espQuery = supabase.from("ESPECIALIDADES").select("*");
      espQuery = scopeTenantQuery(espQuery, rol, tenantId);
      const { data: esp } = await espQuery;

      let profsQuery = supabase.from("PROFESOR").select("*");
      profsQuery = scopeTenantQuery(profsQuery, rol, tenantId);
      const { data: profs } = await profsQuery;

      const especialidadById = new Map(
        (esp ?? []).map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]),
      );

      const rows = (mats || []).map((m: MatriculaRow) => {
        const espFound = esp?.find((e) => e.ID_ESPECIALIDAD === m.ESPECIALIDAD);
        const profFound = profs?.find((p) => p.ID_PROFESOR === m.ID_PROFESOR);

        return {
          ...m,
          ALUMNOS: m.ALUMNOS ?? null,
          HORARIOS_MATRICULAS: m.HORARIOS_MATRICULAS ?? [],
          ESPECIALIDADES: espFound ? { ESPECIALIDAD: espFound.ESPECIALIDAD } : null,
          PROFESOR: profFound ? { NOMBRE_PROFESOR: profFound.NOMBRE_PROFESOR } : null,
        };
      });

      return { rows, especialidadById };
    },
  });

  const create = useMutation({
    mutationFn: async (input: any) => {
      const payload = { ...input, ...workspaceScopeFields(tenantId, centerId) };
      const { data, error } = await supabase.from("MATRICULAS").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { data, error } = await supabase.from("MATRICULAS").update(patch).eq("ID_MATRICULA", id).eq("ID_CLIENTE", tenantId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("MATRICULAS").delete().eq("ID_MATRICULA", id).eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
