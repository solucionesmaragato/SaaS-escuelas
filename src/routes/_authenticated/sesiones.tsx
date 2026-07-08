import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { CalendarWidget } from "@/components/sesiones/CalendarWidget";

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
  const navigate = useNavigate();
  const { alumnoId, sesionId } = Route.useSearch();

  const handleClearSessionDeepLink = useCallback(() => {
    navigate({
      to: "/sesiones",
      search: (prev) => ({ ...prev, sesionId: undefined }),
      replace: true,
    });
  }, [navigate]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <CalendarWidget
        pageTitle="Calendario de Sesiones"
        pageDescription="Vista inteligente de clases, leads e incidencias"
        initialAlumnoId={alumnoId}
        initialSesionId={sesionId}
        onSessionDetailClose={handleClearSessionDeepLink}
      />
    </div>
  );
}
