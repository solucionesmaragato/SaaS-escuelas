import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { SandboxScheduleBuilder } from "@/components/sandbox/SandboxScheduleBuilder";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/sandbox-calendar")({
  component: SandboxCalendarPage,
});

function SandboxCalendarPage() {
  const { loading, isAuthenticated, activePerfil } = useApp();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col gap-4 bg-muted/20 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="min-h-[640px] flex-1 rounded-xl" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!activePerfil) return <Navigate to="/select-tenant" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <header className="border-b bg-background/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Sandbox · Schedule Builder</h1>
              <p className="text-sm text-muted-foreground">
                Prototipo drag-and-drop conectado solo a <code className="text-xs">SANDBOX_CALENDARIO</code>
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al panel
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-6">
        <SandboxScheduleBuilder />
      </main>
    </div>
  );
}
