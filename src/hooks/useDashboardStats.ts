import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, scopeWorkspaceQuery, workspaceListKey } from "@/lib/tenantQuery";

export function useDashboardStats() {
  const { tenantId, centerId, rol } = useActiveTenant();

  return useQuery({
    queryKey: workspaceListKey("dashboard-stats", tenantId, centerId),
    queryFn: async () => {
      const countWorkspace = async (
        table: string,
        extra?: { col: string; val: string },
      ) => {
        let q = supabase.from(table).select("*", { count: "exact", head: true });
        q = scopeWorkspaceQuery(q, tenantId, centerId);
        if (extra) q = q.eq(extra.col, extra.val);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };

      const countTenant = async (table: string) => {
        let q = supabase.from(table).select("*", { count: "exact", head: true });
        q = scopeTenantQuery(q, rol, tenantId);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };

      const [alumnos, profesores, matriculas, leads] = await Promise.all([
        countWorkspace("ALUMNOS"),
        countTenant("PROFESOR"),
        countWorkspace("MATRICULAS", { col: "ESTADO", val: "Activo" }).catch(() =>
          countWorkspace("MATRICULAS"),
        ),
        countTenant("LEADS"),
      ]);

      return { alumnos, profesores, matriculas, leads };
    },
  });
}
