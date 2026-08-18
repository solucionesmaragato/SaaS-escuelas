import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { CalendarWidget } from "@/components/sesiones/CalendarWidget";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";
import { isProfesorRole } from "@/lib/tenantQuery";
import { cn } from "@/lib/utils";

type SesionesSearch = {
  alumnoId?: string;
  horarioId?: string;
  sesionId?: string;
};

export const Route = createFileRoute("/_authenticated/sesiones")({
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
  component: SesionesCalendarioPage,
});

function SesionesCalendarioPage() {
  const { rol } = useActiveTenant();
  const navigate = useNavigate();
  const { alumnoId, sesionId, horarioId } = Route.useSearch();

  const handleClearSessionDeepLink = useCallback(() => {
    navigate({
      to: "/sesiones",
      search: (prev) => ({ ...prev, sesionId: undefined }),
      replace: true,
    });
  }, [navigate]);

  if (isProfesorRole(rol)) {
    return (
      <Navigate
        to="/app/sesiones"
        search={{
          ...(alumnoId ? { alumnoId } : {}),
          ...(horarioId ? { horarioId } : {}),
          ...(sesionId ? { sesionId } : {}),
        }}
        replace
      />
    );
  }

  if (!hasPermission(rol, "sesiones:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "-m-4 flex h-[calc(100svh-3.5rem)] min-h-0 flex-col overflow-hidden p-4 sm:-m-6 sm:p-6",
      )}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col">
        <CalendarWidget
          embedded
          pageTitle="Calendario de Sesiones"
          pageDescription="Vista inteligente de clases, leads e incidencias"
          initialAlumnoId={alumnoId}
          initialSesionId={sesionId}
          initialHorarioId={horarioId}
          onSessionDetailClose={handleClearSessionDeepLink}
        />
      </div>
    </div>
  );
}
