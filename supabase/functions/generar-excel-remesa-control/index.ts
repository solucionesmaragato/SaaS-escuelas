import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { regenerarExcelControlRemesa } from "../_shared/remesaExcelControl.ts";

interface RequestBody {
  id_cliente?: string;
  id_centro?: string;
  id_curso?: string;
  mes_periodo?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const body = (await req.json()) as RequestBody;
      const idCliente = body.id_cliente?.trim();
      const idCentro = body.id_centro?.trim();
      const idCurso = body.id_curso?.trim();
      const mesPeriodo = body.mes_periodo?.trim();

      if (!idCliente || !idCentro || !idCurso || !mesPeriodo) {
        return new Response(JSON.stringify({ error: "Faltan id_cliente, id_centro, id_curso o mes_periodo." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const link = await regenerarExcelControlRemesa(ctx.supabase, {
        idCliente,
        idCentro,
        idCurso,
        mesPeriodo,
      });

      if (!link) {
        return new Response(
          JSON.stringify({ error: "No se encontro CONTROL_REMESAS para ese cliente, centro, curso y periodo." }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      return new Response(JSON.stringify({ link }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Error fatal" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
  }),
};
