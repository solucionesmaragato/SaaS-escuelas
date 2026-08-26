const KOREFACTU_FORMAS_DE_PAGO = [
  "No establecido",
  "Efectivo",
  "Tarjeta",
  "Transferencia",
  "Giro bancario",
  "Cheque",
  "Otro",
] as const;

export type KorefactuFormaDePago = (typeof KOREFACTU_FORMAS_DE_PAGO)[number];

export function mapMetodoPagoToKorefactuFormaDePago(
  metodo: string | null | undefined,
): KorefactuFormaDePago {
  const normalized = metodo?.trim().toLowerCase() ?? "";
  if (!normalized) return "No establecido";

  if (
    normalized === "sepa" ||
    normalized === "remesa" ||
    normalized === "giro" ||
    normalized === "iban" ||
    normalized.includes("sepa") ||
    normalized.includes("remesa") ||
    normalized.includes("giro bancario")
  ) {
    return "Giro bancario";
  }

  if (normalized === "efectivo" || normalized === "cash") {
    return "Efectivo";
  }

  if (
    normalized === "tarjeta" ||
    normalized === "card" ||
    normalized === "tpv" ||
    normalized.includes("stripe")
  ) {
    return "Tarjeta";
  }

  if (normalized === "transferencia" || normalized === "transfer") {
    return "Transferencia";
  }

  if (normalized === "bizum") {
    return "Otro";
  }

  if (normalized === "cheque") {
    return "Cheque";
  }

  throw new Error(`Método de pago no soportado para Verifactu: ${metodo?.trim() ?? ""}`);
}
