export const METODOS_PAGO_OPCIONES = ["SEPA", "Bizum", "Efectivo", "Tarjeta"] as const;

export type MetodoPagoOption = (typeof METODOS_PAGO_OPCIONES)[number];

export type BizumPhoneSource = {
  TLF_COMUNICACION?: string | null;
  TLF_ALUMNO?: string | null;
  TLF_MADRE?: string | null;
  TLF_PADRE?: string | null;
};

export function normalizeMetodoPago(metodo: string | null | undefined): string {
  if (!metodo?.trim()) return "";
  const m = metodo.trim().toLowerCase();
  if (m === "sepa" || m.includes("remesa") || m === "giro" || m.includes("iban")) {
    return "SEPA";
  }
  if (m === "tarjeta") return "Tarjeta";
  if (m === "bizum") return "Bizum";
  if (m === "efectivo") return "Efectivo";
  return metodo.trim();
}

export function isBankRemittancePaymentMethod(metodo: string | null | undefined): boolean {
  return normalizeMetodoPago(metodo) === "SEPA";
}

export function isBizumPaymentMethod(metodo: string | null | undefined): boolean {
  return normalizeMetodoPago(metodo) === "Bizum";
}

export function collectBizumPhoneOptions(source: BizumPhoneSource): string[] {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const phone of [
    source.TLF_COMUNICACION,
    source.TLF_ALUMNO,
    source.TLF_MADRE,
    source.TLF_PADRE,
  ]) {
    const trimmed = phone?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    phones.push(trimmed);
  }
  return phones;
}

export function sanitizeAlumnoPaymentPayload<T extends Record<string, unknown>>(values: T): T {
  const metodo = values.METODO_PAGO as string | null | undefined;
  const sanitized = { ...values } as Record<string, unknown>;

  delete sanitized.TARJETA;
  delete sanitized.STRIPE_ID;
  delete sanitized.HOLDED_ID;

  if (!isBankRemittancePaymentMethod(metodo)) {
    sanitized.IBAN = null;
    sanitized.TITULAR_CUENTA = null;
    sanitized.MANDATO = null;
  }

  if (!isBizumPaymentMethod(metodo)) {
    sanitized.TLF_BIZUM = null;
  }

  return sanitized as T;
}
