import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
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

export const Route = createFileRoute("/registro_/callback")({
  component: RegistroCallbackPage,
});

function RegistroCallbackPage() {
  const navigate = useNavigate();
  const { signOut, perfilesLoading, isAuthenticated, loading, perfiles, session } = useApp();
  const [phase, setPhase] = useState<"waiting" | "provisioning" | "error">("waiting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (loading || session?.user) return;

    const timeout = window.setTimeout(() => {
      if (startedRef.current) return;
      setPhase("error");
      setErrorMessage("No se completó el inicio de sesión. Vuelve a intentarlo.");
    }, 12_000);

    return () => window.clearTimeout(timeout);
  }, [loading, session]);

  useEffect(() => {
    if (loading || perfilesLoading || startedRef.current || !session?.user) return;

    (async () => {
      const demoPerfil = perfiles.find((p) => isDemoTenantId(p.ID_CLIENTE));
      if (demoPerfil) {
        startedRef.current = true;
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
  }, [loading, perfilesLoading, perfiles, navigate, signOut, session]);

  const demoPerfilRedirect = perfiles.find((p) => isDemoTenantId(p.ID_CLIENTE));
  if (
    !loading &&
    !perfilesLoading &&
    isAuthenticated &&
    demoPerfilRedirect &&
    phase === "waiting"
  ) {
    return <Navigate to={homePathForRole(demoPerfilRedirect.ROL)} replace />;
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex justify-center">
              <AppLogo onLight className="max-h-16" />
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
      <AppLogo onLight className="mb-2 max-h-16" />
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        {phase === "provisioning"
          ? "Creando tu entorno demo con datos de Madrid…"
          : "Verificando tu sesión…"}
      </p>
    </div>
  );
}
