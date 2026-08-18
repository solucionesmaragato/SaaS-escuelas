import { createFileRoute } from "@tanstack/react-router";
import { UserCircle } from "lucide-react";
import { TeacherDatosPersonalesDashboard } from "@/components/profesores/TeacherDatosPersonalesDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { canViewMiPerfilNav } from "@/lib/tenantQuery";

export const Route = createFileRoute("/_authenticated/app/datos-personales")({
  component: ProfesorDatosPersonalesPage,
});

function ProfesorDatosPersonalesPage() {
  const { rol, perfil } = useActiveTenant();

  if (!canViewMiPerfilNav(rol, perfil.ID_PROFESOR)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-muted-foreground" />
            Mis datos personales
          </span>
        }
        description="Actualiza tu información de contacto. Los datos de contrato y saldos son de solo lectura."
      />
      <TeacherDatosPersonalesDashboard />
    </div>
  );
}
