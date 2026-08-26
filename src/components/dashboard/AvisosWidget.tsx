import { useMemo, useState } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAvisosInternos, type AvisoInterno } from "@/hooks/useAvisosInternos";
import { useActiveTenant } from "@/context/AppContext";
import { isDireccionRole, isSecretariaRole } from "@/lib/tenantQuery";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatAvisoFecha(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TipoBadge({ tipo }: { tipo: string | null | undefined }) {
  if (!tipo) return null;
  const normalized = tipo.trim().toUpperCase();
  const isUrgent = normalized === "URGENTE";
  return (
    <StatusBadge status={isUrgent ? "destructive" : "warning"} className="font-normal">
      {tipo}
    </StatusBadge>
  );
}

function parseFichajeSesionId(mensaje: string | null | undefined): string | null {
  if (!mensaje) return null;
  const match = mensaje.match(/\[FICHAJE_ALERT:([^:]+):(?:entrada|salida)\]/);
  return match?.[1]?.trim() || null;
}

function navigateFromAviso(aviso: AvisoInterno, navigate: ReturnType<typeof useNavigate>) {
  if (aviso.ID_ALUMNO?.trim()) {
    navigate({ to: "/alumnos", search: { alumnoId: aviso.ID_ALUMNO } });
    return;
  }

  const tipo = aviso.TIPO?.trim() ?? "";
  const profesorId = aviso.ID_PROFESOR?.trim();

  if (tipo === "URGENTE" && aviso.MENSAJE?.includes("[FICHAJE_ALERT:")) {
    const sesionId = parseFichajeSesionId(aviso.MENSAJE);
    if (sesionId) {
      navigate({ to: "/sesiones", search: { sesionId } });
      return;
    }
    if (profesorId) {
      navigate({ to: "/fichajes", search: { profesorId } });
      return;
    }
  }

  if (tipo === "Solicitud fichaje externo" && profesorId) {
    navigate({ to: "/fichajes", search: { profesorId } });
    return;
  }

  if (tipo === "Documento firmado por profesor" && profesorId) {
    navigate({ to: "/profesores", search: { profesorId } });
    return;
  }

  if (profesorId) {
    navigate({ to: "/profesores", search: { profesorId } });
    return;
  }

  if (aviso.ID_HORARIO?.trim()) {
    navigate({ to: "/sesiones", search: { horarioId: aviso.ID_HORARIO } });
  }
}

function isAvisoNavigable(aviso: AvisoInterno): boolean {
  if (aviso.ID_ALUMNO?.trim()) return true;

  const tipo = aviso.TIPO?.trim() ?? "";
  const profesorId = aviso.ID_PROFESOR?.trim();

  if (tipo === "URGENTE" && aviso.MENSAJE?.includes("[FICHAJE_ALERT:")) {
    if (parseFichajeSesionId(aviso.MENSAJE)) return true;
    if (profesorId) return true;
  }

  if (tipo === "Solicitud fichaje externo" && profesorId) return true;
  if (tipo === "Documento firmado por profesor" && profesorId) return true;
  if (profesorId) return true;
  if (aviso.ID_HORARIO?.trim()) return true;

  return false;
}

export function AvisosWidget({ filterCenterId }: { filterCenterId?: string | null }) {
  const navigate = useNavigate();
  const { rol, centerId } = useActiveTenant();
  const { list, markAsRead } = useAvisosInternos();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const effectiveFilterCenterId = isSecretariaRole(rol)
    ? centerId?.trim() || null
    : filterCenterId?.trim() || null;

  const pending = useMemo(() => {
    return (list.data ?? []).filter((aviso) => {
      if (aviso.LEIDO !== false) return false;
      if (!effectiveFilterCenterId) return true;
      return aviso.ID_CENTRO === effectiveFilterCenterId;
    });
  }, [list.data, effectiveFilterCenterId]);

  if (isDireccionRole(rol)) return null;

  const handleResolveClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmingId(id);
  };

  const handleConfirmResolve = async () => {
    if (!confirmingId) return;
    try {
      await markAsRead.mutateAsync(confirmingId);
      toast.success("Aviso marcado como resuelto.");
      setConfirmingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo marcar el aviso.");
    }
  };

  return (
    <>
      <Card
        className="cursor-pointer transition-colors hover:bg-muted/30"
        onClick={() => setDialogOpen(true)}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Avisos</CardTitle>
          <Bell
            className={cn(
              "h-4 w-4",
              pending.length > 0 ? "text-destructive" : "text-muted-foreground",
            )}
          />
        </CardHeader>
        <CardContent className="pb-3 pt-0">
          {list.isLoading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold">{pending.length}</span>
              <span className="text-xs text-muted-foreground">
                {pending.length === 1 ? "pendiente" : "pendientes"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Avisos internos pendientes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {list.isLoading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : list.isError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
                Error al cargar avisos: {(list.error as Error)?.message}
              </p>
            ) : pending.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No hay avisos pendientes. Todo al día.
              </p>
            ) : (
              pending.map((aviso) => (
                <div
                  key={aviso.ID_AVISO}
                  className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between${
                    isAvisoNavigable(aviso) ? " cursor-pointer" : ""
                  }`}
                  onClick={() => {
                    if (!isAvisoNavigable(aviso)) return;
                    setDialogOpen(false);
                    navigateFromAviso(aviso, navigate);
                  }}
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatAvisoFecha(aviso.FECHA)}
                      </span>
                      <TipoBadge tipo={aviso.TIPO} />
                    </div>
                    {aviso.NOMBRE_LEAD?.trim() ? (
                      <p className="text-sm font-medium">{aviso.NOMBRE_LEAD}</p>
                    ) : null}
                    <p className="text-sm leading-relaxed">{aviso.MENSAJE ?? "—"}</p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-2"
                    disabled={markAsRead.isPending}
                    onClick={(e) => handleResolveClick(e, aviso.ID_AVISO)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Marcar como resuelto
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmingId} onOpenChange={(open) => !open && setConfirmingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar aviso como resuelto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas marcar este aviso como resuelto?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markAsRead.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={markAsRead.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmResolve();
              }}
            >
              {markAsRead.isPending ? "Guardando…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
