// Aviso interno de nueva demo vía SMTP Arsys (serviciodecorreo).
// Secrets en Supabase (nunca en repo):
//   ARSYS_SMTP_HOST, ARSYS_SMTP_PORT, ARSYS_SMTP_USER, ARSYS_SMTP_PASS
//   DEMO_NOTIFY_TO, DEMO_NOTIFY_FROM
// Deploy: supabase functions deploy pre-provisionar-demo provisionar-demo

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export type DemoSignupNotifySource = "pre-provision" | "provision";

export async function notifyDemoSignup(input: {
  nombre: string;
  telefono: string;
  email: string;
  idCliente?: string;
  idCentro?: string;
  source: DemoSignupNotifySource;
}): Promise<void> {
  const host = Deno.env.get("ARSYS_SMTP_HOST")?.trim();
  const portRaw = Deno.env.get("ARSYS_SMTP_PORT")?.trim();
  const user = Deno.env.get("ARSYS_SMTP_USER")?.trim();
  const pass = Deno.env.get("ARSYS_SMTP_PASS");
  const from = Deno.env.get("DEMO_NOTIFY_FROM")?.trim();
  const to = Deno.env.get("DEMO_NOTIFY_TO")?.trim() || "info@mysincoppa.com";

  if (!host || !portRaw || !user || !pass || !from) {
    console.warn(
      "[notifyDemoSignup] SMTP no configurado (faltan ARSYS_SMTP_* o DEMO_NOTIFY_FROM); se omite el aviso.",
    );
    return;
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    console.warn("[notifyDemoSignup] ARSYS_SMTP_PORT inválido; se omite el aviso.");
    return;
  }

  const subject = `Nueva demo: ${input.nombre}`;
  const body = [
    "Nueva solicitud de demo en MySincoppa",
    "",
    "Origen: demo iniciada",
    `Nombre: ${input.nombre}`,
    `Email: ${input.email}`,
    `Teléfono: ${input.telefono}`,
    `ID cliente: ${input.idCliente ?? "—"}`,
    `ID centro: ${input.idCentro ?? "—"}`,
    `Fecha (UTC): ${new Date().toISOString()}`,
  ].join("\n");

  const client = new SMTPClient({
    connection: {
      hostname: host,
      port,
      tls: true,
      auth: {
        username: user,
        password: pass,
      },
    },
  });

  try {
    await client.send({
      from,
      to,
      subject,
      content: body,
    });
  } finally {
    await client.close();
  }
}
