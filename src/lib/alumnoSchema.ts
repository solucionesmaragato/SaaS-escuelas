import { z } from "zod";
import type { AlumnoCreateInput } from "@/hooks/useAlumnosTree";
import {
  sanitizeAlumnoPaymentPayload,
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
  MAIL: optionalEmail,
  ESTADO_MATRICULA: optionalString,
  ESTADO_RESERVA: optionalString,
  TOTAL_MENSUAL: optionalNumber,
  NOTAS: optionalString,
  DNI: optionalString,
  NOMBRE_MADRE: optionalString,
  TLF_MADRE: optionalString,
  NOMBRE_PADRE: optionalString,
  TLF_PADRE: optionalString,
  DIRECCION: optionalString,
  CP: optionalString,
  NACIMIENTO: optionalString,
  AUT_MEDIOS: optionalBool,
  AUT_INSTALACIONES: optionalBool,
  AUT_WEB: optionalBool,
  AUT_RRSS: optionalBool,
  AUT_COMUNICACION_TOTAL: optionalBool,
  METODO_PAGO: optionalString,
  IBAN: optionalString,
  TITULAR_CUENTA: optionalString,
  TLF_BIZUM: optionalString,
  MANDATO: optionalString,
  TARJETA: optionalString,
  STRIPE_ID: optionalString,
  HOLDED_ID: optionalString,
  DTO_HERMANOS_PORCENTAJE: optionalNumber,
  AJUSTE_MANUAL_EUR: optionalNumber,
  MOTIVO_AJUSTE: optionalString,
  ID_CENTRO: optionalString,
});

export type AlumnoFormInput = z.input<typeof alumnoFormSchema>;
export type AlumnoFormValues = z.output<typeof alumnoFormSchema>;

export function emptyAlumnoFormValues(): AlumnoFormValues {
  return {
    NOMBRE_ALUMNO: "",
    TLF_COMUNICACION: null,
    MAIL: null,
    ESTADO_MATRICULA: null,
    ESTADO_RESERVA: null,
    TOTAL_MENSUAL: null,
    NOTAS: null,
    DNI: null,
    NOMBRE_MADRE: null,
    TLF_MADRE: null,
    NOMBRE_PADRE: null,
    TLF_PADRE: null,
    DIRECCION: null,
    CP: null,
    NACIMIENTO: null,
    AUT_MEDIOS: false,
    AUT_INSTALACIONES: false,
    AUT_WEB: false,
    AUT_RRSS: false,
    AUT_COMUNICACION_TOTAL: false,
    METODO_PAGO: null,
    IBAN: null,
    TITULAR_CUENTA: null,
    TLF_BIZUM: null,
    MANDATO: null,
    TARJETA: null,
    STRIPE_ID: null,
    HOLDED_ID: null,
    DTO_HERMANOS_PORCENTAJE: null,
    AJUSTE_MANUAL_EUR: null,
    MOTIVO_AJUSTE: null,
    ID_CENTRO: null,
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

export function alumnoToFormValues(
  alumno: Partial<AlumnoFormValues> & { NOMBRE_ALUMNO?: string },
): AlumnoFormValues {
  const base = emptyAlumnoFormValues();
  return {
    ...base,
    ...alumno,
    NOMBRE_ALUMNO: alumno.NOMBRE_ALUMNO ?? "",
    MAIL: alumno.MAIL?.toLowerCase() ?? null,
    AUT_MEDIOS: alumno.AUT_MEDIOS ?? false,
    AUT_INSTALACIONES: alumno.AUT_INSTALACIONES ?? false,
    AUT_WEB: alumno.AUT_WEB ?? false,
    AUT_RRSS: alumno.AUT_RRSS ?? false,
    AUT_COMUNICACION_TOTAL: alumno.AUT_COMUNICACION_TOTAL ?? false,
    ID_CENTRO: alumno.ID_CENTRO ?? null,
  };
}

export function formToAlumnoPayload(values: AlumnoFormValues): AlumnoCreateInput {
  return sanitizeAlumnoPaymentPayload({
    ...values,
    TLF_ALUMNO: null,
    MES_DEVOLUCION_RESERVA: null,
    ESTADO_ALUMNO: null,
    FOTO: null,
  }) as AlumnoCreateInput;
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
