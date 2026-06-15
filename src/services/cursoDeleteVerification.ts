import { supabase } from "@/integrations/supabase/client";

export async function getSessionUserEmail(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userEmail = session?.user?.email?.trim();
  if (!userEmail) {
    throw new Error("No se pudo obtener el email del usuario en la sesión activa.");
  }
  return userEmail;
}

export async function triggerCursoDeleteOtp(courseId: string): Promise<void> {
  const userEmail = await getSessionUserEmail();

  const { error } = await supabase.rpc("generar_codigo_verificacion_curso", {
    p_id_curso: courseId,
    p_email: userEmail,
  });

  if (error) throw error;
}

export async function verifyCursoDeleteOtp(
  targetCourseId: string,
  verificationOtp: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("VERIFICACIONES_OTP")
    .select("*")
    .eq("ID_CURSO", targetCourseId)
    .eq("CODIGO", verificationOtp)
    .gt("EXPIRA_AT", new Date().toISOString())
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error(
        "El código es incorrecto o ha expirado. Comprueba el correo e inténtalo de nuevo.",
      );
    }
    throw error;
  }

  if (!data) {
    throw new Error(
      "El código es incorrecto o ha expirado. Comprueba el correo e inténtalo de nuevo.",
    );
  }
}

export async function deleteCursoEscolar(targetCourseId: string): Promise<void> {
  const { error } = await supabase
    .from("CURSO_ESCOLAR")
    .delete()
    .eq("ID_CURSO", targetCourseId);

  if (error) throw error;
}
