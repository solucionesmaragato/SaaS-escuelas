import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeDirectCentroTableQuery, resolveProfileListCenterId } from "@/lib/centroFilter";
import { workspaceListKey } from "@/lib/tenantQuery";
import type { Alumno } from "@/types/database";

export function useAlumnos() {
  const { tenantId, centerId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const effectiveCenterId = resolveProfileListCenterId(rol, centerId);
  const queryKey = workspaceListKey("alumnos", tenantId, effectiveCenterId ?? "all");

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<Alumno[]> => {
      let query = supabase.from("ALUMNOS").select("*");
      query = scopeDirectCentroTableQuery(query, rol, tenantId, centerId);
      const { data, error } = await query.order("NOMBRE_ALUMNO", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Alumno[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: Omit<Alumno, "ID_ALUMNO" | "ID_CLIENTE">) => {
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase.from("ALUMNOS").insert(payload).select().single();
      if (error) throw error;
      return data as Alumno;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Alumno> }) => {
      const { data, error } = await supabase
        .from("ALUMNOS")
        .update(patch)
        .eq("ID_ALUMNO", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data as Alumno;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ALUMNOS")
        .delete()
        .eq("ID_ALUMNO", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
