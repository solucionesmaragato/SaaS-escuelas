/**
 * Cal.com webhook → CLIENTES.DEMO_CAL_MEETING_AT / DEMO_CAL_BOOKING_UID (tenants DEMO-*).
 *
 * URL: https://<project-ref>.supabase.co/functions/v1/cal-demo-booking
 * Configurar en Cal.com: trigger BOOKING_CREATED, secret = CAL_WEBHOOK_SECRET.
 * Verificación: HMAC SHA-256 del body crudo vs header X-Cal-Signature-256.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type CalWebhookBody = {
  triggerEvent?: string;
  type?: string;
  payload?: {
    startTime?: string;
    uid?: string;
    attendees?: Array<{ email?: string | null }>;
    responses?: {
      email?: { value?: string | null };
    };
  };
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeTrigger(body: CalWebhookBody): string {
  return (body.triggerEvent ?? body.type ?? "").trim().toUpperCase().replace(/\./g, "_");
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (normalized.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function computeHmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyCalSignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature?.trim()) return false;
  const expected = await computeHmacSha256Hex(secret, rawBody);
  const received = signature.trim().toLowerCase();
  const expectedLower = expected.toLowerCase();
  if (received.length !== expectedLower.length) return false;
  return timingSafeEqualBytes(hexToBytes(received), hexToBytes(expectedLower));
}

function isPingEvent(body: CalWebhookBody): boolean {
  return normalizeTrigger(body) === "PING";
}

function isBookingCreatedEvent(body: CalWebhookBody): boolean {
  return normalizeTrigger(body) === "BOOKING_CREATED";
}

function extractAttendeeEmail(body: CalWebhookBody): string | null {
  const payload = body.payload;
  if (!payload) return null;

  for (const attendee of payload.attendees ?? []) {
    if (attendee?.email?.trim()) return normalizeEmail(attendee.email);
  }

  const responseEmail = payload.responses?.email?.value;
  if (responseEmail?.trim()) return normalizeEmail(responseEmail);

  return null;
}

type DemoClienteRow = {
  ID_CLIENTE: string;
  DEMO_CAL_BOOKING_UID: string | null;
  EMAIL_CLIENTE: string | null;
};

async function resolveDemoCliente(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ target: DemoClienteRow | null; error: string | null }> {
  const { data: clientes, error: clientesError } = await admin
    .from("CLIENTES")
    .select("ID_CLIENTE, DEMO_CAL_BOOKING_UID, EMAIL_CLIENTE")
    .like("ID_CLIENTE", "DEMO-%")
    .ilike("EMAIL_CLIENTE", email);

  if (clientesError) {
    console.error("cal-demo-booking CLIENTES lookup failed", clientesError);
    return { target: null, error: clientesError.message };
  }

  if (clientes?.length) {
    let target = clientes[0];
    if (clientes.length > 1) {
      const ids = clientes.map((c) => c.ID_CLIENTE);
      const { data: perfiles, error: perfilesError } = await admin
        .from("PERFILES")
        .select("ID_CLIENTE")
        .in("ID_CLIENTE", ids);

      if (perfilesError) {
        console.error("cal-demo-booking PERFILES lookup failed", perfilesError);
        return { target: null, error: perfilesError.message };
      }

      const withPerfil = new Set((perfiles ?? []).map((p) => p.ID_CLIENTE));
      target = clientes.find((c) => withPerfil.has(c.ID_CLIENTE)) ?? clientes[0];
    }

    return { target, error: null };
  }

  const { data: perfiles, error: perfilesError } = await admin
    .from("PERFILES")
    .select("ID_CLIENTE")
    .like("ID_CLIENTE", "DEMO-%")
    .ilike("EMAIL", email);

  if (perfilesError) {
    console.error("cal-demo-booking PERFILES email lookup failed", perfilesError);
    return { target: null, error: perfilesError.message };
  }

  const demoIds = [...new Set((perfiles ?? []).map((p) => p.ID_CLIENTE).filter(Boolean))];
  if (!demoIds.length) {
    return { target: null, error: null };
  }

  const { data: demoClientes, error: demoClientesError } = await admin
    .from("CLIENTES")
    .select("ID_CLIENTE, DEMO_CAL_BOOKING_UID, EMAIL_CLIENTE")
    .in("ID_CLIENTE", demoIds);

  if (demoClientesError) {
    console.error("cal-demo-booking CLIENTES by perfil lookup failed", demoClientesError);
    return { target: null, error: demoClientesError.message };
  }

  if (!demoClientes?.length) {
    return { target: null, error: null };
  }

  const withoutBooking = demoClientes.find((c) => !c.DEMO_CAL_BOOKING_UID?.trim());
  return { target: withoutBooking ?? demoClientes[0], error: null };
}

export default {
  fetch: async (req: Request) => {
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Método no permitido." }, 405);
    }

    const secret = Deno.env.get("CAL_WEBHOOK_SECRET")?.trim();
    if (!secret) {
      return jsonResponse({ ok: false, error: "Webhook no configurado." }, 401);
    }

    const rawBody = await req.text();
    const signature = req.headers.get("x-cal-signature-256");

    let body: CalWebhookBody;
    try {
      body = JSON.parse(rawBody) as CalWebhookBody;
    } catch {
      return jsonResponse({ ok: false, error: "JSON inválido." }, 400);
    }

    if (isPingEvent(body)) {
      return jsonResponse({ ok: true, skipped: "ping" });
    }

    if (!(await verifyCalSignature(rawBody, signature, secret))) {
      return jsonResponse({ ok: false, error: "Firma inválida." }, 401);
    }

    if (!isBookingCreatedEvent(body)) {
      return jsonResponse({ ok: true, skipped: "evento_ignorado" });
    }

    const email = extractAttendeeEmail(body);
    const startTime = body.payload?.startTime?.trim();
    const uid = body.payload?.uid?.trim();

    if (!email || !startTime || !uid) {
      return jsonResponse({ ok: true, skipped: "payload_incompleto" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: "Configuración Supabase incompleta." }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { target, error: resolveError } = await resolveDemoCliente(admin, email);
    if (resolveError) {
      return jsonResponse({ ok: false, error: resolveError }, 500);
    }

    if (!target) {
      return jsonResponse({ ok: true, skipped: "cliente_no_encontrado" });
    }

    const existingUid = target.DEMO_CAL_BOOKING_UID?.trim() ?? null;
    if (existingUid === uid) {
      return jsonResponse({ ok: true, skipped: "idempotente", id_cliente: target.ID_CLIENTE });
    }
    if (existingUid) {
      return jsonResponse({ ok: true, skipped: "reserva_previa", id_cliente: target.ID_CLIENTE });
    }

    const { error: updateError } = await admin
      .from("CLIENTES")
      .update({
        DEMO_CAL_MEETING_AT: startTime,
        DEMO_CAL_BOOKING_UID: uid,
        ESTADO_CLIENTE: "Activo",
      })
      .eq("ID_CLIENTE", target.ID_CLIENTE)
      .is("DEMO_CAL_BOOKING_UID", null);

    if (updateError) {
      console.error("cal-demo-booking update failed", updateError);
      return jsonResponse({ ok: false, error: updateError.message }, 500);
    }

    return jsonResponse({
      ok: true,
      id_cliente: target.ID_CLIENTE,
      demo_cal_meeting_at: startTime,
      demo_cal_booking_uid: uid,
    });
  },
};
