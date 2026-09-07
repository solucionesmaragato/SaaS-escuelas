import { createFileRoute } from "@tanstack/react-router";
import { TeacherFichajesDashboard } from "@/components/fichajes/TeacherFichajesDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/app/fichajes")({
  validateSearch: (search: Record<string, unknown>) => {
    const fichajeId = search.fichajeId;
    return typeof fichajeId === "string" && fichajeId ? { fichajeId } : {};
  },
  component: ProfesorFichajesPage,
});

function ProfesorFichajesPage() {
  const { rol } = useActiveTenant();
  const { fichajeId } = Route.useSearch();

  if (!hasPermission(rol, "fichajes:write:own")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <PageHeader title="Fichajes" description="Registro de presencia" />
      <TeacherFichajesDashboard highlightFichajeId={fichajeId} />
    </div>
  );
}
