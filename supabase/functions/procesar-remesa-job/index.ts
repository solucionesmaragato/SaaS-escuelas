// NO pegar este archivo en SQL Editor.
// Desplegar: Dashboard → Edge Functions → New → procesar-remesa-job
// o CLI: supabase functions deploy procesar-remesa-job

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { regenerarExcelControlRemesa } from "../_shared/remesaExcelControl.ts";

interface RequestBody {
  id_job?: string;
  access_token?: string;
}

interface RemesaJobClaimResult {
  claimed?: boolean;
  job?: RemesaJobRow;
}

interface RemesaJobRow {
  ID_JOB: string;
  ID_REMESA: string;
  ID_CLIENTE: string;
  ID_CENTRO: string;
  ID_CURSO: string;
  MES_PERIODO: string;
  ESTADO: string;
  PDF_TOTAL: number;
  PDF_OK: number;
  PDF_FAIL: number;
  INICIADO_AT?: string | null;
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

function isReciboBorrador(estadoPago: string | null | undefined): boolean {
  return (estadoPago ?? "").trim().toLowerCase() === "borrador";
}

async function invokeGenerarPdfBorrador(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  idRecibo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(`${supabaseUrl}/functions/v1/generar-pdf-borrador-recibo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id_recibo: idRecibo }),
  });

  let payload: { link?: string; error?: string } | null = null;
  try {
    payload = (await response.json()) as { link?: string; error?: string };
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.trim() || `HTTP ${response.status} al generar PDF borrador.`,
    };
  }

  if (payload?.error?.trim()) {
    return { ok: false, error: payload.error.trim() };
  }

  if (!payload?.link?.trim()) {
    return { ok: false, error: "La función no devolvió enlace del PDF borrador." };
  }

  return { ok: true };
}

async function processRemesaJob(
  admin: SupabaseClient,
  userClient: SupabaseClient,
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  idJob: string,
): Promise<void> {
  const { data: jobRaw, error: claimErr } = await admin.rpc("fn_remesa_job_reclamar", {
    p_id_job: idJob,
  });
  if (claimErr) {
    throw new Error(claimErr.message);
  }

  const claimRaw = jobRaw as RemesaJobClaimResult | RemesaJobRow | null;
  const hasClaimEnvelope = claimRaw && typeof claimRaw === "object" && "claimed" in claimRaw;
  const claimed = hasClaimEnvelope ? (claimRaw as RemesaJobClaimResult).claimed === true : true;
  const job = (
    hasClaimEnvelope && (claimRaw as RemesaJobClaimResult).job
      ? (claimRaw as RemesaJobClaimResult).job
      : claimRaw
  ) as RemesaJobRow | null;

  if (!job?.ID_JOB) {
    throw new Error("Job no encontrado.");
  }

  if (!claimed) {
    return;
  }

  if (job.ESTADO === "completado" || job.ESTADO === "error") {
    return;
  }

  const { data: recibos, error: recibosErr } = await admin
    .from("RECIBOS_MENSUALES")
    .select("ID_RECIBO, ESTADO_PAGO")
    .eq("ID_CLIENTE", job.ID_CLIENTE)
    .eq("ID_CENTRO", job.ID_CENTRO)
    .eq("ID_CURSO", job.ID_CURSO)
    .eq("MES_PERIODO", job.MES_PERIODO);

  if (recibosErr) {
    await admin.rpc("fn_remesa_job_finalizar", {
      p_id_job: idJob,
      p_excel_ok: false,
      p_error_mensaje: recibosErr.message,
    });
    return;
  }

  const borradores = (recibos ?? []).filter((row) => isReciboBorrador(row.ESTADO_PAGO));

  for (const recibo of borradores) {
    const idRecibo = recibo.ID_RECIBO?.trim();
    if (!idRecibo) continue;

    const pdfResult = await invokeGenerarPdfBorrador(supabaseUrl, apiKey, accessToken, idRecibo);
    const { error: regErr } = await admin.rpc("fn_remesa_job_registrar_pdf", {
      p_id_job: idJob,
      p_id_recibo: idRecibo,
      p_ok: pdfResult.ok,
      p_error: pdfResult.ok ? null : pdfResult.error,
    });
    if (regErr) {
      console.error("[procesar-remesa-job] registrar_pdf:", regErr.message);
    }
  }

  let excelOk = false;
  let excelError: string | null = null;
  try {
    const link = await regenerarExcelControlRemesa(userClient, {
      idCliente: job.ID_CLIENTE,
      idCentro: job.ID_CENTRO,
      idCurso: job.ID_CURSO,
      mesPeriodo: job.MES_PERIODO,
    });
    excelOk = Boolean(link);
    if (!link) {
      excelError = "No se encontró CONTROL_REMESAS para generar el Excel de control.";
    }
  } catch (err) {
    excelError = err instanceof Error ? err.message : "Error al generar el Excel de control.";
  }

  const { error: finErr } = await admin.rpc("fn_remesa_job_finalizar", {
    p_id_job: idJob,
    p_excel_ok: excelOk,
    p_error_mensaje: excelError,
  });
  if (finErr) {
    console.error("[procesar-remesa-job] finalizar:", finErr.message);
  }
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

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Configuración Supabase incompleta." }, 500);
    }

    const apiKey = anonKey?.trim() || serviceRoleKey;

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return jsonResponse({ ok: false, error: "Cuerpo JSON inválido." }, 400);
    }

    const idJob = body.id_job?.trim();
    const accessToken = body.access_token?.trim();
    if (!idJob || !accessToken) {
      return jsonResponse({ ok: false, error: "Faltan id_job o access_token." }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const userClient = createClient(supabaseUrl, apiKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const background = processRemesaJob(
      admin,
      userClient,
      supabaseUrl,
      apiKey,
      accessToken,
      idJob,
    ).catch(async (err) => {
      const message = err instanceof Error ? err.message : "Error fatal en post-proceso de remesa.";
      console.error("[procesar-remesa-job]", message);
      await admin.rpc("fn_remesa_job_finalizar", {
        p_id_job: idJob,
        p_excel_ok: false,
        p_error_mensaje: message,
      });
    });

    EdgeRuntime.waitUntil(background);

    return jsonResponse({ ok: true, accepted: true, id_job: idJob }, 202);
  },
};
