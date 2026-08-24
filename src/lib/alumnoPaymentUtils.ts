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
  if (m === "efectivo" || m === "cash") return "Efectivo";
  if (m === "tarjeta" || m === "card" || m === "tpv" || m.includes("stripe")) return "Tarjeta";
  if (m === "bizum") return "Bizum";
  if (m === "transferencia" || m === "transfer") return "Transferencia";
  return "SEPA";
}

export function isBankRemittancePaymentMethod(metodo: string | null | undefined): boolean {
  return normalizeMetodoPago(metodo) === "SEPA";
}

export function isBizumPaymentMethod(metodo: string | null | undefined): boolean {
  return normalizeMetodoPago(metodo) === "Bizum";
}

export function isTarjetaPaymentMethod(metodo: string | null | undefined): boolean {
  return normalizeMetodoPago(metodo) === "Tarjeta";
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

export function sanitizeAlumnoPaymentPayloadForUpdate<T extends Record<string, unknown>>(
  values: T,
): T {
  const metodo = values.METODO_PAGO as string | null | undefined;
  const sanitized = { ...values } as Record<string, unknown>;

  if (!isBankRemittancePaymentMethod(metodo)) {
    sanitized.IBAN = null;
    sanitized.TITULAR_CUENTA = null;
    sanitized.MANDATO = null;
  }

  if (!isBizumPaymentMethod(metodo)) {
    sanitized.TLF_BIZUM = null;
  }

  if ("HOLDED_ID" in sanitized) {
    sanitized.KOREFACTU_ID = sanitized.HOLDED_ID ?? null;
    delete sanitized.HOLDED_ID;
  }

  return sanitized as T;
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
