import { jsPDF } from "jspdf";
import type { MatriculaPdfTextoLegal } from "@/lib/matriculaTextosLabels";

export type MatriculaPdfInput = {
  logoUrl?: string | null;
  nombreEscuela?: string | null;
  cif?: string | null;
  direccionEscuela?: string | null;
  nombreCentro?: string | null;
  nombreAlumno?: string | null;
  dniAlumno?: string | null;
  email?: string | null;
  tlfAlumno?: string | null;
  tlfComunicacion?: string | null;
  nacimiento?: string | null;
  direccion?: string | null;
  cp?: string | null;
  municipio?: string | null;
  provincia?: string | null;
  nombreMadre?: string | null;
  tlfMadre?: string | null;
  nombrePadre?: string | null;
  tlfPadre?: string | null;
  nombreCurso?: string | null;
  especialidades?: string | null;
  observaciones?: string | null;
  metodoPago?: string | null;
  iban?: string | null;
  titularCuenta?: string | null;
  tlfBizum?: string | null;
  nombreFirmante?: string | null;
  dniFirmante?: string | null;
  token?: string | null;
  fechaFirma?: string | null;
  ipDireccion?: string | null;
  userAgent?: string | null;
  hashEvidencia?: string | null;
  autorizaciones?: string[];
  textosLegales?: MatriculaPdfTextoLegal[];
};

const PAGE_MARGIN_MM = 16;
const LOGO_MAX_W_MM = 28;
const LOGO_MAX_H_MM = 22;
const PAGE_BOTTOM_MM = 268;
const BODY_FONT_SIZE = 10;
const SECTION_FONT_SIZE = 12;
const TITLE_FONT_SIZE = 14;
const SUBTITLE_FONT_SIZE = 11;
const META_FONT_SIZE = 9;
const TECH_FONT_SIZE = 8;
const LINE_HEIGHT = 5;
const SECTION_GAP = 4;
const ROW_GAP = 1.5;
const LABEL_COL_WIDTH = 46;
const BRAND_BLUE = { r: 33, g: 72, b: 124 };
const LEGAL_BODY_FONT_SIZE = 9;
const LEGAL_SUBHEADING_FONT_SIZE = 9.5;
const LEGAL_LINE_HEIGHT = 4.3;
const LEGAL_PARAGRAPH_GAP = 2.5;
const LEGAL_BLOCK_GAP = 8;
const LIST_INDENT_MM = 4;

type PdfContext = {
  doc: jsPDF;
  contentWidth: number;
  y: number;
};

type LegalAnnexContext = PdfContext & {
  nombreEscuela: string;
};

type LogoImage = {
  dataUrl: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
};

function hasValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function displayValue(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function formatFechaFirma(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFechaNacimiento(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.trim();
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function sanitizeFilenameSegment(name: string): string {
  const normalized = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
  return normalized || "Alumno";
}

async function loadLogoForPdf(url: string | null | undefined): Promise<LogoImage | null> {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  try {
    const response = await fetch(trimmed);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Logo load failed"));
        img.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(image, 0, 0);

      const dataUrl = canvas.toDataURL("image/png");
      const isJpeg = trimmed.toLowerCase().includes(".jpg") || trimmed.toLowerCase().includes(".jpeg");
      return {
        dataUrl,
        format: isJpeg ? "JPEG" : "PNG",
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

function ensureSpace(ctx: PdfContext, needed = 12): number {
  if (ctx.y + needed <= PAGE_BOTTOM_MM) return ctx.y;
  ctx.doc.addPage();
  return PAGE_MARGIN_MM;
}

function addWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight = LINE_HEIGHT,
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function isMostlyUppercase(line: string): boolean {
  const letters = line.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, "");
  if (letters.length < 12) return false;
  const upperCount = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
  return upperCount / letters.length >= 0.85;
}

function isListItem(line: string): boolean {
  const trimmed = line.trim();
  return /^[a-z]\)\s/i.test(trimmed) || /^[0-9]+[.)]\s/.test(trimmed);
}

function drawAnnexMiniHeader(ctx: PdfContext, nombreEscuela: string): number {
  const { doc, contentWidth } = ctx;
  const rightX = PAGE_MARGIN_MM + contentWidth;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 130, 145);
  doc.text(displayValue(nombreEscuela), PAGE_MARGIN_MM, ctx.y);
  doc.text("Anexo legal", rightX, ctx.y, { align: "right" });

  const lineY = ctx.y + 3;
  doc.setDrawColor(220, 225, 232);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN_MM, lineY, PAGE_MARGIN_MM + contentWidth, lineY);

  return lineY + 4;
}

function ensureLegalSpace(ctx: LegalAnnexContext, needed = 12): number {
  if (ctx.y + needed <= PAGE_BOTTOM_MM) return ctx.y;
  ctx.doc.addPage();
  ctx.y = PAGE_MARGIN_MM;
  ctx.y = drawAnnexMiniHeader(ctx, ctx.nombreEscuela);
  return ctx.y;
}

function drawLegalBlockTitle(ctx: LegalAnnexContext, title: string): number {
  ctx.y = ensureLegalSpace(ctx, 10);
  const barX = PAGE_MARGIN_MM;
  const barY = ctx.y - 3.5;
  const barW = 1;
  const barH = 4.5;

  ctx.doc.setFillColor(BRAND_BLUE.r, BRAND_BLUE.g, BRAND_BLUE.b);
  ctx.doc.rect(barX, barY, barW, barH, "F");

  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(SUBTITLE_FONT_SIZE);
  ctx.doc.setTextColor(BRAND_BLUE.r, BRAND_BLUE.g, BRAND_BLUE.b);
  ctx.doc.text(title, barX + barW + 2, ctx.y);

  return ctx.y + LINE_HEIGHT + 1;
}

function addLegalBodyText(ctx: LegalAnnexContext, text: string, x: number, maxWidth: number): number {
  const paragraphs = text.split(/\n/);
  let y = ctx.y;

  for (let index = 0; index < paragraphs.length; index++) {
    const trimmed = paragraphs[index].trim();
    if (!trimmed) {
      y += LEGAL_PARAGRAPH_GAP;
      continue;
    }

    const isSubheading = isMostlyUppercase(trimmed);
    const isList = isListItem(trimmed);
    const fontSize = isSubheading ? LEGAL_SUBHEADING_FONT_SIZE : LEGAL_BODY_FONT_SIZE;
    const lineHeight = isSubheading ? 4.6 : LEGAL_LINE_HEIGHT;
    const textX = isList ? x + LIST_INDENT_MM : x;
    const textWidth = isList ? maxWidth - LIST_INDENT_MM : maxWidth;

    ctx.doc.setFont("helvetica", isSubheading ? "bold" : "normal");
    ctx.doc.setFontSize(fontSize);
    ctx.doc.setTextColor(
      isSubheading ? 30 : 71,
      isSubheading ? 41 : 85,
      isSubheading ? 59 : 105,
    );

    const lines = ctx.doc.splitTextToSize(trimmed, textWidth) as string[];
    for (const line of lines) {
      if (y + lineHeight > PAGE_BOTTOM_MM) {
        ctx.doc.addPage();
        y = PAGE_MARGIN_MM;
        y = drawAnnexMiniHeader({ ...ctx, y }, ctx.nombreEscuela);
        ctx.doc.setFont("helvetica", isSubheading ? "bold" : "normal");
        ctx.doc.setFontSize(fontSize);
        ctx.doc.setTextColor(
          isSubheading ? 30 : 71,
          isSubheading ? 41 : 85,
          isSubheading ? 59 : 105,
        );
      }
      ctx.doc.text(line, textX, y);
      y += lineHeight;
    }

    if (isSubheading) {
      y += 1;
    } else if (index < paragraphs.length - 1) {
      y += 0.8;
    }
  }

  ctx.y = y;
  return y;
}

function startAnnexOnPageTwo(ctx: PdfContext): void {
  ctx.doc.addPage();
  ctx.y = PAGE_MARGIN_MM;
}

function drawSeparator(ctx: PdfContext): number {
  ctx.y = ensureSpace(ctx, 6);
  ctx.doc.setDrawColor(210, 214, 220);
  ctx.doc.setLineWidth(0.2);
  ctx.doc.line(PAGE_MARGIN_MM, ctx.y, PAGE_MARGIN_MM + ctx.contentWidth, ctx.y);
  return ctx.y + SECTION_GAP;
}

function drawSectionTitle(ctx: PdfContext, title: string): number {
  ctx.y = ensureSpace(ctx, 10);
  const barX = PAGE_MARGIN_MM;
  const barY = ctx.y - 3.8;
  const barW = 1.2;
  const barH = 5;

  ctx.doc.setFillColor(BRAND_BLUE.r, BRAND_BLUE.g, BRAND_BLUE.b);
  ctx.doc.rect(barX, barY, barW, barH, "F");

  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.setFontSize(SECTION_FONT_SIZE);
  ctx.doc.setTextColor(BRAND_BLUE.r, BRAND_BLUE.g, BRAND_BLUE.b);
  ctx.doc.text(title, barX + barW + 2.5, ctx.y);

  return ctx.y + LINE_HEIGHT + 2;
}

function drawLabelValue(
  ctx: PdfContext,
  label: string,
  value: string | null | undefined,
  options?: { omitIfEmpty?: boolean; multiline?: boolean; variant?: "normal" | "technical" },
): number {
  const trimmed = value?.trim();
  if (options?.omitIfEmpty && !trimmed) return ctx.y;

  const isTechnical = options?.variant === "technical";
  const fontSize = isTechnical ? TECH_FONT_SIZE : BODY_FONT_SIZE;
  const lineHeight = isTechnical ? 3.8 : LINE_HEIGHT;
  const labelRgb = isTechnical ? [120, 130, 145] : [71, 85, 105];
  const valueRgb = isTechnical ? [100, 116, 139] : [30, 41, 59];

  ctx.y = ensureSpace(ctx, options?.multiline ? 14 : isTechnical ? 6 : 7);

  const valueX = PAGE_MARGIN_MM + LABEL_COL_WIDTH;
  const valueWidth = ctx.contentWidth - LABEL_COL_WIDTH;

  ctx.doc.setFontSize(fontSize);
  ctx.doc.setTextColor(labelRgb[0], labelRgb[1], labelRgb[2]);
  ctx.doc.setFont("helvetica", "bold");
  ctx.doc.text(`${label}:`, PAGE_MARGIN_MM, ctx.y);

  ctx.doc.setFont("helvetica", "normal");
  ctx.doc.setTextColor(valueRgb[0], valueRgb[1], valueRgb[2]);
  const text = displayValue(trimmed);
  if (options?.multiline) {
    ctx.y = addWrappedText(ctx.doc, text, valueX, ctx.y, valueWidth, lineHeight);
  } else {
    ctx.doc.text(text, valueX, ctx.y);
    ctx.y += lineHeight;
  }

  return ctx.y + (isTechnical ? 1 : ROW_GAP);
}

function drawHeader(ctx: PdfContext, input: MatriculaPdfInput, logo: LogoImage | null): number {
  const { doc, contentWidth } = ctx;
  const rightX = PAGE_MARGIN_MM + contentWidth;
  let headerTop = PAGE_MARGIN_MM;
  let headerBottom = headerTop + 18;

  if (logo) {
    let logoW = LOGO_MAX_W_MM;
    let logoH = (logo.height / logo.width) * logoW;
    if (logoH > LOGO_MAX_H_MM) {
      logoH = LOGO_MAX_H_MM;
      logoW = (logo.width / logo.height) * logoH;
    }
    doc.addImage(logo.dataUrl, logo.format, PAGE_MARGIN_MM, headerTop, logoW, logoH);
    headerBottom = Math.max(headerBottom, headerTop + logoH);
  }

  let textY = headerTop + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(TITLE_FONT_SIZE);
  doc.setTextColor(BRAND_BLUE.r, BRAND_BLUE.g, BRAND_BLUE.b);
  doc.text("Solicitud de matrícula", rightX, textY, { align: "right" });
  textY += 6;

  doc.setFontSize(SUBTITLE_FONT_SIZE);
  doc.setTextColor(30, 41, 59);
  doc.text(displayValue(input.nombreEscuela), rightX, textY, { align: "right" });
  textY += 5;

  if (hasValue(input.nombreCentro)) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    doc.text(input.nombreCentro?.trim() ?? "", rightX, textY, { align: "right" });
    textY += 4.5;
  }

  const metaParts = [
    hasValue(input.cif) ? `CIF: ${input.cif?.trim()}` : null,
    hasValue(input.direccionEscuela) ? input.direccionEscuela?.trim() ?? null : null,
  ].filter(Boolean);

  if (metaParts.length > 0) {
    doc.setFontSize(META_FONT_SIZE);
    doc.setTextColor(100, 116, 139);
    const metaLines = doc.splitTextToSize(metaParts.join(" · "), contentWidth * 0.55);
    for (const line of metaLines) {
      doc.text(line, rightX, textY, { align: "right" });
      textY += 4;
    }
  }

  headerBottom = Math.max(headerBottom, textY);
  let y = headerBottom + 4;

  doc.setDrawColor(BRAND_BLUE.r, BRAND_BLUE.g, BRAND_BLUE.b);
  doc.setLineWidth(0.6);
  doc.line(PAGE_MARGIN_MM, y, PAGE_MARGIN_MM + contentWidth, y);

  return y + SECTION_GAP + 2;
}

function drawAlumnoSection(ctx: PdfContext, input: MatriculaPdfInput): number {
  const sectionCtx = { ...ctx };
  sectionCtx.y = drawSectionTitle(sectionCtx, "Datos del alumno");

  sectionCtx.y = drawLabelValue(sectionCtx, "Nombre", input.nombreAlumno);
  sectionCtx.y = drawLabelValue(sectionCtx, "DNI", input.dniAlumno, { omitIfEmpty: true });
  sectionCtx.y = drawLabelValue(sectionCtx, "Fecha de nacimiento", formatFechaNacimiento(input.nacimiento), {
    omitIfEmpty: true,
  });
  sectionCtx.y = drawLabelValue(sectionCtx, "Email", input.email, { omitIfEmpty: true });
  sectionCtx.y = drawLabelValue(sectionCtx, "Teléfono alumno", input.tlfAlumno, { omitIfEmpty: true });
  sectionCtx.y = drawLabelValue(sectionCtx, "Teléfono comunicación", input.tlfComunicacion, {
    omitIfEmpty: true,
  });

  const domicilioParts = [
    input.direccion?.trim(),
    [input.cp?.trim(), input.municipio?.trim()].filter(Boolean).join(" "),
    input.provincia?.trim(),
  ].filter(Boolean);

  if (domicilioParts.length > 0) {
    sectionCtx.y = drawLabelValue(sectionCtx, "Domicilio", domicilioParts.join(", "), {
      multiline: true,
    });
  }

  return drawSeparator(sectionCtx);
}

function drawTutoresSection(ctx: PdfContext, input: MatriculaPdfInput): number {
  const hasTutores =
    hasValue(input.nombreMadre) ||
    hasValue(input.tlfMadre) ||
    hasValue(input.nombrePadre) ||
    hasValue(input.tlfPadre);

  if (!hasTutores) return ctx.y;

  const sectionCtx = { ...ctx };
  sectionCtx.y = drawSectionTitle(sectionCtx, "Tutores / contacto");

  if (hasValue(input.nombreMadre) || hasValue(input.tlfMadre)) {
    sectionCtx.y = drawLabelValue(sectionCtx, "Tutor A", input.nombreMadre, { omitIfEmpty: true });
    sectionCtx.y = drawLabelValue(sectionCtx, "Teléfono tutor A", input.tlfMadre, { omitIfEmpty: true });
  }

  if (hasValue(input.nombrePadre) || hasValue(input.tlfPadre)) {
    sectionCtx.y = drawLabelValue(sectionCtx, "Tutor B", input.nombrePadre, { omitIfEmpty: true });
    sectionCtx.y = drawLabelValue(sectionCtx, "Teléfono tutor B", input.tlfPadre, { omitIfEmpty: true });
  }

  return drawSeparator(sectionCtx);
}

function drawAcademicSection(ctx: PdfContext, input: MatriculaPdfInput): number {
  const hasAcademic =
    hasValue(input.nombreCurso) ||
    hasValue(input.especialidades) ||
    hasValue(input.observaciones);

  if (!hasAcademic) return ctx.y;

  const sectionCtx = { ...ctx };
  sectionCtx.y = drawSectionTitle(sectionCtx, "Datos académicos");
  sectionCtx.y = drawLabelValue(sectionCtx, "Curso escolar", input.nombreCurso, { omitIfEmpty: true });
  sectionCtx.y = drawLabelValue(sectionCtx, "Especialidades", input.especialidades, {
    omitIfEmpty: true,
  });
  sectionCtx.y = drawLabelValue(sectionCtx, "Observaciones / horarios", input.observaciones, {
    omitIfEmpty: true,
    multiline: true,
  });

  return drawSeparator(sectionCtx);
}

function drawPagoSection(ctx: PdfContext, input: MatriculaPdfInput): number {
  const sectionCtx = { ...ctx };
  sectionCtx.y = drawSectionTitle(sectionCtx, "Forma de pago");
  sectionCtx.y = drawLabelValue(sectionCtx, "Método de pago", input.metodoPago);
  sectionCtx.y = drawLabelValue(sectionCtx, "IBAN", input.iban, { omitIfEmpty: true });
  sectionCtx.y = drawLabelValue(sectionCtx, "Titular cuenta", input.titularCuenta, { omitIfEmpty: true });
  sectionCtx.y = drawLabelValue(sectionCtx, "Teléfono Bizum", input.tlfBizum, { omitIfEmpty: true });

  return drawSeparator(sectionCtx);
}

function drawFirmaSection(ctx: PdfContext, input: MatriculaPdfInput): number {
  const sectionCtx = { ...ctx };
  sectionCtx.y = drawSectionTitle(sectionCtx, "Firma digital");
  sectionCtx.y = drawLabelValue(sectionCtx, "Firmante", input.nombreFirmante);
  sectionCtx.y = drawLabelValue(sectionCtx, "DNI firmante", input.dniFirmante);
  sectionCtx.y = drawLabelValue(sectionCtx, "Fecha", formatFechaFirma(input.fechaFirma));
  sectionCtx.y = drawLabelValue(sectionCtx, "Referencia", input.token, { omitIfEmpty: true });
  sectionCtx.y = drawLabelValue(sectionCtx, "IP", input.ipDireccion, {
    omitIfEmpty: true,
    variant: "technical",
  });
  sectionCtx.y = drawLabelValue(sectionCtx, "Navegador/dispositivo", input.userAgent, {
    omitIfEmpty: true,
    multiline: true,
    variant: "technical",
  });
  sectionCtx.y = drawLabelValue(sectionCtx, "Huella evidencia", input.hashEvidencia, {
    omitIfEmpty: true,
    multiline: true,
    variant: "technical",
  });

  return drawSeparator(sectionCtx);
}

function drawAutorizacionesSection(ctx: PdfContext, autorizaciones: string[]): number {
  if (!autorizaciones.length) return ctx.y;

  let y = drawSectionTitle(ctx, "Autorizaciones aceptadas");
  const sectionCtx = { ...ctx, y };
  const textX = PAGE_MARGIN_MM + 5;
  const textWidth = sectionCtx.contentWidth - 5;

  for (const item of autorizaciones) {
    sectionCtx.y = ensureSpace(sectionCtx, 6);
    sectionCtx.doc.setFillColor(BRAND_BLUE.r, BRAND_BLUE.g, BRAND_BLUE.b);
    sectionCtx.doc.circle(PAGE_MARGIN_MM + 1.5, sectionCtx.y - 1.2, 0.7, "F");
    sectionCtx.doc.setFont("helvetica", "normal");
    sectionCtx.doc.setFontSize(BODY_FONT_SIZE);
    sectionCtx.doc.setTextColor(30, 41, 59);
    y = addWrappedText(sectionCtx.doc, item, textX, sectionCtx.y, textWidth);
    sectionCtx.y = y + ROW_GAP;
  }

  return drawSeparator({ ...ctx, y: sectionCtx.y });
}

function drawTextosLegalesSection(
  ctx: PdfContext,
  textosLegales: MatriculaPdfTextoLegal[],
  nombreEscuela?: string | null,
): number {
  if (!textosLegales.length) return ctx.y;

  startAnnexOnPageTwo(ctx);

  const annexCtx: LegalAnnexContext = {
    ...ctx,
    nombreEscuela: nombreEscuela?.trim() || "Escuela",
  };

  annexCtx.y = drawSectionTitle(annexCtx, "Anexo — Textos legales");

  for (const texto of textosLegales) {
    if (!texto.cuerpo?.trim()) continue;

    annexCtx.y += 2;
    annexCtx.y = drawLegalBlockTitle(annexCtx, texto.titulo);
    annexCtx.y += 2;
    annexCtx.y = addLegalBodyText(annexCtx, texto.cuerpo, PAGE_MARGIN_MM, annexCtx.contentWidth);
    annexCtx.y += LEGAL_BLOCK_GAP;
  }

  return annexCtx.y;
}

export function matriculaPdfFilename(input: MatriculaPdfInput): string {
  return `Matricula_${sanitizeFilenameSegment(input.nombreAlumno ?? "Alumno")}.pdf`;
}

async function buildMatriculaPdfDocument(input: MatriculaPdfInput): Promise<jsPDF> {
  const logo = await loadLogoForPdf(input.logoUrl);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN_MM * 2;

  const ctx: PdfContext = {
    doc,
    contentWidth,
    y: PAGE_MARGIN_MM,
  };

  ctx.y = drawHeader(ctx, input, logo);
  ctx.y = drawAlumnoSection(ctx, input);
  ctx.y = drawTutoresSection(ctx, input);
  ctx.y = drawAcademicSection(ctx, input);
  ctx.y = drawPagoSection(ctx, input);
  ctx.y = drawFirmaSection(ctx, input);
  ctx.y = drawAutorizacionesSection(ctx, input.autorizaciones ?? []);
  drawTextosLegalesSection(
    ctx,
    input.textosLegales?.filter((texto) => texto.cuerpo?.trim()) ?? [],
    input.nombreEscuela,
  );

  return doc;
}

export async function generateMatriculaPdfBuffer(input: MatriculaPdfInput): Promise<Uint8Array> {
  const doc = await buildMatriculaPdfDocument(input);
  return new Uint8Array(doc.output("arraybuffer"));
}

export async function writeMatriculaPdfToPath(
  input: MatriculaPdfInput,
  filePath: string,
): Promise<void> {
  const buffer = await generateMatriculaPdfBuffer(input);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filePath, buffer);
}

export async function downloadMatriculaPdf(input: MatriculaPdfInput): Promise<void> {
  const doc = await buildMatriculaPdfDocument(input);
  doc.save(matriculaPdfFilename(input));
}

export async function computeMatriculaHashEvidence(payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
