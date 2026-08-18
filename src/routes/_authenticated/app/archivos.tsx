import { createFileRoute } from "@tanstack/react-router";
import { TeacherArchivosDashboard } from "@/components/archivos/TeacherArchivosDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { isProfesorRole } from "@/lib/tenantQuery";

export const Route = createFileRoute("/_authenticated/app/archivos")({
  component: ProfesorArchivosPage,
});

function ProfesorArchivosPage() {
  const { rol, perfil } = useActiveTenant();

  if (!isProfesorRole(rol) || !perfil.ID_PROFESOR?.trim()) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis archivos"
        description="Organiza y consulta tus PDFs e imágenes personales"
      />
      <TeacherArchivosDashboard />
    </div>
  );
}
