const KOREFACTU_FORMAS_DE_PAGO = [
  "EFECTIVO",
  "TARJETA",
  "TRANSFERENCIA",
  "GIRO_BANCARIO",
  "CHEQUE",
  "OTRO",
] as const;

export type KorefactuFormaDePago = (typeof KOREFACTU_FORMAS_DE_PAGO)[number];

export function mapMetodoPagoToKorefactuFormaDePago(
  metodo: string | null | undefined,
): KorefactuFormaDePago {
  const normalized = metodo?.trim().toLowerCase() ?? "";
  if (!normalized) {
    throw new Error("Método de pago no definido para Verifactu.");
  }

  if (
    normalized === "sepa" ||
    normalized === "remesa" ||
    normalized === "giro" ||
    normalized === "iban" ||
    normalized.includes("sepa") ||
    normalized.includes("remesa") ||
    normalized.includes("giro bancario")
  ) {
    return "GIRO_BANCARIO";
  }

  if (normalized === "efectivo" || normalized === "cash") {
    return "EFECTIVO";
  }

  if (
    normalized === "tarjeta" ||
    normalized === "card" ||
    normalized === "tpv" ||
    normalized.includes("stripe")
  ) {
    return "TARJETA";
  }

  if (normalized === "transferencia" || normalized === "transfer") {
    return "TRANSFERENCIA";
  }

  if (normalized === "bizum") {
    return "OTRO";
  }

  if (normalized === "cheque") {
    return "CHEQUE";
  }

  throw new Error(`Método de pago no soportado para Verifactu: ${metodo?.trim() ?? ""}`);
}
