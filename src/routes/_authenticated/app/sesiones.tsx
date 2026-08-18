import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { ProfesorCalendar } from "@/components/sesiones/ProfesorCalendar";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";

type SesionesSearch = {
  alumnoId?: string;
  horarioId?: string;
  sesionId?: string;
};

export const Route = createFileRoute("/_authenticated/app/sesiones")({
  validateSearch: (search: Record<string, unknown>): SesionesSearch => {
    const alumnoId =
      typeof search.alumnoId === "string" && search.alumnoId ? search.alumnoId : undefined;
    const horarioId =
      typeof search.horarioId === "string" && search.horarioId ? search.horarioId : undefined;
    const sesionId =
      typeof search.sesionId === "string" && search.sesionId ? search.sesionId : undefined;
    return {
      ...(alumnoId ? { alumnoId } : {}),
      ...(horarioId ? { horarioId } : {}),
      ...(sesionId ? { sesionId } : {}),
    };
  },
  component: ProfesorSesionesPage,
});

function ProfesorSesionesPage() {
  const { rol } = useActiveTenant();
  const navigate = useNavigate();
  const { alumnoId, sesionId, horarioId } = Route.useSearch();

  const handleClearSessionDeepLink = useCallback(() => {
    navigate({
      to: "/app/sesiones",
      search: (prev) => ({ ...prev, sesionId: undefined }),
      replace: true,
    });
  }, [navigate]);

  if (!hasPermission(rol, "sesiones:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="-m-4 flex h-full max-h-full min-h-0 flex-col overflow-hidden p-4 sm:-m-6 sm:p-6">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col">
        <ProfesorCalendar
          embedded
          pageTitle="Mis sesiones"
          pageDescription="Tu semana de clases"
          initialAlumnoId={alumnoId}
          initialSesionId={sesionId}
          initialHorarioId={horarioId}
          onSessionDetailClose={handleClearSessionDeepLink}
        />
      </div>
    </div>
  );
}
