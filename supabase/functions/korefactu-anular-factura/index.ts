import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@^2";

interface RequestBody {
  id_recibo?: string;
  uuid?: string;
}

interface ReciboRow {
  ID_RECIBO: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  FECHA: string | null;
  ESTADO_PAGO: string | null;
  LINK_PDF_RECIBO: string | null;
  NUM_FACTURA_KOREFACTU: string | null;
  LINK_FACTURA_KOREFACTU: string | null;
}

interface ClienteCreds {
  KOREFACTU_BASE_URL: string | null;
  KOREFACTU_API_KEY: string | null;
}

interface KorefactuIdentificador {
  serie?: string | null;
  numero?: string | number | null;
  anio?: string | number | null;
}

interface KorefactuCancelResponse {
  correcto?: boolean;
  mensaje?: string | null;
  errores?: string[] | null;
  codigoError?: string | null;
}

interface KorefactuFacturaData {
  uuid?: string | null;
  identificadorFactura?: KorefactuIdentificador | null;
  fechaExpedicion?: string | null;
}

interface KorefactuGetResponse extends KorefactuCancelResponse {
  datos?: KorefactuFacturaData | null;
  uuid?: string | null;
  identificadorFactura?: KorefactuIdentificador | null;
  fechaExpedicion?: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOCUMENTOS_BUCKET = "documentos-legales";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function isReciboCobrado(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "cobrado";
}

function isReciboAnulado(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "anulado";
}

function isReciboAnulableEnHarmony(estado: string | null | undefined): boolean {
  return isReciboCobrado(estado) || isReciboAnulado(estado);
}

function identificadorFromNumFactura(numFactura: string | null | undefined): KorefactuIdentificador {
  const trimmed = numFactura?.trim() ?? "";
  if (!trimmed) return {};
  const parts = trimmed.split("-");
  if (parts.length < 2) return {};
  if (parts.length === 2) {
    return { serie: parts[0], numero: parts[1] };
  }
  return {
    serie: parts[0],
    numero: parts[1],
    anio: parts.slice(2).join("-"),
  };
}

function formatReciboFechaDdMmYyyy(fecha: string | null | undefined): string {
  const trimmed = fecha?.trim() ?? "";
  if (trimmed) {
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
    }
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  return `${day}-${month}-${year}`;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function korefactuAuthorization(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (/^Bearer\s+/i.test(trimmed)) {
    return trimmed;
  }
  return `Bearer ${trimmed}`;
}

function korefactuApiKeyRaw(apiKey: string): string {
  return apiKey.trim().replace(/^Bearer\s+/i, "");
}

function korefactuAuthHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: korefactuAuthorization(apiKey),
    "X-API-KEY": korefactuApiKeyRaw(apiKey),
  };
}

function redactSecrets(text: string, apiKey: string): string {
  let out = text;
  const key = apiKey.trim();
  const rawKey = korefactuApiKeyRaw(key);
  if (key.length >= 8) {
    out = out.split(key).join("[redacted]");
  }
  if (rawKey !== key && rawKey.length >= 8) {
    out = out.split(rawKey).join("[redacted]");
  }
  out = out.replace(/(Authorization:\s*)\S+/gi, "$1[redacted]");
  return out.replace(/(X-API-KEY:\s*)\S+/gi, "$1[redacted]");
}

function currentYearMadrid(): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
  }).format(new Date());
}

function extractStoragePathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0] ?? "");
}

async function uploadOfficialPdf(
  supabase: SupabaseClient,
  idCliente: string,
  idRecibo: string,
  pdfBytes: Uint8Array,
  previousLink: string | null | undefined,
): Promise<string> {
  const timestamp = Date.now();
  const storagePath = `${idCliente}/facturas/${idRecibo}_korefactu_${timestamp}.pdf`;
  const { error: uploadErr } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadErr) {
    throw new Error(`Error al subir PDF de factura: ${uploadErr.message}`);
  }

  if (previousLink?.trim()) {
    const oldPath = extractStoragePathFromPublicUrl(previousLink.trim(), DOCUMENTOS_BUCKET);
    if (oldPath?.startsWith(`${idCliente}/facturas/`)) {
      await supabase.storage.from(DOCUMENTOS_BUCKET).remove([oldPath]);
    }
  }

  const { data: urlData } = supabase.storage.from(DOCUMENTOS_BUCKET).getPublicUrl(storagePath);
  if (!urlData.publicUrl) {
    throw new Error("No se pudo obtener la URL publica del PDF de factura.");
  }
  return `${urlData.publicUrl}?v=${timestamp}`;
}

async function readKorefactuJson(
  response: Response,
  apiKey: string,
  fallback: string,
): Promise<KorefactuCancelResponse> {
  const raw = await response.text();
  const safe = redactSecrets(raw, apiKey);
  if (!response.ok) {
    throw new Error(safe.trim() || fallback);
  }
  try {
    return JSON.parse(raw) as KorefactuCancelResponse;
  } catch {
    throw new Error(fallback);
  }
}

function assertKorefactuCancelSuccess(payload: KorefactuCancelResponse): void {
  if (payload.correcto === false) {
    const detail =
      payload.errores?.filter(Boolean).join("; ").trim() ||
      payload.mensaje?.trim() ||
      payload.codigoError?.trim() ||
      "Korefactu rechazo la anulacion de la factura.";
    throw new Error(detail);
  }
}

function unwrapFacturaDatos(payload: KorefactuGetResponse): KorefactuFacturaData {
  if (payload.datos && typeof payload.datos === "object") {
    return payload.datos;
  }
  return payload;
}

async function fetchFacturaForCancel(
  root: string,
  apiKey: string,
  uuid: string,
): Promise<{ serie: string; numero: string; fechaExpedicion: string }> {
  const response = await fetch(`${root}/api/v1/key/facturas/${encodeURIComponent(uuid)}`, {
    method: "GET",
    headers: {
      ...korefactuAuthHeaders(apiKey),
      Accept: "application/json",
    },
  });

  const payload = await readKorefactuJson(
    response,
    apiKey,
    "No se pudo leer la factura en Korefactu por uuid.",
  ) as KorefactuGetResponse;
  assertKorefactuCancelSuccess(payload);

  const datos = unwrapFacturaDatos(payload);
  const responseUuid = datos.uuid?.trim() || payload.uuid?.trim() || "";
  if (responseUuid && responseUuid !== uuid) {
    throw new Error("Korefactu devolvio un uuid distinto al solicitado.");
  }

  const identificador = datos.identificadorFactura ?? {};
  const serie = String(identificador.serie ?? "").trim();
  const numero = String(identificador.numero ?? "").trim();
  const fechaExpedicion = String(datos.fechaExpedicion ?? payload.fechaExpedicion ?? "").trim();

  if (!serie || !numero) {
    throw new Error("Korefactu no devolvio serie/numero para la factura del uuid.");
  }
  if (!fechaExpedicion) {
    throw new Error("Korefactu no devolvio fechaExpedicion para la factura del uuid.");
  }

  return { serie, numero, fechaExpedicion };
}

async function fetchPdfBytes(url: string, apiKey: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: korefactuAuthHeaders(apiKey),
    });
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const bytes = new Uint8Array(await response.arrayBuffer());
    const looksPdf =
      contentType.includes("pdf") ||
      (bytes.length >= 4 &&
        bytes[0] === 0x25 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x44 &&
        bytes[3] === 0x46);

    if (!response.ok || !looksPdf) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

async function downloadKorefactuPdf(
  root: string,
  apiKey: string,
  uuid: string | null | undefined,
  identificador: KorefactuIdentificador,
): Promise<Uint8Array | null> {
  let pdfBytes: Uint8Array | null = null;
  const trimmedUuid = uuid?.trim() ?? "";
  if (trimmedUuid) {
    pdfBytes = await fetchPdfBytes(
      `${root}/api/v1/key/facturas/${encodeURIComponent(trimmedUuid)}/pdf`,
      apiKey,
    );
  }
  if (!pdfBytes) {
    const serie = String(identificador.serie ?? "F").trim();
    const numero = String(identificador.numero ?? "").trim();
    const anio = String(identificador.anio ?? currentYearMadrid()).trim();
    if (!numero) return null;
    const qs = new URLSearchParams({ serie, numero, anio });
    pdfBytes = await fetchPdfBytes(`${root}/api/v1/key/facturas/pdf?${qs.toString()}`, apiKey);
  }
  return pdfBytes;
}

export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const body = (await req.json()) as RequestBody;
      const idRecibo = body.id_recibo?.trim();
      const bodyUuid = body.uuid?.trim() ?? "";
      if (!idRecibo) {
        return jsonError("Falta id_recibo.", 400);
      }

      const { data: recibo, error: reciboErr } = await ctx.supabase
        .from("RECIBOS_MENSUALES")
        .select(
          "ID_RECIBO, ID_CLIENTE, ID_CENTRO, FECHA, ESTADO_PAGO, LINK_PDF_RECIBO, NUM_FACTURA_KOREFACTU, LINK_FACTURA_KOREFACTU",
        )
        .eq("ID_RECIBO", idRecibo)
        .maybeSingle();
      if (reciboErr) throw reciboErr;
      if (!recibo) {
        return jsonError("Recibo no encontrado.", 404);
      }

      const reciboRow = recibo as ReciboRow;

      if (!isReciboAnulableEnHarmony(reciboRow.ESTADO_PAGO)) {
        return jsonError("Solo se puede anular en Korefactu un recibo Cobrado o Anulado.", 400);
      }

      const harmonyUuid = reciboRow.LINK_FACTURA_KOREFACTU?.trim() ?? "";
      const targetUuid = bodyUuid || harmonyUuid;
      if (!targetUuid) {
        return jsonError("Falta uuid (body o LINK_FACTURA_KOREFACTU).", 400);
      }

      const isOrphanCancel = Boolean(bodyUuid && bodyUuid !== harmonyUuid);

      const { error: scopeErr } = await ctx.supabase.rpc("assert_remesa_excel_scope", {
        p_id_cliente: reciboRow.ID_CLIENTE,
        p_id_centro: reciboRow.ID_CENTRO,
      });
      if (scopeErr) {
        return jsonError(scopeErr.message, 403);
      }

      const { data: cliente, error: clienteErr } = await ctx.supabase
        .from("CLIENTES")
        .select("KOREFACTU_BASE_URL, KOREFACTU_API_KEY")
        .eq("ID_CLIENTE", reciboRow.ID_CLIENTE)
        .maybeSingle();
      if (clienteErr) throw clienteErr;
      if (!cliente) {
        throw new Error("No se encontro el emisor (CLIENTES) del recibo.");
      }

      const clienteRow = cliente as ClienteCreds;
      const baseUrl = clienteRow.KOREFACTU_BASE_URL?.trim() ?? "";
      const apiKey = clienteRow.KOREFACTU_API_KEY?.trim() ?? "";
      if (!baseUrl || !apiKey) {
        return jsonError("Falta KOREFACTU_BASE_URL / KOREFACTU_API_KEY en CLIENTES", 400);
      }

      const root = normalizeBaseUrl(baseUrl);
      const facturaKorefactu = await fetchFacturaForCancel(root, apiKey, targetUuid);
      const numFactura = reciboRow.NUM_FACTURA_KOREFACTU?.trim() ?? "";
      const identificador = identificadorFromNumFactura(numFactura);
      const cancelBody = {
        serie: facturaKorefactu.serie,
        numero: facturaKorefactu.numero,
        fechaExpedicion: facturaKorefactu.fechaExpedicion,
        rechazoPrevio: "N",
        sinRegistroPrevio: "N",
      };

      const cancelResponse = await fetch(
        `${root}/api/v1/key/verifactu/registros-facturacion/cancelar`,
        {
          method: "POST",
          headers: {
            ...korefactuAuthHeaders(apiKey),
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(cancelBody),
        },
      );

      const cancelPayload = await readKorefactuJson(
        cancelResponse,
        apiKey,
        "Error al anular la factura en Korefactu.",
      );
      assertKorefactuCancelSuccess(cancelPayload);

      let linkPdfRecibo = reciboRow.LINK_PDF_RECIBO?.trim() || null;
      if (!isOrphanCancel) {
        try {
          const pdfBytes = await downloadKorefactuPdf(root, apiKey, targetUuid, identificador);
          if (pdfBytes) {
            linkPdfRecibo = await uploadOfficialPdf(
              ctx.supabase,
              reciboRow.ID_CLIENTE,
              idRecibo,
              pdfBytes,
              reciboRow.LINK_PDF_RECIBO,
            );
          }
        } catch {
          // PDF opcional tras anular: no bloquea la anulacion.
        }
      }

      const updatePatch: { ESTADO_PAGO?: string; LINK_PDF_RECIBO?: string } = {};
      if (!isOrphanCancel) {
        if (!isReciboAnulado(reciboRow.ESTADO_PAGO)) {
          updatePatch.ESTADO_PAGO = "Anulado";
        }
        if (linkPdfRecibo && linkPdfRecibo !== reciboRow.LINK_PDF_RECIBO?.trim()) {
          updatePatch.LINK_PDF_RECIBO = linkPdfRecibo;
        }
      }

      if (Object.keys(updatePatch).length > 0) {
        const { error: updateErr } = await ctx.supabase
          .from("RECIBOS_MENSUALES")
          .update(updatePatch)
          .eq("ID_RECIBO", idRecibo);
        if (updateErr) {
          throw new Error(`Anulacion en Korefactu OK pero no se pudo actualizar el recibo: ${updateErr.message}`);
        }
      }

      return new Response(
        JSON.stringify({
          notification: "success",
          link: isOrphanCancel ? null : linkPdfRecibo,
          uuidAnulado: targetUuid,
          orphan: isOrphanCancel,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error interno al anular la factura.";
      return jsonError(message, 400);
    }
  }),
};
