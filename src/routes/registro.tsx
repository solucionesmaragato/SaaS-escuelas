import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { homePathForRole } from "@/lib/homePath";
import { OAuthProviderButtons } from "@/components/auth/OAuthProviderButtons";
import { invokePreProvisionDemo, invokeProvisionDemo } from "@/lib/provisionDemo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  clearDemoRegistroForm,
  normalizeEmail,
  readDemoRegistroForm,
  saveDemoRegistroForm,
  validateDemoRegistroForm,
  type DemoRegistroForm,
} from "@/lib/demoRegistroStorage";
import { isDemoTenantId } from "@/lib/demoTrial";
import { toast } from "sonner";

export const Route = createFileRoute("/registro")({
  component: RegistroPage,
});

function RegistroPage() {
  const {
    loading,
    perfilesLoading,
    isAuthenticated,
    needsTenantSelection,
    activePerfil,
    perfiles,
    session,
  } = useApp();
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const autoProvisionStartedRef = useRef(false);

  const sessionEmail = session?.user?.email ? normalizeEmail(session.user.email) : "";
  const hasSessionNoPerfil = isAuthenticated && !activePerfil && !needsTenantSelection;

  useEffect(() => {
    const stored = readDemoRegistroForm();
    if (!stored) return;
    setNombre(stored.nombre);
    setTelefono(stored.telefono);
    setEmail(stored.email);
  }, []);

  useEffect(() => {
    if (!hasSessionNoPerfil || !sessionEmail || email.trim()) return;
    setEmail(sessionEmail);
  }, [hasSessionNoPerfil, sessionEmail, email]);

  useEffect(() => {
    if (loading || perfilesLoading || !hasSessionNoPerfil || autoProvisionStartedRef.current) {
      return;
    }

    const form = readDemoRegistroForm();
    if (!form || validateDemoRegistroForm(form)) return;
    if (form.email !== sessionEmail) return;

    autoProvisionStartedRef.current = true;
    setSubmitting(true);

    (async () => {
      try {
        const data = await invokeProvisionDemo(form);
        clearDemoRegistroForm();
        toast.success(`Entorno ${data.id_cliente ?? "demo"} listo. ¡Bienvenido!`);
        window.location.replace("/dashboard");
      } catch (err) {
        autoProvisionStartedRef.current = false;
        setSubmitting(false);
        toast.error(err instanceof Error ? err.message : "Error al crear el entorno demo.");
      }
    })();
  }, [hasSessionNoPerfil, loading, perfilesLoading, sessionEmail]);

  if (loading || (isAuthenticated && perfilesLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated && needsTenantSelection) {
    return <Navigate to="/select-tenant" replace />;
  }

  const demoPerfil = perfiles.find((p) => isDemoTenantId(p.ID_CLIENTE));
  if (isAuthenticated && demoPerfil) {
    return <Navigate to={homePathForRole(demoPerfil.ROL)} replace />;
  }

  if (submitting && hasSessionNoPerfil) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-background via-background to-muted px-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Creando tu entorno demo con datos de Madrid…</p>
      </div>
    );
  }

  if (submitting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-background via-background to-muted px-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Preparando entorno demo…</p>
      </div>
    );
  }

  const buildForm = (): DemoRegistroForm => ({
    nombre: nombre.trim(),
    telefono: telefono.trim(),
    email: normalizeEmail(email),
  });

  const provisionDirect = async () => {
    const form = buildForm();
    const validationError = validateDemoRegistroForm(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (!sessionEmail) {
      toast.error("No se pudo leer el correo de tu sesión OAuth.");
      return;
    }

    if (form.email !== sessionEmail) {
      toast.error(
        `El correo del formulario (${form.email}) debe coincidir con tu sesión (${sessionEmail}).`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const data = await invokeProvisionDemo(form);
      clearDemoRegistroForm();
      toast.success(`Entorno ${data.id_cliente ?? "demo"} listo. ¡Bienvenido!`);
      window.location.replace("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el entorno demo.");
      setSubmitting(false);
    }
  };

  const startOAuth = async (provider: "google" | "azure") => {
    const form = buildForm();
    const validationError = validateDemoRegistroForm(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    saveDemoRegistroForm(form);
    setSubmitting(true);

    try {
      await invokePreProvisionDemo(form);
    } catch (err) {
      setSubmitting(false);
      toast.error(err instanceof Error ? err.message : "No se pudo preparar el entorno demo.");
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/registro/callback`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setSubmitting(false);
      toast.error(err instanceof Error ? err.message : "No se pudo continuar con OAuth");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-10">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/login">Ya tengo cuenta</Link>
        </Button>
      </div>

      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <AppLogo onLight className="max-h-20" />
          </div>
          <CardDescription>
            {hasSessionNoPerfil
              ? "Prueba gratuita: completa tus datos para crear tu entorno demo con datos de Madrid."
              : "Prueba gratuita: crea tu entorno demo. Solo Madrid, datos de ejemplo incluidos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre y apellidos</Label>
            <Input
              id="nombre"
              autoComplete="name"
              placeholder="María García López"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              type="tel"
              autoComplete="tel"
              placeholder="612 345 678"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting || hasSessionNoPerfil}
              readOnly={hasSessionNoPerfil}
            />
            <p className="text-xs text-muted-foreground">
              {hasSessionNoPerfil
                ? `Sesión activa como ${sessionEmail}. El correo debe coincidir con OAuth.`
                : "Usa el mismo correo al iniciar sesión con Google o Microsoft."}
            </p>
          </div>

          {hasSessionNoPerfil ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={submitting}
              onClick={() => provisionDirect()}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando entorno demo…
                </>
              ) : (
                "Crear entorno demo"
              )}
            </Button>
          ) : (
            <OAuthProviderButtons
              submitting={submitting}
              onGoogle={() => startOAuth("google")}
              onMicrosoft={() => startOAuth("azure")}
            />
          )}

          <p className="text-center text-xs text-muted-foreground pt-1">
            Entorno de prueba sin facturación real ni cobros.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
