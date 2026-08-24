import { supabase } from "@/integrations/supabase/client";

export interface ProvisionDemoResult {
  ok: boolean;
  id_cliente?: string;
  id_centro?: string;
  already_exists?: boolean;
  clone?: { ok: boolean; error?: string; counts?: Record<string, number> };
  error?: string;
}

export async function invokeProvisionDemo(body: {
  nombre: string;
  telefono: string;
  email: string;
}): Promise<ProvisionDemoResult> {
  const { data, error } = await supabase.functions.invoke<ProvisionDemoResult>("provisionar-demo", {
    body,
  });

  if (error) throw error;
  if (!data?.ok) {
    throw new Error(data?.error ?? "No se pudo provisionar el entorno demo.");
  }

  return data;
}
