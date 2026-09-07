import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@^2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

interface FichajeConciliacionRow {
  ID_FICHAJE: string;
  FECHA_HORA_REAL: string;
  TIPO_MOVIMIENTO: string;
  METODO: string | null;
  ESTADO_LEGAL: string | null;
  ESTADO_TOLERANCIA?: string | null;
  HASH_INMUTABILIDAD: string | null;
  HORA_TEORICA_IDEAL?: string | null;
  DIFERENCIA_MINUTOS?: number | null;
  ID_CENTRO?: string | null;
}

interface AuditPayload {
  idProfesor: string;
  nombreProfesor: string;
  rangoDesde: string;
  rangoHasta: string;
  totalRegistros: number;
  registros: FichajeConciliacionRow[];
  hashSello: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AUDITORIA_CATEGORIA = "Auditoría horaria";
const DOCUMENTOS_BUCKET = "documentos-legales";

function formatCleanTimestamp(isoStr: string): string {
  if (!isoStr) return "—";
  try {
    return String(isoStr).replace("T", " ").substring(0, 19);
  } catch {
    return String(isoStr);
  }
}

function isAuditPayload(value: unknown): value is AuditPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.idProfesor === "string" && Array.isArray(candidate.registros);
}

function parseAuditPayloads(body: unknown): AuditPayload[] {
  if (Array.isArray(body)) {
    if (!body.every(isAuditPayload)) {
      throw new Error("Payload batch de auditoría inválido.");
    }
    return body;
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const batch = record.payloads ?? record.batch;
    if (Array.isArray(batch)) {
      if (!batch.every(isAuditPayload)) {
        throw new Error("Payload batch de auditoría inválido.");
      }
      return batch as AuditPayload[];
    }
  }

  if (!isAuditPayload(body)) {
    throw new Error("Payload de auditoría inválido.");
  }
  return [body];
}

async function generateProfessorAuditPdf(payload: AuditPayload): Promise<Uint8Array> {
  const { nombreProfesor, rangoDesde, rangoHasta, registros, hashSello } = payload;

  const asientosCalculados = [...registros].sort((a, b) =>
    (a.FECHA_HORA_REAL || "").localeCompare(b.FECHA_HORA_REAL || ""),
  );

  const jornadas: Record<
    string,
    { ordinarias: number; extraordinarias: number; ultimaSalidaY: number }
  > = {};
  let totalHorasPeriodo = 0;
  let openEntradaTime: number | null = null;

  for (const r of asientosCalculados) {
    if (!r.FECHA_HORA_REAL) continue;

    const fecha = r.FECHA_HORA_REAL.split(" ")[0] || r.FECHA_HORA_REAL.split("T")[0];
    const timeMs = new Date(r.FECHA_HORA_REAL.replace(" ", "T")).getTime();

    if (r.TIPO_MOVIMIENTO === "Entrada" || r.TIPO_MOVIMIENTO === "Fin de Pausa") {
      openEntradaTime = timeMs;
    } else if (
      (r.TIPO_MOVIMIENTO === "Salida" || r.TIPO_MOVIMIENTO === "Inicio Pausa") &&
      openEntradaTime
    ) {
      const diffHoras = (timeMs - openEntradaTime) / 3600000;
      if (diffHoras > 0) {
        if (!jornadas[fecha])
          jornadas[fecha] = { ordinarias: 0, extraordinarias: 0, ultimaSalidaY: 0 };

        const acumuladoPrevio = jornadas[fecha].ordinarias + jornadas[fecha].extraordinarias;
        if (acumuladoPrevio + diffHoras <= 8) {
          jornadas[fecha].ordinarias += diffHoras;
        } else if (acumuladoPrevio >= 8) {
          jornadas[fecha].extraordinarias += diffHoras;
        } else {
          const remanenteOrdinario = 8 - acumuladoPrevio;
          jornadas[fecha].ordinarias += remanenteOrdinario;
          jornadas[fecha].extraordinarias += diffHoras - remanenteOrdinario;
        }
        totalHorasPeriodo += diffHoras;
      }
      openEntradaTime = null;
    }
  }

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([841.89, 595.28]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  const drawHeader = (p: typeof page, pageNum: number) => {
    p.drawText("INFORME JURÍDICO AUDITOR DE JORNADA LABORAL (RD-LEY 8/2019)", {
      x: 40,
      y: 550,
      size: 12,
      font: fontBold,
    });
    p.drawText(`Trabajador/a: ${nombreProfesor}`, { x: 40, y: 532, size: 10, font });
    p.drawText(`Periodo de Control Técnico: ${rangoDesde} al ${rangoHasta}`, {
      x: 40,
      y: 518,
      size: 10,
      font,
    });
    p.drawText(
      `Asientos Auditados: ${asientosCalculados.length}  |  Total Horas Computadas: ${totalHorasPeriodo.toFixed(2)}h (Pág. ${pageNum})`,
      { x: 40, y: 504, size: 10, font },
    );

    p.drawText(`Hash de Cierre de Bloque Ledger (SHA-256): ${hashSello}`, {
      x: 40,
      y: 485,
      size: 8,
      font: fontMono,
      color: rgb(0.3, 0.3, 0.3),
    });

    const headerY = 450;
    p.drawText("ID Asiento", { x: 40, y: headerY, size: 9, font: fontBold });
    p.drawText("Fecha / Hora Real", { x: 110, y: headerY, size: 9, font: fontBold });
    p.drawText("Movimiento", { x: 210, y: headerY, size: 9, font: fontBold });
    p.drawText("Método", { x: 320, y: headerY, size: 9, font: fontBold });
    p.drawText("H. Teor.", { x: 375, y: headerY, size: 9, font: fontBold });
    p.drawText("Desfase", { x: 425, y: headerY, size: 9, font: fontBold });
    p.drawText("Estado", { x: 480, y: headerY, size: 9, font: fontBold });
    p.drawText("H. Ordinarias", { x: 540, y: headerY, size: 9, font: fontBold });
    p.drawText("H. Extraord.", { x: 615, y: headerY, size: 9, font: fontBold });
    p.drawText("Sello Hash Inmutabilidad (SHA-256)", {
      x: 690,
      y: headerY,
      size: 9,
      font: fontBold,
    });

    p.drawLine({
      start: { x: 40, y: headerY - 6 },
      end: { x: 800, y: headerY - 6 },
      thickness: 1,
      color: rgb(0.5, 0.5, 0.7),
    });
  };

  drawHeader(page, 1);
  let currentY = 425;

  for (let i = 0; i < asientosCalculados.length; i++) {
    const reg = asientosCalculados[i];
    if (!reg.FECHA_HORA_REAL) continue;

    const fechaActual = reg.FECHA_HORA_REAL.split(" ")[0] || reg.FECHA_HORA_REAL.split("T")[0];

    if (currentY < 50) {
      page = pdfDoc.addPage([841.89, 595.28]);
      drawHeader(page, pdfDoc.getPageCount());
      currentY = 425;
    }

    let esFinDeJornada = true;
    if (i < asientosCalculados.length - 1) {
      const nextReal = asientosCalculados[i + 1].FECHA_HORA_REAL;
      if (nextReal) {
        const sigFecha = nextReal.split(" ")[0] || nextReal.split("T")[0];
        if (sigFecha === fechaActual) esFinDeJornada = false;
      }
    }

    page.drawText(reg.ID_FICHAJE || "—", { x: 40, y: currentY, size: 8, font: fontMono });
    page.drawText(formatCleanTimestamp(reg.FECHA_HORA_REAL), {
      x: 110,
      y: currentY,
      size: 8,
      font,
    });
    page.drawText(reg.TIPO_MOVIMIENTO || "—", { x: 210, y: currentY, size: 8, font: fontBold });
    page.drawText(reg.METODO || "App", { x: 320, y: currentY, size: 8, font });
    page.drawText(reg.HORA_TEORICA_IDEAL || "—", { x: 375, y: currentY, size: 8, font });

    const mins = reg.DIFERENCIA_MINUTOS ?? 0;
    const sign = mins > 0 ? "+" : "";
    page.drawText(mins !== 0 ? `${sign}${mins} min` : "0 min", {
      x: 425,
      y: currentY,
      size: 8,
      font,
    });
    page.drawText(reg.ESTADO_LEGAL || reg.ESTADO_TOLERANCIA || "Válido", {
      x: 480,
      y: currentY,
      size: 8,
      font,
    });

    if (esFinDeJornada && jornadas[fechaActual]) {
      page.drawText(`${jornadas[fechaActual].ordinarias.toFixed(2)}h`, {
        x: 540,
        y: currentY,
        size: 8,
        font: fontBold,
      });
      page.drawText(`${jornadas[fechaActual].extraordinarias.toFixed(2)}h`, {
        x: 615,
        y: currentY,
        size: 8,
        font: fontBold,
        color: jornadas[fechaActual].extraordinarias > 0 ? rgb(0.7, 0.1, 0.1) : rgb(0, 0, 0),
      });
    } else {
      page.drawText("—", { x: 540, y: currentY, size: 8, font, color: rgb(0.6, 0.6, 0.6) });
      page.drawText("—", { x: 615, y: currentY, size: 8, font, color: rgb(0.6, 0.6, 0.6) });
    }

    const hashTxt =
      reg.HASH_INMUTABILIDAD && reg.HASH_INMUTABILIDAD !== "Denegado"
        ? reg.HASH_INMUTABILIDAD
        : "Sin Sellar (Asiento Manual)";
    const hashTruncado = hashTxt.length > 16 ? `${hashTxt.substring(0, 14)}...` : hashTxt;
    page.drawText(hashTruncado, {
      x: 690,
      y: currentY,
      size: 7,
      font: fontMono,
      color: hashTxt.startsWith("Sin Sellar") ? rgb(0.6, 0.2, 0.2) : rgb(0.1, 0.4, 0.2),
    });

    page.drawLine({
      start: { x: 40, y: currentY - 4 },
      end: { x: 800, y: currentY - 4 },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    currentY -= 16;
  }

  return pdfDoc.save();
}

async function mergeAuditPdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  if (parts.length === 0) {
    throw new Error("No hay PDFs para combinar.");
  }
  if (parts.length === 1) {
    return parts[0];
  }

  const merged = await PDFDocument.create();
  for (const part of parts) {
    const doc = await PDFDocument.load(part);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return merged.save();
}

async function archiveAuditPdfToDocumentos(
  supabase: SupabaseClient,
  params: {
    idProfesor: string;
    idCentro: string | null;
    creadoPor: string | null;
    pdfBytes: Uint8Array;
  },
): Promise<void> {
  const { data: profRow, error: profErr } = await supabase
    .from("PROFESOR")
    .select("ID_CLIENTE")
    .eq("ID_PROFESOR", params.idProfesor)
    .maybeSingle();

  if (profErr || !profRow?.ID_CLIENTE) {
    throw new Error("No se pudo resolver ID_CLIENTE del profesor para archivar el documento.");
  }

  const tenantId = profRow.ID_CLIENTE as string;
  const storagePath = `${tenantId}/original_${crypto.randomUUID()}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from(DOCUMENTOS_BUCKET)
    .upload(storagePath, params.pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadErr) {
    throw new Error(`Error al subir PDF a documentos: ${uploadErr.message}`);
  }

  const { data: urlData } = supabase.storage.from(DOCUMENTOS_BUCKET).getPublicUrl(storagePath);

  const { error: insertErr } = await supabase.from("DOCUMENTOS_LEGALES_V2").insert({
    ID_CLIENTE: tenantId,
    ID_PROFESOR: params.idProfesor,
    ID_CENTRO: params.idCentro,
    CATEGORIA: AUDITORIA_CATEGORIA,
    URL_ORIGINAL: urlData.publicUrl,
    REQUIERE_FIRMA: false,
    CREADO_POR: params.creadoPor,
  });

  if (insertErr) {
    throw new Error(`Error al registrar documento legal: ${insertErr.message}`);
  }
}

export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const body = await req.json();
      const payloads = parseAuditPayloads(body);

      const {
        data: { user },
      } = await ctx.supabase.auth.getUser();

      const professorPdfs: Uint8Array[] = [];
      for (const payload of payloads) {
        const pdfBytes = await generateProfessorAuditPdf(payload);
        const idCentro = payload.registros.find((r) => r.ID_CENTRO)?.ID_CENTRO ?? null;
        await archiveAuditPdfToDocumentos(ctx.supabase, {
          idProfesor: payload.idProfesor,
          idCentro,
          creadoPor: user?.email ?? null,
          pdfBytes,
        });
        professorPdfs.push(pdfBytes);
      }

      const responsePdf = await mergeAuditPdfs(professorPdfs);

      return new Response(responsePdf, {
        headers: { ...corsHeaders, "Content-Type": "application/pdf" },
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
