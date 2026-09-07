import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { homePathForRole } from "@/lib/homePath";
import { WorkspaceOptionCard } from "@/components/workspace/WorkspaceOptionCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/select-tenant")({
  component: SelectTenantPage,
});

function SelectTenantPage() {
  const navigate = useNavigate();
  const {
    loading,
    perfilesLoading,
    isAuthenticated,
    perfiles,
    workspaceOptions,
    activePerfil,
    activateWorkspace,
    signOut,
  } = useApp();
  const [activatingId, setActivatingId] = useState<string | null>(null);

  useEffect(() => {
    if (loading || perfilesLoading) return;
    if (!isAuthenticated) return;
    if (perfiles.length !== 1) return;

    if (activePerfil) {
      navigate({ to: homePathForRole(activePerfil.ROL), replace: true });
      return;
    }

    activateWorkspace(perfiles[0].ID_PERFIL)
      .then(() => navigate({ to: homePathForRole(perfiles[0].ROL), replace: true }))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "No se pudo activar el workspace");
      });
  }, [
    loading,
    perfilesLoading,
    isAuthenticated,
    perfiles,
    activePerfil,
    activateWorkspace,
    navigate,
  ]);

  if (loading || perfilesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (perfiles.length === 0) return <Navigate to="/registro" replace />;
  if (perfiles.length === 1) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSelect = async (perfilId: string) => {
    setActivatingId(perfilId);
    try {
      await activateWorkspace(perfilId);
      const selected = perfiles.find((p) => p.ID_PERFIL === perfilId);
      navigate({ to: homePathForRole(selected?.ROL), replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo activar el workspace");
    } finally {
      setActivatingId(null);
    }
  };

  const count = workspaceOptions.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-6xl space-y-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Selecciona tu workspace</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground">
            Tu cuenta tiene acceso a varios centros. Elige la escuela y el centro con los que
            quieres trabajar en esta sesión.
          </p>
        </div>

        <div
          className={cn(
            "mx-auto grid w-full gap-5",
            count === 1 && "max-w-sm",
            count === 2 && "max-w-3xl sm:grid-cols-2",
            count >= 3 && "sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          {workspaceOptions.map((option) => (
            <WorkspaceOptionCard
              key={option.perfil.ID_PERFIL}
              option={option}
              isActivating={activatingId === option.perfil.ID_PERFIL}
              disabled={!!activatingId}
              onSelect={() => handleSelect(option.perfil.ID_PERFIL)}
            />
          ))}
        </div>

        <div className="flex justify-center pt-2">
          <Button variant="ghost" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
