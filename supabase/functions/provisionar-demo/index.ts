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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ ok: false, error: "Configuración Supabase incompleta." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ ok: false, error: "Sesión no autenticada." }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    try {
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser();

      if (userError || !user) {
        return jsonResponse({ ok: false, error: "Sesión OAuth inválida o expirada." }, 401);
      }

      const body = (await req.json()) as RequestBody;
      const nombre = body.nombre?.trim();
      const telefono = body.telefono?.trim();
      const email = body.email ? normalizeEmail(body.email) : "";
      const oauthEmail = user.email ? normalizeEmail(user.email) : "";

      if (!nombre || !telefono || !email) {
        return jsonResponse({ ok: false, error: "Faltan nombre, teléfono o correo del formulario." }, 400);
      }

      if (!oauthEmail || oauthEmail !== email) {
        return jsonResponse(
          {
            ok: false,
            error: `El correo OAuth (${oauthEmail || "desconocido"}) no coincide con el del formulario (${email}).`,
          },
          400,
        );
      }

      const { data, error } = await adminClient.rpc("provision_demo_signup", {
        p_user_id: user.id,
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
          { ok: false, error: (result?.error as string | undefined) ?? "No se pudo provisionar el demo." },
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
        { ok: false, error: error instanceof Error ? error.message : "Error fatal en provisionar-demo." },
        500,
      );
    }
  },
};
