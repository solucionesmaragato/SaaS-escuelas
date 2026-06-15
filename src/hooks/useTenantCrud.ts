import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";

export function useTenantCrud<TRow>(
  table: string,
  pk: keyof TRow & string,
  orderBy?: keyof TRow & string,
  ascending = true,
) {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const key = tenantListKey(table, rol, tenantId);

  const list = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TRow[]> => {
      let q = supabase.from(table).select("*");
      q = scopeTenantQuery(q, rol, tenantId);
      if (orderBy) q = q.order(orderBy as string, { ascending });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TRow[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: Partial<TRow>) => {
      const payload = { ...input, ID_CLIENTE: tenantId } as Record<string, unknown>;
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data as TRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TRow> }) => {
      const { data, error } = await supabase
        .from(table)
        .update(patch as Record<string, unknown>)
        .eq(pk as string, id)
        .eq("ID_CLIENTE", tenantId)
        .select()
        .single();
      if (error) throw error;
      return data as TRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq(pk as string, id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { list, create, update, remove, tenantId };
}
