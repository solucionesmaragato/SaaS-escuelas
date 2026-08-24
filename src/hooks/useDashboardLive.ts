import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { tenantListKey, workspaceListKey } from "@/lib/tenantQuery";

export type DashboardLiveEntity = {
  id: string;
  nombre: string;
};

export type DashboardLivePresenteEntity = DashboardLiveEntity & {
  tipo: "alumno" | "lead";
};

export type DashboardLiveAulaOcupadaEntity = DashboardLiveEntity & {
  id_sesion: string;
};

export type DashboardLiveData = {
  alumnos: {
    presentes_count: number;
    totales_count: number;
    lista_presentes: DashboardLivePresenteEntity[];
  };
  profesores: {
    en_clase_count: number;
    ocupados_sin_fichar_count: number;
    libres_count: number;
    alerta_grave_count: number;
    lista_en_clase: DashboardLiveEntity[];
    lista_ocupados_sin_fichar: DashboardLiveEntity[];
    lista_libres: DashboardLiveEntity[];
    lista_alerta_grave: DashboardLiveEntity[];
    /** @deprecated Usar en_clase_count + ocupados_sin_fichar_count */
    ocupados_count: number;
    /** @deprecated Usar lista_en_clase + lista_ocupados_sin_fichar */
    lista_ocupados: DashboardLiveEntity[];
  };
  aulas: {
    ocupadas_count: number;
    lista_libres: DashboardLiveEntity[];
    lista_ocupadas: DashboardLiveAulaOcupadaEntity[];
  };
};

export function useDashboardLive(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const scopedCenterId = filterCenterId?.trim() || null;
  const queryClient = useQueryClient();
  const queryKey = workspaceListKey("dashboard-live", tenantId, scopedCenterId);
  const avisosQueryKey = tenantListKey("avisos-internos", rol, tenantId);

  useEffect(() => {
    if (!tenantId) return;

    const invalidateLiveData = () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: avisosQueryKey });
    };

    let channelErrorLogged = false;

    const channel = supabase
      .channel(`dashboard-live-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "FICHAJES",
          filter: `ID_CLIENTE=eq.${tenantId}`,
        },
        invalidateLiveData,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "SESIONES",
          filter: `ID_CLIENTE=eq.${tenantId}`,
        },
        invalidateLiveData,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "AVISOS_INTERNOS",
          filter: `ID_CLIENTE=eq.${tenantId}`,
        },
        invalidateLiveData,
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" && !channelErrorLogged) {
          channelErrorLogged = true;
          console.warn(
            "[dashboard-live] Realtime channel error; using 60s refetch fallback.",
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, scopedCenterId, queryClient, queryKey, avisosQueryKey]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_live", {
        p_id_cliente: tenantId,
        p_id_centro: scopedCenterId,
      });
      if (error) throw error;
      return data as DashboardLiveData;
    },
    // Fallback si realtime no entrega el evento (p. ej. antes de publicar tablas).
    refetchInterval: 60_000,
  });
}
