import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { appendCenterFilter } from "@/lib/centroFilter";
import {
  isAdminRole,
  isSecretariaRole,
  scopeTenantQuery,
  workspaceListKey,
  workspaceScopeFields,
} from "@/lib/tenantQuery";
import type { Alumno, HorarioMatricula, Matricula } from "@/types/database";

const ALUMNO_TREE_SELECT = `
  *,
  MATRICULAS (
    *,
    HORARIOS_MATRICULAS (
      *
    )
  )
` as const;

export type HorarioMatriculaTree = HorarioMatricula;
export type MatriculaTree = Matricula & {
  HORARIOS_MATRICULAS: HorarioMatriculaTree[];
};
export type AlumnoTree = Alumno & {
  MATRICULAS: MatriculaTree[];
};

export type AlumnoCreateInput = Omit<Alumno, "ID_ALUMNO" | "ID_CLIENTE"> & {
  ID_ALUMNO?: string;
};
export type AlumnoUpdateInput = Partial<AlumnoCreateInput>;

export type MatriculaCreateInput = Omit<Matricula, "ID_MATRICULA" | "ID_CLIENTE">;
export type MatriculaUpdateInput = Partial<MatriculaCreateInput>;

export type HorarioCreateInput = Omit<HorarioMatricula, "ID_HORARIO" | "ID_CLIENTE">;
export type HorarioUpdateInput = Partial<HorarioCreateInput>;

function assertCanMutateAlumnos(rol: string | null | undefined) {
  if (isAdminRole(rol) || isSecretariaRole(rol)) return;
  throw new Error("No tienes permiso para modificar alumnos.");
}

function normalizeAlumnoTreeRows(rows: AlumnoTree[]): AlumnoTree[] {
  return rows.map((row) => ({
    ...row,
    MATRICULAS: (row.MATRICULAS ?? []).map((mat) => ({
      ...mat,
      HORARIOS_MATRICULAS: mat.HORARIOS_MATRICULAS ?? [],
    })),
  }));
}

export function useAlumnosTree(filterCenterId?: string | null) {
  const { tenantId, centerId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const resolvedCenterId = filterCenterId !== undefined ? filterCenterId : centerId;
  const queryKey = workspaceListKey("alumnosTree", tenantId, resolvedCenterId ?? "all");

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<AlumnoTree[]> => {
      let query = supabase.from("ALUMNOS").select(ALUMNO_TREE_SELECT);
      query = scopeTenantQuery(query, rol, tenantId);
      query = appendCenterFilter(query, resolvedCenterId);
      const { data, error } = await query.order("NOMBRE_ALUMNO", { ascending: true });
      if (error) throw error;
      return normalizeAlumnoTreeRows((data ?? []) as AlumnoTree[]);
    },
  });

  const create = useMutation({
    mutationFn: async (input: AlumnoCreateInput) => {
      assertCanMutateAlumnos(rol);
      const payload = {
        ...input,
        ID_CLIENTE: tenantId,
      };
      const { data, error } = await supabase
        .from("ALUMNOS")
        .insert(payload)
        .select(ALUMNO_TREE_SELECT)
        .single();
      if (error) throw error;
      return normalizeAlumnoTreeRows([data as AlumnoTree])[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: AlumnoUpdateInput }) => {
      assertCanMutateAlumnos(rol);
      const { data, error } = await supabase
        .from("ALUMNOS")
        .update(patch)
        .eq("ID_ALUMNO", id)
        .eq("ID_CLIENTE", tenantId)
        .select(ALUMNO_TREE_SELECT)
        .single();
      if (error) throw error;
      return normalizeAlumnoTreeRows([data as AlumnoTree])[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const createMatricula = useMutation({
    mutationFn: async (input: MatriculaCreateInput) => {
      assertCanMutateAlumnos(rol);

      // Limpiamos el input por si el formulario envía objetos {id, label} en vez de strings
      const sanitizedInput = Object.entries(input).reduce(
        (acc, [key, val]) => {
          if (val && typeof val === "object" && !Array.isArray(val)) {
            acc[key] = (val as any).id || (val as any).value || null;
          } else {
            acc[key] = val;
          }
          return acc;
        },
        {} as Record<string, any>,
      );

      const payload = { ...sanitizedInput, ...workspaceScopeFields(tenantId, centerId) };

      const { data, error } = await supabase
        .from("MATRICULAS")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as Matricula;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const updateMatricula = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MatriculaUpdateInput }) => {
      assertCanMutateAlumnos(rol);

      // Limpiamos el patch de la misma manera
      const sanitizedPatch = Object.entries(patch).reduce(
        (acc, [key, val]) => {
          if (val && typeof val === "object" && !Array.isArray(val)) {
            acc[key] = (val as any).id || (val as any).value || null;
          } else {
            acc[key] = val;
          }
          return acc;
        },
        {} as Record<string, any>,
      );

      const { data, error } = await supabase
        .from("MATRICULAS")
        .update(sanitizedPatch)
        .eq("ID_MATRICULA", id)
        .eq("ID_CLIENTE", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      return data as Matricula;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const createHorario = useMutation({
    mutationFn: async (input: HorarioCreateInput) => {
      assertCanMutateAlumnos(rol);
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase
        .from("HORARIOS_MATRICULAS")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as HorarioMatricula;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const updateHorario = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: HorarioUpdateInput }) => {
      assertCanMutateAlumnos(rol);
      const { data, error } = await supabase
        .from("HORARIOS_MATRICULAS")
        .update(patch)
        .eq("ID_HORARIO", id)
        .eq("ID_CLIENTE", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      return data as HorarioMatricula;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const removeHorario = useMutation({
    mutationFn: async (id: string) => {
      assertCanMutateAlumnos(rol);
      const { error } = await supabase
        .from("HORARIOS_MATRICULAS")
        .delete()
        .eq("ID_HORARIO", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    list,
    create,
    update,
    createMatricula,
    updateMatricula,
    createHorario,
    updateHorario,
    removeHorario,
  };
}
