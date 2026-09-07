import { supabase } from "@/integrations/supabase/client";
import { normalizeMetodoPago } from "@/lib/alumnoPaymentUtils";
import { buildMatriculaEvidenceString } from "@/lib/matriculaEvidence";
import {
  computeMatriculaHashEvidence,
  downloadMatriculaPdf,
  type MatriculaPdfInput,
} from "@/lib/generateMatriculaPdf";
import {
  buildMatriculaPdfTextosLegales,
  buildMatriculaPdfTextosLegalesFromSolicitud,
  getMatriculaTextoLabel,
  type MatriculaTextoFieldKey,
} from "@/lib/matriculaTextosLabels";
import type { FirmarSolicitudMatriculaPayload } from "@/lib/solicitudMatricula";

const SOLICITUD_FIRMADA_SELECT =
  "ID_SOLICITUD, ID_ALUMNO, ID_CLIENTE, ID_CENTRO, ESTADO, TOKEN_PUBLICO, DATOS_JSON, NOMBRE_FIRMANTE, DNI_FIRMANTE, HASH_EVIDENCIA, FIRMADO_AT, IP_DIRECCION, USER_AGENT" as const;

export type SolicitudMatriculaFirmadaRow = {
  ID_SOLICITUD: string;
  ID_ALUMNO: string;
  ID_CLIENTE: string;
  ID_CENTRO: string | null;
  ESTADO: string;
  TOKEN_PUBLICO: string;
  DATOS_JSON: FirmarSolicitudMatriculaPayload | null;
  NOMBRE_FIRMANTE: string | null;
  DNI_FIRMANTE: string | null;
  HASH_EVIDENCIA: string | null;
  FIRMADO_AT: string | null;
  IP_DIRECCION: string | null;
  USER_AGENT: string | null;
};

const AUTORIZACION_LABELS = [
  getMatriculaTextoLabel("TEXTO_AUT_MEDIOS"),
  getMatriculaTextoLabel("TEXTO_AUT_INSTALACIONES"),
  getMatriculaTextoLabel("TEXTO_AUT_WEB"),
  getMatriculaTextoLabel("TEXTO_AUT_RRSS"),
  getMatriculaTextoLabel("TEXTO_AUT_COMUNICACION"),
];

export async function fetchFirmadaSolicitudByAlumnoId(
  idAlumno: string,
): Promise<SolicitudMatriculaFirmadaRow | null> {
  const { data, error } = await supabase
    .from("SOLICITUDES_MATRICULA")
    .select(SOLICITUD_FIRMADA_SELECT)
    .eq("ID_ALUMNO", idAlumno)
    .eq("ESTADO", "firmada")
    .order("FIRMADO_AT", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SolicitudMatriculaFirmadaRow | null) ?? null;
}

export async function hasFirmadaMatriculaSolicitud(idAlumno: string): Promise<boolean> {
  const solicitud = await fetchFirmadaSolicitudByAlumnoId(idAlumno);
  return solicitud != null;
}

export async function verifyMatriculaHashEvidence(
  solicitud: SolicitudMatriculaFirmadaRow,
): Promise<void> {
  const storedHash = solicitud.HASH_EVIDENCIA?.trim();
  if (!storedHash) {
    throw new Error("La solicitud firmada no incluye huella de evidencia.");
  }

  const payload = solicitud.DATOS_JSON;
  if (!payload || typeof payload !== "object") {
    throw new Error("La solicitud firmada no incluye los datos del formulario.");
  }

  const computed = await computeMatriculaHashEvidence(
    buildMatriculaEvidenceString(
      payload,
      solicitud.NOMBRE_FIRMANTE?.trim() ?? "",
      solicitud.DNI_FIRMANTE?.trim() ?? payload.DNI_FIRMANTE?.trim() ?? "",
      solicitud.TOKEN_PUBLICO?.trim() ?? "",
    ),
  );

  if (computed !== storedHash) {
    throw new Error(
      "La huella de evidencia no coincide con los datos firmados. No se puede generar el PDF.",
    );
  }
}

const EMPRESA_RESUMEN_SELECT =
  "NOMBRE_ESCUELA, CIF, DIRECCION, TEXTO_REGIMEN_INTERNO, TEXTO_AUT_MEDIOS, TEXTO_AUT_INSTALACIONES, TEXTO_AUT_WEB, TEXTO_AUT_RRSS, TEXTO_AUT_COMUNICACION" as const;

type EmpresaResumenRow = {
  NOMBRE_ESCUELA?: string | null;
  CIF?: string | null;
  DIRECCION?: string | null;
  TEXTO_REGIMEN_INTERNO?: string | null;
  TEXTO_AUT_MEDIOS?: string | null;
  TEXTO_AUT_INSTALACIONES?: string | null;
  TEXTO_AUT_WEB?: string | null;
  TEXTO_AUT_RRSS?: string | null;
  TEXTO_AUT_COMUNICACION?: string | null;
};

async function fetchEmpresaResumen(idCliente: string) {
  const { data, error } = await supabase
    .from("VISTA_EMPRESA_CLIENTE")
    .select(EMPRESA_RESUMEN_SELECT)
    .eq("ID_CLIENTE", idCliente)
    .maybeSingle();

  if (error) throw error;
  return data as EmpresaResumenRow | null;
}

function mapEmpresaTextosLegales(empresa: EmpresaResumenRow | null) {
  if (!empresa) return [];
  const values: Partial<Record<MatriculaTextoFieldKey, string | null | undefined>> = {
    TEXTO_REGIMEN_INTERNO: empresa.TEXTO_REGIMEN_INTERNO,
    TEXTO_AUT_MEDIOS: empresa.TEXTO_AUT_MEDIOS,
    TEXTO_AUT_INSTALACIONES: empresa.TEXTO_AUT_INSTALACIONES,
    TEXTO_AUT_WEB: empresa.TEXTO_AUT_WEB,
    TEXTO_AUT_RRSS: empresa.TEXTO_AUT_RRSS,
    TEXTO_AUT_COMUNICACION: empresa.TEXTO_AUT_COMUNICACION,
  };
  return buildMatriculaPdfTextosLegales(values);
}

function mapPayloadTextosLegales(
  payload: FirmarSolicitudMatriculaPayload,
  empresa: EmpresaResumenRow | null,
) {
  const snapshot = buildMatriculaPdfTextosLegalesFromSolicitud(payload.TEXTOS_LEGALES);
  if (snapshot.length > 0) return snapshot;
  return mapEmpresaTextosLegales(empresa);
}

async function fetchCentroNombre(idCentro: string | null | undefined) {
  const centroId = idCentro?.trim();
  if (!centroId) return null;

  const { data, error } = await supabase
    .from("CENTROS")
    .select("NOMBRE_CENTRO")
    .eq("ID_CENTRO", centroId)
    .maybeSingle();

  if (error) throw error;
  return data?.NOMBRE_CENTRO ?? null;
}

export function mapSolicitudToMatriculaPdfInput(
  solicitud: SolicitudMatriculaFirmadaRow,
  empresa: EmpresaResumenRow | null,
  nombreCentro: string | null,
): MatriculaPdfInput {
  const payload = solicitud.DATOS_JSON;
  if (!payload) {
    throw new Error("La solicitud firmada no incluye los datos del formulario.");
  }

  return {
    nombreEscuela: empresa?.NOMBRE_ESCUELA,
    cif: empresa?.CIF,
    direccionEscuela: empresa?.DIRECCION,
    nombreCentro,
    nombreAlumno: payload.NOMBRE_ALUMNO,
    nombreFirmante: solicitud.NOMBRE_FIRMANTE,
    dniFirmante: solicitud.DNI_FIRMANTE ?? payload.DNI_FIRMANTE,
    token: solicitud.TOKEN_PUBLICO,
    fechaFirma: solicitud.FIRMADO_AT,
    ipDireccion: solicitud.IP_DIRECCION,
    userAgent: solicitud.USER_AGENT,
    hashEvidencia: solicitud.HASH_EVIDENCIA,
    metodoPago: normalizeMetodoPago(payload.METODO_PAGO) || payload.METODO_PAGO,
    autorizaciones: AUTORIZACION_LABELS,
    textosLegales: mapPayloadTextosLegales(payload, empresa),
  };
}

export async function downloadMatriculaPdfForAlumno(idAlumno: string): Promise<void> {
  const solicitud = await fetchFirmadaSolicitudByAlumnoId(idAlumno);
  if (!solicitud) {
    throw new Error("No hay una matrícula online firmada para este alumno.");
  }

  await verifyMatriculaHashEvidence(solicitud);

  const [empresa, nombreCentro] = await Promise.all([
    fetchEmpresaResumen(solicitud.ID_CLIENTE),
    fetchCentroNombre(solicitud.ID_CENTRO ?? payloadCentroId(solicitud)),
  ]);

  downloadMatriculaPdf(mapSolicitudToMatriculaPdfInput(solicitud, empresa, nombreCentro));
}

function payloadCentroId(solicitud: SolicitudMatriculaFirmadaRow): string | null {
  return solicitud.DATOS_JSON?.ID_CENTRO ?? solicitud.ID_CENTRO;
}
