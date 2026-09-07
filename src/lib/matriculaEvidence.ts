import {
  isBankRemittancePaymentMethod,
  isBizumPaymentMethod,
  normalizeMetodoPago,
} from "@/lib/alumnoPaymentUtils";
import type { FirmarSolicitudMatriculaPayload } from "@/lib/solicitudMatricula";

function normalizeStringArray(value: string[] | null | undefined): string[] | null {
  if (!value?.length) return null;
  const cleaned = value.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeEspecialidadesIdsForEvidence(
  ids: string[] | null | undefined,
): string[] | undefined {
  const cleaned = normalizeStringArray(ids);
  if (!cleaned) return undefined;
  return [...cleaned].sort();
}

function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalizeJsonValue(record[key]);
  }
  return sorted;
}

export function stringifyCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalizeJsonValue(value));
}

export function normalizePayloadForEvidence(
  raw: FirmarSolicitudMatriculaPayload,
): FirmarSolicitudMatriculaPayload {
  const metodo = normalizeMetodoPago(raw.METODO_PAGO) || raw.METODO_PAGO?.trim() || null;
  const showSepaFields = isBankRemittancePaymentMethod(metodo);
  const showBizumField = isBizumPaymentMethod(metodo);

  return {
    NOMBRE_ALUMNO: raw.NOMBRE_ALUMNO?.trim() || null,
    DNI: raw.DNI?.trim() || null,
    MAIL: raw.MAIL?.trim() || null,
    TLF_ALUMNO: raw.TLF_ALUMNO?.trim() || null,
    TLF_COMUNICACION: raw.TLF_COMUNICACION?.trim() || null,
    NOMBRE_MADRE: raw.NOMBRE_MADRE?.trim() || null,
    TLF_MADRE: raw.TLF_MADRE?.trim() || null,
    NOMBRE_PADRE: raw.NOMBRE_PADRE?.trim() || null,
    TLF_PADRE: raw.TLF_PADRE?.trim() || null,
    DIRECCION: raw.DIRECCION?.trim() || null,
    CP: raw.CP?.trim() || null,
    MUNICIPIO: raw.MUNICIPIO?.trim() || null,
    PROVINCIA: raw.PROVINCIA?.trim() || null,
    NACIMIENTO: raw.NACIMIENTO?.trim() || null,
    METODO_PAGO: metodo,
    IBAN: showSepaFields ? raw.IBAN?.trim() || null : null,
    TITULAR_CUENTA: showSepaFields ? raw.TITULAR_CUENTA?.trim() || null : null,
    TLF_BIZUM: showBizumField ? raw.TLF_BIZUM?.trim() || null : null,
    ID_CURSO: raw.ID_CURSO?.trim() || null,
    ESPECIALIDADES_IDS: normalizeEspecialidadesIdsForEvidence(raw.ESPECIALIDADES_IDS),
    OBSERVACIONES: raw.OBSERVACIONES?.trim() || null,
    DNI_FIRMANTE: raw.DNI_FIRMANTE?.trim() ?? "",
    acepta_regimen: raw.acepta_regimen,
    AUT_MEDIOS: raw.AUT_MEDIOS,
    AUT_INSTALACIONES: raw.AUT_INSTALACIONES,
    AUT_WEB: raw.AUT_WEB,
    AUT_RRSS: raw.AUT_RRSS,
    AUT_COMUNICACION_TOTAL: raw.AUT_COMUNICACION_TOTAL,
  };
}

export function buildMatriculaEvidenceString(
  payload: FirmarSolicitudMatriculaPayload,
  nombreFirmante: string,
  dniFirmante: string,
  token: string,
): string {
  return stringifyCanonicalJson({
    payload: normalizePayloadForEvidence(payload),
    nombreFirmante: nombreFirmante.trim(),
    dniFirmante: dniFirmante.trim(),
    token: token.trim(),
  });
}
