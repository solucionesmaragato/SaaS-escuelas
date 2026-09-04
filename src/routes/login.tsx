import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppLogo } from "@/components/AppLogo";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { homePathForRole } from "@/lib/homePath";
import { OAuthProviderButtons } from "@/components/auth/OAuthProviderButtons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { loading, perfilesLoading, isAuthenticated, needsTenantSelection, activePerfil, perfiles } =
    useApp();
  const [submitting, setSubmitting] = useState(false);

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
  if (isAuthenticated && perfiles.length === 0) {
    return <Navigate to="/registro" replace />;
  }
  if (isAuthenticated) return <Navigate to={homePathForRole(activePerfil?.ROL)} replace />;

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setSubmitting(false);
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión con Google");
    }
  };

  const handleMicrosoft = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (err) {
      setSubmitting(false);
      toast.error(err instanceof Error ? err.message : "No se pudo iniciar sesión con Microsoft");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <Button variant="outline" size="sm" asChild>
          <Link to="/registro">Regístrate</Link>
        </Button>
      </div>
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex justify-center">
            <AppLogo onLight className="max-h-20" />
          </div>
          <CardDescription>Accede a tu escuela con tu cuenta corporativa o personal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <OAuthProviderButtons
            submitting={submitting}
            onGoogle={handleGoogle}
            onMicrosoft={handleMicrosoft}
            googleLabel="Iniciar sesión con Google"
            microsoftLabel="Iniciar sesión con Outlook / Microsoft"
          />

          <p className="text-center text-xs text-muted-foreground pt-2">
            ¿Primera vez?{" "}
            <Link
              to="/registro"
              className="font-medium text-primary underline-offset-4 hover:text-brand-hover hover:underline"
            >
              Regístrate y solicita un entorno demo
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}