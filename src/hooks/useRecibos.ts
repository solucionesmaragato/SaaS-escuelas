import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

export function useRecibos(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("recibos", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      // RECIBOS_MENSUALES has no ID_CENTRO — scope by ALUMNOS.ID_CENTRO via ID_ALUMNO.
      const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);
      if (alumnoIds && alumnoIds.length === 0) return [];

      let query = supabase.from("RECIBOS_MENSUALES").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
      if (scoped === "empty") return [];

      const { data: recibos, error } = await scoped.order("FECHA", { ascending: false });
        
      if (error) throw error;

      // Traemos el diccionario de alumnos para el Frontend Join en memoria
      let alumnosQuery = supabase.from("ALUMNOS").select("ID_ALUMNO, NOMBRE_ALUMNO");
      alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);
      if (alumnoIds) {
        alumnosQuery = alumnosQuery.in("ID_ALUMNO", alumnoIds);
      }
      const { data: alumnos } = await alumnosQuery;

      return (recibos || []).map((r: any) => {
        const aluFound = alumnos?.find(a => a.ID_ALUMNO === r.ID_ALUMNO);
        return {
          ...r,
          ALUMNOS: aluFound ? { NOMBRE_ALUMNO: aluFound.NOMBRE_ALUMNO } : null,
        };
      });
    },
  });

  const create = useMutation({
    mutationFn: async (input: any) => {
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase.from("RECIBOS_MENSUALES").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { data, error } = await supabase.from("RECIBOS_MENSUALES").update(patch).eq("ID_RECIBO", id).eq("ID_CLIENTE", tenantId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("RECIBOS_MENSUALES").delete().eq("ID_RECIBO", id).eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
