import { supabase } from "@/integrations/supabase/client";

export interface ProvisionDemoResult {
  ok: boolean;
  id_cliente?: string;
  id_centro?: string;
  already_exists?: boolean;
  clone?: { ok: boolean; error?: string; counts?: Record<string, number> };
  error?: string;
}

export interface PreProvisionDemoResult {
  ok: boolean;
  id_cliente?: string;
  already_exists?: boolean;
  error?: string;
}

async function readFunctionsInvokeError(error: unknown): Promise<string | null> {
  const context = (error as { context?: Response | { json?: () => Promise<unknown> } })?.context;
  if (!context) return null;
  try {
    if (typeof (context as Response).clone === "function") {
      const body = (await (context as Response).clone().json()) as { error?: string } | null;
      return body?.error?.trim() || null;
    }
    if (typeof context.json === "function") {
      const body = (await context.json()) as { error?: string } | null;
      return body?.error?.trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

export async function invokeProvisionDemo(body: {
  nombre: string;
  telefono: string;
  email: string;
}): Promise<ProvisionDemoResult> {
  const { data, error } = await supabase.functions.invoke<ProvisionDemoResult>("provisionar-demo", {
    body,
  });

  if (error) {
    const fromBody = await readFunctionsInvokeError(error);
    throw new Error(
      fromBody ||
        (error instanceof Error ? error.message : "No se pudo provisionar el entorno demo."),
    );
  }
  if (!data?.ok) {
    throw new Error(data?.error ?? "No se pudo provisionar el entorno demo.");
  }

  return data;
}

export async function invokePreProvisionDemo(body: {
  nombre: string;
  telefono: string;
  email: string;
}): Promise<PreProvisionDemoResult> {
  const { data, error } = await supabase.functions.invoke<PreProvisionDemoResult>(
    "pre-provisionar-demo",
    { body },
  );

  if (error) {
    const fromBody = await readFunctionsInvokeError(error);
    throw new Error(
      fromBody || (error instanceof Error ? error.message : "No se pudo preparar el entorno demo."),
    );
  }
  if (!data?.ok) {
    throw new Error(data?.error ?? "No se pudo preparar el entorno demo.");
  }

  return data;
}
