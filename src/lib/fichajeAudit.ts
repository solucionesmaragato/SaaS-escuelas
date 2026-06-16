import { supabase } from "@/integrations/supabase/client";

export type FichajeAuditPayload = {
  tenantId: string;
  idProfesor: string | null;
  idUsuario: string | null;
  tipoMovimiento: string;
  errorMessage: string;
  attemptedPayload?: Record<string, unknown>;
};

/** Fire-and-forget audit trail when a sealed fichaje insert is rejected. */
export async function logFichajeRejection(payload: FichajeAuditPayload): Promise<void> {
  try {
    const { error } = await supabase.from("AUDITORIA_LOGS").insert({
      TABLA_AFECTADA: "FICHAJES",
      ACCION: "FICHAJE_RECHAZADO",
      ID_REGISTRO: payload.idProfesor ?? payload.idUsuario ?? "unknown",
      ID_PROFESOR: payload.idUsuario,
      ID_CLIENTE: payload.tenantId,
      DETALLES: {
        errorMessage: payload.errorMessage,
        tipoMovimiento: payload.tipoMovimiento,
        idProfesorFichaje: payload.idProfesor,
        attemptedPayload: payload.attemptedPayload ?? null,
      },
    });
    if (error) {
      console.error("AUDITORIA_LOGS insert failed", error);
    }
  } catch (err) {
    console.error("AUDITORIA_LOGS insert failed", err);
  }
}
