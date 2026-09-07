export function isEidasSecurityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("[SEGURIDAD_EIDAS]") || message.includes("SEGURIDAD_EIDAS");
}

function fichajeErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(error);
}

function fichajeErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/** FK fk_fic_cen — QR or profile references a non-existent ID_CENTRO. */
export function isInvalidCentroFichajeError(error: unknown): boolean {
  const code = fichajeErrorCode(error);
  const message = fichajeErrorText(error).toLowerCase();
  if (code === "23503" && message.includes("fk_fic_cen")) return true;
  if (message.includes("fk_fic_cen")) return true;
  if (code === "23503" && message.includes("id_centro") && message.includes("centros")) {
    return true;
  }
  return false;
}

export function formatFichajeErrorMessage(error: unknown): string {
  if (isEidasSecurityError(error)) {
    return "Registro rechazado por controles de seguridad eIDAS. El intento ha quedado auditado.";
  }
  if (isInvalidCentroFichajeError(error)) {
    return "El centro del QR no existe. Pide un cartel nuevo o ficha fuera del centro.";
  }
  return error instanceof Error ? error.message : "Error al registrar el fichaje.";
}

export const CORRECCION_PENDIENTE = "Corrección Pendiente";
export const CORRECCION_APROBADA = "Corrección Aprobada";
export const MODIFICACION_PENDIENTE = "Modificación Pendiente";

export const CLOCK_MOVEMENT_TYPES = new Set(["Entrada", "Salida", "Inicio Pausa", "Fin de Pausa"]);

export function isCorrectionMovement(tipo: string | null | undefined): boolean {
  return (tipo ?? "").toLowerCase().includes("corrección");
}

function isOpenFichajeSolicitud(
  row: {
    ID_FICHAJE_CORREGIDO: string | null;
    TIPO_MOVIMIENTO: string | null;
    ESTADO?: string | null;
  },
  originalId: string,
): boolean {
  if (row.ID_FICHAJE_CORREGIDO !== originalId) return false;
  const mov = (row.TIPO_MOVIMIENTO ?? "").trim();
  const estado = (row.ESTADO ?? "").trim();
  if (mov === CORRECCION_PENDIENTE && estado !== "Rechazado") return true;
  if (mov === MODIFICACION_PENDIENTE && estado === "Pendiente de aceptación modificación") {
    return true;
  }
  return false;
}

export function canRequestCorrection(
  record: { ID_FICHAJE: string; TIPO_MOVIMIENTO: string | null },
  allRecords: Array<{
    ID_FICHAJE: string;
    ID_FICHAJE_CORREGIDO: string | null;
    TIPO_MOVIMIENTO: string | null;
    ESTADO?: string | null;
  }>,
): boolean {
  if (isCorrectionMovement(record.TIPO_MOVIMIENTO)) return false;
  return !allRecords.some((row) => isOpenFichajeSolicitud(row, record.ID_FICHAJE));
}
