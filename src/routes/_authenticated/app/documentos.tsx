import { createFileRoute } from "@tanstack/react-router";
import { TeacherDocumentosDashboard } from "@/components/documentos/TeacherDocumentosDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";

type DocumentosSearch = {
  documentoId?: string;
};

export const Route = createFileRoute("/_authenticated/app/documentos")({
  validateSearch: (search: Record<string, unknown>): DocumentosSearch => {
    const documentoId =
      typeof search.documentoId === "string" && search.documentoId ? search.documentoId : undefined;
    return documentoId ? { documentoId } : {};
  },
  component: ProfesorDocumentosPage,
});

function ProfesorDocumentosPage() {
  const { rol } = useActiveTenant();
  const { documentoId } = Route.useSearch();

  if (!hasPermission(rol, "documentos:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis documentos legales"
        description="Consulta, abre y firma tus documentos asignados"
      />
      <TeacherDocumentosDashboard initialDocumentoId={documentoId} />
    </div>
  );
}
