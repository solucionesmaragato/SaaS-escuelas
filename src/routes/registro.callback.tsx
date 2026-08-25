import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Music4 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { homePathForRole } from "@/lib/homePath";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  clearDemoRegistroForm,
  normalizeEmail,
  readDemoRegistroForm,
} from "@/lib/demoRegistroStorage";
import { invokeProvisionDemo } from "@/lib/provisionDemo";
import { isDemoTenantId } from "@/lib/demoTrial";
import { toast } from "sonner";

export const Route = createFileRoute("/registro/callback")({
  component: RegistroCallbackPage,
});

function RegistroCallbackPage() {
  const navigate = useNavigate();
  const { signOut, perfilesLoading, activePerfil, isAuthenticated, loading, perfiles } = useApp();
  const [phase, setPhase] = useState<"waiting" | "provisioning" | "error">("waiting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading || perfilesLoading || startedRef.current) return;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.user) {
        setPhase("error");
        setErrorMessage("No se completó el inicio de sesión. Vuelve a intentarlo.");
        return;
      }

      const demoPerfil = perfiles.find((p) => isDemoTenantId(p.ID_CLIENTE));
      if (demoPerfil) {
        clearDemoRegistroForm();
        navigate({ to: homePathForRole(demoPerfil.ROL), replace: true });
        return;
      }

      const form = readDemoRegistroForm();
      if (!form) {
        navigate({ to: "/registro", replace: true });
        return;
      }

      const oauthEmail = normalizeEmail(session.user.email ?? "");
      if (!oauthEmail || oauthEmail !== form.email) {
        clearDemoRegistroForm();
        await signOut();
        setPhase("error");
        setErrorMessage(
          `El correo de OAuth (${oauthEmail || "desconocido"}) no coincide con el del formulario (${form.email}). No se ha creado ningún entorno demo.`,
        );
        return;
      }

      startedRef.current = true;
      setPhase("provisioning");

      try {
        const data = await invokeProvisionDemo({
          nombre: form.nombre,
          telefono: form.telefono,
          email: form.email,
        });

        clearDemoRegistroForm();
        toast.success(`Entorno ${data.id_cliente ?? "demo"} listo. ¡Bienvenido!`);

        window.location.replace("/dashboard");
      } catch (err) {
        setPhase("error");
        setErrorMessage(err instanceof Error ? err.message : "Error al crear el entorno demo.");
      }
    })();
  }, [loading, perfilesLoading, perfiles, activePerfil, navigate, signOut]);

  if (!loading && !perfilesLoading && isAuthenticated && activePerfil && phase === "waiting") {
    return <Navigate to={homePathForRole(activePerfil.ROL)} replace />;
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <Music4 className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl">No se pudo completar el registro</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" asChild>
              <Link to="/registro">Volver al registro</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login">Ir al login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-background via-background to-muted px-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        {phase === "provisioning"
          ? "Creando tu entorno demo con datos de Madrid…"
          : "Verificando tu sesión…"}
      </p>
    </div>
  );
}
