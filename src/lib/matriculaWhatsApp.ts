import { formatWhatsAppNumber } from "@/components/ui/ContactQuickActions";
import { supabase } from "@/integrations/supabase/client";
import { buildMatriculaSignLink } from "@/lib/solicitudMatricula";

export type CrearSolicitudMatriculaDesdeLeadResult = {
  ok: boolean;
  token_publico?: string;
  id_alumno?: string;
  id_solicitud?: string;
  reused?: boolean;
  expira_at?: string | null;
  error?: string;
};

export type CrearSolicitudMatriculaDesdeAlumnoResult = CrearSolicitudMatriculaDesdeLeadResult;

export type CrearSolicitudMatriculaDesdeCeroResult = CrearSolicitudMatriculaDesdeLeadResult;

export type SolicitudMatriculaStatus = {
  hasPending: boolean;
  hasFirmada: boolean;
  tokenPublico: string | null;
};

export type LeadSolicitudMatriculaStatus = SolicitudMatriculaStatus;

export type AlumnoSolicitudMatriculaStatus = SolicitudMatriculaStatus;

export type MatriculaWhatsAppMessageParams = {
  nombreContacto?: string | null;
  nombreAlumno?: string | null;
  url: string;
};

export function buildMatriculaWhatsAppUrl(
  phone: string,
  params: MatriculaWhatsAppMessageParams,
): string {
  const contacto = params.nombreContacto?.trim() || "familia";
  const alumno = params.nombreAlumno?.trim() || "el alumno";
  const message = `Hola ${contacto}, complete la matrícula de ${alumno} aquí: ${params.url}`;
  return `https://wa.me/${formatWhatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}

export async function crearSolicitudMatriculaDesdeLead(
  idLead: string,
): Promise<CrearSolicitudMatriculaDesdeLeadResult> {
  const { data, error } = await supabase.rpc("crear_solicitud_matricula_desde_lead", {
    p_id_lead: idLead,
  });
  if (error) throw error;
  return data as CrearSolicitudMatriculaDesdeLeadResult;
}

export async function crearSolicitudMatriculaDesdeAlumno(
  idAlumno: string,
): Promise<CrearSolicitudMatriculaDesdeAlumnoResult> {
  const { data, error } = await supabase.rpc("crear_solicitud_matricula_desde_alumno", {
    p_id_alumno: idAlumno,
  });
  if (error) throw error;
  return data as CrearSolicitudMatriculaDesdeAlumnoResult;
}

export async function crearSolicitudMatriculaDesdeCero(params: {
  idCliente: string;
  idCentro: string;
  idCurso?: string | null;
}): Promise<CrearSolicitudMatriculaDesdeCeroResult> {
  const { data, error } = await supabase.rpc("crear_solicitud_matricula_desde_cero", {
    p_id_cliente: params.idCliente,
    p_id_centro: params.idCentro,
    p_id_curso: params.idCurso?.trim() || null,
  });
  if (error) throw error;
  return data as CrearSolicitudMatriculaDesdeCeroResult;
}

function resolveMatriculaNombreContacto(
  nombreMadre?: string | null,
  nombrePadre?: string | null,
  nombreContacto?: string | null,
): string | null {
  return nombreMadre?.trim() || nombrePadre?.trim() || nombreContacto?.trim() || null;
}

export async function fetchLeadSolicitudMatriculaStatus(
  idLead: string,
): Promise<LeadSolicitudMatriculaStatus> {
  const { data, error } = await supabase
    .from("SOLICITUDES_MATRICULA")
    .select("ESTADO, TOKEN_PUBLICO, EXPIRA_AT")
    .eq("ID_LEAD", idLead)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return parseSolicitudMatriculaStatusRows(data ?? []);
}

export async function fetchAlumnoSolicitudMatriculaStatus(
  idAlumno: string,
): Promise<AlumnoSolicitudMatriculaStatus> {
  const { data, error } = await supabase
    .from("SOLICITUDES_MATRICULA")
    .select("ESTADO, TOKEN_PUBLICO, EXPIRA_AT")
    .eq("ID_ALUMNO", idAlumno)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return parseSolicitudMatriculaStatusRows(data ?? []);
}

function parseSolicitudMatriculaStatusRows(
  rows: Array<{ ESTADO: string; TOKEN_PUBLICO: string; EXPIRA_AT: string | null }>,
): SolicitudMatriculaStatus {
  const now = Date.now();
  const pendingRow = rows.find((row) => {
    if (row.ESTADO !== "pendiente") return false;
    if (!row.EXPIRA_AT) return true;
    return new Date(row.EXPIRA_AT).getTime() > now;
  });

  const firmadaRow = rows.find((row) => row.ESTADO === "firmada");

  return {
    hasPending: Boolean(pendingRow),
    hasFirmada: Boolean(firmadaRow),
    tokenPublico: pendingRow?.TOKEN_PUBLICO ?? firmadaRow?.TOKEN_PUBLICO ?? null,
  };
}

export async function sendMatriculaOnlineForLead(lead: {
  ID_LEAD: string;
  TELEFONO?: string | null;
  NOMBRE?: string | null;
  NOMBRE_CONTACTO?: string | null;
}): Promise<{ reused: boolean }> {
  const result = await crearSolicitudMatriculaDesdeLead(lead.ID_LEAD);
  if (!result.ok || !result.token_publico?.trim()) {
    throw new Error(result.error ?? "No se pudo generar el enlace de matrícula.");
  }

  const url = buildMatriculaSignLink(result.token_publico);
  const phone = lead.TELEFONO?.trim();
  if (phone) {
    window.open(
      buildMatriculaWhatsAppUrl(phone, {
        nombreContacto: lead.NOMBRE_CONTACTO,
        nombreAlumno: lead.NOMBRE,
        url,
      }),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return { reused: result.reused === true };
}

export async function sendMatriculaOnlineForAlumno(alumno: {
  ID_ALUMNO: string;
  TLF_COMUNICACION?: string | null;
  NOMBRE_ALUMNO?: string | null;
  NOMBRE_MADRE?: string | null;
  NOMBRE_PADRE?: string | null;
}): Promise<{ reused: boolean }> {
  const result = await crearSolicitudMatriculaDesdeAlumno(alumno.ID_ALUMNO);
  if (!result.ok || !result.token_publico?.trim()) {
    throw new Error(result.error ?? "No se pudo generar el enlace de matrícula.");
  }

  const url = buildMatriculaSignLink(result.token_publico);
  const phone = alumno.TLF_COMUNICACION?.trim();
  if (phone) {
    window.open(
      buildMatriculaWhatsAppUrl(phone, {
        nombreContacto: resolveMatriculaNombreContacto(
          alumno.NOMBRE_MADRE,
          alumno.NOMBRE_PADRE,
        ),
        nombreAlumno: alumno.NOMBRE_ALUMNO,
        url,
      }),
      "_blank",
      "noopener,noreferrer",
    );
  }

  return { reused: result.reused === true };
}

export function canShowMatriculaOnlineForLead(
  estadoLead: string | null | undefined,
): boolean {
  const estado = estadoLead?.trim().toLowerCase() ?? "";
  return (
    estado !== "matriculado" &&
    estado !== "cerrado" &&
    estado !== "cerrado (no matriculado)"
  );
}

export function canWhatsAppMatriculaForLead(telefono: string | null | undefined): boolean {
  return Boolean(telefono?.trim());
}

export async function resolveLeadMatriculaSignUrl(idLead: string): Promise<string> {
  const status = await fetchLeadSolicitudMatriculaStatus(idLead);
  const existingToken = status.tokenPublico?.trim();
  if (existingToken) {
    return buildMatriculaSignLink(existingToken);
  }

  const result = await crearSolicitudMatriculaDesdeLead(idLead);
  if (!result.ok || !result.token_publico?.trim()) {
    throw new Error(result.error ?? "No se pudo generar el enlace de matrícula.");
  }

  return buildMatriculaSignLink(result.token_publico);
}

/** Preinscripción o Activo: mostrar acciones de matrícula online (copiar enlace; WhatsApp si hay teléfono). */
export function canShowMatriculaOnlineForAlumno(
  estadoAlumno: string | null | undefined,
): boolean {
  const estado = estadoAlumno?.trim().toLowerCase() ?? "";
  return estado === "activo" || estado === "preinscripción" || estado === "preinscripcion";
}

/** WhatsApp solo si estado válido y hay teléfono de comunicación. */
export function canWhatsAppMatriculaForAlumno(
  estadoAlumno: string | null | undefined,
  telefono: string | null | undefined,
): boolean {
  return canShowMatriculaOnlineForAlumno(estadoAlumno) && Boolean(telefono?.trim());
}

/** @deprecated Usar canShowMatriculaOnlineForAlumno / canWhatsAppMatriculaForAlumno */
export function canSendMatriculaOnlineForAlumno(
  estadoAlumno: string | null | undefined,
  telefono?: string | null | undefined,
): boolean {
  if (telefono !== undefined) {
    return canWhatsAppMatriculaForAlumno(estadoAlumno, telefono);
  }
  return canShowMatriculaOnlineForAlumno(estadoAlumno);
}
