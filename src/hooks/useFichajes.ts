import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { CORRECCION_APROBADA, CORRECCION_PENDIENTE } from "@/lib/fichajeEidas";
import {
  appendCenterFilter,
  centerFilterQueryKey,
} from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

export type ProfesorLookup = {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  FECHA_BAJA?: string | null;
};

export type FichajeData = {
  ID_FICHAJE: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  TIPO_MOVIMIENTO: string;
  MODALIDAD: string | null;
  FECHA_HORA: string;
  FECHA_HORA_REAL: string;
  ESTADO_LEGAL: string | null;
  IP_FICHAJE: string | null;
  USER_AGENT: string | null;
  LATITUD_LONGITUD: string | null;
  UBICACION: string | null;
  METODO: string | null;
  NOTAS: string | null;
  TOTAL_HORAS_INTERVALO: number | null;
  TOTAL_HORAS_ACUMULADAS_DIA: number | null;
  ID_FICHAJE_CORREGIDO: string | null;
  MODIFICADO_POR: string | null;
  FECHA_HORA_MODIFICACION: string | null;
  MOTIVO_MODIFICACION: string | null;
  FECHA_HORA_MANUAL: string | null;
  PROFESOR: { NOMBRE_PROFESOR: string } | null;
};

export type FichajeConciliacionAdminRow = {
  ID_FICHAJE: string;
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string | null;
  TIPO_MOVIMIENTO: string;
  FECHA_HORA_REAL: string;
  HORA_REAL: string;
  HORA_TEORICA_IDEAL: string;
  DIFERENCIA_MINUTOS: number;
  ESTADO_TOLERANCIA: string;
  ESTADO_LEGAL: string;
};

export type FichajesQueryData = {
  fichajes: FichajeData[];
  profesores: ProfesorLookup[];
};

export type ProfesorFichajeRow = {
  ID_FICHAJE: string;
  ID_CLIENTE: string;
  ID_PROFESOR: string;
  TIPO_MOVIMIENTO: string;
  MODALIDAD: string | null;
  FECHA_HORA_REAL: string;
  ESTADO_LEGAL: string | null;
  METODO: string | null;
  NOTAS: string | null;
  TOTAL_HORAS_INTERVALO: number | null;
  TOTAL_HORAS_ACUMULADAS_DIA: number | null;
};

export type ProfesorFichajeCreateInput = FichajeSealedCreateInput & {
  ID_CLIENTE?: string;
  NOTAS?: string | null;
  ID_CENTRO?: string | null;
};

/** Sealed insert — backend trigger sets FECHA_HORA and hash. */
export type FichajeSealedCreateInput = {
  ID_PROFESOR: string;
  TIPO_MOVIMIENTO: string;
  IP_FICHAJE: string;
  USER_AGENT: string;
  LATITUD_LONGITUD: string;
  ID_CENTRO?: string | null;
  METODO?: string | null;
  MODALIDAD?: string | null;
  ID_FICHAJE_CORREGIDO?: string | null;
  FECHA_HORA_MANUAL?: string | null;
  MOTIVO_MODIFICACION?: string | null;
};

export type FichajeCreateInput = Omit<
  FichajeSealedCreateInput,
  "IP_FICHAJE" | "USER_AGENT" | "LATITUD_LONGITUD"
> & {
  IP_FICHAJE?: string | null;
  USER_AGENT?: string | null;
  LATITUD_LONGITUD?: string | null;
  FECHA_HORA?: string;
  UBICACION?: string | null;
  NOTAS?: string | null;
  TOTAL_HORAS_INTERVALO?: number | null;
  TOTAL_HORAS_ACUMULADAS_DIA?: number | null;
};

function buildFichajeInsertPayload(
  tenantId: string,
  input: FichajeSealedCreateInput,
): Record<string, unknown> {
  return {
    ID_CLIENTE: tenantId,
    ID_PROFESOR: input.ID_PROFESOR,
    ID_CENTRO: input.ID_CENTRO ?? null,
    TIPO_MOVIMIENTO: input.TIPO_MOVIMIENTO,
    IP_FICHAJE: input.IP_FICHAJE,
    USER_AGENT: input.USER_AGENT,
    LATITUD_LONGITUD: input.LATITUD_LONGITUD,
    METODO: input.METODO ?? null,
    MODALIDAD: input.MODALIDAD ?? null,
    ID_FICHAJE_CORREGIDO: input.ID_FICHAJE_CORREGIDO ?? null,
    FECHA_HORA_MANUAL: input.FECHA_HORA_MANUAL ?? null,
    MOTIVO_MODIFICACION: input.MOTIVO_MODIFICACION ?? null,
  };
}

export type FichajeUpdateInput = Partial<FichajeCreateInput> & {
  ID_FICHAJE_CORREGIDO?: string | null;
  MODIFICADO_POR?: string | null;
  FECHA_HORA_MODIFICACION?: string | null;
  MOTIVO_MODIFICACION?: string | null;
};

type FichajeRow = Omit<FichajeData, "PROFESOR">;

type FichajeLegalViewRow = Omit<FichajeRow, "FECHA_HORA" | "ESTADO_LEGAL"> & {
  FECHA_HORA_REAL: string;
  ESTADO_LEGAL: string | null;
  NOMBRE_PROFESOR: string | null;
};

export function useFichajesConciliacionAdmin(fecha: string) {
  const { tenantId, rol } = useActiveTenant();

  return useQuery({
    queryKey: [...tenantListKey("fichajes-conciliacion-admin", rol, tenantId), fecha] as const,
    enabled: Boolean(tenantId && fecha),
    queryFn: async (): Promise<FichajeConciliacionAdminRow[]> => {
      const { data, error } = await supabase.rpc("obtener_conciliacion_admin", {
        p_id_cliente: tenantId,
        p_fecha: fecha,
      });
      if (error) throw error;
      return (data ?? []) as FichajeConciliacionAdminRow[];
    },
  });
}

export function useFichajes(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("fichajes", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<FichajesQueryData> => {
      let query = supabase.from("V_HISTORIAL_FICHAJES_LEGAL").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      query = appendCenterFilter(query, filterCenterId);

      const { data: fichajes, error } = await query.order("FECHA_HORA_REAL", {
        ascending: false,
      });

      if (error) throw error;

      let profesoresQuery = supabase
        .from("PROFESOR")
        .select("ID_PROFESOR, NOMBRE_PROFESOR, FECHA_BAJA")
        .order("NOMBRE_PROFESOR", { ascending: true });
      profesoresQuery = scopeTenantQuery(profesoresQuery, rol, tenantId);
      const { data: profesores, error: profError } = await profesoresQuery;
      if (profError) throw profError;

      const fichajesMapped: FichajeData[] = ((fichajes ?? []) as FichajeLegalViewRow[]).map(
        (f) => {
          const { FECHA_HORA_REAL, NOMBRE_PROFESOR, ESTADO_LEGAL, ...rest } = f;
          return {
            ...rest,
            FECHA_HORA: FECHA_HORA_REAL,
            FECHA_HORA_REAL,
            ESTADO_LEGAL,
            PROFESOR: NOMBRE_PROFESOR ? { NOMBRE_PROFESOR } : null,
          };
        },
      );

      return {
        fichajes: fichajesMapped,
        profesores: (profesores ?? []) as ProfesorLookup[],
      };
    },
  });

  const create = useMutation({
    mutationFn: async (input: FichajeCreateInput) => {
      const payload: Record<string, unknown> = {
        ID_CLIENTE: tenantId,
        ID_PROFESOR: input.ID_PROFESOR,
        ID_CENTRO: input.ID_CENTRO ?? null,
        TIPO_MOVIMIENTO: input.TIPO_MOVIMIENTO,
        IP_FICHAJE: input.IP_FICHAJE ?? null,
        USER_AGENT: input.USER_AGENT ?? null,
        LATITUD_LONGITUD: input.LATITUD_LONGITUD ?? null,
        METODO: input.METODO ?? null,
        MODALIDAD: input.MODALIDAD ?? null,
        UBICACION: input.UBICACION ?? null,
        NOTAS: input.NOTAS ?? null,
        TOTAL_HORAS_INTERVALO: input.TOTAL_HORAS_INTERVALO ?? null,
        TOTAL_HORAS_ACUMULADAS_DIA: input.TOTAL_HORAS_ACUMULADAS_DIA ?? null,
        ID_FICHAJE_CORREGIDO: input.ID_FICHAJE_CORREGIDO ?? null,
        FECHA_HORA_MANUAL: input.FECHA_HORA_MANUAL ?? null,
        MOTIVO_MODIFICACION: input.MOTIVO_MODIFICACION ?? null,
      };
      if (input.FECHA_HORA) payload.FECHA_HORA = input.FECHA_HORA;
      const { data, error } = await supabase
        .from("FICHAJES")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const createSealed = useMutation({
    mutationFn: async (input: FichajeSealedCreateInput) => {
      const { data, error } = await supabase
        .from("FICHAJES")
        .insert(buildFichajeInsertPayload(tenantId, input))
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const requestCorrection = useMutation({
    mutationFn: async (input: {
      idProfesor: string;
      idFichajeCorregido: string;
      fechaHoraManual: string;
      motivo: string;
      compliance: {
        IP_FICHAJE: string;
        USER_AGENT: string;
        LATITUD_LONGITUD: string;
      };
    }) => {
      const { data, error } = await supabase
        .from("FICHAJES")
        .insert({
          ID_CLIENTE: tenantId,
          ID_PROFESOR: input.idProfesor,
          TIPO_MOVIMIENTO: CORRECCION_PENDIENTE,
          ID_FICHAJE_CORREGIDO: input.idFichajeCorregido,
          FECHA_HORA_MANUAL: input.fechaHoraManual,
          MOTIVO_MODIFICACION: input.motivo,
          IP_FICHAJE: input.compliance.IP_FICHAJE,
          USER_AGENT: input.compliance.USER_AGENT,
          LATITUD_LONGITUD: input.compliance.LATITUD_LONGITUD,
          METODO: "Corrección",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const approveCorrection = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("FICHAJES")
        .update({ TIPO_MOVIMIENTO: CORRECCION_APROBADA })
        .eq("ID_FICHAJE", id)
        .eq("ID_CLIENTE", tenantId)
        .eq("TIPO_MOVIMIENTO", CORRECCION_PENDIENTE)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: FichajeUpdateInput }) => {
      const { data, error } = await supabase
        .from("FICHAJES")
        .update(patch)
        .eq("ID_FICHAJE", id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("FICHAJES")
        .delete()
        .eq("ID_FICHAJE", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    list,
    create,
    createSealed,
    requestCorrection,
    approveCorrection,
    update,
    remove,
  };
}

export function useProfesorFichajes() {
  const { tenantId, rol, perfil } = useActiveTenant();
  const qc = useQueryClient();
  const profesorId = perfil.ID_PROFESOR;
  const queryKey = [
    ...tenantListKey("fichajes-profesor", rol, tenantId),
    profesorId ?? "none",
  ] as const;

  const list = useQuery({
    queryKey,
    enabled: Boolean(tenantId && profesorId),
    queryFn: async (): Promise<ProfesorFichajeRow[]> => {
      let query = supabase.from("VISTA_FICHAJES_PROFESOR").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query
        .eq("ID_PROFESOR", profesorId!)
        .order("FECHA_HORA_REAL", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProfesorFichajeRow[];
    },
  });

  const insert = useMutation({
    mutationFn: async (input: ProfesorFichajeCreateInput) => {
      const payload = {
        ...buildFichajeInsertPayload(tenantId, input),
        NOTAS: input.NOTAS ?? null,
      };
      const { data, error } = await supabase
        .from("FICHAJES")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, insert };
}
