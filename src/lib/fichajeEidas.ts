export function isEidasSecurityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("[SEGURIDAD_EIDAS]") || message.includes("SEGURIDAD_EIDAS");
}

export function formatFichajeErrorMessage(error: unknown): string {
  if (isEidasSecurityError(error)) {
    return "Registro rechazado por controles de seguridad eIDAS. El intento ha quedado auditado.";
  }
  return error instanceof Error ? error.message : "Error al registrar el fichaje.";
}

export const CORRECCION_PENDIENTE = "Corrección Pendiente";
export const CORRECCION_APROBADA = "Corrección Aprobada";

export const CLOCK_MOVEMENT_TYPES = new Set([
  "Entrada",
  "Salida",
  "Inicio Pausa",
  "Fin de Pausa",
]);

export function isCorrectionMovement(tipo: string | null | undefined): boolean {
  return (tipo ?? "").toLowerCase().includes("corrección");
}

export function canRequestCorrection(
  record: { ID_FICHAJE: string; TIPO_MOVIMIENTO: string | null },
  allRecords: Array<{ ID_FICHAJE: string; ID_FICHAJE_CORREGIDO: string | null; TIPO_MOVIMIENTO: string | null }>,
): boolean {
  if (isCorrectionMovement(record.TIPO_MOVIMIENTO)) return false;
  return !allRecords.some(
    (row) =>
      row.ID_FICHAJE_CORREGIDO === record.ID_FICHAJE &&
      (row.TIPO_MOVIMIENTO ?? "").trim() === CORRECCION_PENDIENTE,
  );
}
