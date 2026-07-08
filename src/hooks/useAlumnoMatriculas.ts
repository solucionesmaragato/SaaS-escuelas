import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import type { Matricula } from "@/types/database";
import {
  isAdminRole,
  isSecretariaRole,
  scopeWorkspaceQuery,
  tenantListKey,
  workspaceListKey,
  workspaceScopeFields,
} from "@/lib/tenantQuery";

function assertCanMutateAlumnos(rol: string | null | undefined) {
  if (isAdminRole(rol) || isSecretariaRole(rol)) return;
  throw new Error("No tienes permiso para modificar alumnos.");
}

export type MatriculaCreateInput = {
  ESPECIALIDAD: string | null;
  ID_TARIFA: string | null;
  ID_PROFESOR: string | null;
  ESTADO?: string | null;
  FECHA_ALTA?: string | null;
};

export type MatriculaUpdateInput = {
  ESPECIALIDAD?: string | null;
  ID_TARIFA?: string | null;
  ID_PROFESOR?: string | null;
  ESTADO?: string | null;
  FECHA_ALTA?: string | null;
  FECHA_BAJA?: string | null;
};

function alumnoMatriculasKey(
  tenantId: string,
  centerId: string | null | undefined,
  alumnoId: string | null,
) {
  return [...workspaceListKey("alumno-matriculas", tenantId, centerId), alumnoId] as const;
}

function invalidateMatriculaQueries(
  qc: ReturnType<typeof useQueryClient>,
  rol: string | null | undefined,
  tenantId: string,
  centerId: string | null | undefined,
  alumnoId: string | null,
) {
  void qc.invalidateQueries({
    queryKey: alumnoMatriculasKey(tenantId, centerId, alumnoId),
  });
  void qc.invalidateQueries({
    queryKey: tenantListKey("alumno-matriculas-incidencias", rol, tenantId),
  });
  void qc.invalidateQueries({ queryKey: workspaceListKey("matriculas", tenantId, centerId) });
  void qc.invalidateQueries({ queryKey: workspaceListKey("alumnosTree", tenantId, centerId) });
}

export function useAlumnoMatriculas(alumnoId: string | null) {
  const { tenantId, centerId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = alumnoMatriculasKey(tenantId, centerId, alumnoId);

  const list = useQuery({
    queryKey,
    enabled: !!alumnoId,
    queryFn: async () => {
      let query = supabase
        .from("MATRICULAS")
        .select("*")
        .eq("ID_ALUMNO", alumnoId!);
      query = scopeWorkspaceQuery(query, tenantId, centerId);
      const { data, error } = await query.order("FECHA_ALTA", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Matricula[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: MatriculaCreateInput) => {
      assertCanMutateAlumnos(rol);
      if (!alumnoId) throw new Error("Alumno no definido");
      const payload = {
        ID_ALUMNO: alumnoId,
        ESPECIALIDAD: input.ESPECIALIDAD,
        ID_TARIFA: input.ID_TARIFA,
        ID_PROFESOR: input.ID_PROFESOR,
        ESTADO: input.ESTADO ?? "Activo",
        FECHA_ALTA: input.FECHA_ALTA ?? new Date().toISOString().slice(0, 10),
        ...workspaceScopeFields(tenantId, centerId),
      };
      const { data, error } = await supabase
        .from("MATRICULAS")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Matricula;
    },
    onSuccess: () => invalidateMatriculaQueries(qc, rol, tenantId, centerId, alumnoId),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MatriculaUpdateInput }) => {
      assertCanMutateAlumnos(rol);
      let query = supabase
        .from("MATRICULAS")
        .update(patch)
        .eq("ID_MATRICULA", id)
        .eq("ID_CLIENTE", tenantId);
      if (centerId) query = query.eq("ID_CENTRO", centerId);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as Matricula;
    },
    onSuccess: () => invalidateMatriculaQueries(qc, rol, tenantId, centerId, alumnoId),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertCanMutateAlumnos(rol);
      let query = supabase
        .from("MATRICULAS")
        .delete()
        .eq("ID_MATRICULA", id)
        .eq("ID_CLIENTE", tenantId);
      if (centerId) query = query.eq("ID_CENTRO", centerId);
      const { error } = await query;
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidateMatriculaQueries(qc, rol, tenantId, centerId, alumnoId),
  });

  return { list, create, update, remove };
}
