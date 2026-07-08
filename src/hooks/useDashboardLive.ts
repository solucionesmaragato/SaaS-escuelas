import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { workspaceListKey } from "@/lib/tenantQuery";

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
    ocupados_count: number;
    lista_libres: DashboardLiveEntity[];
    lista_ocupados: DashboardLiveEntity[];
  };
  aulas: {
    ocupadas_count: number;
    lista_libres: DashboardLiveEntity[];
    lista_ocupadas: DashboardLiveAulaOcupadaEntity[];
  };
};

export function useDashboardLive() {
  const { tenantId, centerId } = useActiveTenant();

  return useQuery({
    queryKey: workspaceListKey("dashboard-live", tenantId, centerId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_live", {
        p_id_cliente: tenantId,
      });
      if (error) throw error;
      return data as DashboardLiveData;
    },
  });
}
