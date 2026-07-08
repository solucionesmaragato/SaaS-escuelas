import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Pencil,
  FileText,
  ExternalLink,
  Download,
  CreditCard,
  Calendar,
  GraduationCap,
  Loader2,
  X,
} from "lucide-react";
import {
  useRecibos,
  normalizeEstadoPago,
  canTransitionEstadoPago,
  type ReciboRow,
  type EstadoPagoOption,
} from "@/hooks/useRecibos";
import {
  FacturaReferenciaCell,
  FacturaPdfDownloadButton,
  EstadoPagoSelect,
} from "@/components/facturas/FacturaTableCells";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useCentros, type CursoEscolarData } from "@/hooks/useCentros";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EntityLink } from "@/components/navigation/EntityLink";
import { toast } from "sonner";

type FacturasSearch = {
  invoiceId?: string;
};

export const Route = createFileRoute("/_authenticated/facturas")({
  validateSearch: (search: Record<string, unknown>): FacturasSearch => {
    const invoiceId = search.invoiceId;
    return typeof invoiceId === "string" && invoiceId ? { invoiceId } : {};
  },
  component: FacturasPage,
});

const FILTER_ALL_VALUE = "__all__";
const TABLE_COLS = 8;

type FacturaConfirmAction =
  | { type: "estado"; row: ReciboRow; estado: EstadoPagoOption }
  | { type: "emitir"; row: ReciboRow };

function getFacturaConfirmCopy(action: FacturaConfirmAction): {
  title: string;
  description: string;
  destructive?: boolean;
} {
  if (action.type === "emitir") {
    return {
      title: "Emitir factura definitiva",
      description: "¿Deseas consolidar este borrador y emitir la factura definitiva?",
    };
  }
  if (action.estado === "Anulado") {
    return {
      title: "Anular factura",
      description:
        "¿Estás seguro de que deseas ANULAR esta factura? Esta acción bloqueará el documento y no se podrá revertir.",
      destructive: true,
    };
  }
  return {
    title: "Confirmar cobro",
    description: "¿Confirmar cambio de estado a COBRADO?",
  };
}

function sortCursosEscolares(cursos: CursoEscolarData[]): CursoEscolarData[] {
  return [...cursos].sort((a, b) =>
    (b.NOMBRE_CURSO ?? "").localeCompare(a.NOMBRE_CURSO ?? "", "es", { sensitivity: "base" }),
  );
}

function isFacturaBorrador(row: ReciboRow): boolean {
  return normalizeEstadoPago(row.ESTADO_PAGO) === "Borrador";
}

function isFacturaCobrado(row: ReciboRow): boolean {
  return normalizeEstadoPago(row.ESTADO_PAGO) === "Cobrado";
}

function isFacturaAnulado(row: ReciboRow): boolean {
  return normalizeEstadoPago(row.ESTADO_PAGO) === "Anulado";
}

function FacturaDetailBody({
  factura,
  canWrite,
  updatingEstadoId,
  onRequestEstadoChange,
}: {
  factura: ReciboRow;
  canWrite: boolean;
  updatingEstadoId: string | null;
  onRequestEstadoChange: (estado: EstadoPagoOption) => void;
}) {
  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-lg border bg-blue-50/70 p-3 dark:bg-blue-900/20 dark:border-blue-900/40">
        <div className="flex items-start gap-2">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-blue-900 dark:text-blue-400" />
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-900/70 dark:text-blue-400/80">
              Alumno
            </span>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {factura.ALUMNOS?.NOMBRE_ALUMNO?.trim() ? (
                <EntityLink type="alumno" id={factura.ID_ALUMNO}>
                  {factura.ALUMNOS.NOMBRE_ALUMNO.trim()}
                </EntityLink>
              ) : (
                "Sin alumno vinculado"
              )}
            </p>
          </div>
        </div>
      </div>

      {factura.LINK_PDF_RECIBO && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:bg-emerald-900/20 dark:border-emerald-900/40">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                PDF de factura
              </p>
              <p className="text-xs text-muted-foreground">
                Documento oficial disponible para descarga
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-2 border-emerald-300 bg-white"
            asChild
          >
            <a href={factura.LINK_PDF_RECIBO} target="_blank" rel="noreferrer" download>
              <Download className="h-4 w-4" />
              Descargar PDF
            </a>
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/50 p-2.5">
        <div>
          <span className="block font-medium text-muted-foreground">Referencia / Factura</span>
          <div className="mt-1">
            <FacturaReferenciaCell row={factura} />
          </div>
        </div>
        <div>
          <span className="block font-medium text-muted-foreground">Estado de Operación</span>
          <div className="mt-1">
            <EstadoPagoSelect
              row={factura}
              canWrite={canWrite}
              updating={updatingEstadoId === factura.ID_RECIBO}
              onRequestChange={onRequestEstadoChange}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t pt-2">
        <h3 className="text-xs font-bold text-slate-900">Datos del Cliente / Pagador</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-muted-foreground">Nombre del Receptor</span>
            <span className="font-medium text-slate-900">{factura.RECEPTOR_NOMBRE || "—"}</span>
          </div>
          <div>
            <span className="block text-muted-foreground">DNI / CIF</span>
            <span className="font-mono font-medium">{factura.CIF_DNI || "—"}</span>
          </div>
          <div>
            <span className="block text-muted-foreground">Contacto Electrónico</span>
            <span>{factura.MAIL || "—"}</span>
          </div>
          <div>
            <span className="block text-muted-foreground">Teléfono Móvil</span>
            <span>{factura.TLF || "—"}</span>
          </div>
          <div className="col-span-2">
            <span className="block text-muted-foreground">Dirección Fiscal</span>
            <span>{factura.DIRECCION || "—"}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-md border bg-slate-50 p-2.5 border-t pt-2">
        <h3 className="text-xs font-bold text-blue-950">Desglose Fiscal de Importes</h3>
        <div className="grid grid-cols-4 gap-2 text-center font-mono">
          <div className="rounded border bg-white p-1.5">
            <span className="block text-xs text-muted-foreground">Base Imp.</span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(factura.TOTAL_BASE ?? 0)}
            </span>
          </div>
          <div className="rounded border bg-white p-1.5">
            <span className="block text-xs text-muted-foreground">Descuento</span>
            <span className="font-semibold text-amber-700">
              -{formatCurrency(factura.DESCUENTO ?? 0)}
            </span>
          </div>
          <div className="rounded border bg-white p-1.5">
            <span className="block text-xs text-muted-foreground">Impuestos (IVA)</span>
            <span className="font-semibold text-slate-900">
              {formatCurrency(factura.TOTAL_IVA ?? 0)}
            </span>
          </div>
          <div className="rounded border border-blue-900/20 bg-blue-900/10 p-1.5">
            <span className="block text-xs font-bold text-blue-900">Total Doc</span>
            <span className="text-sm font-bold text-blue-950">
              {formatCurrency(factura.TOTAL_DOC ?? 0)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
          <div>
            <span className="text-muted-foreground">Tipo de Documento:</span>{" "}
            <span className="font-medium">{factura.TIPO_DOC ?? "Factura Simplificada"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Método Liquidación:</span>{" "}
            <span className="font-medium">{factura.METODO_PAGO ?? "Remesa Bancaria"}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t pt-2">
        <h3 className="text-xs font-bold text-slate-900">
          Pasarelas y Documentación Externa (n8n / Holded)
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {factura.NUM_FACTURA_HOLDED && (
            <div className="flex items-center justify-between rounded border bg-white p-2">
              <div>
                <span className="block text-[10px] text-muted-foreground">Factura Holded</span>
                <span className="font-mono font-semibold">
                  <EntityLink type="factura" id={factura.ID_RECIBO}>
                    {factura.NUM_FACTURA_HOLDED}
                  </EntityLink>
                </span>
              </div>
              {factura.LINK_FACTURA_HOLDED && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-950" asChild>
                  <a href={factura.LINK_FACTURA_HOLDED} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          )}
          {factura.LINK_PDF_RECIBO && (
            <div className="col-span-1 flex items-center justify-between rounded border bg-white p-2">
              <div>
                <span className="block text-[10px] text-muted-foreground">Archivo PDF Oficial</span>
                <span className="font-medium">Descargar copia</span>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-700" asChild>
                <a href={factura.LINK_PDF_RECIBO} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            </div>
          )}
          {factura.URL_QR && (
            <div className="col-span-2 flex items-center justify-between rounded border bg-white p-2">
              <div>
                <span className="block text-[10px] text-muted-foreground">
                  Enlace de Validación QR
                </span>
                <span className="block max-w-md truncate font-mono text-[10px]">
                  {factura.URL_QR}
                </span>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" asChild>
                <a href={factura.URL_QR} target="_blank" rel="noreferrer">
                  Ver QR
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>

      {factura.HUELLA_HASH && (
        <div className="rounded border-t bg-muted/20 p-2 pt-2 text-[10px] text-muted-foreground">
          <span className="block font-mono font-semibold">
            Criptografía / Huella Hash de Auditoría (Sistema):
          </span>
          <span className="mt-0.5 block select-all break-all font-mono">{factura.HUELLA_HASH}</span>
        </div>
      )}
    </div>
  );
}

function FacturaDetailOverlay({
  open,
  mode,
  factura,
  canWrite,
  submitting,
  updatingEstadoId,
  onClose,
  onEdit,
  onCancelEdit,
  onAnular,
  onRequestEstadoChange,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  factura: ReciboRow | null;
  canWrite: boolean;
  submitting: boolean;
  updatingEstadoId: string | null;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onAnular: () => void;
  onRequestEstadoChange: (estado: EstadoPagoOption) => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "edit") onCancelEdit();
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, mode, onClose, onCancelEdit]);

  if (!open) return null;

  if (!factura) {
    return createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/10"
          aria-label="Cerrar"
          onClick={onClose}
        />
        <div className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "flex items-center justify-center p-6")}>
          <Skeleton className="h-8 w-48" />
        </div>
      </>,
      document.body,
    );
  }

  const canEditImportes = canWrite && isFacturaBorrador(factura);
  const canAnularFactura = canWrite && isFacturaCobrado(factura);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle de la factura"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="factura-overlay-title"
        className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "flex max-h-[90vh] flex-col p-6")}
      >
        {mode === "edit" ? (
          <>
            <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-2"
                  onClick={onCancelEdit}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </Button>
                <h2 id="factura-overlay-title" className="truncate text-xl font-semibold">
                  Editar importes
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar"
                onClick={onClose}
              >
                <X className="h-5 w-5" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FacturaFormDialog
                open
                embedded
                title="Editar importes"
                submitLabel="Guardar"
                initial={factura}
                submitting={submitting}
                onClose={onCancelEdit}
                onSubmit={onSubmit}
              />
            </div>
            <div className="mt-4 flex shrink-0 justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="factura-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="factura-overlay-title" className="truncate text-xl font-semibold">
                  Vista detalle
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEditImportes && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-2 bg-black text-white hover:bg-black/90"
                    onClick={onEdit}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar importes
                  </Button>
                )}
                {canAnularFactura && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={onAnular}
                  >
                    <Trash2 className="h-4 w-4" />
                    Anular factura
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar"
                  onClick={onClose}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FacturaDetailBody
                factura={factura}
                canWrite={canWrite}
                updatingEstadoId={updatingEstadoId}
                onRequestEstadoChange={onRequestEstadoChange}
              />
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function FacturasPage() {
  const { rol } = useActiveTenant();
  const { invoiceId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const canWrite = canWriteUi(rol, "recibos:write");
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list: centrosList } = useCentros();
  const [filtroCurso, setFiltroCurso] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const { list, mesPeriodoOptions, create, update } = useRecibos({
    centerId: filterCenterId,
    cursoId: filtroCurso || null,
    mesPeriodo: filtroMes || null,
  });

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [updatingEstadoId, setUpdatingEstadoId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<FacturaConfirmAction | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const cursosEscolares = useMemo(() => {
    const centros = filterCenterId
      ? (centrosList.data ?? []).filter((centro) => centro.ID_CENTRO === filterCenterId)
      : (centrosList.data ?? []);
    const byId = new Map<string, CursoEscolarData>();
    for (const centro of centros) {
      for (const curso of centro.CURSO_ESCOLAR ?? []) {
        byId.set(curso.ID_CURSO, curso);
      }
    }
    return sortCursosEscolares([...byId.values()]);
  }, [centrosList.data, filterCenterId]);

  const rows = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);

  const overlayFactura = useMemo(
    () => rows.find((r) => r.ID_RECIBO === overlay?.id) ?? null,
    [rows, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => {
    setOverlay(null);
    navigate({ search: (prev) => ({ ...prev, invoiceId: undefined }), replace: true });
  }, [navigate]);
  const handleEditOverlay = useCallback(() => {
    setOverlay((prev) => {
      if (!prev) return null;
      const row = rows.find((r) => r.ID_RECIBO === prev.id);
      if (!row || !isFacturaBorrador(row)) return prev;
      return { ...prev, mode: "edit" };
    });
  }, [rows]);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
  }, []);

  useEffect(() => {
    if (invoiceId) {
      setOverlay({ id: invoiceId, mode: "detail" });
    }
  }, [invoiceId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.REF_RECIBO?.toLowerCase().includes(q) ||
        r.NUM_FACTURA_HOLDED?.toLowerCase().includes(q) ||
        r.ID_RECIBO?.toLowerCase().includes(q) ||
        r.RECEPTOR_NOMBRE?.toLowerCase().includes(q) ||
        r.ALUMNOS?.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
        r.MES_PERIODO?.toLowerCase().includes(q) ||
        r.ESTADO_PAGO?.toLowerCase().includes(q),
    );
  }, [rows, query]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (
          entry?.isIntersecting &&
          list.hasNextPage &&
          !list.isFetchingNextPage &&
          !list.isLoading
        ) {
          void list.fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [list]);

  // 1. Botón "Generar Fra. proforma" del menú de acciones
  const handleGenerarProforma = async (row: ReciboRow) => {
    if (!isFacturaBorrador(row)) return;
    setUpdatingEstadoId(row.ID_RECIBO);
    try {
      await update.mutateAsync({ 
        id: row.ID_RECIBO, 
        patch: { TIPO_DOC: "Proforma" } 
      });
      toast.success("Solicitud de proforma enviada al webhook");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al procesar proforma");
    } finally {
      setUpdatingEstadoId(null);
    }
  };

  // 2. Botón "Generar factura" del menú de acciones
  const executeGenerarFactura = async (row: ReciboRow) => {
    if (!isFacturaBorrador(row)) return;
    setUpdatingEstadoId(row.ID_RECIBO);
    try {
      await update.mutateAsync({ 
        id: row.ID_RECIBO, 
        patch: { TIPO_DOC: "Proforma", ESTADO_PAGO: "Cobrado" } 
      });
      toast.success("Factura proforma encolada correctamente");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al procesar documento");
    } finally {
      setUpdatingEstadoId(null);
    }
  };

  const requestGenerarFactura = (row: ReciboRow) => {
    if (!isFacturaBorrador(row)) return;
    setConfirmAction({ type: "emitir", row });
  };

  // 3. Selector de estado en línea (Cuando cambian a "Cobrado" a mano)
  const executeEstadoChange = async (row: ReciboRow, estado: EstadoPagoOption) => {
    setUpdatingEstadoId(row.ID_RECIBO);
    try {
      const patchValues: Record<string, any> = { ESTADO_PAGO: estado };
      if (estado === "Cobrado") {
        patchValues.TIPO_DOC = "Proforma"; // Fuerza el flujo de proforma real en n8n
      }
      await update.mutateAsync({ id: row.ID_RECIBO, patch: patchValues });
      toast.success("Estado de factura actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el estado");
    } finally {
      setUpdatingEstadoId(null);
    }
  };

  const requestEstadoChange = (row: ReciboRow, estado: EstadoPagoOption) => {
    const current = normalizeEstadoPago(row.ESTADO_PAGO);
    if (!canTransitionEstadoPago(current, estado)) {
      toast.error("Transición de estado no permitida para esta factura");
      return;
    }
    if (current === estado) return;
    if (estado === "Cobrado" || estado === "Anulado") {
      setConfirmAction({ type: "estado", row, estado });
    }
  };

  const requestAnularFactura = (row: ReciboRow) => {
    requestEstadoChange(row, "Anulado");
  };

  const handleConfirmFacturaAction = async () => {
    if (!confirmAction || isConfirmingAction) return;
    setIsConfirmingAction(true);
    const action = confirmAction;
    try {
      if (action.type === "emitir") {
        await executeGenerarFactura(action.row);
      } else {
        await executeEstadoChange(action.row, action.estado);
      }
      setConfirmAction(null);
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const confirmCopy = confirmAction ? getFacturaConfirmCopy(confirmAction) : null;

  const resetFilters = () => {
    setFiltroCurso("");
    setFiltroMes("");
  };

  const loadedCountLabel = list.hasNextPage
    ? `${filtered.length}+ facturas cargadas`
    : `${filtered.length} facturas consolidadas en el sistema`;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabecera de control */}
      <PageHeader
        title="Gestión de Facturas"
        description={loadedCountLabel}
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Emitir factura manual
            </Button>
          )
        }
      />

      <Card className="p-4">
        {/* Buscador inteligente */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por referencia, cliente, mes o estado..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="facturas-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={(v) => {
                setSelectedCenterId(v);
                resetFilters();
              }}
            />
          )}
          <div className="space-y-1.5">
            <Label htmlFor="facturas-curso-filter" className="text-xs text-muted-foreground">
              Curso
            </Label>
            <Select
              value={filtroCurso || FILTER_ALL_VALUE}
              onValueChange={(value) => setFiltroCurso(value === FILTER_ALL_VALUE ? "" : value)}
            >
              <SelectTrigger id="facturas-curso-filter" className="w-full sm:w-[180px]">
                <SelectValue placeholder="Todos los cursos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL_VALUE}>Todos los cursos</SelectItem>
                {cursosEscolares.map((curso) => (
                  <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                    {curso.NOMBRE_CURSO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="facturas-mes-filter" className="text-xs text-muted-foreground">
              Mes
            </Label>
            <Select
              value={filtroMes || FILTER_ALL_VALUE}
              onValueChange={(value) => setFiltroMes(value === FILTER_ALL_VALUE ? "" : value)}
            >
              <SelectTrigger id="facturas-mes-filter" className="w-full sm:w-[180px]">
                <SelectValue placeholder="Todos los meses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTER_ALL_VALUE}>Todos los meses</SelectItem>
                {(mesPeriodoOptions.data ?? []).map((mes) => (
                  <SelectItem key={mes} value={mes}>
                    {mes}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error en la lectura financiera de Supabase: {(list.error as Error)?.message}
          </div>
        )}

        {/* Tabla compacta y estilizada */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia / Factura</TableHead>
                <TableHead>Receptor / Alumno</TableHead>
                <TableHead>Fecha / Periodo</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Total Doc</TableHead>
                <TableHead className="text-center">Factura</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={TABLE_COLS}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={TABLE_COLS}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {query ? "Sin resultados de facturación." : "No hay facturas registradas aún."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const borrador = isFacturaBorrador(r);
                  const cobrado = isFacturaCobrado(r);
                  const anulado = isFacturaAnulado(r);
                  const hasMenuActions = canWrite && !anulado;

                  return (
                    <TableRow
                      key={r.ID_RECIBO}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => setOverlay({ id: r.ID_RECIBO, mode: "detail" })}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <FacturaReferenciaCell row={r} />
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{r.RECEPTOR_NOMBRE || "—"}</div>
                        {r.ALUMNOS?.NOMBRE_ALUMNO && (
                          <div
                            className="text-xs text-muted-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Alumno:{" "}
                            <EntityLink type="alumno" id={r.ID_ALUMNO}>
                              {r.ALUMNOS.NOMBRE_ALUMNO}
                            </EntityLink>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="space-y-0.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {r.FECHA ?? "—"}
                        </div>
                        {r.MES_PERIODO && (
                          <div className="font-medium capitalize text-slate-700">
                            {r.MES_PERIODO}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CreditCard className="h-3 w-3" /> {r.METODO_PAGO || "Remesa"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold text-blue-950">
                        {formatCurrency(r.TOTAL_DOC)}
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        {r.LINK_PDF_RECIBO ? (
                          <div className="flex justify-center">
                            <FacturaPdfDownloadButton link={r.LINK_PDF_RECIBO} />
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EstadoPagoSelect
                          row={r}
                          canWrite={canWrite}
                          updating={updatingEstadoId === r.ID_RECIBO}
                          onRequestChange={(estado) => requestEstadoChange(r, estado)}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {hasMenuActions ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Acciones de la factura"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {borrador && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => void requestGenerarFactura(r)}
                                    disabled={updatingEstadoId === r.ID_RECIBO}
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Generar factura
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleGenerarProforma(r)}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Generar Fra. proforma
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setOverlay({ id: r.ID_RECIBO, mode: "edit" })}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Editar importes
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => requestAnularFactura(r)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Anular
                                  </DropdownMenuItem>
                                </>
                              )}
                              {cobrado && (
                                <DropdownMenuItem
                                  onClick={() => requestAnularFactura(r)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Anular
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div ref={loadMoreRef} className="py-4">
          {list.isFetchingNextPage && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando más facturas...
            </div>
          )}
        </div>
      </Card>

      <FacturaDetailOverlay
        open={overlay != null}
        mode={overlay?.mode ?? "detail"}
        factura={overlayFactura}
        canWrite={canWrite}
        submitting={update.isPending}
        updatingEstadoId={updatingEstadoId}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onAnular={() => {
          if (!overlayFactura) return;
          requestAnularFactura(overlayFactura);
        }}
        onRequestEstadoChange={(estado) => {
          if (!overlayFactura) return;
          requestEstadoChange(overlayFactura, estado);
        }}
        onSubmit={async (values) => {
          if (!overlay?.id) return;
          try {
            await update.mutateAsync({ id: overlay.id, patch: values });
            toast.success("Factura actualizada");
            setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      {/* Create Modal */}
      <FacturaFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Emitir Nueva Factura"
        submitLabel="Emitir Documento"
        submitting={create.isPending}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(values);
            toast.success("Factura guardada y encolada para n8n");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al guardar");
          }
        }}
      />

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open && !isConfirmingAction) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirmingAction}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                confirmCopy?.destructive &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
              disabled={isConfirmingAction}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmFacturaAction();
              }}
            >
              {isConfirmingAction ? "Procesando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DIÁLOGO DEL FORMULARIO DE FACTURAS
// ---------------------------------------------------------------------------

function FacturaFormDialog({
  open,
  embedded,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  onSubmit,
}: {
  open: boolean;
  embedded?: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: ReciboRow | null;
  submitting: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const [refRecibo, setRefRecibo] = useState(initial?.REF_RECIBO ?? "");
  const [idAlumno, setIdAlumno] = useState(initial?.ID_ALUMNO ?? "");
  const [receptorNombre, setReceptorNombre] = useState(initial?.RECEPTOR_NOMBRE ?? "");
  const [cifDni, setCifDni] = useState(initial?.CIF_DNI ?? "");
  const [mail, setMail] = useState(initial?.MAIL ?? "");
  const [tlf, setTlf] = useState(initial?.TLF ?? "");
  const [fecha, setFecha] = useState(initial?.FECHA ?? "");
  const [mesPeriodo, setMesPeriodo] = useState(initial?.MES_PERIODO ?? "");
  const [direccion, setDireccion] = useState(initial?.DIRECCION ?? "");
  const [tipoDoc, setTipoDoc] = useState(initial?.TIPO_DOC ?? "Factura Simplificada");
  const [metodoPago, setMetodoPago] = useState(initial?.METODO_PAGO ?? "Remesa Bancaria");
  const [totalBase, setTotalBase] = useState(initial?.TOTAL_BASE?.toString() ?? "");
  const [descuento, setDescuento] = useState(initial?.DESCUENTO?.toString() ?? "");
  const [totalIva, setTotalIva] = useState(initial?.TOTAL_IVA?.toString() ?? "0");
  const [totalDoc, setTotalDoc] = useState(initial?.TOTAL_DOC?.toString() ?? "");
  const [estadoPago, setEstadoPago] = useState(initial?.ESTADO_PAGO ?? "Cobrado");
  const [numFacturaHolded, setNumFacturaHolded] = useState(initial?.NUM_FACTURA_HOLDED ?? "");
  const [linkFacturaHolded, setLinkFacturaHolded] = useState(initial?.LINK_FACTURA_HOLDED ?? "");
  const [linkPdfRecibo, setLinkPdfRecibo] = useState(initial?.LINK_PDF_RECIBO ?? "");

  useMemo(() => {
    if (open) {
      setRefRecibo(initial?.REF_RECIBO ?? "");
      setIdAlumno(initial?.ID_ALUMNO ?? "");
      setReceptorNombre(initial?.RECEPTOR_NOMBRE ?? "");
      setCifDni(initial?.CIF_DNI ?? "");
      setMail(initial?.MAIL ?? "");
      setTlf(initial?.TLF ?? "");
      setFecha(initial?.FECHA ?? "");
      setMesPeriodo(initial?.MES_PERIODO ?? "");
      setDireccion(initial?.DIRECCION ?? "");
      setTipoDoc(initial?.TIPO_DOC ?? "Factura Simplificada");
      setMetodoPago(initial?.METODO_PAGO ?? "Remesa Bancaria");
      setTotalBase(initial?.TOTAL_BASE?.toString() ?? "");
      setDescuento(initial?.DESCUENTO?.toString() ?? "");
      setTotalIva(initial?.TOTAL_IVA?.toString() ?? "0");
      setTotalDoc(initial?.TOTAL_DOC?.toString() ?? "");
      setEstadoPago(initial?.ESTADO_PAGO ?? "Cobrado");
      setNumFacturaHolded(initial?.NUM_FACTURA_HOLDED ?? "");
      setLinkFacturaHolded(initial?.LINK_FACTURA_HOLDED ?? "");
      setLinkPdfRecibo(initial?.LINK_PDF_RECIBO ?? "");
    }
  }, [open, initial]);

  const formBody = (
    <form
      id={embedded ? "factura-form" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!refRecibo.trim() || !receptorNombre.trim()) return;
        onSubmit({
          REF_RECIBO: refRecibo.trim(),
          ID_ALUMNO: idAlumno || null,
          RECEPTOR_NOMBRE: receptorNombre.trim(),
          CIF_DNI: cifDni || null,
          MAIL: mail || null,
          TLF: tlf || null,
          FECHA: fecha || null,
          MES_PERIODO: mesPeriodo || null,
          DIRECCION: direccion || null,
          TIPO_DOC: tipoDoc || null,
          METODO_PAGO: metodoPago || null,
          TOTAL_BASE: totalBase ? parseFloat(totalBase) : null,
          DESCUENTO: descuento ? parseFloat(descuento) : null,
          TOTAL_IVA: totalIva ? parseFloat(totalIva) : null,
          TOTAL_DOC: totalDoc ? parseFloat(totalDoc) : null,
          ESTADO_PAGO: estadoPago || null,
          NUM_FACTURA_HOLDED: numFacturaHolded || null,
          LINK_FACTURA_HOLDED: linkFacturaHolded || null,
          LINK_PDF_RECIBO: linkPdfRecibo || null,
        });
      }}
      className={embedded ? "space-y-4" : "space-y-4 pt-1"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Referencia Interna Factura *</Label>
          <Input
            value={refRecibo}
            onChange={(e) => setRefRecibo(e.target.value)}
            placeholder="Ej: FAC-2026-001"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>ID del Alumno Relacionado</Label>
          <Input
            value={idAlumno}
            onChange={(e) => setIdAlumno(e.target.value)}
            placeholder="Ej: ESC_004_ALU_0017"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Nombre completo Receptor *</Label>
          <Input
            value={receptorNombre}
            onChange={(e) => setReceptorNombre(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>CIF / DNI Fiscal</Label>
          <Input
            value={cifDni}
            onChange={(e) => setCifDni(e.target.value)}
            placeholder="12345678Z"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Email Envío</Label>
          <Input type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Teléfono Móvil</Label>
          <Input value={tlf} onChange={(e) => setTlf(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Fecha Emisión</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Mes / Periodo de cobro</Label>
          <Input
            value={mesPeriodo}
            onChange={(e) => setMesPeriodo(e.target.value)}
            placeholder="Ej: Junio 2026"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Dirección Fiscal Facturación</Label>
        <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-4 font-mono">
        <div className="space-y-1 col-span-1">
          <Label className="font-sans text-xs">Base (€)</Label>
          <Input
            type="number"
            step="0.01"
            value={totalBase}
            onChange={(e) => setTotalBase(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1 col-span-1">
          <Label className="font-sans text-xs">Dto (€)</Label>
          <Input
            type="number"
            step="0.01"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1 col-span-1">
          <Label className="font-sans text-xs">IVA (€)</Label>
          <Input
            type="number"
            step="0.01"
            value={totalIva}
            onChange={(e) => setTotalIva(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1 col-span-1">
          <Label className="font-sans text-xs font-bold">TOTAL (€)</Label>
          <Input
            type="number"
            step="0.01"
            value={totalDoc}
            onChange={(e) => setTotalDoc(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Tipo Doc</Label>
          <Input value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Método de Pago</Label>
          <Input value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Estado Pago</Label>
          <Input
            value={estadoPago}
            onChange={(e) => setEstadoPago(e.target.value)}
            placeholder="Cobrado, Pendiente..."
          />
        </div>
      </div>

      <div className="border-t pt-2 space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground">
          Enlaces y Sincronizaciones Externas (Opcionales)
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Num Factura Holded</Label>
            <Input value={numFacturaHolded} onChange={(e) => setNumFacturaHolded(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Link Factura Holded</Label>
            <Input
              value={linkFacturaHolded}
              onChange={(e) => setLinkFacturaHolded(e.target.value)}
            />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Link PDF Factura (URL)</Label>
            <Input value={linkPdfRecibo} onChange={(e) => setLinkPdfRecibo(e.target.value)} />
          </div>
        </div>
      </div>

      {!embedded ? (
        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : submitLabel}
          </Button>
        </DialogFooter>
      ) : null}
    </form>
  );

  if (embedded) {
    if (!open) return null;
    return formBody;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
