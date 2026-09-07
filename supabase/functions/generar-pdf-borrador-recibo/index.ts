import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@^2";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "https://esm.sh/pdf-lib@1.17.1";

interface RequestBody {
  id_recibo?: string;
}

interface VentaLineaPdfRow {
  CONCEPTO: string;
  CANTIDAD: number;
  PRECIO_UNITARIO: number;
  SUBTOTAL: number;
  IVA_PORCENTAJE: number | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DOCUMENTOS_BUCKET = "documentos-legales";
const LOGOS_BUCKET = "logos";
const MM_TO_PT = 2.834645669;
const MIN_Y = 12 * MM_TO_PT;

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function sanitizePdfText(text: string): string {
  return text
    .replace(/\u20AC/g, "EUR")
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u00B7/g, ".")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\t\n\r\x20-\xFF]/g, "?");
}

function formatMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  const formatted = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${formatted} EUR`;
}

function formatFecha(value: string | null | undefined): string {
  if (!value?.trim()) return "-";
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [y, m, d] = raw.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  return sanitizePdfText(raw);
}

function parseMesPeriodo(mesPeriodo: string): { month: number; year: number } | null {
  const match = mesPeriodo.trim().match(/^([A-Za-zÁÉÍÓÚáéíóúÑñ]+)\s+(\d{4})$/);
  if (!match) return null;

  const monthName = match[1].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const monthIdx = MESES_ES.findIndex((m) => m === monthName);
  if (monthIdx < 0) return null;

  return { month: monthIdx, year: Number(match[2]) };
}

function formatPeriodoDelAl(mesPeriodo: string | null | undefined): string {
  if (!mesPeriodo?.trim()) return "-";
  const parsed = parseMesPeriodo(mesPeriodo);
  if (!parsed) return sanitizePdfText(mesPeriodo.trim());

  const { month, year } = parsed;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const monthName = MESES_ES[month];
  return sanitizePdfText(
    `Del 1 de ${monthName} de ${year} al ${lastDay} de ${monthName} de ${year}`,
  );
}

function isReciboBorrador(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "borrador";
}

function extractStoragePathFromPublicUrl(publicUrl: string, bucket: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx < 0) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length).split("?")[0] ?? "");
}

async function loadLogoBytes(
  supabase: SupabaseClient,
  appLogo: string,
): Promise<{ bytes: Uint8Array; contentType: string; lowerRef: string } | null> {
  const raw = appLogo.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const response = await fetch(raw);
      if (response.ok) {
        return {
          bytes: new Uint8Array(await response.arrayBuffer()),
          contentType: (response.headers.get("content-type") ?? "").toLowerCase(),
          lowerRef: raw.toLowerCase(),
        };
      }
    } catch {
      // fall through to storage
    }
  }

  const downloadCandidates = [raw, raw.split("/").pop() ?? ""].filter(Boolean);
  for (const candidate of downloadCandidates) {
    const { data, error } = await supabase.storage.from(LOGOS_BUCKET).download(candidate);
    if (!error && data) {
      return {
        bytes: new Uint8Array(await data.arrayBuffer()),
        contentType: "",
        lowerRef: candidate.toLowerCase(),
      };
    }
  }

  return null;
}

async function tryEmbedLogo(
  pdfDoc: PDFDocument,
  supabase: SupabaseClient,
  appLogo: string | null | undefined,
): Promise<PDFImage | null> {
  if (!appLogo?.trim()) return null;

  const loaded = await loadLogoBytes(supabase, appLogo);
  if (!loaded) return null;

  const { bytes, contentType, lowerRef } = loaded;
  const isWebp = contentType.includes("webp") || lowerRef.endsWith(".webp");
  if (isWebp) return null;

  const isPng = contentType.includes("png") || lowerRef.endsWith(".png");
  const isJpg =
    contentType.includes("jpeg") ||
    contentType.includes("jpg") ||
    lowerRef.endsWith(".jpg") ||
    lowerRef.endsWith(".jpeg");

  try {
    if (isPng) return await pdfDoc.embedPng(bytes);
    if (isJpg) return await pdfDoc.embedJpg(bytes);
    try {
      return await pdfDoc.embedPng(bytes);
    } catch {
      return await pdfDoc.embedJpg(bytes);
    }
  } catch {
    return null;
  }
}

function drawTextSafe(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  options?: { color?: ReturnType<typeof rgb> },
) {
  page.drawText(sanitizePdfText(text), { x, y, size, font, color: options?.color });
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: PDFFont,
  lineHeight = 12,
): number {
  const safeText = sanitizePdfText(text);
  const words = safeText.split(/\s+/).filter(Boolean);
  let line = "";
  let cursorY = y;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width > maxWidth && line) {
      drawTextSafe(page, line, x, cursorY, size, font);
      cursorY -= lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) {
    drawTextSafe(page, line, x, cursorY, size, font);
    cursorY -= lineHeight;
  }

  return cursorY;
}

function ensureSpace(
  pdfDoc: PDFDocument,
  pageRef: { page: PDFPage },
  pageWidth: number,
  pageHeight: number,
  cursorY: number,
  needed: number,
  margin: number,
): number {
  if (cursorY - needed >= MIN_Y) return cursorY;

  pageRef.page = pdfDoc.addPage([pageWidth, pageHeight]);
  return pageHeight - margin - 20;
}

async function buildBorradorPdf(params: {
  supabase: SupabaseClient;
  cliente: {
    APP_LOGO: string | null;
    CIF: string | null;
    NOMBRE_ESCUELA: string | null;
    DIRECCION: string | null;
    TLF_REAL: string | null;
    IBAN: string | null;
  };
  alumnoNombre: string | null;
  recibo: {
    REF_RECIBO: string;
    FECHA: string | null;
    MES_PERIODO: string | null;
    METODO_PAGO: string | null;
    TOTAL_BASE: number | null;
    TOTAL_IVA: number | null;
    TOTAL_DOC: number | null;
  };
  lineas: VentaLineaPdfRow[];
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const pageRef = { page: pdfDoc.addPage([pageWidth, pageHeight]) };
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = MIN_Y;
  const logoBoxW = 40 * MM_TO_PT;
  const logoBoxH = 18 * MM_TO_PT;
  const topY = pageHeight - margin;

  const logo = await tryEmbedLogo(pdfDoc, params.supabase, params.cliente.APP_LOGO);
  if (logo) {
    const scale = Math.min(logoBoxW / logo.width, logoBoxH / logo.height);
    const drawW = logo.width * scale;
    const drawH = logo.height * scale;
    pageRef.page.drawImage(logo, {
      x: margin + (logoBoxW - drawW) / 2,
      y: topY - logoBoxH + (logoBoxH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  const blockTop = topY - logoBoxH - 8;
  const leftX = margin;
  const rightX = pageWidth / 2 + 10;
  const colWidth = pageWidth / 2 - margin - 14;

  let leftY = blockTop;
  const leftRows = [
    params.cliente.CIF ? `CIF: ${params.cliente.CIF}` : null,
    params.cliente.NOMBRE_ESCUELA?.trim() || null,
    [params.cliente.DIRECCION?.trim(), params.cliente.TLF_REAL?.trim()]
      .filter(Boolean)
      .join(". ") || null,
  ].filter(Boolean) as string[];

  for (const row of leftRows) {
    leftY = drawWrappedText(pageRef.page, row, leftX, leftY, colWidth, 9, font);
    leftY -= 2;
  }

  let rightY = blockTop;
  drawTextSafe(pageRef.page, params.alumnoNombre?.trim() || "-", rightX, rightY, 10, fontBold);
  rightY -= 14;
  rightY = drawWrappedText(
    pageRef.page,
    formatPeriodoDelAl(params.recibo.MES_PERIODO),
    rightX,
    rightY,
    colWidth,
    9,
    font,
  );
  rightY -= 4;
  drawTextSafe(pageRef.page, "BORRADOR", rightX, rightY, 12, fontBold, {
    color: rgb(0.75, 0.2, 0.1),
  });

  let cursorY = Math.min(leftY, rightY) - 18;
  drawTextSafe(pageRef.page, `Número: ${params.recibo.REF_RECIBO}`, margin, cursorY, 9, font);
  drawTextSafe(
    pageRef.page,
    `Fecha: ${formatFecha(params.recibo.FECHA)}`,
    pageWidth - margin - 140,
    cursorY,
    9,
    font,
  );
  cursorY -= 22;

  const headers = ["Concepto", "Precio unit.", "Cantidad", "Subtotal", "IVA %"];
  const colXs = [margin, margin + 210, margin + 290, margin + 350, margin + 430];
  const conceptWidth = colXs[1] - colXs[0] - 8;

  for (let i = 0; i < headers.length; i++) {
    drawTextSafe(pageRef.page, headers[i], colXs[i], cursorY, 8, fontBold);
  }
  cursorY -= 8;
  pageRef.page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: pageWidth - margin, y: cursorY },
    thickness: 0.8,
    color: rgb(0.7, 0.7, 0.7),
  });
  cursorY -= 14;

  for (const linea of params.lineas) {
    cursorY = ensureSpace(pdfDoc, pageRef, pageWidth, pageHeight, cursorY, 40, margin);

    const rowTop = cursorY;
    const conceptBottom = drawWrappedText(
      pageRef.page,
      linea.CONCEPTO ?? "-",
      colXs[0],
      rowTop,
      conceptWidth,
      8,
      font,
    );

    drawTextSafe(pageRef.page, formatMoney(linea.PRECIO_UNITARIO), colXs[1], rowTop, 8, font);
    drawTextSafe(pageRef.page, String(linea.CANTIDAD ?? 0), colXs[2], rowTop, 8, font);
    drawTextSafe(pageRef.page, formatMoney(linea.SUBTOTAL), colXs[3], rowTop, 8, font);
    drawTextSafe(pageRef.page, `${linea.IVA_PORCENTAJE ?? 0}%`, colXs[4], rowTop, 8, font);

    cursorY = Math.min(conceptBottom, rowTop - 13) - 4;
  }

  cursorY = ensureSpace(pdfDoc, pageRef, pageWidth, pageHeight, cursorY, 70, margin);
  cursorY -= 8;
  pageRef.page.drawLine({
    start: { x: margin, y: cursorY },
    end: { x: pageWidth - margin, y: cursorY },
    thickness: 0.8,
    color: rgb(0.7, 0.7, 0.7),
  });
  cursorY -= 16;

  const totalsX = pageWidth - margin - 170;
  drawTextSafe(
    pageRef.page,
    `Base imponible: ${formatMoney(params.recibo.TOTAL_BASE)}`,
    totalsX,
    cursorY,
    9,
    font,
  );
  cursorY -= 12;
  drawTextSafe(
    pageRef.page,
    `IVA: ${formatMoney(params.recibo.TOTAL_IVA)}`,
    totalsX,
    cursorY,
    9,
    font,
  );
  cursorY -= 12;
  drawTextSafe(
    pageRef.page,
    `Total: ${formatMoney(params.recibo.TOTAL_DOC)}`,
    totalsX,
    cursorY,
    10,
    fontBold,
  );
  cursorY -= 18;

  const footerParts: string[] = [];
  const metodo = params.recibo.METODO_PAGO?.trim().toLowerCase() ?? "";
  if (metodo === "transferencia" || metodo === "transfer") {
    footerParts.push("Condiciones de pago: Transferencia.");
    const iban = params.cliente.IBAN?.trim();
    if (iban) {
      footerParts.push(`Realice la transferencia al IBAN acreedor: ${iban}`);
    }
  } else if (params.recibo.METODO_PAGO?.trim()) {
    footerParts.push(`Condiciones de pago: ${params.recibo.METODO_PAGO.trim()}.`);
  } else {
    footerParts.push("Condiciones de pago según acuerdo con el centro.");
  }

  for (const part of footerParts) {
    cursorY = ensureSpace(pdfDoc, pageRef, pageWidth, pageHeight, cursorY, 24, margin);
    cursorY = drawWrappedText(
      pageRef.page,
      part,
      margin,
      cursorY,
      pageWidth - margin * 2,
      8,
      font,
      10,
    );
    cursorY -= 4;
  }

  return await pdfDoc.save();
}

async function uploadBorradorPdf(
  supabase: SupabaseClient,
  idCliente: string,
  idRecibo: string,
  pdfBytes: Uint8Array,
  previousLink: string | null | undefined,
): Promise<string> {
  const timestamp = Date.now();
  const storagePath = `${idCliente}/recibos/${idRecibo}_borrador_${timestamp}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from(DOCUMENTOS_BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (uploadErr) {
    throw new Error(`Error al subir PDF borrador: ${uploadErr.message}`);
  }

  if (previousLink?.trim()) {
    const oldPath = extractStoragePathFromPublicUrl(previousLink.trim(), DOCUMENTOS_BUCKET);
    if (oldPath?.startsWith(`${idCliente}/recibos/`)) {
      await supabase.storage.from(DOCUMENTOS_BUCKET).remove([oldPath]);
    }
  }

  const { data: urlData } = supabase.storage.from(DOCUMENTOS_BUCKET).getPublicUrl(storagePath);
  if (!urlData.publicUrl) {
    throw new Error("No se pudo obtener la URL publica del PDF borrador.");
  }
  return `${urlData.publicUrl}?v=${timestamp}`;
}

export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const body = (await req.json()) as RequestBody;
      const idRecibo = body.id_recibo?.trim();
      if (!idRecibo) {
        return new Response(JSON.stringify({ error: "Falta id_recibo." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const { data: recibo, error: reciboErr } = await ctx.supabase
        .from("RECIBOS_MENSUALES")
        .select(
          "ID_RECIBO, ID_CLIENTE, ID_CENTRO, ID_ALUMNO, REF_RECIBO, FECHA, MES_PERIODO, ESTADO_PAGO, METODO_PAGO, TOTAL_BASE, TOTAL_IVA, TOTAL_DOC, LINK_PDF_BORRADOR",
        )
        .eq("ID_RECIBO", idRecibo)
        .maybeSingle();

      if (reciboErr) throw reciboErr;
      if (!recibo) {
        return new Response(JSON.stringify({ error: "Recibo no encontrado." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      if (!isReciboBorrador(recibo.ESTADO_PAGO)) {
        return new Response(
          JSON.stringify({
            error: "Solo se puede generar PDF borrador para recibos en estado Borrador.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const { error: scopeErr } = await ctx.supabase.rpc("assert_remesa_excel_scope", {
        p_id_cliente: recibo.ID_CLIENTE,
        p_id_centro: recibo.ID_CENTRO,
      });
      if (scopeErr) {
        return new Response(JSON.stringify({ error: scopeErr.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const [
        { data: lineas, error: lineasErr },
        { data: cliente, error: clienteErr },
        { data: alumno, error: alumnoErr },
      ] = await Promise.all([
        ctx.supabase
          .from("VENTAS_LINEAS")
          .select("CONCEPTO, CANTIDAD, PRECIO_UNITARIO, SUBTOTAL, IVA_PORCENTAJE")
          .eq("ID_RECIBO", idRecibo)
          .order("CONCEPTO", { ascending: true }),
        ctx.supabase
          .from("CLIENTES")
          .select("APP_LOGO, CIF, NOMBRE_ESCUELA, DIRECCION, TLF_REAL, IBAN")
          .eq("ID_CLIENTE", recibo.ID_CLIENTE)
          .maybeSingle(),
        ctx.supabase
          .from("ALUMNOS")
          .select("NOMBRE_ALUMNO")
          .eq("ID_ALUMNO", recibo.ID_ALUMNO)
          .maybeSingle(),
      ]);

      if (lineasErr) throw lineasErr;
      if (clienteErr) throw clienteErr;
      if (alumnoErr) throw alumnoErr;
      if (!cliente) {
        throw new Error("No se encontro el emisor (CLIENTES) del recibo.");
      }

      const pdfBytes = await buildBorradorPdf({
        supabase: ctx.supabase,
        cliente,
        alumnoNombre: alumno?.NOMBRE_ALUMNO ?? null,
        recibo,
        lineas: (lineas ?? []) as VentaLineaPdfRow[],
      });

      const publicUrl = await uploadBorradorPdf(
        ctx.supabase,
        recibo.ID_CLIENTE,
        idRecibo,
        pdfBytes,
        recibo.LINK_PDF_BORRADOR,
      );

      const { error: updateErr } = await ctx.supabase
        .from("RECIBOS_MENSUALES")
        .update({ LINK_PDF_BORRADOR: publicUrl })
        .eq("ID_RECIBO", idRecibo);

      if (updateErr) {
        throw new Error(
          `PDF generado pero no se pudo guardar LINK_PDF_BORRADOR: ${updateErr.message}`,
        );
      }

      return new Response(JSON.stringify({ link: publicUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : "Error fatal" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }
  }),
};
