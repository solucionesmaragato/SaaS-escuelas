import { Loader2, MapPin } from "lucide-react";
import type { WorkspaceOption } from "@/lib/workspaceProfiles";
import { ROLE_LABEL } from "@/lib/rbac";
import { roleBadgeClass } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SchoolBrandAvatar } from "./SchoolBrandAvatar";

type WorkspaceOptionCardProps = {
  option: WorkspaceOption;
  isActivating?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export function WorkspaceOptionCard({
  option,
  isActivating = false,
  disabled = false,
  onSelect,
}: WorkspaceOptionCardProps) {
  const { perfil, cliente, centro } = option;
  const schoolName = cliente?.NOMBRE_ESCUELA?.trim() || "Escuela";
  const centerName = centro?.NOMBRE_CENTRO?.trim() || "Sin centro asignado";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "group relative flex h-full w-full flex-col rounded-2xl border bg-card p-6 text-left shadow-sm transition",
        "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      <Badge
        className={cn(
          "absolute right-4 top-4 text-[10px] font-semibold uppercase tracking-wide",
          roleBadgeClass(perfil.ROL),
        )}
      >
        {ROLE_LABEL[perfil.ROL] ?? perfil.ROL}
      </Badge>

      <div className="mb-5 flex items-center gap-4 pr-16">
        {isActivating ? (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <SchoolBrandAvatar schoolName={schoolName} logoUrl={cliente?.APP_LOGO} />
        )}
      </div>

      <div className="mt-auto space-y-2">
        <h2 className="text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
          {schoolName}
        </h2>
        <p className="flex items-start gap-1.5 text-sm leading-snug text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{centerName}</span>
        </p>
      </div>
    </button>
  );
}
