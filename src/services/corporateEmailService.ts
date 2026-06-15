/**
 * Corporate email relay for security-sensitive OTP delivery.
 * Configure VITE_CORPORATE_EMAIL_ENDPOINT to point at Resend, EmailJS, SMTP, or n8n.
 */

const CORPORATE_EMAIL_ENDPOINT = import.meta.env.VITE_CORPORATE_EMAIL_ENDPOINT as
  | string
  | undefined;

export type CursoDeleteOtpEmailPayload = {
  to: string;
  code: string;
  courseId: string;
  courseName?: string;
};

export async function sendCursoDeleteOtpEmail(
  payload: CursoDeleteOtpEmailPayload,
): Promise<void> {
  const subject = "Código de verificación — eliminación de curso escolar";
  const body = [
    "Has solicitado eliminar un curso escolar. Este es un paso crítico e irreversible.",
    "",
    `Curso: ${payload.courseName?.trim() || payload.courseId}`,
    `Código de verificación: ${payload.code}`,
    "",
    "El código caduca en breve. Si no has solicitado esta acción, ignora este mensaje.",
  ].join("\n");

  if (!CORPORATE_EMAIL_ENDPOINT?.trim()) {
    console.warn(
      "[corporateEmail] VITE_CORPORATE_EMAIL_ENDPOINT no configurado. OTP generado pero no enviado por correo.",
      { to: payload.to, courseId: payload.courseId },
    );
    return;
  }

  const res = await fetch(CORPORATE_EMAIL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: payload.to,
      subject,
      text: body,
      template: "curso-delete-otp",
      code: payload.code,
      courseId: payload.courseId,
      courseName: payload.courseName ?? null,
    }),
  });

  if (!res.ok) {
    throw new Error("No se pudo enviar el correo corporativo de verificación.");
  }
}
