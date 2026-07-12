import { useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell, Users, GraduationCap, DoorOpen, Music2,
  CalendarDays, ClipboardList, AlertTriangle, UserPlus,
  Tags, Banknote, Clock, CalendarOff, FileText, CalendarClock,
  Building2, LogOut, UserCog, MessageSquare, UsersRound, UserCircle, Package,
  ClipboardCheck, ScrollText, HardDrive,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useApp, useActiveTenant } from "@/context/AppContext";
import { useGrupos, canViewGruposNav } from "@/hooks/useGrupos";
import { useAvisosInternos } from "@/hooks/useAvisosInternos";
import { hasAnyPermission, ROLE_LABEL, type Permission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import {
  canViewAlumnosModule,
  canViewMiPerfilNav,
  canViewUsuariosYMensajes,
  isMasterRole,
  isProfesorRole,
} from "@/lib/tenantQuery";

interface NavItem {
  title: string;
  to: string;
  icon: LucideIcon;
  perms?: Permission[];
  masterOnly?: boolean;
  usuariosAccess?: boolean;
  mensajesAccess?: boolean;
  gruposAccess?: boolean;
  miPerfilAccess?: boolean;
  alumnosModuleAccess?: boolean;
  /** Hidden from PROFESOR navigation (e.g. Avisos). */
  hideForProfesor?: boolean;
  /** Visible only to PROFESOR (e.g. Mis archivos). */
  profesorOnly?: boolean;
}

const SIDEBAR_ROLE_LABEL: Record<string, string> = {
  MASTER: "Master",
  ADMIN: "Admin",
  DIRECCION: "Dirección",
  SECRETARIA: "Secretaría",
  PROFESOR: "Profesor",
};

interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Soft pastel icon tones for light backgrounds. */
const NAV_GROUP_ICON_COLORS: Record<string, string> = {
  Personas: "text-indigo-400",
  Académico: "text-emerald-400",
  "Recursos humanos": "text-amber-500",
  Facturación: "text-purple-400",
  Configuración: "text-slate-400",
  Alertas: "text-red-500",
};

/** Chromatic icon tones for PROFESOR sidebar blocks. */
const PROFESOR_GROUP_ICON_COLORS: Record<string, string> = {
  Académico: "text-emerald-400",
  "Recursos humanos": "text-amber-500",
  Personas: "text-blue-500",
  Alertas: "text-red-500",
};

const DEFAULT_NAV_ICON_COLOR = "text-muted-foreground";

const NAV: NavGroup[] = [
  {
    label: "Panel",
    items: [
      { title: "Avisos", to: "/dashboard", icon: Bell, hideForProfesor: true },
      {
        title: "Mis datos personales",
        to: "/profesores/mi-perfil",
        icon: UserCircle,
        miPerfilAccess: true,
      },
    ],
  },
  {
    label: "Personas",
    items: [
      { title: "Alumnos", to: "/alumnos", icon: Users, alumnosModuleAccess: true },
      { title: "Nuevos Alumnos", to: "/leads", icon: UserPlus, perms: ["leads:read"] },
      { title: "Incidencias", to: "/incidencias", icon: AlertTriangle, perms: ["incidencias:read"] },
      { title: "Profesores", to: "/profesores", icon: GraduationCap, perms: ["profesores:read"] },
    ],
  },
  {
    label: "Académico",
    items: [
      { title: "Sesiones", to: "/sesiones", icon: CalendarDays, perms: ["sesiones:read"] },
      { title: "Grupos", to: "/grupos", icon: UsersRound, gruposAccess: true },
      { title: "Evaluaciones", to: "/evaluaciones", icon: ClipboardCheck, perms: ["evaluaciones:read"] },
      { title: "Matrículas", to: "/matriculas", icon: ClipboardList, perms: ["matriculas:read"] },
      {
        title: "Préstamos de material",
        to: "/prestamosMaterial",
        icon: Package,
        perms: ["prestamos:read", "prestamos:write"],
      },
    ],
  },
  {
    label: "Facturación",
    items: [
      { title: "Facturas", to: "/facturas", icon: ScrollText, perms: ["recibos:read"] },
      { title: "Recibos Mensuales", to: "/remesas", icon: Banknote, perms: ["remesas:write"] },
      { title: "Tarifas", to: "/tarifas", icon: Tags, perms: ["tarifas:read"] },
    ],
  },
  {
    label: "Recursos humanos",
    items: [
      { title: "Fichajes", to: "/fichajes", icon: Clock, perms: ["fichajes:read:all", "fichajes:write:own"] },
      { title: "Permisos", to: "/ausencias", icon: CalendarOff, perms: ["ausencias:write", "ausencias:read"] },
      { title: "Documentos legales", to: "/documentos", icon: FileText, perms: ["documentos:write", "documentos:read"] },
      { title: "Disponibilidad horaria", to: "/turnos", icon: CalendarClock, perms: ["turnos:read", "turnos:write"] },
    ],
  },
  {
    label: "Configuración",
    items: [
      { title: "Usuarios", to: "/usuarios", icon: UserCog, usuariosAccess: true },
      { title: "Aulas", to: "/aulas", icon: DoorOpen, perms: ["aulas:write"] },
      { title: "Especialidades", to: "/especialidades", icon: Music2, perms: ["especialidades:write"] },
      { title: "Escuela y centros", to: "/escuela", icon: Building2, perms: ["clientes:write"] },
      { title: "Mensajes automáticos", to: "/mensajesAutomaticos", icon: MessageSquare, mensajesAccess: true },
      { title: "Clientes", to: "/clientes", icon: Building2, masterOnly: true },
    ],
  },
];

/** PROFESOR-only navigation — chromatic block order mirroring ProfesorMobileMenuGrid. */
const PROFESOR_NAV: NavGroup[] = [
  {
    label: "Académico",
    items: [
      { title: "Sesiones", to: "/sesiones", icon: CalendarDays, perms: ["sesiones:read"] },
      { title: "Grupos", to: "/grupos", icon: UsersRound, gruposAccess: true },
      { title: "Evaluaciones", to: "/evaluaciones", icon: ClipboardCheck, perms: ["evaluaciones:read"] },
      {
        title: "Préstamos de material",
        to: "/prestamosMaterial",
        icon: Package,
        perms: ["prestamos:read", "prestamos:write"],
      },
    ],
  },
  {
    label: "Recursos humanos",
    items: [
      { title: "Fichajes", to: "/fichajes", icon: Clock, perms: ["fichajes:read:all", "fichajes:write:own"] },
      { title: "Permisos", to: "/ausencias", icon: CalendarOff, perms: ["ausencias:write", "ausencias:read"] },
      { title: "Disponibilidad horaria", to: "/turnos", icon: CalendarClock, perms: ["turnos:read", "turnos:write"] },
      { title: "Documentos legales", to: "/documentos", icon: FileText, perms: ["documentos:write", "documentos:read"] },
      { title: "Mis archivos", to: "/mis-archivos", icon: HardDrive },
    ],
  },
  {
    label: "Personas",
    items: [
      { title: "Alumnos", to: "/alumnos", icon: Users, alumnosModuleAccess: true },
      {
        title: "Mis datos personales",
        to: "/profesores/mi-perfil",
        icon: UserCircle,
        miPerfilAccess: true,
      },
    ],
  },
  {
    label: "Alertas",
    items: [
      { title: "Incidencias", to: "/incidencias", icon: AlertTriangle, perms: ["incidencias:read"] },
    ],
  },
];

function AvisosNavIcon({ baseColorClass }: { baseColorClass: string }) {
  const { list } = useAvisosInternos();
  const pendingCount = useMemo(
    () => (list.data ?? []).filter((aviso) => aviso.LEIDO === false).length,
    [list.data],
  );

  return (
    <Bell
      className={cn(
        "h-4 w-4 shrink-0",
        pendingCount > 0 ? "text-red-500 fill-red-500" : baseColorClass,
      )}
    />
  );
}

export function AppSidebar({ isOpen = true }: { isOpen?: boolean }) {
  const { isMobile } = useSidebar();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { rol, cliente, perfil } = useActiveTenant();
  const { activePerfil, signOut } = useApp();
  const { list: gruposList } = useGrupos();
  const grupos = gruposList.data?.grupos ?? [];
  const showGruposNav = canViewGruposNav(rol, grupos, perfil.ID_PROFESOR);
  const isProfesor = isProfesorRole(rol);
  const navGroups = isProfesor ? PROFESOR_NAV : NAV;

  const filterVisibleItems = (items: NavItem[]) =>
    items.filter((i) => {
      if (isProfesor && i.hideForProfesor) return false;
      if (i.profesorOnly) return isProfesorRole(rol);
      if (i.masterOnly) return isMasterRole(rol);
      if (i.miPerfilAccess) return canViewMiPerfilNav(rol, perfil.ID_PROFESOR);
      if (i.gruposAccess) return showGruposNav;
      if (i.alumnosModuleAccess) {
        return canViewAlumnosModule(rol) || isProfesorRole(rol);
      }
      if (i.usuariosAccess || i.mensajesAccess) return canViewUsuariosYMensajes(rol);
      return !i.perms || hasAnyPermission(rol, i.perms);
    });

  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "icon"} className="h-svh">
      <SidebarHeader className="shrink-0 border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar className="h-8 w-8 shrink-0 rounded-md">
            {cliente?.APP_LOGO ? <AvatarImage src={cliente.APP_LOGO} alt={cliente.NOMBRE_ESCUELA} /> : null}
            <AvatarFallback className="rounded-md bg-primary text-primary-foreground text-xs font-semibold">
              {(cliente?.NOMBRE_ESCUELA ?? "ME").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 overflow-hidden transition-[opacity,width] duration-200 ease-linear group-data-[collapsible=icon]:hidden group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
            <div className="truncate text-sm font-semibold">{cliente?.NOMBRE_ESCUELA ?? "Mi escuela"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {SIDEBAR_ROLE_LABEL[rol] ?? ROLE_LABEL[rol] ?? rol}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] group-data-[collapsible=icon]:!overflow-y-auto [&::-webkit-scrollbar]:hidden">
        {navGroups.map((group) => {
          const iconColorClass = isProfesor
            ? (PROFESOR_GROUP_ICON_COLORS[group.label] ?? DEFAULT_NAV_ICON_COLOR)
            : (NAV_GROUP_ICON_COLORS[group.label] ?? DEFAULT_NAV_ICON_COLOR);
          const visible = filterVisibleItems(group.items);
          if (visible.length === 0) return null;
          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const active =
                      item.to === "/profesores"
                        ? currentPath === "/profesores"
                        : currentPath === item.to || currentPath.startsWith(item.to + "/");
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                          <Link
                            to={item.to}
                            className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                          >
                            {item.to === "/dashboard" ? (
                              <AvisosNavIcon baseColorClass={iconColorClass} />
                            ) : (
                              <item.icon className={cn("h-4 w-4 shrink-0", iconColorClass)} />
                            )}
                            <span className="truncate group-data-[collapsible=icon]:hidden">
                              {item.title}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="shrink-0 border-t">
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-xs">
              {(activePerfil?.NOMBRE ?? "??").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 overflow-hidden transition-[opacity,width] duration-200 ease-linear group-data-[collapsible=icon]:hidden group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
            <div className="truncate text-xs font-medium">{activePerfil?.NOMBRE}</div>
            <div className="truncate text-xs text-muted-foreground">
              {SIDEBAR_ROLE_LABEL[rol] ?? ROLE_LABEL[rol] ?? rol}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut()}
            title="Cerrar sesión"
            className="shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
