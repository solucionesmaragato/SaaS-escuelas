import { jsPDF } from "jspdf";
import type { MatriculaPdfTextoLegal } from "@/lib/matriculaTextosLabels";

export type MatriculaPdfInput = {
  nombreEscuela?: string | null;
  cif?: string | null;
  direccionEscuela?: string | null;
  nombreCentro?: string | null;
  nombreAlumno?: string | null;
  nombreFirmante?: string | null;
  dniFirmante?: string | null;
  token?: string | null;
  fechaFirma?: string | null;
  ipDireccion?: string | null;
  userAgent?: string | null;
  hashEvidencia?: string | null;
  metodoPago?: string | null;
  autorizaciones?: string[];
  textosLegales?: MatriculaPdfTextoLegal[];
};

const PAGE_MARGIN_MM = 18;
const LINE_HEIGHT = 5.5;

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

function addWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * LINE_HEIGHT;
}

export function downloadMatriculaPdf(input: MatriculaPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN_MM * 2;
  let y = PAGE_MARGIN_MM;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Solicitud de matrícula online", PAGE_MARGIN_MM, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  y = addWrappedText(
    doc,
    `Escuela: ${displayValue(input.nombreEscuela)} · Centro: ${displayValue(input.nombreCentro)}`,
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y += 2;
  y = addWrappedText(
    doc,
    `CIF: ${displayValue(input.cif)} · Dirección: ${displayValue(input.direccionEscuela)}`,
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Datos del alumno", PAGE_MARGIN_MM, y);
  y += LINE_HEIGHT + 1;
  doc.setFont("helvetica", "normal");
  y = addWrappedText(doc, `Alumno: ${displayValue(input.nombreAlumno)}`, PAGE_MARGIN_MM, y, contentWidth);
  y = addWrappedText(doc, `Método de pago: ${displayValue(input.metodoPago)}`, PAGE_MARGIN_MM, y, contentWidth);
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.text("Firma digital", PAGE_MARGIN_MM, y);
  y += LINE_HEIGHT + 1;
  doc.setFont("helvetica", "normal");
  y = addWrappedText(doc, `Firmante: ${displayValue(input.nombreFirmante)}`, PAGE_MARGIN_MM, y, contentWidth);
  y = addWrappedText(doc, `DNI firmante: ${displayValue(input.dniFirmante)}`, PAGE_MARGIN_MM, y, contentWidth);
  y = addWrappedText(doc, `Fecha: ${formatFechaFirma(input.fechaFirma)}`, PAGE_MARGIN_MM, y, contentWidth);
  y = addWrappedText(doc, `Referencia: ${displayValue(input.token)}`, PAGE_MARGIN_MM, y, contentWidth);
  y = addWrappedText(doc, `IP: ${displayValue(input.ipDireccion)}`, PAGE_MARGIN_MM, y, contentWidth);
  y = addWrappedText(
    doc,
    `Navegador/dispositivo: ${displayValue(input.userAgent)}`,
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y = addWrappedText(
    doc,
    `Huella evidencia: ${displayValue(input.hashEvidencia)}`,
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y += 4;

  if (input.autorizaciones?.length) {
    doc.setFont("helvetica", "bold");
    doc.text("Autorizaciones aceptadas", PAGE_MARGIN_MM, y);
    y += LINE_HEIGHT + 1;
    doc.setFont("helvetica", "normal");
    for (const item of input.autorizaciones) {
      if (y > 270) {
        doc.addPage();
        y = PAGE_MARGIN_MM;
      }
      y = addWrappedText(doc, `• ${item}`, PAGE_MARGIN_MM, y, contentWidth);
    }
  }

  const textosLegales = input.textosLegales?.filter((texto) => texto.cuerpo?.trim()) ?? [];
  if (textosLegales.length) {
    y += 4;
    if (y > 270) {
      doc.addPage();
      y = PAGE_MARGIN_MM;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Anexo — Textos legales", PAGE_MARGIN_MM, y);
    y += LINE_HEIGHT + 2;
    doc.setFontSize(11);

    for (const texto of textosLegales) {
      if (y > 270) {
        doc.addPage();
        y = PAGE_MARGIN_MM;
      }
      doc.setFont("helvetica", "bold");
      y = addWrappedText(doc, texto.titulo, PAGE_MARGIN_MM, y, contentWidth);
      y += 1;
      doc.setFont("helvetica", "normal");
      y = addWrappedText(doc, texto.cuerpo, PAGE_MARGIN_MM, y, contentWidth);
      y += 4;
    }
  }

  const filename = `Matricula_${sanitizeFilenameSegment(input.nombreAlumno ?? "Alumno")}.pdf`;
  doc.save(filename);
}

export async function computeMatriculaHashEvidence(payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
