import { z } from "zod";
import type { AlumnoCreateInput, AlumnoUpdateInput } from "@/hooks/useAlumnosTree";
import type { Alumno } from "@/types/database";
import {
  normalizeMetodoPago,
  sanitizeAlumnoPaymentPayload,
  sanitizeAlumnoPaymentPayloadForUpdate,
} from "@/lib/alumnoPaymentUtils";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isSecretariaRole,
} from "@/lib/tenantQuery";

const optionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    return v.trim();
  });

const optionalEmail = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || !v.trim()) return null;
    return v.trim().toLowerCase();
  })
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Email inválido",
  });

const optionalNumber = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .optional()
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  });

const optionalBool = z.boolean().nullable().optional().default(false);

export const alumnoFormSchema = z.object({
  NOMBRE_ALUMNO: z.string().trim().min(1, "El nombre es obligatorio"),
  TLF_COMUNICACION: optionalString,
  TLF_ALUMNO: optionalString,
  MAIL: optionalEmail,
  DNI: optionalString,
  NACIMIENTO: optionalString,
  FOTO: optionalString,
  ID_CENTRO: optionalString,
  NOMBRE_MADRE: optionalString,
  TLF_MADRE: optionalString,
  NOMBRE_PADRE: optionalString,
  TLF_PADRE: optionalString,
  DIRECCION: optionalString,
  CP: optionalString,
  ESTADO_ALUMNO: optionalString,
  ESTADO_MATRICULA: optionalString,
  ESTADO_RESERVA: optionalString,
  MES_DEVOLUCION_RESERVA: optionalString,
  DTO_HERMANOS_PORCENTAJE: optionalNumber,
  AJUSTE_MANUAL_EUR: optionalNumber,
  TOTAL_MENSUAL: optionalNumber,
  MOTIVO_AJUSTE: optionalString,
  METODO_PAGO: optionalString,
  IBAN: optionalString,
  TITULAR_CUENTA: optionalString,
  TLF_BIZUM: optionalString,
  MANDATO: optionalString,
  TARJETA: optionalString,
  STRIPE_ID: optionalString,
  HOLDED_ID: optionalString,
  AUT_MEDIOS: optionalBool,
  AUT_INSTALACIONES: optionalBool,
  AUT_WEB: optionalBool,
  AUT_RRSS: optionalBool,
  AUT_COMUNICACION_TOTAL: optionalBool,
  NOTAS: optionalString,
});

export type AlumnoFormInput = z.input<typeof alumnoFormSchema>;
export type AlumnoFormValues = z.output<typeof alumnoFormSchema>;

const ALUMNO_UPDATE_PATCH_KEYS = [
  "NOMBRE_ALUMNO",
  "TLF_COMUNICACION",
  "TLF_ALUMNO",
  "MAIL",
  "DNI",
  "NACIMIENTO",
  "FOTO",
  "ID_CENTRO",
  "NOMBRE_MADRE",
  "TLF_MADRE",
  "NOMBRE_PADRE",
  "TLF_PADRE",
  "DIRECCION",
  "CP",
  "ESTADO_ALUMNO",
  "ESTADO_MATRICULA",
  "ESTADO_RESERVA",
  "MES_DEVOLUCION_RESERVA",
  "DTO_HERMANOS_PORCENTAJE",
  "AJUSTE_MANUAL_EUR",
  "TOTAL_MENSUAL",
  "MOTIVO_AJUSTE",
  "METODO_PAGO",
  "IBAN",
  "TITULAR_CUENTA",
  "TLF_BIZUM",
  "MANDATO",
  "TARJETA",
  "STRIPE_ID",
  "HOLDED_ID",
  "AUT_MEDIOS",
  "AUT_INSTALACIONES",
  "AUT_WEB",
  "AUT_RRSS",
  "AUT_COMUNICACION_TOTAL",
  "NOTAS",
] as const satisfies readonly (keyof AlumnoFormValues)[];

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return trimmed;
}

function readAlumnoField(record: Record<string, unknown>, upperKey: string, lowerKey: string): unknown {
  return record[upperKey] ?? record[lowerKey];
}

function toFormString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function toFormNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

function toFormBool(value: unknown): boolean {
  return value === true;
}

export function emptyAlumnoFormValues(): AlumnoFormValues {
  return {
    NOMBRE_ALUMNO: "",
    TLF_COMUNICACION: null,
    TLF_ALUMNO: null,
    MAIL: null,
    DNI: null,
    NACIMIENTO: null,
    FOTO: null,
    ID_CENTRO: null,
    NOMBRE_MADRE: null,
    TLF_MADRE: null,
    NOMBRE_PADRE: null,
    TLF_PADRE: null,
    DIRECCION: null,
    CP: null,
    ESTADO_ALUMNO: null,
    ESTADO_MATRICULA: null,
    ESTADO_RESERVA: null,
    MES_DEVOLUCION_RESERVA: null,
    DTO_HERMANOS_PORCENTAJE: null,
    AJUSTE_MANUAL_EUR: null,
    TOTAL_MENSUAL: null,
    MOTIVO_AJUSTE: null,
    METODO_PAGO: null,
    IBAN: null,
    TITULAR_CUENTA: null,
    TLF_BIZUM: null,
    MANDATO: null,
    TARJETA: null,
    STRIPE_ID: null,
    HOLDED_ID: null,
    AUT_MEDIOS: false,
    AUT_INSTALACIONES: false,
    AUT_WEB: false,
    AUT_RRSS: false,
    AUT_COMUNICACION_TOTAL: false,
    NOTAS: null,
  };
}

export function alumnoRecordToFormValues(
  alumno: Partial<Alumno> & { NOMBRE_ALUMNO?: string },
): AlumnoFormValues {
  const record = alumno as Record<string, unknown>;
  const normalizedMetodo = normalizeMetodoPago(toFormString(readAlumnoField(record, "METODO_PAGO", "metodo_pago")));

  return {
    NOMBRE_ALUMNO: toFormString(readAlumnoField(record, "NOMBRE_ALUMNO", "nombre_alumno")) ?? "",
    TLF_COMUNICACION: toFormString(readAlumnoField(record, "TLF_COMUNICACION", "tlf_comunicacion")),
    TLF_ALUMNO: toFormString(readAlumnoField(record, "TLF_ALUMNO", "tlf_alumno")),
    MAIL: toFormString(readAlumnoField(record, "MAIL", "mail"))?.toLowerCase() ?? null,
    DNI: toFormString(readAlumnoField(record, "DNI", "dni")),
    NACIMIENTO: toDateInputValue(toFormString(readAlumnoField(record, "NACIMIENTO", "nacimiento")) ?? ""),
    FOTO: toFormString(readAlumnoField(record, "FOTO", "foto")),
    ID_CENTRO: toFormString(readAlumnoField(record, "ID_CENTRO", "id_centro")),
    NOMBRE_MADRE: toFormString(readAlumnoField(record, "NOMBRE_MADRE", "nombre_madre")),
    TLF_MADRE: toFormString(readAlumnoField(record, "TLF_MADRE", "tlf_madre")),
    NOMBRE_PADRE: toFormString(readAlumnoField(record, "NOMBRE_PADRE", "nombre_padre")),
    TLF_PADRE: toFormString(readAlumnoField(record, "TLF_PADRE", "tlf_padre")),
    DIRECCION: toFormString(readAlumnoField(record, "DIRECCION", "direccion")),
    CP: toFormString(readAlumnoField(record, "CP", "cp")),
    ESTADO_ALUMNO: toFormString(readAlumnoField(record, "ESTADO_ALUMNO", "estado_alumno")),
    ESTADO_MATRICULA: toFormString(readAlumnoField(record, "ESTADO_MATRICULA", "estado_matricula")),
    ESTADO_RESERVA: toFormString(readAlumnoField(record, "ESTADO_RESERVA", "estado_reserva")),
    MES_DEVOLUCION_RESERVA: toFormString(
      readAlumnoField(record, "MES_DEVOLUCION_RESERVA", "mes_devolucion_reserva"),
    ),
    DTO_HERMANOS_PORCENTAJE: toFormNumber(
      readAlumnoField(record, "DTO_HERMANOS_PORCENTAJE", "dto_hermanos_porcentaje"),
    ),
    AJUSTE_MANUAL_EUR: toFormNumber(readAlumnoField(record, "AJUSTE_MANUAL_EUR", "ajuste_manual_eur")),
    TOTAL_MENSUAL: toFormNumber(readAlumnoField(record, "TOTAL_MENSUAL", "total_mensual")),
    MOTIVO_AJUSTE: toFormString(readAlumnoField(record, "MOTIVO_AJUSTE", "motivo_ajuste")),
    METODO_PAGO: normalizedMetodo || null,
    IBAN: toFormString(readAlumnoField(record, "IBAN", "iban")),
    TITULAR_CUENTA: toFormString(readAlumnoField(record, "TITULAR_CUENTA", "titular_cuenta")),
    TLF_BIZUM: toFormString(readAlumnoField(record, "TLF_BIZUM", "tlf_bizum")),
    MANDATO: toFormString(readAlumnoField(record, "MANDATO", "mandato")),
    TARJETA: toFormString(readAlumnoField(record, "TARJETA", "tarjeta")),
    STRIPE_ID: toFormString(readAlumnoField(record, "STRIPE_ID", "stripe_id")),
    HOLDED_ID: toFormString(readAlumnoField(record, "HOLDED_ID", "korefactu_id")),
    AUT_MEDIOS: toFormBool(readAlumnoField(record, "AUT_MEDIOS", "aut_medios")),
    AUT_INSTALACIONES: toFormBool(readAlumnoField(record, "AUT_INSTALACIONES", "aut_instalaciones")),
    AUT_WEB: toFormBool(readAlumnoField(record, "AUT_WEB", "aut_web")),
    AUT_RRSS: toFormBool(readAlumnoField(record, "AUT_RRSS", "aut_rrss")),
    AUT_COMUNICACION_TOTAL: toFormBool(
      readAlumnoField(record, "AUT_COMUNICACION_TOTAL", "aut_comunicacion_total"),
    ),
    NOTAS: toFormString(readAlumnoField(record, "NOTAS", "notas")),
  };
}

export function shouldShowAlumnoCentroSelector(
  rol: string | null | undefined,
  centroCount: number,
): boolean {
  if (isSecretariaRole(rol) || isDireccionRole(rol)) return false;
  return isMasterRole(rol) || isAdminRole(rol) || centroCount > 1;
}

export function resolveAlumnoCreateCenterId(
  values: AlumnoFormValues,
  options: {
    showCentroSelector: boolean;
    assignedCenterId: string | null | undefined;
  },
): string | null {
  if (options.showCentroSelector) {
    return values.ID_CENTRO?.trim() || null;
  }
  return options.assignedCenterId?.trim() || null;
}

/** @deprecated Use alumnoRecordToFormValues instead. */
export function alumnoToFormValues(
  alumno: Partial<AlumnoFormValues> & { NOMBRE_ALUMNO?: string },
): AlumnoFormValues {
  return alumnoRecordToFormValues(alumno);
}

export function formToAlumnoCreatePayload(values: AlumnoFormValues): AlumnoCreateInput {
  const payload = sanitizeAlumnoPaymentPayload({
    ...values,
    NOMBRE_ALUMNO: values.NOMBRE_ALUMNO.trim(),
    ESTADO_ALUMNO: values.ESTADO_ALUMNO ?? "Activo",
  });

  return payload as AlumnoCreateInput;
}

export function formToAlumnoUpdatePayload(values: AlumnoFormValues): AlumnoUpdateInput {
  const patch: Record<string, unknown> = {
    NOMBRE_ALUMNO: values.NOMBRE_ALUMNO.trim(),
  };

  for (const key of ALUMNO_UPDATE_PATCH_KEYS) {
    if (key === "NOMBRE_ALUMNO") continue;
    patch[key] = values[key];
  }

  return sanitizeAlumnoPaymentPayloadForUpdate(patch) as AlumnoUpdateInput;
}

/** @deprecated Use formToAlumnoCreatePayload or formToAlumnoUpdatePayload. */
export function formToAlumnoPayload(values: AlumnoFormValues): AlumnoCreateInput {
  return formToAlumnoCreatePayload(values);
}

export function calcEdad(nacimiento: string | null | undefined): string {
  if (!nacimiento?.trim()) return "—";
  const birth = new Date(nacimiento);
  if (Number.isNaN(birth.getTime())) return "—";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return `${age} años`;
}
