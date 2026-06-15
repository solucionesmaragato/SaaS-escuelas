import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

export function useIncidencias(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("incidencias", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      // INCIDENCIAS has no ID_CENTRO — scope by ALUMNOS.ID_CENTRO via ID_ALUMNO.
      const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);
      if (alumnoIds && alumnoIds.length === 0) return [];

      let query = supabase.from("INCIDENCIAS").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
      if (scoped === "empty") return [];

      const { data: incidencias, error } = await scoped.order("FECHA_EXACTA", {
        ascending: false,
      });

      if (error) throw error;

      // 2. Descargamos los diccionarios que ya tenemos creados para cruzar los nombres
      let alumnosQuery = supabase.from("ALUMNOS").select("*");
      alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);
      if (alumnoIds) {
        alumnosQuery = alumnosQuery.in("ID_ALUMNO", alumnoIds);
      }
      const { data: alumnos } = await alumnosQuery;

      let profesoresQuery = supabase.from("PROFESOR").select("*");
      profesoresQuery = scopeTenantQuery(profesoresQuery, rol, tenantId);
      const { data: profesores } = await profesoresQuery;

      let especialidadesQuery = supabase.from("ESPECIALIDADES").select("*");
      especialidadesQuery = scopeTenantQuery(especialidadesQuery, rol, tenantId);
      const { data: especialidades } = await especialidadesQuery;

      // 3. Cruzamos los datos en memoria (Frontend Join)
      return (incidencias || []).map((inc: any) => {
        const alumno = alumnos?.find(a => a.ID_ALUMNO === inc.ID_ALUMNO);
        const profesor = profesores?.find(p => p.ID_PROFESOR === inc.ID_PROFESOR);
        const especialidad = especialidades?.find(e => e.ID_ESPECIALIDAD === inc.ID_ESPECIALIDAD);

        return {
          ...inc,
          ALUMNOS: alumno ? { NOMBRE_ALUMNO: alumno.NOMBRE_ALUMNO } : null,
          PROFESOR: profesor ? { NOMBRE_PROFESOR: profesor.NOMBRE_PROFESOR } : null,
          ESPECIALIDADES: especialidad ? { ESPECIALIDAD: especialidad.ESPECIALIDAD } : null,
        };
      });
    },
  });

  const create = useMutation({
    mutationFn: async (input: any) => {
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase.from("INCIDENCIAS").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { data, error } = await supabase.from("INCIDENCIAS").update(patch).eq("ID_INCIDENCIA", id).eq("ID_CLIENTE", tenantId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("INCIDENCIAS").delete().eq("ID_INCIDENCIA", id).eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
