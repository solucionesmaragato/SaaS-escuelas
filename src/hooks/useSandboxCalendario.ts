import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import type { SandboxCalendario } from "@/types/database";

export type SandboxCalendarioInsert = {
  NOMBRE_GRUPO: string;
  DIA: number;
  HORA_INICIO: string;
  HORA_FIN: string;
};

export type SandboxCalendarioUpdate = {
  DIA: number;
  HORA_INICIO: string;
  HORA_FIN: string;
};

export function useSandboxCalendario() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("sandboxCalendario", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<SandboxCalendario[]> => {
      let query = supabase.from("SANDBOX_CALENDARIO").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query
        .not("DIA", "is", null)
        .order("DIA", { ascending: true })
        .order("HORA_INICIO", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SandboxCalendario[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: SandboxCalendarioInsert) => {
      const payload = { ...input, ID_CLIENTE: tenantId };
      const { data, error } = await supabase
        .from("SANDBOX_CALENDARIO")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return data as SandboxCalendario;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: SandboxCalendarioUpdate;
    }) => {
      const { data, error } = await supabase
        .from("SANDBOX_CALENDARIO")
        .update(patch)
        .eq("ID_SANDBOX_CALENDARIO", id)
        .eq("ID_CLIENTE", tenantId)
        .select("*")
        .single();
      if (error) throw error;
      return data as SandboxCalendario;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("SANDBOX_CALENDARIO")
        .delete()
        .eq("ID_SANDBOX_CALENDARIO", id)
        .eq("ID_CLIENTE", tenantId);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
