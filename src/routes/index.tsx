import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useApp } from "@/context/AppContext";
import { homePathForRole } from "@/lib/homePath";

export const Route = createFileRoute("/")({
  component: IndexRedirect,
});

function IndexRedirect() {
  const { loading, perfilesLoading, isAuthenticated, needsTenantSelection, activePerfil } =
    useApp();

  if (loading || (isAuthenticated && perfilesLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (needsTenantSelection) return <Navigate to="/select-tenant" replace />;
  return <Navigate to={homePathForRole(activePerfil?.ROL)} replace />;
}
