import { createFileRoute } from "@tanstack/react-router";
import { TeacherPermisosDashboard } from "@/components/permisos/TeacherPermisosDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";

export const Route = createFileRoute("/_authenticated/app/permisos")({
  component: ProfesorPermisosPage,
});

function ProfesorPermisosPage() {
  const { rol } = useActiveTenant();

  if (!hasPermission(rol, "ausencias:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis permisos"
        description="Consulta tus solicitudes y pide vacaciones o ausencias"
      />
      <TeacherPermisosDashboard />
    </div>
  );
}
