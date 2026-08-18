import { createFileRoute } from "@tanstack/react-router";
import { TeacherIncidenciasDashboard } from "@/components/incidencias/TeacherIncidenciasDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/app/incidencias")({
  component: ProfesorIncidenciasPage,
});

function ProfesorIncidenciasPage() {
  const { rol } = useActiveTenant();

  if (!hasPermission(rol, "incidencias:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis incidencias"
        description="Faltas, recuperaciones y consultas de tus alumnos"
      />
      <TeacherIncidenciasDashboard />
    </div>
  );
}
