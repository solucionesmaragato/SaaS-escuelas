import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Search,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Calendar,
  HelpCircle,
  Loader2,
  AlertCircle,
  Send,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useRemesas,
  buildGenerarRemesaRpcPayload,
  assertGenerarRemesaRpcPayload,
  buildEnviarRemesaRpcPayloadFromRow,
  fetchIncompleteRemesaBankingNames,
  formatRemesaBankingValidationMessage,
} from "@/hooks/useRemesas";
import {
  useCentros,
  getActiveCursoEscolar,
  type CentroData,
  type CursoEscolarData,
} from "@/hooks/useCentros";
import { useActiveTenant, useApp } from "@/context/AppContext";
import type { WorkspaceOption } from "@/lib/workspaceProfiles";
import { canWriteUi } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { MESES_ANIO } from "@/lib/alumnosMatriculasUtils";
import { isAdminRole, isMasterRole } from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/remesas")({
  component: RemesasPage,
});

const PAGE_SIZE = 10;
const sortLocale = { sensitivity: "base" } as const;

function parseCalendarDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isDateWithinCurso(curso: CursoEscolarData, referenceDate: Date): boolean {
  const start = parseCalendarDate(curso.FECHA_INICIO);
  const end = parseCalendarDate(curso.FECHA_FIN);
  if (!start || !end) return false;
  const day = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  return day >= start && day <= end;
}

/** Prefer the course whose term contains today; fall back to ESTADO activo. */
function resolveOperationalCursoEscolar(
  cursos: CursoEscolarData[],
  referenceDate = new Date(),
): CursoEscolarData | null {
  if (cursos.length === 0) return null;

  const inRange = cursos.filter((curso) => isDateWithinCurso(curso, referenceDate));
  if (inRange.length === 1) return inRange[0];
  if (inRange.length > 1) {
    return inRange.find((curso) => curso.ESTADO?.trim().toLowerCase() === "activo") ?? inRange[0];
  }

  return getActiveCursoEscolar(cursos);
}

function cursosForCentro(centros: CentroData[], centroId: string): CursoEscolarData[] {
  const centro = centros.find((c) => c.ID_CENTRO === centroId);
  return centro?.CURSO_ESCOLAR ?? [];
}

function buildSchoolYearMonthOptions(curso: CursoEscolarData | null): string[] {
  if (!curso?.FECHA_INICIO || !curso?.FECHA_FIN) return [];
  const start = parseCalendarDate(curso.FECHA_INICIO);
  const end = parseCalendarDate(curso.FECHA_FIN);
  if (!start || !end) return [];

  const options: string[] = [];
  const current = startOfMonth(start);
  const lastMonth = startOfMonth(end);

  while (current <= lastMonth) {
    options.push(`${MESES_ANIO[current.getMonth()]} ${current.getFullYear()}`);
    current.setMonth(current.getMonth() + 1);
  }

  return options;
}

function currentMonthPeriodLabel(referenceDate = new Date()): string {
  return `${MESES_ANIO[referenceDate.getMonth()]} ${referenceDate.getFullYear()}`;
}

function mergeTenantCentros(
  centros: CentroData[],
  workspaceOptions: WorkspaceOption[],
  tenantId: string,
): CentroData[] {
  const map = new Map<string, CentroData>();
  for (const centro of centros) {
    map.set(centro.ID_CENTRO, centro);
  }
  for (const option of workspaceOptions) {
    if (option.perfil.ID_CLIENTE !== tenantId) continue;
    const wsCentro = option.centro;
    if (!wsCentro?.ID_CENTRO || map.has(wsCentro.ID_CENTRO)) continue;
    map.set(wsCentro.ID_CENTRO, {
      ID_CENTRO: wsCentro.ID_CENTRO,
      ID_CLIENTE: tenantId,
      NOMBRE_CENTRO: wsCentro.NOMBRE_CENTRO,
      DIRECCION: null,
      TELEFONO_CENTRO: null,
      EMAIL_CENTRO: null,
      ESTADO: null,
      REF_FACTURA: null,
      VAPI_ASSISTANT_ID: null,
      VAPI_PHONE_NUMBER: null,
      CURSO_ESCOLAR: [],
    });
  }
  return [...map.values()].sort((a, b) =>
    a.NOMBRE_CENTRO.localeCompare(b.NOMBRE_CENTRO, "es", sortLocale),
  );
}

function collectErrorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    return [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
  }
  return String(err);
}

function isRestrictVetoError(err: unknown): boolean {
  return collectErrorText(err).includes("RESTRICT_VETO");
}

function isRemesaGenerada(estado: string | null | undefined): boolean {
  return estado?.trim().toLowerCase() === "generada";
}

type RemesaEstado = "Generada" | "Enviada";

function normalizeRemesaEstado(estado: string | null | undefined): RemesaEstado {
  return estado?.trim().toLowerCase() === "enviada" ? "Enviada" : "Generada";
}

function remesaEstadoStatus(estado: RemesaEstado): StatusBadgeVariant {
  return estado === "Enviada" ? "success" : "info";
}

async function handleDownloadXML(remesa: RemesaXmlDownloadRow) {
  if (!remesa.LINK_XML_SEPA) {
    toast.error("No XML file linked to this remittance record.");
    return;
  }

  try {
    const { data, error } = await supabase.storage
      .from("remesas_sepa")
      .download(remesa.LINK_XML_SEPA);

    if (error) throw error;
    if (!data) throw new Error("Empty file response from storage");

    const url = window.URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = remesa.LINK_XML_SEPA.split("/").pop() ?? "remesa_sepa.xml";

    document.body.appendChild(a);
    a.click();

    window.URL.revokeObjectURL(url);
    a.remove();

    toast.success("XML downloaded successfully.");
  } catch (error) {
    console.error("Error downloading XML from Storage:", error);
    toast.error("Failed to download the XML file. Please check storage permissions.");
  }
}

type RemesaXmlDownloadRow = {
  LINK_XML_SEPA?: string | null;
};

function RemesaVaultIconButton({
  available,
  label,
  icon: Icon,
  onClick,
  href,
}: {
  available: boolean;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
}) {
  const buttonClass = cn(
    "h-8 w-8 rounded-md border shadow-sm transition-colors",
    available
      ? "border-border/80 bg-background text-slate-700 hover:border-primary/30 hover:bg-muted hover:text-slate-900"
      : "border-transparent bg-muted/30 text-muted-foreground/35 cursor-not-allowed",
  );

  if (available && href) {
    return (
      <Button variant="ghost" size="icon" className={buttonClass} asChild title={label}>
        <a href={href} target="_blank" rel="noreferrer" aria-label={label}>
          <Icon className="h-4 w-4" />
        </a>
      </Button>
    );
  }

  if (available && onClick) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={buttonClass}
        onClick={onClick}
        title={label}
        aria-label={label}
      >
        <Icon className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={buttonClass}
      disabled
      tabIndex={-1}
      aria-label={`${label} no disponible`}
      title={`${label} no disponible`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

async function executeGenerarRemesaSubmit({
  id_cliente,
  id_centro,
  id_curso,
  mes_periodo,
  onSubmit,
}: {
  id_cliente: string;
  id_centro: string;
  id_curso: string;
  mes_periodo: string;
  onSubmit: (payload: {
    p_id_cliente: string;
    p_id_centro: string;
    p_id_curso: string;
    p_mes_periodo: string;
  }) => Promise<void>;
}): Promise<void> {
  const payload = buildGenerarRemesaRpcPayload({
    id_cliente,
    id_centro,
    id_curso,
    mes_periodo,
  });

  assertGenerarRemesaRpcPayload(payload);

  await onSubmit(payload);
}

function RemesasPage() {
  const { tenantId, rol } = useActiveTenant();
  const canWrite = canWriteUi(rol, "remesas:write");
  const { list, update, remove, generarRemesaMensual, enviarRemesaBloque } = useRemesas();

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [sendingRemesaId, setSendingRemesaId] = useState<string | null>(null);
  const [validatingRemesaId, setValidatingRemesaId] = useState<string | null>(null);
  const [confirmEnviarRemesa, setConfirmEnviarRemesa] = useState<{
    ID_REMESA: string;
    ID_CLIENTE?: string | null;
    ID_CENTRO?: string | null;
    ID_CURSO?: string | null;
    MES_PERIODO?: string | null;
    ESTADO?: string | null;
  } | null>(null);

  const executeEnviarRemesa = async (row: {
    ID_REMESA: string;
    ID_CLIENTE?: string | null;
    ID_CENTRO?: string | null;
    ID_CURSO?: string | null;
    MES_PERIODO?: string | null;
    ESTADO?: string | null;
  }) => {
    if (!isRemesaGenerada(row.ESTADO)) return;

    const payload = assertGenerarRemesaRpcPayload(buildEnviarRemesaRpcPayloadFromRow(row));
    setSendingRemesaId(row.ID_REMESA);

    try {
      await enviarRemesaBloque.mutateAsync(payload);
      toast.success("Remesa enviada al banco correctamente");
    } catch (err) {
      toast.error(collectErrorText(err) || "Error al enviar la remesa al banco");
    } finally {
      setSendingRemesaId(null);
    }
  };

  const requestEnviarRemesa = async (row: {
    ID_REMESA: string;
    ID_CLIENTE?: string | null;
    ID_CENTRO?: string | null;
    ID_CURSO?: string | null;
    MES_PERIODO?: string | null;
    ESTADO?: string | null;
  }) => {
    if (!isRemesaGenerada(row.ESTADO)) return;

    setValidatingRemesaId(row.ID_REMESA);
    try {
      const incompleteNames = await fetchIncompleteRemesaBankingNames(tenantId, rol, row);
      if (incompleteNames.length > 0) {
        toast.error(formatRemesaBankingValidationMessage(incompleteNames));
        return;
      }
      setConfirmEnviarRemesa(row);
    } catch (err) {
      toast.error(collectErrorText(err) || "Error al validar los datos bancarios de la remesa");
    } finally {
      setValidatingRemesaId(null);
    }
  };

  const handleConfirmEnviarRemesa = async () => {
    if (!confirmEnviarRemesa || sendingRemesaId) return;
    const row = confirmEnviarRemesa;
    setConfirmEnviarRemesa(null);
    await executeEnviarRemesa(row);
  };

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r: any) =>
        r.MES_PERIODO?.toLowerCase().includes(q) ||
        r.ESTADO?.toLowerCase().includes(q) ||
        r.ID_REMESA?.toLowerCase().includes(q),
    );
  }, [list.data, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabecera del panel */}
      <PageHeader
        title="Gestión de Recibos Mensuales"
        description={`${list.data?.length ?? 0} remesas SEPA de cobros consolidadas en el sistema`}
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Generar nuevos recibos
            </Button>
          )
        }
      />

      <Card className="p-4">
        {/* Buscador reactivo */}
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar remesa por periodo o estado..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error en la lectura de remesas de Supabase: {(list.error as Error)?.message}
          </div>
        )}

        {/* Tabla de operaciones bancarias */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo / Mes</TableHead>
                <TableHead>Estado Remesa</TableHead>
                <TableHead className="text-center">XML SEPA (Banco)</TableHead>
                <TableHead className="text-center">Excel Contable</TableHead>
                <TableHead className="text-center">Recibos ZIP</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {query
                      ? "Sin resultados para tu búsqueda."
                      : "No hay registros de remesas SEPA."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r: any) => {
                  const remesaEstado = normalizeRemesaEstado(r.ESTADO);

                  return (
                    <TableRow
                      key={r.ID_REMESA}
                      className={cn(
                        canWrite && "cursor-pointer transition-colors hover:bg-muted/50",
                      )}
                      onClick={canWrite ? () => setEditing(r) : undefined}
                    >
                      <TableCell className="font-semibold text-slate-900 capitalize">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {r.MES_PERIODO || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={remesaEstadoStatus(remesaEstado)}
                          className="capitalize text-[10px]"
                        >
                          {remesaEstado}
                        </StatusBadge>
                      </TableCell>

                      {/* Enlace XML SEPA */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <RemesaVaultIconButton
                            available={Boolean(r.LINK_XML_SEPA)}
                            label="Descargar XML SEPA"
                            icon={FileCode}
                            onClick={() => void handleDownloadXML(r)}
                          />
                        </div>
                      </TableCell>

                      {/* Enlace Excel Contabilidad */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <RemesaVaultIconButton
                            available={Boolean(r.LINK_EXCEL_CONTABILIDAD)}
                            label="Descargar Excel contable"
                            icon={FileSpreadsheet}
                            href={r.LINK_EXCEL_CONTABILIDAD ?? undefined}
                          />
                        </div>
                      </TableCell>

                      {/* Enlace Recibos ZIP */}
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <RemesaVaultIconButton
                            available={Boolean(r.LINK_RECIBOS_ZIP)}
                            label="Descargar recibos ZIP"
                            icon={FileArchive}
                            href={r.LINK_RECIBOS_ZIP ?? undefined}
                          />
                        </div>
                      </TableCell>

                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {canWrite && isRemesaGenerada(r.ESTADO) && (
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={
                                sendingRemesaId === r.ID_REMESA ||
                                validatingRemesaId === r.ID_REMESA
                              }
                              onClick={() => void requestEnviarRemesa(r)}
                            >
                              {sendingRemesaId === r.ID_REMESA ||
                              validatingRemesaId === r.ID_REMESA ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="mr-1 h-3.5 w-3.5" />
                              )}
                              Enviar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación real */}
        {filtered.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm border-t pt-4">
            <div className="text-muted-foreground">
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <GenerarRemesaDialog
        open={creating}
        onClose={() => setCreating(false)}
        submitting={generarRemesaMensual.isPending}
        onSubmit={async (payload) => {
          try {
            const result = await generarRemesaMensual.mutateAsync(payload);
            const count = result?.recibos_generados ?? 0;
            toast.success(`Success! Generated ${count} draft receipts.`);
            setCreating(false);
          } catch (err) {
            if (isRestrictVetoError(err)) throw err;
            toast.error(collectErrorText(err) || "Error al generar la remesa");
            throw err;
          }
        }}
      />

      {/* Edit Modal */}
      <RemesaEditDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Modificar Configuración de Remesa"
        submitLabel="Guardar Cambios"
        initial={editing}
        submitting={update.isPending}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.ID_REMESA, patch: values });
            toast.success("Registro de remesa actualizado correctamente");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      <AlertDialog
        open={!!confirmEnviarRemesa}
        onOpenChange={(open) => {
          if (!open && !sendingRemesaId) setConfirmEnviarRemesa(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar remesa al banco</AlertDialogTitle>
            <AlertDialogDescription>
              ¡ATENCIÓN! Vas a enviar esta remesa al banco. Esto cambiará automáticamente el estado
              de todos los recibos SEPA asociados de este lote a &quot;Cobrado&quot;. ¿Deseas
              continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(sendingRemesaId)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(sendingRemesaId)}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmEnviarRemesa();
              }}
            >
              {sendingRemesaId ? "Enviando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Modal */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este histórico bancario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará definitivamente el registro de la remesa del periodo{" "}
              <b>{deleting?.MES_PERIODO}</b>. Los archivos XML o ZIP enlazados dejarán de estar
              disponibles en esta consola. Esta operación es definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_REMESA);
                  toast.success("Registro purgado de la base de datos");
                  setDeleting(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al eliminar");
                }
              }}
            >
              Eliminar Remesa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DIÁLOGO GENERAR REMESA (RPC generar_remesa_mensual)
// ---------------------------------------------------------------------------

function GenerarRemesaDialog({
  open,
  onClose,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (payload: {
    p_id_cliente: string;
    p_id_centro: string;
    p_id_curso: string;
    p_mes_periodo: string;
  }) => Promise<void>;
}) {
  const { tenantId, centerId: profileCenterId, centro: activeCentro, rol } = useActiveTenant();
  const { workspaceOptions } = useApp();
  const centros = useCentros();

  const centrosOrdenados = useMemo(
    () => mergeTenantCentros(centros.list.data ?? [], workspaceOptions, tenantId),
    [centros.list.data, workspaceOptions, tenantId],
  );

  const defaultCenterId =
    activeCentro?.ID_CENTRO ?? profileCenterId ?? centrosOrdenados[0]?.ID_CENTRO ?? "";

  const showCentroSelect = isAdminRole(rol) || isMasterRole(rol);

  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [mesPeriodo, setMesPeriodo] = useState("");
  const [restrictVetoError, setRestrictVetoError] = useState<string | null>(null);

  const resolvedCenterId = showCentroSelect ? selectedCenterId || defaultCenterId : defaultCenterId;

  const embeddedCursos = useMemo(
    () => cursosForCentro(centrosOrdenados, resolvedCenterId),
    [centrosOrdenados, resolvedCenterId],
  );

  const { data: fetchedCursos, isLoading: fetchedCursosLoading } = useQuery({
    queryKey: ["remesa-curso-escolar", tenantId, resolvedCenterId],
    enabled: open && Boolean(resolvedCenterId) && embeddedCursos.length === 0,
    queryFn: async (): Promise<CursoEscolarData[]> => {
      const { data, error } = await supabase
        .from("CURSO_ESCOLAR")
        .select("*")
        .eq("ID_CLIENTE", tenantId)
        .eq("ID_CENTRO", resolvedCenterId);
      if (error) throw error;
      return (data ?? []) as CursoEscolarData[];
    },
  });

  const cursosForResolvedCentro =
    embeddedCursos.length > 0 ? embeddedCursos : (fetchedCursos ?? []);

  const activeCurso = useMemo(
    () => resolveOperationalCursoEscolar(cursosForResolvedCentro),
    [cursosForResolvedCentro],
  );

  const monthOptions = useMemo(() => buildSchoolYearMonthOptions(activeCurso), [activeCurso]);

  const lockedCentroName = useMemo(() => {
    if (!resolvedCenterId) return "";
    return centrosOrdenados.find((c) => c.ID_CENTRO === resolvedCenterId)?.NOMBRE_CENTRO ?? "";
  }, [centrosOrdenados, resolvedCenterId]);

  useEffect(() => {
    if (!open) return;
    setRestrictVetoError(null);
    setMesPeriodo("");
    setSelectedCenterId(defaultCenterId);
  }, [open, defaultCenterId]);

  useEffect(() => {
    if (!open || monthOptions.length === 0) return;
    const currentMonth = currentMonthPeriodLabel();
    setMesPeriodo((prev) => {
      if (prev && monthOptions.includes(prev)) return prev;
      if (monthOptions.includes(currentMonth)) return currentMonth;
      return monthOptions[monthOptions.length - 1] ?? "";
    });
  }, [open, monthOptions]);

  const canSubmit =
    Boolean(resolvedCenterId) &&
    Boolean(activeCurso?.ID_CURSO) &&
    Boolean(mesPeriodo) &&
    !submitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generar Registro de Remesa Bancaria</DialogTitle>
          <DialogDescription>
            Se generarán los recibos borrador del periodo seleccionado. Los archivos SEPA y
            contables se procesarán automáticamente en segundo plano.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setRestrictVetoError(null);

            try {
              await executeGenerarRemesaSubmit({
                id_cliente: tenantId,
                id_centro: resolvedCenterId,
                id_curso: activeCurso?.ID_CURSO ?? "",
                mes_periodo: mesPeriodo,
                onSubmit,
              });
            } catch (err) {
              if (isRestrictVetoError(err)) {
                setRestrictVetoError(
                  "Error: The drafts for this month have already been generated. Please edit them manually on the Receipts panel.",
                );
              }
            }
          }}
          className="space-y-4 pt-1"
        >
          {restrictVetoError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Remesa duplicada</AlertTitle>
              <AlertDescription>{restrictVetoError}</AlertDescription>
            </Alert>
          )}

          {showCentroSelect ? (
            <div className="space-y-2">
              <Label>Sede / Centro *</Label>
              <Select
                value={resolvedCenterId || undefined}
                onValueChange={setSelectedCenterId}
                disabled={centros.list.isLoading || centrosOrdenados.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un centro" />
                </SelectTrigger>
                <SelectContent>
                  {centrosOrdenados.map((centro) => (
                    <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                      {centro.NOMBRE_CENTRO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            lockedCentroName && (
              <div className="space-y-2">
                <Label>Sede / Centro</Label>
                <Input value={lockedCentroName} disabled readOnly className="bg-muted" />
              </div>
            )
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Mes / Periodo de la Remesa *</Label>
              <Select
                value={mesPeriodo}
                onValueChange={setMesPeriodo}
                disabled={
                  monthOptions.length === 0 || centros.list.isLoading || fetchedCursosLoading
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un mes" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {monthOptions.length === 0 &&
                resolvedCenterId &&
                !centros.list.isLoading &&
                !fetchedCursosLoading && (
                  <p className="text-xs text-muted-foreground">
                    No hay meses disponibles para el curso escolar activo de este centro.
                  </p>
                )}
            </div>
            <div className="space-y-2">
              <Label>Estado</Label>
              <div className="flex h-10 items-center">
                <Badge variant="outline" className="capitalize px-3 py-1">
                  Generada
                </Badge>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                "Generar Entrada"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DIÁLOGO EDICIÓN DE REMESA (enlaces n8n / estado manual)
// ---------------------------------------------------------------------------

function RemesaEditDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: any | null;
  submitting: boolean;
  onSubmit: (values: any) => void;
}) {
  const [mesPeriodo, setMesPeriodo] = useState(initial?.MES_PERIODO ?? "");
  const [estado, setEstado] = useState(initial?.ESTADO ?? "Generada");
  const [linkXmlSepa, setLinkXmlSepa] = useState(initial?.LINK_XML_SEPA ?? "");
  const [linkExcelContabilidad, setLinkExcelContabilidad] = useState(
    initial?.LINK_EXCEL_CONTABILIDAD ?? "",
  );
  const [linkRecibosZip, setLinkRecibosZip] = useState(initial?.LINK_RECIBOS_ZIP ?? "");

  useEffect(() => {
    if (open) {
      setMesPeriodo(initial?.MES_PERIODO ?? "");
      setEstado(initial?.ESTADO ?? "Generada");
      setLinkXmlSepa(initial?.LINK_XML_SEPA ?? "");
      setLinkExcelContabilidad(initial?.LINK_EXCEL_CONTABILIDAD ?? "");
      setLinkRecibosZip(initial?.LINK_RECIBOS_ZIP ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!mesPeriodo.trim()) return;
            onSubmit({
              MES_PERIODO: mesPeriodo.trim(),
              ESTADO: estado || null,
              LINK_XML_SEPA: linkXmlSepa || null,
              LINK_EXCEL_CONTABILIDAD: linkExcelContabilidad || null,
              LINK_RECIBOS_ZIP: linkRecibosZip || null,
            });
          }}
          className="space-y-4 pt-1"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Mes / Periodo de la Remesa *</Label>
              <Input
                value={mesPeriodo}
                onChange={(e) => setMesPeriodo(e.target.value)}
                placeholder="Ej: Junio 2026"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Estado de Operación</Label>
              <Input
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                placeholder="Generada, Enviada, Cobrada, Devuelta..."
              />
            </div>
          </div>

          <div className="border-t pt-3 space-y-3 mt-2 bg-slate-50/50 p-2.5 rounded border">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <HelpCircle className="h-4 w-4 text-blue-900" />
              Direcciones URL de Repositorio (Alimentadas por n8n)
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Archivo XML SEPA (.xml)</Label>
              <Input
                className="h-8 text-xs font-mono"
                value={linkXmlSepa}
                onChange={(e) => setLinkXmlSepa(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Libro Excel Contable (.xlsx)</Label>
              <Input
                className="h-8 text-xs font-mono"
                value={linkExcelContabilidad}
                onChange={(e) => setLinkExcelContabilidad(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Comprobantes Comprimidos (.zip)</Label>
              <Input
                className="h-8 text-xs font-mono"
                value={linkRecibosZip}
                onChange={(e) => setLinkRecibosZip(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
