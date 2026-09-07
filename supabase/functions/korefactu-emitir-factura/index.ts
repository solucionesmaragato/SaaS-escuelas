import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@^2";
import { regenerarExcelControlRemesa } from "../_shared/remesaExcelControl.ts";
import { mapMetodoPagoToKorefactuFormaDePago } from "../_shared/korefactuFormaDePago.ts";

interface RequestBody {
  id_recibo?: string;
  solo_descargar_pdf?: boolean;
}

interface ReciboRow {
  ID_RECIBO: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  ID_CURSO: string | null;
  ID_ALUMNO: string | null;
  REF_RECIBO: string | null;
  FECHA: string | null;
  MES_PERIODO: string | null;
  ESTADO_PAGO: string | null;
  METODO_PAGO: string | null;
  RECEPTOR_NOMBRE: string | null;
  CIF_DNI: string | null;
  DIRECCION: string | null;
  LINK_PDF_RECIBO: string | null;
  NUM_FACTURA_KOREFACTU: string | null;
  LINK_FACTURA_KOREFACTU: string | null;
  URL_QR: string | null;
  HUELLA_HASH: string | null;
}

interface AlumnoRow {
  DIRECCION: string | null;
  CP: string | null;
  MUNICIPIO: string | null;
  PROVINCIA: string | null;
}

interface VentaLineaRow {
  CONCEPTO: string | null;
  CANTIDAD: number | null;
  PRECIO_UNITARIO: number | null;
  DESCUENTO_LINEA: number | null;
  IVA_PORCENTAJE: number | null;
}

interface ClienteCreds {
  NOMBRE_ESCUELA: string | null;
  KOREFACTU_BASE_URL: string | null;
  KOREFACTU_API_KEY: string | null;
}

interface KorefactuIdentificador {
  serie?: string | null;
  numero?: string | number | null;
  anio?: string | number | null;
}

interface KorefactuFacturaData {
  uuid?: string | null;
  id?: string | null;
  idFactura?: string | null;
  estadoInterno?: string | null;
  urlVerificacion?: string | null;
  qr?: string | null;
  huella?: string | null;
  hash?: string | null;
  identificadorFactura?: KorefactuIdentificador | null;
}

interface KorefactuCreateResponse {
  correcto?: boolean;
  mensaje?: string | null;
  errores?: string[] | null;
  codigoError?: string | null;
  datos?: KorefactuFacturaData | null;
  uuid?: string | null;
  id?: string | null;
  idFactura?: string | null;
  estadoInterno?: string | null;
  urlVerificacion?: string | null;
  qr?: string | null;
  huella?: string | null;
  hash?: string | null;
  identificadorFactura?: KorefactuIdentificador | null;
  factura?: KorefactuFacturaData | null;
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

function isReciboBorrador(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "borrador";
}

function isReciboCobrado(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "cobrado";
}

function identificadorFromNumFactura(
  numFactura: string | null | undefined,
): KorefactuIdentificador {
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

async function downloadKorefactuPdf(
  root: string,
  apiKey: string,
  uuid: string | null | undefined,
  identificador: KorefactuIdentificador,
): Promise<Uint8Array | null> {
  let pdfBytes: Uint8Array | null = null;
  const trimmedUuid = uuid?.trim() ?? "";
  if (trimmedUuid) {
    try {
      pdfBytes = await fetchPdfBytes(
        `${root}/api/v1/key/facturas/${encodeURIComponent(trimmedUuid)}/pdf`,
        apiKey,
      );
    } catch {
      pdfBytes = null;
    }
  }
  if (!pdfBytes) {
    const serie = String(identificador.serie ?? "F").trim();
    const numero = String(identificador.numero ?? "").trim();
    const anio = String(identificador.anio ?? currentYearMadrid()).trim();
    if (!numero) return null;
    try {
      const qs = new URLSearchParams({ serie, numero, anio });
      pdfBytes = await fetchPdfBytes(`${root}/api/v1/key/facturas/pdf?${qs.toString()}`, apiKey);
    } catch {
      return null;
    }
  }
  return pdfBytes;
}

function successResponse(payload: {
  link: string | null;
  pdfDownloaded: boolean;
  notification: "success" | "pdf_missing";
  NUM_FACTURA_KOREFACTU: string | null;
  LINK_FACTURA_KOREFACTU: string | null;
  URL_QR: string | null;
  HUELLA_HASH: string | null;
  excel_error?: string | null;
}): Response {
  const body: Record<string, unknown> = { ...payload };
  if (payload.excel_error?.trim()) {
    body.excel_error = payload.excel_error.trim();
  } else {
    delete body.excel_error;
  }
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDdMmYyyy(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  return `${day}-${month}-${year}`;
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
  return formatDdMmYyyy();
}

function streetBeforePipe(direccion: string | null | undefined): string {
  const raw = direccion?.trim() ?? "";
  if (!raw || raw.startsWith("{")) return "";
  const pipeIdx = raw.indexOf(" | ");
  return pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw;
}

function cpAfterPipe(direccion: string | null | undefined): string {
  const raw = direccion?.trim() ?? "";
  if (!raw || raw.startsWith("{")) return "";
  const pipeIdx = raw.indexOf(" | ");
  return pipeIdx >= 0 ? raw.slice(pipeIdx + 3).trim() : "";
}

interface ReciboDireccionJson {
  calle: string;
  cp: string;
  municipio: string;
  provincia: string;
}

function parseReciboDireccionJson(
  direccion: string | null | undefined,
): ReciboDireccionJson | null {
  const raw = direccion?.trim() ?? "";
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReciboDireccionJson>;
    return {
      calle: String(parsed.calle ?? "").trim(),
      cp: String(parsed.cp ?? "").trim(),
      municipio: String(parsed.municipio ?? "").trim(),
      provincia: String(parsed.provincia ?? "").trim(),
    };
  } catch {
    return null;
  }
}

interface KorefactuDestinatario {
  nif: string;
  nombreRazon: string;
  direccion: string;
  codigoPostal: string;
  municipio: string;
  provincia: string;
}

function buildDestinatarioKorefactu(
  recibo: ReciboRow,
  alumno: AlumnoRow | null,
): { destinatario: KorefactuDestinatario | null; missing: string[] } {
  const nif = recibo.CIF_DNI?.trim() ?? "";
  const nombreRazon = recibo.RECEPTOR_NOMBRE?.trim() || "Destinatario";
  const jsonDireccion = parseReciboDireccionJson(recibo.DIRECCION);
  const hasAlumno = Boolean(alumno);

  let direccion = "";
  let codigoPostal = "";
  let municipio = "";
  let provincia = "";

  if (hasAlumno && alumno) {
    direccion =
      streetBeforePipe(recibo.DIRECCION) ||
      (jsonDireccion?.calle ?? "") ||
      streetBeforePipe(alumno.DIRECCION);
    codigoPostal =
      alumno.CP?.trim() ||
      cpAfterPipe(recibo.DIRECCION) ||
      (jsonDireccion?.cp ?? "") ||
      cpAfterPipe(alumno.DIRECCION ?? null);
    municipio = alumno.MUNICIPIO?.trim() ?? jsonDireccion?.municipio ?? "";
    provincia = alumno.PROVINCIA?.trim() ?? jsonDireccion?.provincia ?? "";
  } else if (jsonDireccion) {
    direccion = jsonDireccion.calle;
    codigoPostal = jsonDireccion.cp;
    municipio = jsonDireccion.municipio;
    provincia = jsonDireccion.provincia;
  } else {
    direccion = streetBeforePipe(recibo.DIRECCION);
    codigoPostal = cpAfterPipe(recibo.DIRECCION);
  }

  const missing: string[] = [];
  if (!nif) missing.push("NIF");
  if (!codigoPostal) missing.push("CP");
  if (!municipio) missing.push("municipio");
  if (!provincia) missing.push("provincia");
  if (!hasAlumno && !jsonDireccion) {
    missing.push("dirección JSON");
  }

  if (missing.length > 0) {
    return { destinatario: null, missing };
  }

  return {
    destinatario: {
      nif,
      nombreRazon,
      direccion,
      codigoPostal,
      municipio,
      provincia,
    },
    missing,
  };
}

function destinatarioValidationError(missing: string[]): string {
  return `Falta municipio/provincia/CP/NIF del alumno (${missing.join(", ")}).`;
}

function currentYearMadrid(): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
  }).format(new Date());
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

function lineTipoImpositivo(iva: number | null | undefined): number {
  if (iva === null || iva === undefined || Number.isNaN(Number(iva))) return 0;
  return Number(iva);
}

function lineBase(row: VentaLineaRow): number {
  const cantidad = Number(row.CANTIDAD ?? 0);
  const precio = Number(row.PRECIO_UNITARIO ?? 0);
  const descuento = Number(row.DESCUENTO_LINEA ?? 0);
  return round2(cantidad * precio - descuento);
}

function lineBaseImponibleUnidad(row: VentaLineaRow): number {
  const cantidad = Number(row.CANTIDAD ?? 0);
  const base = lineBase(row);
  if (cantidad <= 0) return base;
  return round2(base / cantidad);
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
  const { error: uploadErr } = await supabase.storage
    .from(DOCUMENTOS_BUCKET)
    .upload(storagePath, pdfBytes, {
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

function unwrapDatos(payload: KorefactuCreateResponse): KorefactuFacturaData {
  if (payload.datos && typeof payload.datos === "object") {
    return payload.datos;
  }
  if (payload.factura && typeof payload.factura === "object") {
    return payload.factura;
  }
  return payload;
}

function assertKorefactuSuccess(payload: KorefactuCreateResponse): KorefactuFacturaData {
  if (payload.correcto === false) {
    const detail =
      payload.errores?.filter(Boolean).join("; ").trim() ||
      payload.mensaje?.trim() ||
      payload.codigoError?.trim() ||
      "Error de validacion en Korefactu.";
    throw new Error(detail);
  }
  return unwrapDatos(payload);
}

function pickUuid(datos: KorefactuFacturaData): string {
  return datos.uuid?.trim() || datos.idFactura?.trim() || datos.id?.trim() || "";
}

function pickIdentificador(datos: KorefactuFacturaData): KorefactuIdentificador {
  return datos.identificadorFactura ?? {};
}

function pickEstadoInterno(datos: KorefactuFacturaData): string {
  return (datos.estadoInterno ?? "").trim().toUpperCase();
}

function pickUrlVerificacion(datos: KorefactuFacturaData): string {
  return (datos.urlVerificacion ?? "").trim();
}

function pickHuella(datos: KorefactuFacturaData, fallbackUrl: string): string {
  const qr = datos.qr?.trim();
  if (qr) return qr;
  const huella = (datos.huella ?? datos.hash ?? "").trim();
  return huella || fallbackUrl;
}

function formatNumFactura(id: KorefactuIdentificador): string | null {
  const serie = String(id.serie ?? "").trim();
  const numero = String(id.numero ?? "").trim();
  const anio = String(id.anio ?? "").trim();
  const parts = [serie, numero, anio].filter(Boolean);
  return parts.length > 0 ? parts.join("-") : null;
}

async function readKorefactuJson(
  response: Response,
  apiKey: string,
  fallback: string,
): Promise<KorefactuCreateResponse> {
  const raw = await response.text();
  const safe = redactSecrets(raw, apiKey);
  if (!response.ok) {
    throw new Error(safe.trim() || fallback);
  }
  try {
    return JSON.parse(raw) as KorefactuCreateResponse;
  } catch {
    throw new Error(fallback);
  }
}

async function fetchPdfBytes(url: string, apiKey: string): Promise<Uint8Array> {
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
    const asText = new TextDecoder().decode(bytes.slice(0, 500));
    throw new Error(
      redactSecrets(asText.trim() || `Error al descargar PDF (${response.status}).`, apiKey),
    );
  }
  return bytes;
}

async function tryRegenerarExcelRemesaControl(
  supabase: SupabaseClient,
  recibo: ReciboRow,
): Promise<string | null> {
  const idCentro = recibo.ID_CENTRO?.trim() ?? "";
  const idCurso = recibo.ID_CURSO?.trim() ?? "";
  const mesPeriodo = recibo.MES_PERIODO?.trim() ?? "";
  if (!idCentro || !idCurso || !mesPeriodo) return null;

  try {
    await regenerarExcelControlRemesa(supabase, {
      idCliente: recibo.ID_CLIENTE,
      idCentro,
      idCurso,
      mesPeriodo,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Error al regenerar el Excel de control.";
  }
}

export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const body = (await req.json()) as RequestBody;
      const idRecibo = body.id_recibo?.trim();
      const soloDescargarPdf = body.solo_descargar_pdf === true;
      if (!idRecibo) {
        return jsonError("Falta id_recibo.", 400);
      }

      const { data: recibo, error: reciboErr } = await ctx.supabase
        .from("RECIBOS_MENSUALES")
        .select(
          "ID_RECIBO, ID_CLIENTE, ID_CENTRO, ID_CURSO, ID_ALUMNO, REF_RECIBO, FECHA, MES_PERIODO, ESTADO_PAGO, METODO_PAGO, RECEPTOR_NOMBRE, CIF_DNI, DIRECCION, LINK_PDF_RECIBO, NUM_FACTURA_KOREFACTU, LINK_FACTURA_KOREFACTU, URL_QR, HUELLA_HASH",
        )
        .eq("ID_RECIBO", idRecibo)
        .maybeSingle();
      if (reciboErr) throw reciboErr;
      if (!recibo) {
        return jsonError("Recibo no encontrado.", 404);
      }

      const reciboRow = recibo as ReciboRow;

      if (soloDescargarPdf) {
        const existingUuid = reciboRow.LINK_FACTURA_KOREFACTU?.trim() ?? "";
        if (!existingUuid) {
          return jsonError("Este recibo no tiene factura Korefactu emitida.", 400);
        }

        const { error: scopeErrPdf } = await ctx.supabase.rpc("assert_remesa_excel_scope", {
          p_id_cliente: reciboRow.ID_CLIENTE,
          p_id_centro: reciboRow.ID_CENTRO,
        });
        if (scopeErrPdf) {
          return jsonError(scopeErrPdf.message, 403);
        }

        const { data: clientePdf, error: clientePdfErr } = await ctx.supabase
          .from("CLIENTES")
          .select("KOREFACTU_BASE_URL, KOREFACTU_API_KEY")
          .eq("ID_CLIENTE", reciboRow.ID_CLIENTE)
          .maybeSingle();
        if (clientePdfErr) throw clientePdfErr;
        if (!clientePdf) {
          throw new Error("No se encontro el emisor (CLIENTES) del recibo.");
        }

        const clientePdfRow = clientePdf as ClienteCreds;
        const baseUrlPdf = clientePdfRow.KOREFACTU_BASE_URL?.trim() ?? "";
        const apiKeyPdf = clientePdfRow.KOREFACTU_API_KEY?.trim() ?? "";
        if (!baseUrlPdf || !apiKeyPdf) {
          return jsonError("Falta KOREFACTU_BASE_URL / KOREFACTU_API_KEY en CLIENTES", 400);
        }

        const existingPdfLink = reciboRow.LINK_PDF_RECIBO?.trim() ?? "";
        if (existingPdfLink) {
          return successResponse({
            link: existingPdfLink,
            pdfDownloaded: true,
            notification: "success",
            NUM_FACTURA_KOREFACTU: reciboRow.NUM_FACTURA_KOREFACTU,
            LINK_FACTURA_KOREFACTU: existingUuid,
            URL_QR: reciboRow.URL_QR,
            HUELLA_HASH: reciboRow.HUELLA_HASH,
          });
        }

        const rootPdf = normalizeBaseUrl(baseUrlPdf);
        const identificadorPdf = identificadorFromNumFactura(reciboRow.NUM_FACTURA_KOREFACTU);
        const pdfBytes = await downloadKorefactuPdf(
          rootPdf,
          apiKeyPdf,
          existingUuid,
          identificadorPdf,
        );
        if (!pdfBytes) {
          return jsonError(
            "Korefactu no permite descargar el PDF en este momento. La factura sigue registrada.",
            400,
          );
        }

        const publicUrl = await uploadOfficialPdf(
          ctx.supabase,
          reciboRow.ID_CLIENTE,
          idRecibo,
          pdfBytes,
          reciboRow.LINK_PDF_RECIBO,
        );
        const { error: pdfSaveErr } = await ctx.supabase
          .from("RECIBOS_MENSUALES")
          .update({ LINK_PDF_RECIBO: publicUrl })
          .eq("ID_RECIBO", idRecibo);
        if (pdfSaveErr) {
          throw new Error(
            `PDF descargado pero no se pudo guardar el recibo: ${pdfSaveErr.message}`,
          );
        }

        return successResponse({
          link: publicUrl,
          pdfDownloaded: true,
          notification: "success",
          NUM_FACTURA_KOREFACTU: reciboRow.NUM_FACTURA_KOREFACTU,
          LINK_FACTURA_KOREFACTU: existingUuid,
          URL_QR: reciboRow.URL_QR,
          HUELLA_HASH: reciboRow.HUELLA_HASH,
        });
      }

      const existingUuid = reciboRow.LINK_FACTURA_KOREFACTU?.trim() ?? "";
      const existingPdf = reciboRow.LINK_PDF_RECIBO?.trim() ?? "";
      const borrador = isReciboBorrador(reciboRow.ESTADO_PAGO);
      const cobrado = isReciboCobrado(reciboRow.ESTADO_PAGO);

      if (existingUuid && existingPdf) {
        return successResponse({
          link: existingPdf,
          pdfDownloaded: true,
          notification: "success",
          NUM_FACTURA_KOREFACTU: reciboRow.NUM_FACTURA_KOREFACTU,
          LINK_FACTURA_KOREFACTU: existingUuid,
          URL_QR: reciboRow.URL_QR,
          HUELLA_HASH: reciboRow.HUELLA_HASH,
        });
      }

      const { error: scopeErr } = await ctx.supabase.rpc("assert_remesa_excel_scope", {
        p_id_cliente: reciboRow.ID_CLIENTE,
        p_id_centro: reciboRow.ID_CENTRO,
      });
      if (scopeErr) {
        return jsonError(scopeErr.message, 403);
      }

      const { data: cliente, error: clienteErr } = await ctx.supabase
        .from("CLIENTES")
        .select("NOMBRE_ESCUELA, KOREFACTU_BASE_URL, KOREFACTU_API_KEY")
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

      if (existingUuid && !existingPdf && (borrador || cobrado)) {
        const identificador = identificadorFromNumFactura(reciboRow.NUM_FACTURA_KOREFACTU);
        const pdfBytes = await downloadKorefactuPdf(root, apiKey, existingUuid, identificador);
        if (pdfBytes) {
          const publicUrl = await uploadOfficialPdf(
            ctx.supabase,
            reciboRow.ID_CLIENTE,
            idRecibo,
            pdfBytes,
            reciboRow.LINK_PDF_RECIBO,
          );
          const { error: updateErr } = await ctx.supabase
            .from("RECIBOS_MENSUALES")
            .update({
              ESTADO_PAGO: "Cobrado",
              LINK_PDF_RECIBO: publicUrl,
            })
            .eq("ID_RECIBO", idRecibo);
          if (updateErr) {
            throw new Error(
              `PDF descargado pero no se pudo guardar el recibo: ${updateErr.message}`,
            );
          }
          return successResponse({
            link: publicUrl,
            pdfDownloaded: true,
            notification: "success",
            NUM_FACTURA_KOREFACTU: reciboRow.NUM_FACTURA_KOREFACTU,
            LINK_FACTURA_KOREFACTU: existingUuid,
            URL_QR: reciboRow.URL_QR,
            HUELLA_HASH: reciboRow.HUELLA_HASH,
          });
        }
        if (borrador) {
          const { error: updateErr } = await ctx.supabase
            .from("RECIBOS_MENSUALES")
            .update({ ESTADO_PAGO: "Cobrado", LINK_PDF_RECIBO: null })
            .eq("ID_RECIBO", idRecibo);
          if (updateErr) {
            throw new Error(`Factura emitida pero no se pudo marcar Cobrado: ${updateErr.message}`);
          }
        }
        return successResponse({
          link: null,
          pdfDownloaded: false,
          notification: "pdf_missing",
          NUM_FACTURA_KOREFACTU: reciboRow.NUM_FACTURA_KOREFACTU,
          LINK_FACTURA_KOREFACTU: existingUuid,
          URL_QR: reciboRow.URL_QR,
          HUELLA_HASH: reciboRow.HUELLA_HASH,
        });
      }

      if (!borrador) {
        return jsonError("Solo se puede emitir a Korefactu un recibo en estado Borrador.", 400);
      }

      const { data: lineas, error: lineasErr } = await ctx.supabase
        .from("VENTAS_LINEAS")
        .select("CONCEPTO, CANTIDAD, PRECIO_UNITARIO, DESCUENTO_LINEA, IVA_PORCENTAJE")
        .eq("ID_RECIBO", idRecibo)
        .order("CONCEPTO", { ascending: true });
      if (lineasErr) throw lineasErr;

      const lineRows = (lineas ?? []) as VentaLineaRow[];
      if (lineRows.length === 0) {
        return jsonError("El recibo no tiene lineas en VENTAS_LINEAS.", 400);
      }

      const idAlumno = reciboRow.ID_ALUMNO?.trim() ?? "";
      let alumnoRow: AlumnoRow | null = null;

      if (idAlumno) {
        const { data: alumno, error: alumnoErr } = await ctx.supabase
          .from("ALUMNOS")
          .select("DIRECCION, CP, MUNICIPIO, PROVINCIA")
          .eq("ID_ALUMNO", idAlumno)
          .eq("ID_CLIENTE", reciboRow.ID_CLIENTE)
          .maybeSingle();
        if (alumnoErr) throw alumnoErr;
        if (!alumno) {
          return jsonError(
            destinatarioValidationError(["NIF", "CP", "municipio", "provincia"]),
            400,
          );
        }
        alumnoRow = alumno as AlumnoRow;
      }

      const { destinatario, missing } = buildDestinatarioKorefactu(reciboRow, alumnoRow);
      if (!destinatario) {
        return jsonError(destinatarioValidationError(missing), 400);
      }
      if (!destinatario.direccion?.trim()) {
        return jsonError("Falta la dirección del destinatario (calle).", 400);
      }

      const fecha = formatReciboFechaDdMmYyyy(reciboRow.FECHA);
      const escuela = clienteRow.NOMBRE_ESCUELA?.trim() || "Escuela";
      const korefactuBody = {
        identificadorFactura: {
          serie: "F",
        },
        fechaExpedicion: fecha,
        fechaVencimiento: fecha,
        tipoFactura: "F1",
        formaDePago: mapMetodoPagoToKorefactuFormaDePago(reciboRow.METODO_PAGO),
        descripcionOperacion: [escuela, reciboRow.MES_PERIODO?.trim(), reciboRow.REF_RECIBO?.trim()]
          .filter(Boolean)
          .join(" - "),
        estadoPago: "COBRADA",
        destinatario,
        lineas: lineRows.map((row) => ({
          descripcion: row.CONCEPTO?.trim() || "Concepto",
          baseImponibleUnidad: lineBaseImponibleUnidad(row),
          cantidad: Number(row.CANTIDAD ?? 0),
          tipoImpositivo: lineTipoImpositivo(row.IVA_PORCENTAJE),
        })),
      };

      console.log("[korefactu-emitir-factura] payload", JSON.stringify(korefactuBody));

      const createRes = await fetch(`${root}/api/v1/key/facturas`, {
        method: "POST",
        headers: {
          ...korefactuAuthHeaders(apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(korefactuBody),
      });
      const createdPayload = await readKorefactuJson(
        createRes,
        apiKey,
        "Error al crear la factura en Korefactu.",
      );
      const created = assertKorefactuSuccess(createdPayload);

      const uuid = pickUuid(created);
      const identificador = pickIdentificador(created);
      if (!uuid && !formatNumFactura(identificador)) {
        throw new Error("Korefactu no devolvio uuid ni identificadorFactura.");
      }

      if (pickEstadoInterno(created) === "BORRADOR") {
        if (!uuid) {
          throw new Error("Korefactu dejo la factura en BORRADOR sin uuid para publicar.");
        }
        const publishRes = await fetch(
          `${root}/api/v1/key/facturas/${encodeURIComponent(uuid)}/publicar`,
          {
            method: "PUT",
            headers: korefactuAuthHeaders(apiKey),
          },
        );
        if (!publishRes.ok) {
          const raw = redactSecrets(await publishRes.text(), apiKey);
          throw new Error(raw.trim() || "Error al publicar la factura en Korefactu.");
        }
      }

      const urlVerificacion = pickUrlVerificacion(created);
      const huella = pickHuella(created, urlVerificacion);
      const numFactura = formatNumFactura(identificador);

      const { error: korefactuSaveErr } = await ctx.supabase
        .from("RECIBOS_MENSUALES")
        .update({
          NUM_FACTURA_KOREFACTU: numFactura,
          LINK_FACTURA_KOREFACTU: uuid || null,
          URL_QR: urlVerificacion || null,
          HUELLA_HASH: huella || null,
        })
        .eq("ID_RECIBO", idRecibo);
      if (korefactuSaveErr) {
        throw new Error(
          `Factura emitida en Korefactu pero no se pudo guardar el recibo: ${korefactuSaveErr.message}`,
        );
      }

      const excelError = await tryRegenerarExcelRemesaControl(ctx.supabase, reciboRow);

      const pdfBytes = await downloadKorefactuPdf(root, apiKey, uuid, identificador);
      if (pdfBytes) {
        const publicUrl = await uploadOfficialPdf(
          ctx.supabase,
          reciboRow.ID_CLIENTE,
          idRecibo,
          pdfBytes,
          reciboRow.LINK_PDF_RECIBO,
        );
        const { error: updateErr } = await ctx.supabase
          .from("RECIBOS_MENSUALES")
          .update({
            ESTADO_PAGO: "Cobrado",
            LINK_PDF_RECIBO: publicUrl,
          })
          .eq("ID_RECIBO", idRecibo);
        if (updateErr) {
          throw new Error(`PDF emitido pero no se pudo marcar Cobrado: ${updateErr.message}`);
        }
        return successResponse({
          link: publicUrl,
          pdfDownloaded: true,
          notification: "success",
          NUM_FACTURA_KOREFACTU: numFactura,
          LINK_FACTURA_KOREFACTU: uuid || null,
          URL_QR: urlVerificacion || null,
          HUELLA_HASH: huella || null,
          excel_error: excelError,
        });
      }

      const { error: cobradoErr } = await ctx.supabase
        .from("RECIBOS_MENSUALES")
        .update({
          ESTADO_PAGO: "Cobrado",
          LINK_PDF_RECIBO: null,
        })
        .eq("ID_RECIBO", idRecibo);
      if (cobradoErr) {
        throw new Error(`Factura emitida pero no se pudo marcar Cobrado: ${cobradoErr.message}`);
      }

      return successResponse({
        link: null,
        pdfDownloaded: false,
        notification: "pdf_missing",
        NUM_FACTURA_KOREFACTU: numFactura,
        LINK_FACTURA_KOREFACTU: uuid || null,
        URL_QR: urlVerificacion || null,
        HUELLA_HASH: huella || null,
        excel_error: excelError,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error fatal";
      return jsonError(message, 400);
    }
  }),
};
