import { jsPDF } from "jspdf";

/** Flat camelCase payload consumed by the PDF renderer. */
export type SepaPdfInput = {
  nombreEscuela?: string | null;
  cif?: string | null;
  direccionEscuela?: string | null;
  nombreCentro?: string | null;
  nombreAlumno?: string | null;
  titularCuenta?: string | null;
  iban?: string | null;
  token?: string | null;
  fechaFirma?: string | null;
  ipDireccion?: string | null;
  userAgent?: string | null;
  identificadorAcreedor?: string | null;
  hashEvidencia?: string | null;
};

type MandatoSepaAlumnoRow = {
  NOMBRE_ALUMNO?: string | null;
  IBAN?: string | null;
  TITULAR_CUENTA?: string | null;
};

type MandatoSepaClienteRow = {
  NOMBRE_ESCUELA?: string | null;
  CIF?: string | null;
  DIRECCION?: string | null;
  IDENTIFICADOR_ACREEDOR?: string | null;
};

type MandatoSepaCentroRow = {
  NOMBRE_CENTRO?: string | null;
};

export type MandatoSepaPdfSource = {
  TOKEN_PUBLICO?: string | null;
  FIRMADO_AT?: string | null;
  IP_DIRECCION?: string | null;
  USER_AGENT?: string | null;
  HASH_EVIDENCIA?: string | null;
  ALUMNOS?:
    | MandatoSepaAlumnoRow
    | MandatoSepaAlumnoRow[]
    | null;
  CLIENTES?:
    | MandatoSepaClienteRow
    | MandatoSepaClienteRow[]
    | null;
  CENTROS?:
    | MandatoSepaCentroRow
    | MandatoSepaCentroRow[]
    | null;
};

export const MANDATO_SEPA_PDF_SELECT = `
  TOKEN_PUBLICO,
  ESTADO,
  FIRMADO_AT,
  IP_DIRECCION,
  USER_AGENT,
  HASH_EVIDENCIA,
  ALUMNOS (
    NOMBRE_ALUMNO,
    IBAN,
    TITULAR_CUENTA
  ),
  CLIENTES (
    NOMBRE_ESCUELA,
    CIF,
    DIRECCION,
    IDENTIFICADOR_ACREEDOR
  ),
  CENTROS (
    NOMBRE_CENTRO
  )
` as const;

const SEPA_LEGAL_TEXT =
  "Mediante la firma de esta orden de domiciliacion, el deudor autoriza (A) al acreedor a enviar instrucciones a la entidad del deudor para adeudar su cuenta y (B) a la entidad para efectuar los adeudos conforme a las instrucciones del acreedor. Como parte de sus derechos, el deudor esta legitimado al reembolso por su entidad en los terminos y condiciones del contrato suscrito con la misma. La solicitud de reembolso debera efectuarse dentro de las ocho semanas que siguen a la fecha de adeudo en cuenta. Puede obtener informacion adicional sobre sus derechos en su entidad financiera.";

const PAGE_MARGIN_MM = 20;
const LINE_HEIGHT = 5;

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function pickString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Maps a relational MANDATOS_SEPA row into the flat PDF input shape. */
export function mapMandatoToSepaPdfInput(mandato: MandatoSepaPdfSource): SepaPdfInput {
  const alumno = unwrapRelation(mandato.ALUMNOS);
  const cliente = unwrapRelation(mandato.CLIENTES);
  const centro = unwrapRelation(mandato.CENTROS);

  return {
    nombreEscuela: pickString(cliente?.NOMBRE_ESCUELA),
    cif: pickString(cliente?.CIF),
    direccionEscuela: pickString(cliente?.DIRECCION),
    identificadorAcreedor: pickString(cliente?.IDENTIFICADOR_ACREEDOR),
    nombreCentro: pickString(centro?.NOMBRE_CENTRO),
    nombreAlumno: pickString(alumno?.NOMBRE_ALUMNO),
    titularCuenta: pickString(alumno?.TITULAR_CUENTA),
    iban: pickString(alumno?.IBAN),
    token: pickString(mandato.TOKEN_PUBLICO),
    fechaFirma: pickString(mandato.FIRMADO_AT),
    ipDireccion: pickString(mandato.IP_DIRECCION),
    userAgent: pickString(mandato.USER_AGENT),
    hashEvidencia: pickString(mandato.HASH_EVIDENCIA),
  };
}

function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "-";
}

function pdfSafeText(value: string | null | undefined): string {
  return displayValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function formatFirmadoAt(iso: string | null | undefined): string {
  if (!iso?.trim()) return "-";
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "long",
      timeStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatIbanForPdf(iban: string | null | undefined): string {
  const clean = (iban ?? "").replace(/\s/g, "").toUpperCase();
  if (!clean) return "-";
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

function writeWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const safe = pdfSafeText(text);
  const lines = doc.splitTextToSize(safe, maxWidth) as string[];
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function writeFieldBlock(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(pdfSafeText(label), x, y);
  y += LINE_HEIGHT;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  return writeWrappedText(doc, value, x, y, maxWidth, LINE_HEIGHT) + 4;
}

export function generateSepaPdf(input: SepaPdfInput): void {
  const titular =
    displayValue(input.titularCuenta) !== "-"
      ? pdfSafeText(input.titularCuenta)
      : pdfSafeText(input.nombreAlumno);
  const iban = formatIbanForPdf(input.iban);

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN_MM * 2;
  let y = PAGE_MARGIN_MM + 4;

  doc.setDrawColor(210, 210, 210);
  doc.line(PAGE_MARGIN_MM, y - 2, pageWidth - PAGE_MARGIN_MM, y - 2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("ORDEN DE DOMICILIACION DE ADEUDO DIRECTO SEPA", pageWidth / 2, y + 6, {
    align: "center",
  });
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(pdfSafeText(input.nombreEscuela), pageWidth / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text("Core Direct Debit Mandate - Single Euro Payments Area (SEPA)", pageWidth / 2, y, {
    align: "center",
  });
  doc.setTextColor(0, 0, 0);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Datos del acreedor", PAGE_MARGIN_MM, y);
  y += LINE_HEIGHT + 2;

  y = writeFieldBlock(
    doc,
    "Nombre de la escuela:",
    pdfSafeText(input.nombreEscuela),
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y = writeFieldBlock(
    doc,
    "Centro:",
    pdfSafeText(input.nombreCentro),
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y = writeFieldBlock(doc, "CIF:", pdfSafeText(input.cif), PAGE_MARGIN_MM, y, contentWidth);
  y = writeFieldBlock(
    doc,
    "Direccion:",
    pdfSafeText(input.direccionEscuela),
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y = writeFieldBlock(
    doc,
    "Identificador del Acreedor (Creditor Identifier):",
    pdfSafeText(input.identificadorAcreedor),
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Datos del deudor", PAGE_MARGIN_MM, y);
  y += LINE_HEIGHT + 2;

  y = writeFieldBlock(
    doc,
    "Alumno:",
    pdfSafeText(input.nombreAlumno),
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y = writeFieldBlock(
    doc,
    "Referencia del Mandato (Mandate Reference):",
    pdfSafeText(input.token),
    PAGE_MARGIN_MM,
    y,
    contentWidth,
  );
  y = writeFieldBlock(doc, "Titular de la cuenta (Account Holder):", titular, PAGE_MARGIN_MM, y, contentWidth);
  y = writeFieldBlock(doc, "Numero de cuenta - IBAN:", iban, PAGE_MARGIN_MM, y, contentWidth);

  y += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Autorizacion de adeudo directo SEPA", PAGE_MARGIN_MM, y);
  y += LINE_HEIGHT + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  y = writeWrappedText(doc, SEPA_LEGAL_TEXT, PAGE_MARGIN_MM, y, contentWidth, 4.5) + 6;

  const signatureLines = [
    "FIRMADO DIGITALMENTE",
    `Fecha y hora de firma: ${formatFirmadoAt(input.fechaFirma)}`,
    `Direccion IP: ${pdfSafeText(input.ipDireccion)}`,
    `Referencia de verificacion: ${pdfSafeText(input.token)}`,
  ];
  const userAgent = pdfSafeText(input.userAgent);
  const hashEvidencia = pdfSafeText(input.hashEvidencia);
  const signatureBoxHeight =
    38 + (userAgent !== "-" ? 10 : 0) + (hashEvidencia !== "-" ? 12 : 0);

  if (y + signatureBoxHeight > pageHeight - PAGE_MARGIN_MM) {
    doc.addPage();
    y = PAGE_MARGIN_MM;
  }

  doc.setDrawColor(180, 180, 180);
  doc.setFillColor(248, 249, 250);
  doc.roundedRect(PAGE_MARGIN_MM, y, contentWidth, signatureBoxHeight, 2, 2, "FD");

  let boxY = y + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(signatureLines[0], PAGE_MARGIN_MM + 4, boxY);
  boxY += LINE_HEIGHT + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const line of signatureLines.slice(1)) {
    doc.text(line, PAGE_MARGIN_MM + 4, boxY);
    boxY += LINE_HEIGHT;
  }

  if (userAgent !== "-") {
    boxY += 1;
    doc.setFont("helvetica", "bold");
    doc.text("User-Agent:", PAGE_MARGIN_MM + 4, boxY);
    boxY += LINE_HEIGHT;
    doc.setFont("helvetica", "normal");
    boxY = writeWrappedText(doc, userAgent, PAGE_MARGIN_MM + 4, boxY, contentWidth - 8, 4) + 2;
  }

  if (hashEvidencia !== "-") {
    boxY += 1;
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    boxY =
      writeWrappedText(
        doc,
        `Hash de evidencia: ${hashEvidencia}`,
        PAGE_MARGIN_MM + 4,
        boxY,
        contentWidth - 8,
        3.5,
      ) + 1;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
  }

  y += signatureBoxHeight + 8;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  writeWrappedText(
    doc,
    "Documento generado electronicamente. Este mandato se emite exclusivamente para pagos domiciliados SEPA entre residentes en la Union Europea.",
    PAGE_MARGIN_MM,
    y,
    contentWidth,
    4,
  );

  const filenameBase = titular !== "-" ? titular : pdfSafeText(input.nombreAlumno);
  const filename = `Mandato_SEPA_${filenameBase.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}

/** Accepts either a flat input or a relational MANDATOS_SEPA row. */
export function downloadRealSepaPdf(input: SepaPdfInput | MandatoSepaPdfSource): void {
  const isRelationalRow =
    "ALUMNOS" in input ||
    "CLIENTES" in input ||
    "CENTROS" in input ||
    "TOKEN_PUBLICO" in input;
  const flat = isRelationalRow
    ? mapMandatoToSepaPdfInput(input as MandatoSepaPdfSource)
    : (input as SepaPdfInput);
  generateSepaPdf(flat);
}
