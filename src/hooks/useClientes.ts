import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/context/AppContext";
import { isMasterRole, scopeTenantQuery, tenantListKey } from "@/lib/tenantQuery";
import type { ISODate, UUID } from "@/types/database";

export interface ClienteData {
  ID_CLIENTE: UUID;
  NOMBRE_ESCUELA: string;
  REF_FACTURA: string | null;
  TLF_REAL: string | null;
  VAPI_ASSISTANT_ID: string | null;
  VAPI_PHONE_NUMBER: string | null;
  URL_WEB: string | null;
  EMAIL_CLIENTE: string | null;
  APP_LOGO: string | null;
  CIF: string | null;
  DIRECCION: string | null;
  ESTADO_CLIENTE: string | null;
  PLAN: string | null;
  METODO_PAGO_PROPIO: string | null;
  PAGO: string | null;
  TARIFA: number | null;
  FECHA_PROXIMO_PLAN: ISODate | null;
  NOMINAS: string | null;
  SECRETARIA: string | null;
  MONTAJE: string | null;
  MONTAJE_PENDIENTE: string | null;
  DESCUENTO: number | null;
  TIPO_COBRO: string | null;
  ESTADO_MANDATO: string | null;
  IBAN: string | null;
  STRIPE_ID: string | null;
  STRIPE_API_KEY: string | null;
  DOCUMENTO_SEPA: string | null;
  HOLDED_CONTACT_ID: string | null;
  HOLDED_API_KEY: string | null;
}

function assertMaster(rol: string | null | undefined) {
  if (!isMasterRole(rol)) {
    throw new Error("Acceso denegado. Exclusivo para Master.");
  }
}

export function useClientes() {
  const { tenantId, rol } = useActiveTenant();
  const qc = useQueryClient();
  const queryKey = tenantListKey("clientes", rol, tenantId);

  const list = useQuery({
    queryKey,
    queryFn: async (): Promise<ClienteData[]> => {
      let query = supabase.from("CLIENTES").select("*");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query.order("ID_CLIENTE", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClienteData[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: ClienteData) => {
      assertMaster(rol);
      const { data, error } = await supabase.from("CLIENTES").insert(input).select().single();
      if (error) throw error;
      return data as ClienteData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ClienteData> }) => {
      assertMaster(rol);
      const { data, error } = await supabase
        .from("CLIENTES")
        .update(patch)
        .eq("ID_CLIENTE", id)
        .select()
        .single();
      if (error) throw error;
      return data as ClienteData;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      assertMaster(rol);
      const { error } = await supabase.from("CLIENTES").delete().eq("ID_CLIENTE", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { list, create, update, remove };
}
