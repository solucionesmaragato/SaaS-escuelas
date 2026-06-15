/**
 * Centralized n8n webhook integration.
 * All external automation triggers funnel through this service so the
 * payload adapter logic stays in one place and the UI never knows about
 * raw fetch/URL details.
 *
 * NOTE: fire-and-forget triggers (no `await` at the call site) should still
 * `.catch()` so a failed webhook does not surface as an unhandled rejection.
 */

import type { Alumno, Lead, ControlRemesa } from "@/types/database";

const N8N_BASE_URL = "https://n8n.solucionesmaragato.com/mcp-server/http";

export type N8nEvent =
  | "alumno.created"
  | "alumno.updated"
  | "lead.created"
  | "remesa.generated"
  | "matricula.created"
  | "incidencia.created";

interface N8nPayload<T> {
  event: N8nEvent;
  tenantId: string;
  timestamp: string;
  data: T;
}

async function postWebhook<T>(event: N8nEvent, tenantId: string, data: T): Promise<void> {
  const payload: N8nPayload<T> = {
    event,
    tenantId,
    timestamp: new Date().toISOString(),
    data,
  };

  try {
    const res = await fetch(`${N8N_BASE_URL}/${event.replace(/\./g, "-")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`[n8n] ${event} responded ${res.status}`);
    }
  } catch (err) {
    console.warn(`[n8n] ${event} failed`, err);
  }
}

// ---------- Adapters: clean payloads before sending ----------

function adaptAlumno(a: Alumno) {
  return {
    id: a.ID_ALUMNO,
    nombre: a.NOMBRE_ALUMNO,
    email: a.MAIL,
    telefono: a.TLF_COMUNICACION,
    estado: a.ESTADO_ALUMNO,
    totalMensual: a.TOTAL_MENSUAL,
  };
}

function adaptLead(l: Lead) {
  return {
    id: l.ID_LEAD,
    nombre: l.NOMBRE,
    contacto: l.NOMBRE_CONTACTO,
    telefono: l.TELEFONO,
    especialidad: l.ESPECIALIDAD,
    estado: l.ESTADO,
  };
}

function adaptRemesa(r: ControlRemesa) {
  return {
    id: r.ID_REMESA,
    periodo: r.MES_PERIODO,
    estado: r.ESTADO,
    xmlSepa: r.LINK_XML_SEPA,
  };
}

// ---------- Public triggers ----------

export const n8n = {
  alumnoCreated: (tenantId: string, alumno: Alumno) =>
    postWebhook("alumno.created", tenantId, adaptAlumno(alumno)),
  alumnoUpdated: (tenantId: string, alumno: Alumno) =>
    postWebhook("alumno.updated", tenantId, adaptAlumno(alumno)),
  leadCreated: (tenantId: string, lead: Lead) =>
    postWebhook("lead.created", tenantId, adaptLead(lead)),
  remesaGenerated: (tenantId: string, remesa: ControlRemesa) =>
    postWebhook("remesa.generated", tenantId, adaptRemesa(remesa)),
};
