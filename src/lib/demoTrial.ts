import { supabase } from "@/integrations/supabase/client";

export type DemoTrialResult = {
  expired: boolean;
  has_meeting?: boolean;
  estado_cliente?: string | null;
  skipped?: boolean;
  error?: string;
};

export async function enforceDemoTrial(idCliente: string): Promise<DemoTrialResult> {
  const { data, error } = await supabase.rpc("enforce_demo_trial", {
    p_id_cliente: idCliente,
  });

  if (error) throw error;

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    expired: Boolean(row.expired),
    has_meeting: row.has_meeting === true,
    estado_cliente: typeof row.estado_cliente === "string" ? row.estado_cliente : null,
    skipped: row.skipped === true,
    error: typeof row.error === "string" ? row.error : undefined,
  };
}

export function isDemoTenantId(idCliente: string): boolean {
  return idCliente.startsWith("DEMO-");
}
