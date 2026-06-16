import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, GraduationCap, DoorOpen, Music2,
  CalendarDays, ClipboardList, AlertTriangle, UserPlus,
  Receipt, Tags, Banknote, Clock, CalendarOff, FileText, CalendarClock,
  Building2, LogOut, UserCog, MessageSquare, UsersRound, UserCircle, Package,
  ClipboardCheck, ScrollText,
} from "lucide-react";

import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useApp, useActiveTenant } from "@/context/AppContext";
import { useGrupos, canViewGruposNav } from "@/hooks/useGrupos";
import { hasAnyPermission, ROLE_LABEL, type Permission } from "@/lib/rbac";
import {
  canViewAlumnosModule,
  canViewMiPerfilNav,
  canViewUsuariosYMensajes,
  isMasterRole,
} from "@/lib/tenantQuery";

interface NavItem {
  title: string;
  to: string;
  icon: typeof LayoutDashboard;
  perms?: Permission[];
  masterOnly?: boolean;
  usuariosAccess?: boolean;
  mensajesAccess?: boolean;
  gruposAccess?: boolean;
  miPerfilAccess?: boolean;
  alumnosModuleAccess?: boolean;
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

const NAV: NavGroup[] = [
  {
    label: "Panel",
    items: [
      { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
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
      { title: "Profesores", to: "/profesores", icon: GraduationCap, perms: ["profesores:read"] },
      { title: "Leads", to: "/leads", icon: UserPlus, perms: ["leads:read"] },
      { title: "Incidencias", to: "/incidencias", icon: AlertTriangle, perms: ["incidencias:read"] },
    ],
  },
  {
    label: "Académico",
    items: [
      { title: "Matrículas", to: "/matriculas", icon: ClipboardList, perms: ["matriculas:read"] },
      { title: "Grupos", to: "/grupos", icon: UsersRound, gruposAccess: true },
      { title: "Sesiones", to: "/sesiones", icon: CalendarDays, perms: ["sesiones:read"] },
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
      { title: "Permisos", to: "/ausencias", icon: CalendarOff, perms: ["ausencias:write", "ausencias:read"] },
      { title: "Documentos legales", to: "/documentos", icon: FileText, perms: ["documentos:write", "documentos:read"] },
      { title: "Fichajes", to: "/fichajes", icon: Clock, perms: ["fichajes:read:all", "fichajes:write:own"] },
      { title: "Disponibilidad horaria", to: "/turnos", icon: CalendarClock, perms: ["turnos:read", "turnos:write"] },
    ],
  },
  {
    label: "Facturación",
    items: [
      { title: "Recibos", to: "/recibos", icon: Receipt, perms: ["recibos:read"] },
      { title: "Remesas", to: "/remesas", icon: Banknote, perms: ["remesas:write"] },
      { title: "Facturas", to: "/facturas", icon: ScrollText, perms: ["recibos:read"] },
      { title: "Tarifas", to: "/tarifas", icon: Tags, perms: ["tarifas:read"] },
    ],
  },
  {
    label: "Configuración",
    items: [
      { title: "Especialidades", to: "/especialidades", icon: Music2, perms: ["especialidades:write"] },
      { title: "Aulas", to: "/aulas", icon: DoorOpen, perms: ["aulas:write"] },
      { title: "Usuarios", to: "/usuarios", icon: UserCog, usuariosAccess: true },
      { title: "Mensajes automáticos", to: "/mensajesAutomaticos", icon: MessageSquare, mensajesAccess: true },
      { title: "Escuela y centros", to: "/escuela", icon: Building2, perms: ["clientes:write"] },
      { title: "Clientes", to: "/clientes", icon: Building2, masterOnly: true },
    ],
  },
];

export function AppSidebar() {
  const { isMobile } = useSidebar();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { rol, cliente, perfil } = useActiveTenant();
  const { activePerfil, signOut } = useApp();
  const { list: gruposList } = useGrupos();
  const grupos = gruposList.data?.grupos ?? [];
  const showGruposNav = canViewGruposNav(rol, grupos, perfil.ID_PROFESOR);

  return (
    <Sidebar collapsible={isMobile ? "icon" : "none"}>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar className="h-8 w-8 rounded-md">
            {cliente?.APP_LOGO ? <AvatarImage src={cliente.APP_LOGO} alt={cliente.NOMBRE_ESCUELA} /> : null}
            <AvatarFallback className="rounded-md bg-primary text-primary-foreground text-xs font-semibold">
              {(cliente?.NOMBRE_ESCUELA ?? "ME").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{cliente?.NOMBRE_ESCUELA ?? "Mi escuela"}</div>
            <div className="truncate text-xs text-muted-foreground">
              {SIDEBAR_ROLE_LABEL[rol] ?? ROLE_LABEL[rol] ?? rol}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAV.map((group) => {
          const visible = group.items.filter((i) => {
            if (i.masterOnly) return isMasterRole(rol);
            if (i.miPerfilAccess) return canViewMiPerfilNav(rol, perfil.ID_PROFESOR);
            if (i.gruposAccess) return showGruposNav;
            if (i.alumnosModuleAccess) return canViewAlumnosModule(rol);
            if (i.usuariosAccess || i.mensajesAccess) return canViewUsuariosYMensajes(rol);
            return !i.perms || hasAnyPermission(rol, i.perms);
          });
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
                          <Link to={item.to} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.title}</span>
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

      <SidebarFooter className="border-t">
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">
              {(activePerfil?.NOMBRE ?? "??").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{activePerfil?.NOMBRE}</div>
            <div className="truncate text-xs text-muted-foreground">
              {SIDEBAR_ROLE_LABEL[rol] ?? ROLE_LABEL[rol] ?? rol}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut()} title="Cerrar sesión">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
