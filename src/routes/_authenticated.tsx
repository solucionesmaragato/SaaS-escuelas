import { Outlet, Navigate, createFileRoute } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { useApp } from "@/context/AppContext";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, perfilesLoading, isAuthenticated, needsTenantSelection, activePerfil, perfiles } =
    useApp();

  if (loading || perfilesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (needsTenantSelection || (!activePerfil && perfiles.length > 1)) {
    return <Navigate to="/select-tenant" />;
  }
  if (!activePerfil) {
    // signed in but has zero PERFILES — bad data state
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Sin escuela asignada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta no está vinculada a ninguna escuela. Contacta con tu administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-muted/30">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <WorkspaceSwitcher />
            <div className="flex-1" />
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
