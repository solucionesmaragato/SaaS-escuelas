import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { SchoolBrandAvatar } from "@/components/workspace/SchoolBrandAvatar";
import { BRAND_BLUE, MYSINCOPPA_SIDEBAR_LOGO_URL } from "@/lib/brand";
import { ROLE_LABEL } from "@/lib/rbac";
import { roleBadgeClass } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const WORKSPACE_ROLE_LABEL: Record<string, string> = {
  MASTER: "Master",
  ADMIN: "Admin",
  DIRECCION: "Dirección",
  SECRETARIA: "Secretaría",
  PROFESOR: "Profesor",
};

export function WorkspaceSwitcher() {
  const router = useRouter();
  const {
    activePerfil,
    activeCliente,
    activeCentro,
    workspaceOptions,
    hasMultipleProfiles,
    activateWorkspace,
  } = useApp();
  const [switching, setSwitching] = useState(false);

  if (!activePerfil) return null;

  const schoolName = activeCliente?.NOMBRE_ESCUELA?.trim() || "Mi escuela";
  const logoUrl = activeCliente?.APP_LOGO?.trim() || MYSINCOPPA_SIDEBAR_LOGO_URL;
  const roleLabel =
    WORKSPACE_ROLE_LABEL[activePerfil.ROL] ?? ROLE_LABEL[activePerfil.ROL] ?? activePerfil.ROL;
  const centerName = activeCentro?.NOMBRE_CENTRO?.trim() || null;

  const handleSwitch = async (perfilId: string) => {
    if (perfilId === activePerfil.ID_PERFIL || switching) return;
    setSwitching(true);
    try {
      await activateWorkspace(perfilId);
      await router.invalidate();
      toast.success("Workspace activado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar de workspace");
    } finally {
      setSwitching(false);
    }
  };

  const content = (
    <div className="flex min-w-0 items-center gap-2 text-left">
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-white">
        <img src={logoUrl} alt={schoolName} className="h-full w-full object-contain" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold" style={{ color: BRAND_BLUE }}>
          {schoolName}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {roleLabel}
          {centerName ? ` · ${centerName}` : ""}
        </div>
      </div>
      {hasMultipleProfiles && <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      {switching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
    </div>
  );

  if (!hasMultipleProfiles) {
    return content;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto max-w-[320px] px-0 py-0 hover:bg-transparent"
          disabled={switching}
        >
          {content}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[340px]">
        <DropdownMenuLabel>Cambiar workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaceOptions.map(({ perfil, cliente, centro }) => {
          const isActive = perfil.ID_PERFIL === activePerfil.ID_PERFIL;
          return (
            <DropdownMenuItem
              key={perfil.ID_PERFIL}
              className="flex cursor-pointer flex-col items-start gap-1 p-3"
              onClick={() => handleSwitch(perfil.ID_PERFIL)}
            >
              <div className="flex w-full items-center gap-3">
                <SchoolBrandAvatar
                  schoolName={cliente?.NOMBRE_ESCUELA?.trim() || "Escuela"}
                  logoUrl={cliente?.APP_LOGO}
                  className="h-9 w-9"
                  fallbackClassName="text-[10px]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">
                      {cliente?.NOMBRE_ESCUELA?.trim() || "Escuela"}
                    </span>
                    <Badge className={roleBadgeClass(perfil.ROL)}>
                      {ROLE_LABEL[perfil.ROL] ?? perfil.ROL}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {centro?.NOMBRE_CENTRO?.trim() || "Sin centro asignado"}
                  </span>
                </div>
              </div>
              {isActive && <span className="text-xs font-medium text-primary">Activo</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
