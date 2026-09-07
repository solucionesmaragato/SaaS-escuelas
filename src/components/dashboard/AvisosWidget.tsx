/* eslint-disable react-refresh/only-export-components -- shared navigation helpers for avisos */
import { useMemo, useState } from "react";
import { Bell, CheckCircle2, UserCheck } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAvisosInternos, type AvisoInterno } from "@/hooks/useAvisosInternos";
import { useActiveTenant } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
} from "@/lib/tenantQuery";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MatriculaFirmadaPdfButton } from "@/components/matricula/MatriculaFirmadaPdfButton";
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

function isSepaMandatoAviso(tipo: string | null | undefined): boolean {
  const normalized = tipo?.trim() ?? "";
  return normalized === "Mandato SEPA pendiente" || normalized === "Mandato SEPA firmado";
}

function isLeadAviso(aviso: AvisoInterno): boolean {
  if (aviso.NOMBRE_LEAD?.trim()) return true;
  const tipo = aviso.TIPO?.trim() ?? "";
  if (tipo === "Lead estado actualizado" || tipo === "Lead sesión de prueba") return true;
  if (tipo === "ATENCION" && aviso.MENSAJE?.toLowerCase().includes("lead")) return true;
  const id = aviso.ID_ALUMNO?.trim() ?? "";
  return id.startsWith("LEA_") || id.startsWith("TMP-");
}

function isIncidenciaAviso(aviso: AvisoInterno): boolean {
  if (aviso.ID_INCIDENCIA?.trim()) return true;
  const tipo = aviso.TIPO?.trim() ?? "";
  if (tipo.startsWith("Incidencia ")) return true;
  if (tipo !== "ATENCION") return false;
  const msg = (aviso.MENSAJE ?? "").toUpperCase();
  return (
    msg.includes("FALTARÁ") ||
    msg.includes("RECUPERACION") ||
    msg.includes("RECUPERACIÓN") ||
    msg.includes("CONSULTA DEL ALUMNO")
  );
}

function isMatriculaOnlinePendienteAviso(aviso: AvisoInterno): boolean {
  return (aviso.TIPO?.trim() ?? "") === "Matrícula online pendiente";
}

function isMatriculaIncompletaAviso(aviso: AvisoInterno): boolean {
  if (isMatriculaOnlinePendienteAviso(aviso)) return false;
  const tipo = aviso.TIPO?.trim() ?? "";
  if (tipo === "Matrícula incompleta" || tipo === "Matrícula pendiente grupo") return true;
  if (aviso.ID_MATRICULA?.trim()) return true;
  if (tipo !== "ATENCION") return false;
  const msg = (aviso.MENSAJE ?? "").toLowerCase();
  return msg.includes("matrícula autogenerada") || msg.includes("matricula autogenerada");
}

function isEvaluacionesNuevasAviso(aviso: AvisoInterno): boolean {
  return (aviso.TIPO?.trim() ?? "") === "Evaluaciones nuevas";
}

function isPrestamoMaterialAviso(aviso: AvisoInterno): boolean {
  const tipo = aviso.TIPO?.trim() ?? "";
  return tipo === "Préstamo material" || Boolean(aviso.ID_PRESTAMO?.trim());
}

function isPermisoAviso(aviso: AvisoInterno): boolean {
  const tipo = aviso.TIPO?.trim() ?? "";
  return tipo === "Permiso" || Boolean(aviso.ID_PERMISO?.trim());
}

function isDocumentoAviso(aviso: AvisoInterno): boolean {
  if (aviso.ID_DOCUMENTO?.trim()) return true;
  const tipo = aviso.TIPO?.trim() ?? "";
  return (
    tipo === "Documento pendiente de firma" ||
    tipo === "Documento firmado por profesor" ||
    tipo === "Documento nuevo" ||
    tipo === "Documento próximo a caducar"
  );
}

function isFichajeUrgenteAviso(aviso: AvisoInterno): boolean {
  return (
    (aviso.TIPO?.trim() ?? "") === "URGENTE" && Boolean(aviso.MENSAJE?.includes("[FICHAJE_ALERT:"))
  );
}

function isFichajeExternoAviso(aviso: AvisoInterno): boolean {
  return (aviso.TIPO?.trim() ?? "") === "Solicitud fichaje externo";
}

function isFichajePausaAviso(aviso: AvisoInterno): boolean {
  return (aviso.TIPO?.trim() ?? "") === "Fichaje pausa prolongada";
}

function isFichajePendienteAceptacionAviso(aviso: AvisoInterno): boolean {
  const tipo = aviso.TIPO?.trim() ?? "";
  return tipo === "Fichaje pendiente de aceptación" || tipo === "Modificación de fichaje pendiente";
}

function isFichajeCorreccionPendienteAviso(aviso: AvisoInterno): boolean {
  return (aviso.TIPO?.trim() ?? "") === "Corrección de fichaje pendiente";
}

function isFichajeCorreccionRespuestaAviso(aviso: AvisoInterno): boolean {
  const tipo = aviso.TIPO?.trim() ?? "";
  return tipo === "Corrección de fichaje autorizada" || tipo === "Corrección de fichaje rechazada";
}

function isFichajeManualRespuestaAviso(aviso: AvisoInterno): boolean {
  const tipo = aviso.TIPO?.trim() ?? "";
  return (
    tipo === "Fichaje manual aceptado" ||
    tipo === "Fichaje manual rechazado" ||
    tipo === "Modificación de fichaje autorizada" ||
    tipo === "Modificación de fichaje rechazada"
  );
}

function isFichajeAviso(aviso: AvisoInterno): boolean {
  return (
    isFichajeUrgenteAviso(aviso) ||
    isFichajeExternoAviso(aviso) ||
    isFichajePausaAviso(aviso) ||
    isFichajePendienteAceptacionAviso(aviso) ||
    isFichajeCorreccionPendienteAviso(aviso) ||
    isFichajeManualRespuestaAviso(aviso) ||
    isFichajeCorreccionRespuestaAviso(aviso)
  );
}

const REMESA_AVISO_TIPOS = new Set([
  "Remesa borrador lista",
  "Remesa PDF borrador fallido",
  "Remesa recibo no generado",
  "Remesa Excel fallido",
  "Remesa XML SEPA generado",
  "Remesa XML SEPA fallido",
  "Ajuste manual procesado",
  "Cargo extra procesado",
]);

function isRemesaAviso(aviso: AvisoInterno): boolean {
  const tipo = aviso.TIPO?.trim() ?? "";
  return Boolean(aviso.ID_REMESA?.trim()) && REMESA_AVISO_TIPOS.has(tipo);
}

function navigateRemesaAviso(aviso: AvisoInterno, navigate: ReturnType<typeof useNavigate>) {
  const tipo = aviso.TIPO?.trim() ?? "";
  const remesaId = aviso.ID_REMESA?.trim();
  const reciboId = aviso.ID_RECIBO?.trim();
  const alumnoId = aviso.ID_ALUMNO?.trim();

  if (
    (tipo === "Remesa PDF borrador fallido" ||
      tipo === "Ajuste manual procesado" ||
      tipo === "Cargo extra procesado") &&
    reciboId
  ) {
    navigate({ to: "/facturas", search: { invoiceId: reciboId } });
    return;
  }

  if (tipo === "Remesa recibo no generado" && alumnoId) {
    navigate({
      to: "/facturas",
      search: {
        newInvoice: true,
        alumnoId,
        remesaId: aviso.ID_REMESA?.trim() || undefined,
        centroId: aviso.ID_CENTRO?.trim() || undefined,
        cursoId: aviso.ID_CURSO?.trim() || undefined,
      },
    });
    return;
  }

  if (remesaId) {
    navigate({ to: "/remesas", search: { remesaId } });
  }
}

function navigateFichajeAviso(
  aviso: AvisoInterno,
  navigate: ReturnType<typeof useNavigate>,
  isProfesor: boolean,
) {
  const fichajeId = aviso.ID_FICHAJE?.trim();
  const profesorId = aviso.ID_PROFESOR?.trim();

  if (isProfesor) {
    navigate({ to: "/app/fichajes", search: fichajeId ? { fichajeId } : {} });
    return;
  }

  if (fichajeId) {
    navigate({
      to: "/fichajes",
      search: profesorId ? { profesorId, fichajeId } : { fichajeId },
    });
    return;
  }

  const sesionId = parseFichajeSesionId(aviso.MENSAJE);
  if (sesionId) {
    navigate({ to: "/sesiones", search: { sesionId } });
    return;
  }

  if (profesorId) {
    navigate({ to: "/fichajes", search: { profesorId } });
  }
}

export function navigateFromAviso(
  aviso: AvisoInterno,
  navigate: ReturnType<typeof useNavigate>,
  isProfesor: boolean,
) {
  const tipo = aviso.TIPO?.trim() ?? "";
  const alumnoId = aviso.ID_ALUMNO?.trim();

  if (isIncidenciaAviso(aviso)) {
    const incidenciaId = aviso.ID_INCIDENCIA?.trim();
    navigate({
      to: isProfesor ? "/app/incidencias" : "/incidencias",
      search: incidenciaId ? { incidenciaId } : {},
    });
    return;
  }

  if (isMatriculaOnlinePendienteAviso(aviso)) {
    const alumnoId = aviso.ID_ALUMNO?.trim();
    navigate({
      to: "/alumnos",
      search: alumnoId ? { alumnoId } : {},
    });
    return;
  }

  if (isMatriculaIncompletaAviso(aviso)) {
    const matriculaId = aviso.ID_MATRICULA?.trim();
    navigate({
      to: "/matriculas",
      search: matriculaId ? { matriculaId } : {},
    });
    return;
  }

  if (isEvaluacionesNuevasAviso(aviso)) {
    const evalProfesorId = aviso.ID_PROFESOR?.trim();
    navigate({
      to: isProfesor ? "/app/evaluaciones" : "/evaluaciones",
      search: isProfesor || !evalProfesorId ? {} : { profesorId: evalProfesorId },
    });
    return;
  }

  if (isPrestamoMaterialAviso(aviso)) {
    const prestamoId = aviso.ID_PRESTAMO?.trim();
    navigate({
      to: isProfesor ? "/app/prestamos" : "/prestamosMaterial",
      search: prestamoId ? { prestamoId } : {},
    });
    return;
  }

  if (isPermisoAviso(aviso)) {
    const permisoId = aviso.ID_PERMISO?.trim();
    navigate({
      to: isProfesor ? "/app/permisos" : "/ausencias",
      search: permisoId ? { permisoId } : {},
    });
    return;
  }

  if (isDocumentoAviso(aviso)) {
    const documentoId = aviso.ID_DOCUMENTO?.trim();
    navigate({
      to: isProfesor ? "/app/documentos" : "/documentos",
      search: documentoId ? { documentoId } : {},
    });
    return;
  }

  if (isFichajeAviso(aviso)) {
    navigateFichajeAviso(aviso, navigate, isProfesor);
    return;
  }

  if (isRemesaAviso(aviso)) {
    navigateRemesaAviso(aviso, navigate);
    return;
  }

  if (alumnoId) {
    if (isLeadAviso(aviso)) {
      navigate({ to: "/leads", search: { leadId: alumnoId } });
      return;
    }
    navigate({
      to: "/alumnos",
      search: isSepaMandatoAviso(tipo) ? { alumnoId, tab: "pago" } : { alumnoId },
    });
    return;
  }

  const profesorId = aviso.ID_PROFESOR?.trim();

  if (profesorId) {
    navigate({ to: "/profesores", search: { profesorId } });
    return;
  }

  if (aviso.ID_HORARIO?.trim()) {
    navigate({ to: "/sesiones", search: { horarioId: aviso.ID_HORARIO } });
  }
}

function canActivarAlumnoPreinscripcion(
  aviso: AvisoInterno,
  rol: string | null | undefined,
): boolean {
  if (!isMatriculaOnlinePendienteAviso(aviso)) return false;
  if (!aviso.ID_ALUMNO?.trim()) return false;
  if (isProfesorRole(rol)) return false;
  return (
    isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol) || isDireccionRole(rol)
  );
}

function avisoRequiresFichajeRpc(aviso: AvisoInterno): boolean {
  const tipo = aviso.TIPO?.trim() ?? "";
  return (
    tipo === "Corrección de fichaje pendiente" ||
    tipo === "Modificación de fichaje pendiente" ||
    tipo === "Fichaje pendiente de aceptación"
  );
}

function canMarkAvisoAsResolved(aviso: AvisoInterno, rol: string | null | undefined): boolean {
  if (isMatriculaOnlinePendienteAviso(aviso)) return false;
  if (isProfesorRole(rol) || isDireccionRole(rol)) return false;
  if (avisoRequiresFichajeRpc(aviso)) return false;
  if (isFichajeUrgenteAviso(aviso) && !isMasterRole(rol) && !isAdminRole(rol)) return false;
  return isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol);
}

function isStaffPanelOnlyFichajeAviso(aviso: AvisoInterno): boolean {
  return avisoRequiresFichajeRpc(aviso);
}

function isAvisoNavigable(aviso: AvisoInterno): boolean {
  if (isIncidenciaAviso(aviso)) return true;
  if (isMatriculaOnlinePendienteAviso(aviso)) return Boolean(aviso.ID_ALUMNO?.trim());
  if (isMatriculaIncompletaAviso(aviso)) return true;
  if (isEvaluacionesNuevasAviso(aviso)) return Boolean(aviso.ID_PROFESOR?.trim());
  if (isPrestamoMaterialAviso(aviso)) return true;
  if (isPermisoAviso(aviso)) return true;
  if (isDocumentoAviso(aviso)) return true;
  if (isFichajeAviso(aviso)) return true;
  if (isRemesaAviso(aviso)) {
    const tipo = aviso.TIPO?.trim() ?? "";
    if (tipo === "Remesa recibo no generado") return Boolean(aviso.ID_ALUMNO?.trim());
    if (
      tipo === "Remesa PDF borrador fallido" ||
      tipo === "Ajuste manual procesado" ||
      tipo === "Cargo extra procesado"
    ) {
      return Boolean(aviso.ID_RECIBO?.trim());
    }
    return Boolean(aviso.ID_REMESA?.trim());
  }
  if (aviso.ID_ALUMNO?.trim()) return true;

  const profesorId = aviso.ID_PROFESOR?.trim();

  if (profesorId) return true;
  if (aviso.ID_HORARIO?.trim()) return true;

  return false;
}

export function usePendingAvisosInternos(filterCenterId?: string | null) {
  const { rol, centerId } = useActiveTenant();
  const { list } = useAvisosInternos();

  const effectiveFilterCenterId = isSecretariaRole(rol)
    ? centerId?.trim() || null
    : filterCenterId?.trim() || null;

  const pending = useMemo(() => {
    return (list.data ?? []).filter((aviso) => {
      if (aviso.LEIDO !== false) return false;
      if (!isProfesorRole(rol) && isStaffPanelOnlyFichajeAviso(aviso)) return false;
      if (!effectiveFilterCenterId) return true;
      return aviso.ID_CENTRO === effectiveFilterCenterId;
    });
  }, [list.data, effectiveFilterCenterId, rol]);

  return {
    pending,
    count: pending.length,
    isLoading: list.isLoading,
    isError: list.isError,
    error: list.error,
  };
}

export function AvisosPendientesDialog({
  open,
  onOpenChange,
  filterCenterId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterCenterId?: string | null;
}) {
  const navigate = useNavigate();
  const { rol } = useActiveTenant();
  const isProfesor = isProfesorRole(rol);
  const { pending, isLoading, isError, error } = usePendingAvisosInternos(filterCenterId);
  const { markAsRead } = useAvisosInternos();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [activatingAviso, setActivatingAviso] = useState<AvisoInterno | null>(null);
  const [isActivating, setIsActivating] = useState(false);

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

  const handleActivarClick = (e: React.MouseEvent, aviso: AvisoInterno) => {
    e.stopPropagation();
    setActivatingAviso(aviso);
  };

  const handleConfirmActivar = async () => {
    const alumnoId = activatingAviso?.ID_ALUMNO?.trim();
    const avisoId = activatingAviso?.ID_AVISO;
    if (!alumnoId || !avisoId) return;

    setIsActivating(true);
    try {
      const { data, error } = await supabase.rpc("activar_alumno_preinscripcion", {
        p_id_alumno: alumnoId,
      });
      if (error) throw error;

      const result = data as { ok?: boolean; error?: string };
      if (!result?.ok) {
        throw new Error(result?.error ?? "No se pudo activar el alumno.");
      }

      await markAsRead.mutateAsync(avisoId);
      toast.success("Alumno activado correctamente.");
      setActivatingAviso(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo activar el alumno.");
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Avisos internos pendientes</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : isError ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
                Error al cargar avisos: {(error as Error)?.message}
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
                    onOpenChange(false);
                    navigateFromAviso(aviso, navigate, isProfesor);
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
                    ) : aviso.NOMBRE_ALUMNO?.trim() ? (
                      <p className="text-sm font-medium">{aviso.NOMBRE_ALUMNO}</p>
                    ) : null}
                    <p className="text-sm leading-relaxed">{aviso.MENSAJE ?? "—"}</p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    {canActivarAlumnoPreinscripcion(aviso, rol) && (
                      <>
                        <MatriculaFirmadaPdfButton
                          idAlumno={aviso.ID_ALUMNO!.trim()}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <Button
                          size="sm"
                          variant="brand"
                          className="gap-2"
                          disabled={isActivating}
                          onClick={(e) => handleActivarClick(e, aviso)}
                        >
                          <UserCheck className="h-4 w-4" />
                          Activar alumno
                        </Button>
                      </>
                    )}
                    {canMarkAvisoAsResolved(aviso, rol) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        disabled={markAsRead.isPending}
                        onClick={(e) => handleResolveClick(e, aviso.ID_AVISO)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Marcar como resuelto
                      </Button>
                    )}
                  </div>
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

      <AlertDialog
        open={!!activatingAviso}
        onOpenChange={(open) => !open && !isActivating && setActivatingAviso(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activar alumno</AlertDialogTitle>
            <AlertDialogDescription>
              Se activará el alumno{" "}
              <strong>
                {activatingAviso?.NOMBRE_ALUMNO?.trim() ||
                  activatingAviso?.NOMBRE_LEAD?.trim() ||
                  "seleccionado"}
              </strong>{" "}
              (estado Preinscripción → Activo) y se marcará este aviso como leído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActivating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isActivating}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmActivar();
              }}
            >
              {isActivating ? "Activando…" : "Confirmar activación"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function AvisosWidget({ filterCenterId }: { filterCenterId?: string | null }) {
  const { rol } = useActiveTenant();
  const { count, isLoading } = usePendingAvisosInternos(filterCenterId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isDireccionRole(rol)) return null;

  return (
    <>
      <Card
        className="cursor-pointer transition-colors hover:bg-muted/30"
        onClick={() => setDialogOpen(true)}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Avisos</CardTitle>
          <Bell
            className={cn("h-4 w-4", count > 0 ? "text-destructive" : "text-muted-foreground")}
          />
        </CardHeader>
        <CardContent className="pb-3 pt-0">
          {isLoading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold">{count}</span>
              <span className="text-xs text-muted-foreground">
                {count === 1 ? "pendiente" : "pendientes"}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <AvisosPendientesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        filterCenterId={filterCenterId}
      />
    </>
  );
}
