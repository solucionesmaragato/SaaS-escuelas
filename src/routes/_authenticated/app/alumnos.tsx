import { createFileRoute } from "@tanstack/react-router";
import { TeacherAlumnosDashboard } from "@/components/alumnos/TeacherAlumnosDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";
import { isProfesorRole } from "@/lib/tenantQuery";

export const Route = createFileRoute("/_authenticated/app/alumnos")({
  component: ProfesorAlumnosPage,
});

function ProfesorAlumnosPage() {
  const { rol, perfil } = useActiveTenant();

  if (!isProfesorRole(rol) || !perfil.ID_PROFESOR?.trim() || !hasPermission(rol, "alumnos:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis alumnos"
        description="Consulta datos básicos, tutores y horarios activos de tus alumnos"
      />
      <TeacherAlumnosDashboard />
    </div>
  );
}
