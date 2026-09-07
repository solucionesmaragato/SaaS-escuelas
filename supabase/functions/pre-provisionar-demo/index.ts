import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface RequestBody {
  nombre?: string;
  telefono?: string;
  email?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateDemoRegistroForm(form: {
  nombre: string;
  telefono: string;
  email: string;
}): string | null {
  if (form.nombre.trim().length < 2) return "Introduce tu nombre y apellidos.";
  const digits = form.telefono.replace(/\D/g, "");
  if (digits.length < 9) return "Introduce un teléfono válido (mínimo 9 dígitos).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    return "Introduce un correo electrónico válido.";
  }
  return null;
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Método no permitido." }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Configuración Supabase incompleta." }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    try {
      const body = (await req.json()) as RequestBody;
      const nombre = body.nombre?.trim() ?? "";
      const telefono = body.telefono?.trim() ?? "";
      const email = body.email ? normalizeEmail(body.email) : "";

      const validationError = validateDemoRegistroForm({ nombre, telefono, email });
      if (validationError) {
        return jsonResponse({ ok: false, error: validationError }, 400);
      }

      const { data, error } = await adminClient.rpc("provision_demo_preauth", {
        p_nombre: nombre,
        p_telefono: telefono,
        p_email: email,
      });

      if (error) {
        return jsonResponse({ ok: false, error: error.message }, 400);
      }

      const result = data as Record<string, unknown> | null;
      if (!result?.ok) {
        return jsonResponse(
          {
            ok: false,
            error: (result?.error as string | undefined) ?? "No se pudo pre-provisionar el demo.",
          },
          400,
        );
      }

      return jsonResponse({
        ok: true,
        id_cliente: result.id_cliente,
        id_centro: result.id_centro,
        already_exists: result.already_exists ?? false,
        clone: result.clone ?? null,
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Error fatal en pre-provisionar-demo.",
        },
        500,
      );
    }
  },
};
