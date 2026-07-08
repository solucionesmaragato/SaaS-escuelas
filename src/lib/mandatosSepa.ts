import { supabase } from "@/integrations/supabase/client";

export type MandatoSepaStatus = "pendiente" | "firmado" | "revocado";

export type MandatoSepaRow = {
  TOKEN_PUBLICO: string;
  ESTADO: string | null;
  FIRMADO_AT: string | null;
  created_at: string | null;
  PDF_URL: string | null;
};

export type MandatoSepaListResult = {
  mandatos: MandatoSepaRow[];
  /** Latest mandate row (newest `created_at`). */
  current: MandatoSepaRow | null;
  /** Older mandates excluding the current one. */
  history: MandatoSepaRow[];
};

export function mandatoSepaQueryKey(alumnoId: string) {
  return ["mandatoSepa", alumnoId] as const;
}

export function parseMandatoSepaStatus(estado: string | null | undefined): MandatoSepaStatus {
  const normalized = estado?.trim().toLowerCase() ?? "";
  if (normalized === "firmado") return "firmado";
  if (normalized === "revocado") return "revocado";
  return "pendiente";
}

export function buildMandatoSepaListResult(mandatos: MandatoSepaRow[]): MandatoSepaListResult {
  return {
    mandatos,
    current: mandatos[0] ?? null,
    history: mandatos.slice(1),
  };
}

export function buildSepaMandateSignLink(token: string): string {
  return `${window.location.origin}/firmar-sepa?token=${encodeURIComponent(token)}`;
}

export async function fetchMandatosSepaByAlumnoId(alumnoId: string): Promise<MandatoSepaRow[]> {
  const { data, error } = await supabase
    .from("MANDATOS_SEPA")
    .select("TOKEN_PUBLICO, ESTADO, FIRMADO_AT, created_at, PDF_URL")
    .eq("ID_ALUMNO", alumnoId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as MandatoSepaRow[];
}

export async function fetchMandatoSepaByAlumnoId(
  alumnoId: string,
): Promise<MandatoSepaRow | null> {
  const mandatos = await fetchMandatosSepaByAlumnoId(alumnoId);
  return mandatos[0] ?? null;
}

export async function fetchMandatoSepaListByAlumnoId(
  alumnoId: string,
): Promise<MandatoSepaListResult> {
  const mandatos = await fetchMandatosSepaByAlumnoId(alumnoId);
  return buildMandatoSepaListResult(mandatos);
}

export function generateSepaPublicToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function ensureMandatoSepaForAlumno(
  alumnoId: string,
  idCliente: string,
  idCentro?: string | null,
): Promise<MandatoSepaRow> {
  const existing = await fetchMandatoSepaByAlumnoId(alumnoId);
  if (existing?.TOKEN_PUBLICO) return existing;

  const token = generateSepaPublicToken();
  const { data, error } = await supabase
    .from("MANDATOS_SEPA")
    .insert({
      ID_ALUMNO: alumnoId,
      ID_CLIENTE: idCliente,
      ID_CENTRO: idCentro ?? null,
      TOKEN_PUBLICO: token,
      ESTADO: "pendiente",
    })
    .select("TOKEN_PUBLICO, ESTADO, FIRMADO_AT")
    .single();

  if (error) throw error;
  return data as MandatoSepaRow;
}

function sanitizeSepaPdfFilenameSegment(name: string): string {
  const normalized = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
  return normalized || "Alumno";
}

export function triggerMockSepaPdfDownload(alumnoNombre?: string) {
  const filename = alumnoNombre
    ? `Mandato_SEPA_${sanitizeSepaPdfFilenameSegment(alumnoNombre)}.pdf`
    : "Mandato_SEPA.pdf";
  const blob = new Blob(["Mock SEPA mandate PDF — demo export"], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
