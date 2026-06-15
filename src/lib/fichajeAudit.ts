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
      ID_CLIENTE: payload.tenantId,
      TIPO_EVENTO: "FICHAJE_RECHAZADO",
      MENSAJE: payload.errorMessage,
      DETALLE: JSON.stringify({
        tipoMovimiento: payload.tipoMovimiento,
        idProfesor: payload.idProfesor,
        idUsuario: payload.idUsuario,
        attemptedPayload: payload.attemptedPayload ?? null,
      }),
      ID_PROFESOR: payload.idProfesor,
      ID_USUARIO: payload.idUsuario,
    });
    if (error) {
      console.error("AUDITORIA_LOGS insert failed", error);
    }
  } catch (err) {
    console.error("AUDITORIA_LOGS insert failed", err);
  }
}
