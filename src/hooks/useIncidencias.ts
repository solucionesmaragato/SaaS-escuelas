import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import {
  appendIdInFilter,
  centerFilterQueryKey,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey, isProfesorRole } from "@/lib/tenantQuery";

export interface IncidenciaRow {
  ID_INCIDENCIA: string;
  ID_CLIENTE?: string | null;
  ID_MATRICULA?: string | null;
  ID_HORARIO?: string | null;
  ID_ALUMNO?: string | null;
  ID_SESION?: string | null;
  ID_PROFESOR?: string | null;
  ID_ESPECIALIDAD?: string | null;
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
  ID_AULA?: string | null;
  TIPO_INCIDENCIA?: string | null;
  TIPO_FALTA?: string | null;
  NOTAS?: string | null;
  FECHA_EXACTA?: string | null;
  HORA_INICIO?: string | null;
  HORA_FIN?: string | null;
  ESTADO_CONSULTA?: string | null;
  FECHA_CREACION?: string | null;
  ULTIMA_MODIFICACION?: string | null;
}

export type IncidenciaData = IncidenciaRow & {
  ALUMNOS: { NOMBRE_ALUMNO: string } | null;
  PROFESOR: { NOMBRE_PROFESOR: string } | null;
  ESPECIALIDADES: { ESPECIALIDAD: string } | null;
};

export type IncidenciaUpdateInput = Partial<
  Omit<IncidenciaRow, "ID_INCIDENCIA" | "ID_CLIENTE" | "FECHA_CREACION" | "ULTIMA_MODIFICACION">
>;

export function useIncidencias(filterCenterId?: string | null) {
  const { tenantId, rol, perfil } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("incidencias", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<IncidenciaData[]> => {
      let incidencias: IncidenciaRow[];
      let alumnoIds: string[] | null = null;

      if (isProfesorRole(rol)) {
        if (!perfil?.ID_PROFESOR) return [];

        let query = supabase
          .from("INCIDENCIAS")
          .select("*")
          .eq("ID_PROFESOR", perfil.ID_PROFESOR);
        query = scopeTenantQuery(query, rol, tenantId);

        const { data, error } = await query.order("FECHA_EXACTA", { ascending: false });
        if (error) throw error;
        incidencias = (data ?? []) as IncidenciaRow[];
      } else {
        // ADMIN, SECRETARIA, DIRECCION — scope by ALUMNOS.ID_CENTRO via ID_ALUMNO.
        alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);
        if (alumnoIds && alumnoIds.length === 0) return [];

        let query = supabase.from("INCIDENCIAS").select("*");
        query = scopeTenantQuery(query, rol, tenantId);
        const scoped = appendIdInFilter(query, "ID_ALUMNO", alumnoIds);
        if (scoped === "empty") return [];

        const { data, error } = await scoped.order("FECHA_EXACTA", { ascending: false });
        if (error) throw error;
        incidencias = (data ?? []) as IncidenciaRow[];
      }

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
      return incidencias.map((inc): IncidenciaData => {
        const alumno = alumnos?.find((a) => a.ID_ALUMNO === inc.ID_ALUMNO);
        const profesor = profesores?.find((p) => p.ID_PROFESOR === inc.ID_PROFESOR);
        const especialidad = especialidades?.find((e) => e.ID_ESPECIALIDAD === inc.ID_ESPECIALIDAD);

        return {
          ...inc,
          FECHA_CREACION: inc.FECHA_CREACION ?? null,
          ULTIMA_MODIFICACION: inc.ULTIMA_MODIFICACION ?? null,
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
    mutationFn: async ({ id, patch }: { id: string; patch: IncidenciaUpdateInput }) => {
      const { data, error } = await supabase
        .from("INCIDENCIAS")
        .update(patch)
        .eq("ID_INCIDENCIA", id)
        .eq("ID_CLIENTE", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      return data as IncidenciaRow;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<IncidenciaData[]>(queryKey);
      if (previous) {
        qc.setQueryData<IncidenciaData[]>(
          queryKey,
          previous.map((inc) =>
            inc.ID_INCIDENCIA === id ? { ...inc, ...patch } : inc,
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
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
