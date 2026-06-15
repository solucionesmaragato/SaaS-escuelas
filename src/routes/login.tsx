import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Music4 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.3 0-6-2.74-6-6.1S8.7 5.9 12 5.9c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.95 3.36 14.7 2.4 12 2.4 6.92 2.4 2.8 6.52 2.8 11.6S6.92 20.8 12 20.8c6.93 0 9.2-4.86 9.2-7.4 0-.5-.05-.88-.12-1.2H12z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 23 23" className="h-5 w-5" aria-hidden>
      <path fill="#F25022" d="M0 0h11v11H0z" />
      <path fill="#7FBA00" d="M12 0h11v11H12z" />
      <path fill="#00A4EF" d="M0 12h11v11H0z" />
      <path fill="#FFB900" d="M12 12h11v11H12z" />
    </svg>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useApp();
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const handleGoogle = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
          queryParams: { access_type: "offline", prompt: "consent" },
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Music4 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Music School OS</CardTitle>
          <CardDescription>Accede a tu escuela con tu cuenta corporativa o personal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleGoogle}
            disabled={submitting}
            variant="outline"
            size="lg"
            className="w-full justify-center gap-3"
          >
            <GoogleIcon />
            {submitting ? "Redirigiendo..." : "Iniciar sesión con Google"}
          </Button>

          <Button
            onClick={handleMicrosoft}
            disabled={submitting}
            variant="outline"
            size="lg"
            className="w-full justify-center gap-3"
          >
            <MicrosoftIcon />
            {submitting ? "Redirigiendo..." : "Iniciar sesión con Outlook / Microsoft"}
          </Button>

          <p className="text-center text-xs text-muted-foreground pt-2">
            Solo el personal autorizado puede acceder. Si tu cuenta no está vinculada a ninguna escuela, contacta con tu administrador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}