import { Outlet, Navigate, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useActiveTenant } from "@/context/AppContext";
import { canViewMiPerfilNav, isProfesorRole } from "@/lib/tenantQuery";

export const Route = createFileRoute("/_authenticated/app")({
  component: ProfesorAppLayout,
});

function ProfesorAppLayout() {
  const { rol, perfil } = useActiveTenant();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (
    pathname === "/app/datos-personales" &&
    canViewMiPerfilNav(rol, perfil.ID_PROFESOR)
  ) {
    return <Outlet />;
  }

  if (!isProfesorRole(rol)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
