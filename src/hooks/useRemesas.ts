import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { centerFilterQueryKey } from "@/lib/centroFilter";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

export function useRemesas(filterCenterId?: string | null) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = [
    ...tenantListKey("remesas", rol, tenantId),
    centerFilterQueryKey(filterCenterId),
  ] as const;

  const list = useQuery({
    queryKey,
    queryFn: async () => {
      // CONTROL_REMESAS is tenant-wide (no ID_CENTRO) — center filter not applied.
      void filterCenterId;
      // Leemos tu tabla CONTROL_REMESAS mapeada rigurosamente
      let query = supabase.from("CONTROL_REMESAS").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query.order("MES_PERIODO", { ascending: false });
        
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (input: any) => {
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase.from("CONTROL_REMESAS").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { data, error } = await supabase.from("CONTROL_REMESAS").update(patch).eq("ID_REMESA", id).eq("ID_CLIENTE", tenantId).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("CONTROL_REMESAS").delete().eq("ID_REMESA", id).eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
