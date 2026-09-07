import { useState } from "react";
import { Bell } from "lucide-react";
import { useActiveTenant } from "@/context/AppContext";
import { isProfesorRole } from "@/lib/tenantQuery";
import { cn } from "@/lib/utils";
import {
  AvisosPendientesDialog,
  usePendingAvisosInternos,
} from "@/components/dashboard/AvisosWidget";

export function AvisosHeaderBell({ className }: { className?: string }) {
  const { rol } = useActiveTenant();
  const isProfesor = isProfesorRole(rol);
  const { count } = usePendingAvisosInternos();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isProfesor) return null;

  const badgeLabel = count > 99 ? "99+" : String(count);

  return (
    <>
      <button
        type="button"
        className={cn(
          "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted",
          className,
        )}
        onClick={() => setDialogOpen(true)}
        aria-label={count > 0 ? `Avisos pendientes: ${badgeLabel}` : "Avisos pendientes"}
      >
        <Bell
          className={cn(
            "h-5 w-5",
            count > 0 ? "text-red-500 fill-red-500" : "text-muted-foreground",
          )}
        />
        {count > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white"
            aria-hidden
          >
            {badgeLabel}
          </span>
        ) : null}
      </button>

      <AvisosPendientesDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
