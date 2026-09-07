import { useState } from "react";
import { Outlet, Navigate, createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, Clock } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarLogoToggle } from "@/components/SidebarLogoToggle";
import { DemoCalComBanner } from "@/components/DemoCalComBanner";
import { DemoExpiredWall } from "@/components/DemoExpiredWall";
import { MobileBouncer } from "@/components/MobileBouncer";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { AvisosHeaderBell, canViewAvisosHeaderBell } from "@/components/dashboard/AvisosHeaderBell";
import { HelpVideosHeaderButton } from "@/components/help/HelpVideosHeaderButton";
import { useApp, useActiveTenant, ACTIVE_PERFIL_STORAGE_KEY } from "@/context/AppContext";
import { useProfesorMobileShell } from "@/hooks/useProfesorMobileShell";
import { useIsMobile } from "@/hooks/use-mobile";
import { isProfesorRole } from "@/lib/tenantQuery";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const {
    loading,
    perfilesLoading,
    isAuthenticated,
    needsTenantSelection,
    activePerfil,
    perfiles,
    demoTrialBlocked,
    demoTrialChecking,
    demoTrialError,
    refreshDemoTrialGate,
  } = useApp();

  if (loading || perfilesLoading || demoTrialChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" />;
  const storedPerfilId =
    typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_PERFIL_STORAGE_KEY) : null;
  const hasStoredValidPerfil =
    !!storedPerfilId && perfiles.some((p) => p.ID_PERFIL === storedPerfilId);
  if (
    (needsTenantSelection || (!activePerfil && perfiles.length > 1)) &&
    !hasStoredValidPerfil
  ) {
    return <Navigate to="/select-tenant" />;
  }
  if (!activePerfil) {
    if (hasStoredValidPerfil) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      );
    }
    return <Navigate to="/registro" replace />;
  }
  if (demoTrialError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="max-w-md text-center text-sm text-destructive">{demoTrialError}</p>
      </div>
    );
  }
  if (demoTrialBlocked) {
    return <DemoExpiredWall activePerfil={activePerfil} onReactivated={refreshDemoTrialGate} />;
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
      className="min-h-dvh h-dvh overflow-hidden"
    >
      <AuthenticatedShellContent isSidebarOpen={isSidebarOpen} showMobileShell={showMobileShell} />
    </SidebarProvider>
  );
}

const BOTTOM_NAV_ITEMS = [
  { to: "/app/fichajes", label: "Fichajes", icon: Clock, activeColor: "text-amber-500" },
  { to: "/app/sesiones", label: "Sesiones", icon: CalendarDays, activeColor: "text-emerald-500" },
  { to: "/app", label: "Menu", icon: Home, activeColor: "text-zinc-700 dark:text-zinc-300" },
] as const;

function ProfesorBottomNav() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur safe-area-inset-bottom"
    >
      <div className="grid grid-cols-3">
        {BOTTOM_NAV_ITEMS.map(({ to, label, icon: Icon, activeColor }) => {
          const isActive =
            to === "/app"
              ? currentPath === "/app" || currentPath === "/"
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
  const { activePerfil, session } = useApp();
  const { rol } = useActiveTenant();
  const isMobile = useIsMobile();
  const isAppRoute = useRouterState({ select: (s) => s.location.pathname.startsWith("/app") });
  const showAvisosBell =
    canViewAvisosHeaderBell(rol) && (isProfesorRole(rol) ? isAppRoute : true);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-muted/30">
      <div className="flex min-h-0 flex-1">
        {!showMobileShell && <AppSidebar isOpen={isSidebarOpen} />}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
            {!showMobileShell && isMobile ? <SidebarLogoToggle className="shrink-0" /> : null}
            <div className="min-w-0 flex-1">
              <WorkspaceSwitcher />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {showAvisosBell ? <AvisosHeaderBell className="shrink-0" /> : null}
              {!showMobileShell ? <HelpVideosHeaderButton /> : null}
            </div>
            {activePerfil ? (
              <DemoCalComBanner
                activePerfil={activePerfil}
                sessionAccessToken={session?.access_token}
              />
            ) : null}
          </header>
          <main
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-6",
              showMobileShell && "pb-bottom-nav",
            )}
          >
            <Outlet />
          </main>
          {showMobileShell && <ProfesorBottomNav />}
        </div>
      </div>
      <MobileBouncer />
    </div>
  );
}
