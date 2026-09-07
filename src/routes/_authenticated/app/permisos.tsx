import { createFileRoute } from "@tanstack/react-router";
import { TeacherPermisosDashboard } from "@/components/permisos/TeacherPermisosDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";

type ProfesorPermisosSearch = {
  permisoId?: string;
};

export const Route = createFileRoute("/_authenticated/app/permisos")({
  validateSearch: (search: Record<string, unknown>): ProfesorPermisosSearch => {
    const permisoId = search.permisoId;
    return typeof permisoId === "string" && permisoId ? { permisoId } : {};
  },
  component: ProfesorPermisosPage,
});

function ProfesorPermisosPage() {
  const { rol } = useActiveTenant();
  const { permisoId } = Route.useSearch();
  const navigate = Route.useNavigate();

  if (!hasPermission(rol, "ausencias:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const handleClearDeepLink = () => {
    navigate({ search: (prev) => ({ ...prev, permisoId: undefined }), replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis permisos"
        description="Consulta tus solicitudes y pide vacaciones o ausencias"
      />
      <TeacherPermisosDashboard
        deepLinkPermisoId={permisoId}
        onClearDeepLink={handleClearDeepLink}
      />
    </div>
  );
}
