import { useState } from "react";
import { Outlet, Navigate, createFileRoute, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { PanelLeft, Home, CalendarDays, Clock, Users } from "lucide-react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { useProfesorMobileShell } from "@/hooks/useProfesorMobileShell";
import { cn } from "@/lib/utils";

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

  return <AuthenticatedAppShell />;
}

function AuthenticatedAppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const showMobileShell = useProfesorMobileShell();

  return (
    <SidebarProvider
      open={isSidebarOpen}
      onOpenChange={setIsSidebarOpen}
      className="h-svh overflow-hidden"
    >
      <AuthenticatedShellContent
        isSidebarOpen={isSidebarOpen}
        showMobileShell={showMobileShell}
      />
    </SidebarProvider>
  );
}

const BOTTOM_NAV_ITEMS = [
  { to: "/fichajes", label: "Fichajes", icon: Clock, activeColor: "text-amber-500" },
  { to: "/alumnos", label: "Alumnos", icon: Users, activeColor: "text-blue-500" },
  { to: "/sesiones", label: "Sesiones", icon: CalendarDays, activeColor: "text-emerald-500" },
  { to: "/dashboard", label: "Menu", icon: Home, activeColor: "text-zinc-700 dark:text-zinc-300" },
] as const;

function ProfesorBottomNav() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Navegación principal"
      className="shrink-0 border-t bg-background/95 backdrop-blur safe-area-inset-bottom"
    >
      <div className="grid grid-cols-4">
        {BOTTOM_NAV_ITEMS.map(({ to, label, icon: Icon, activeColor }) => {
          const isActive =
            to === "/dashboard"
              ? currentPath === "/dashboard" || currentPath === "/"
              : currentPath === to || currentPath.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                isActive ? activeColor : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn("h-5 w-5 shrink-0 transition-colors", activeColor)}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AuthenticatedShellContent({
  isSidebarOpen,
  showMobileShell,
}: {
  isSidebarOpen: boolean;
  showMobileShell: boolean;
}) {
  const { toggleSidebar } = useSidebar();

  return (
    <div className="flex h-full min-h-0 w-full bg-muted/30">
      {!showMobileShell && <AppSidebar isOpen={isSidebarOpen} />}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          {!showMobileShell && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={isSidebarOpen ? "Contraer menú lateral" : "Expandir menú lateral"}
              aria-expanded={isSidebarOpen}
              onClick={toggleSidebar}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
          )}
          <WorkspaceSwitcher />
          <div className="flex-1" />
        </header>
        <main
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-6",
            showMobileShell && "pb-safe",
          )}
        >
          <Outlet />
        </main>
        {showMobileShell && <ProfesorBottomNav />}
      </div>
    </div>
  );
}
