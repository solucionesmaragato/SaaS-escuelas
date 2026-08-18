import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TeacherGruposDashboard } from "@/components/grupos/TeacherGruposDashboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { useActiveTenant } from "@/context/AppContext";
import { canViewGruposNav, useGrupos } from "@/hooks/useGrupos";

type GruposSearch = {
  grupoId?: string;
};

export const Route = createFileRoute("/_authenticated/app/grupos")({
  validateSearch: (search: Record<string, unknown>): GruposSearch => {
    const grupoId =
      typeof search.grupoId === "string" && search.grupoId ? search.grupoId : undefined;
    return {
      ...(grupoId ? { grupoId } : {}),
    };
  },
  component: ProfesorGruposPage,
});

function ProfesorGruposPage() {
  const { grupoId } = Route.useSearch();
  const { rol, perfil } = useActiveTenant();
  const { list } = useGrupos();
  const grupos = useMemo(() => list.data?.grupos ?? [], [list.data?.grupos]);
  const canViewPage = canViewGruposNav(rol, grupos, perfil.ID_PROFESOR);

  if (!list.isLoading && !canViewPage) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Card className="p-10 text-center text-muted-foreground">
          No tienes grupos asignados. Consulta tu calendario de sesiones para ver tus clases.
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mis grupos"
        description="Consulta tus grupos activos y la lista de alumnos inscritos"
      />
      <TeacherGruposDashboard initialGrupoId={grupoId} />
    </div>
  );
}
