import { createFileRoute } from "@tanstack/react-router";
import { TeacherPrestamosDashboard } from "@/components/prestamos/TeacherPrestamosDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasAnyPermission } from "@/lib/rbac";

type ProfesorPrestamosSearch = {
  prestamoId?: string;
};

export const Route = createFileRoute("/_authenticated/app/prestamos")({
  validateSearch: (search: Record<string, unknown>): ProfesorPrestamosSearch => {
    const prestamoId = search.prestamoId;
    return typeof prestamoId === "string" && prestamoId ? { prestamoId } : {};
  },
  component: ProfesorPrestamosPage,
});

function ProfesorPrestamosPage() {
  const { rol } = useActiveTenant();
  const { prestamoId } = Route.useSearch();
  const navigate = Route.useNavigate();

  if (!hasAnyPermission(rol, ["prestamos:read", "prestamos:write"])) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const handleClearDeepLink = () => {
    navigate({ search: (prev) => ({ ...prev, prestamoId: undefined }), replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis préstamos"
        description="Consulta y registra préstamos de material para ti o tus alumnos"
      />
      <TeacherPrestamosDashboard
        deepLinkPrestamoId={prestamoId}
        onClearDeepLink={handleClearDeepLink}
      />
    </div>
  );
}
