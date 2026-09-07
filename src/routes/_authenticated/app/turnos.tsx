import { createFileRoute } from "@tanstack/react-router";
import { TeacherTurnosDashboard } from "@/components/turnos/TeacherTurnosDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/app/turnos")({
  component: ProfesorTurnosPage,
});

function ProfesorTurnosPage() {
  const { rol } = useActiveTenant();

  if (!hasPermission(rol, "turnos:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader title="Mi disponibilidad" description="Consulta tus franjas horarias semanales" />
      <TeacherTurnosDashboard />
    </div>
  );
}
