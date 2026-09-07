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
  sortRecibosByPeriodoAndAlumno,
  reciboTieneFacturaOficial,
  resolveCobradoVerifactuEmision,
  resolveAnulacionVerifactu,
  reciboRequiereAnulacionKorefactu,
  buildReciboCobradoPatch,
  VERIFACTU_EMITIDA_SIN_PDF_TOAST,
  type ReciboRow,
  type EstadoPagoOption,
} from "@/hooks/useRecibos";
import {
  useVentasLineas,
  calcVentaLineaSubtotal,
  type VentaLineaRow,
} from "@/hooks/useVentasLineas";
import {
  FacturaReferenciaCell,
  FacturaPdfDownloadButton,
  FacturaOficialPdfButton,
  EstadoPagoSelect,
} from "@/components/facturas/FacturaTableCells";
import {
  NuevaFacturaDialog,
  type NuevaFacturaLineaPrefill,
} from "@/components/facturas/NuevaFacturaDialog";
import { fetchRemesaProcesoAlumnoPrefill } from "@/hooks/useRemesas";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useCentros, type CursoEscolarData } from "@/hooks/useCentros";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi, hasPermission } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { EntityLink } from "@/components/navigation/EntityLink";
import {
  METODOS_PAGO_OPCIONES,
  normalizeMetodoPago,
  isTarjetaPaymentMethod,
} from "@/lib/alumnoPaymentUtils";
import {
  packReciboDireccionJson,
  parseReciboDireccionJson,
  streetBeforePipe,
} from "@/lib/reciboDireccionUtils";
import { toast } from "sonner";

function direccionFieldsFromRaw(direccion: string | null | undefined) {
  const parsed = parseReciboDireccionJson(direccion);
  if (parsed) return parsed;
  const raw = direccion?.trim() ?? "";
  const pipeIdx = raw.indexOf(" | ");
  if (pipeIdx >= 0) {
    return {
      calle: raw.slice(0, pipeIdx).trim(),
      cp: raw.slice(pipeIdx + 3).trim(),
      municipio: "",
      provincia: "",
    };
  }
  return {
    calle: streetBeforePipe(direccion) || raw,
    cp: "",
    municipio: "",
    provincia: "",
  };
}

function formatReciboDireccionDisplay(direccion: string | null | undefined): string {
  const parsed = parseReciboDireccionJson(direccion);
  if (parsed) {
    const line = [parsed.calle, parsed.cp, parsed.municipio, parsed.provincia]
      .filter(Boolean)
      .join(", ");
    return line || "—";
  }
  return direccion?.trim() || "—";
}

type FacturasSearch = {
  invoiceId?: string;
  newInvoice?: boolean;
  alumnoId?: string;
  remesaId?: string;
  centroId?: string;
  cursoId?: string;
  mesPeriodo?: string;
};

function parseFacturasSearch(search: Record<string, unknown>): FacturasSearch {
  const result: FacturasSearch = {};
  const invoiceId = search.invoiceId;
  if (typeof invoiceId === "string" && invoiceId.trim()) {
    result.invoiceId = invoiceId.trim();
  }
  if (search.newInvoice === true || search.newInvoice === "true") {
    result.newInvoice = true;
  }
  const alumnoId = search.alumnoId;
  if (typeof alumnoId === "string" && alumnoId.trim()) {
    result.alumnoId = alumnoId.trim();
  }
  const remesaId = search.remesaId;
  if (typeof remesaId === "string" && remesaId.trim()) {
    result.remesaId = remesaId.trim();
  }
  const centroId = search.centroId;
  if (typeof centroId === "string" && centroId.trim()) {
    result.centroId = centroId.trim();
  }
  const cursoId = search.cursoId;
  if (typeof cursoId === "string" && cursoId.trim()) {
    result.cursoId = cursoId.trim();
  }
  const mesPeriodo = search.mesPeriodo;
  if (typeof mesPeriodo === "string" && mesPeriodo.trim()) {
    result.mesPeriodo = mesPeriodo.trim();
  }
  return result;
}

export const Route = createFileRoute("/_authenticated/facturas")({
  validateSearch: parseFacturasSearch,
  component: FacturasPage,
});

const FILTER_ALL_VALUE = "__all__";
const TABLE_COLS = 10;

type FacturaConfirmAction =
  | { type: "estado"; row: ReciboRow; estado: EstadoPagoOption }
  | { type: "emitir"; row: ReciboRow };

function getFacturaConfirmCopy(action: FacturaConfirmAction): {
  title: string;
  description: string;
  destructive?: boolean;
} {
  if (action.type === "emitir") {
    if (isTarjetaPaymentMethod(action.row.METODO_PAGO)) {
      return {
        title: "Marcar cobro TPV",
        description:
          "Indica el nº de ticket emitido en el TPV. El recibo pasará a Cobrado sin enviar a Verifactu.",
      };
    }
    return {
      title: "Emitir factura",
      description:
        "¿Deseas marcar este borrador como cobrado y emitir la factura oficial con Verifactu?",
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
  if (action.estado === "Cobrado" && isTarjetaPaymentMethod(action.row.METODO_PAGO)) {
    return {
      title: "Marcar cobro TPV",
      description:
        "Indica el nº de ticket emitido en el TPV. El recibo pasará a Cobrado sin enviar a Verifactu.",
    };
  }
  return {
    title: "Confirmar cobro",
    description: "¿Confirmar cambio de estado a COBRADO?",
  };
}

function reciboTarjetaNecesitaTicket(row: ReciboRow): boolean {
  return isTarjetaPaymentMethod(row.METODO_PAGO) && !row.NUM_FACTURA_KOREFACTU?.trim();
}

function confirmActionRequiereTicketTpv(action: FacturaConfirmAction): boolean {
  if (action.type === "emitir") {
    return isTarjetaPaymentMethod(action.row.METODO_PAGO);
  }
  return action.estado === "Cobrado" && isTarjetaPaymentMethod(action.row.METODO_PAGO);
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

const RECIBO_TOTALES_READONLY_HINT =
  "Los importes se calculan desde las líneas del recibo. Para corregirlos, modifique la matrícula/horario, los cargos extra (Compras internas o ficha del alumno) o el ajuste manual en la ficha del alumno antes de generar la remesa. No parchee el total del recibo.";

const RECIBO_TOTAL_PATCH_KEYS = ["TOTAL_BASE", "DESCUENTO", "TOTAL_IVA", "TOTAL_DOC"] as const;

function stripReciboTotalsFromPatch(values: Record<string, unknown>): Record<string, unknown> {
  const patch = { ...values };
  for (const key of RECIBO_TOTAL_PATCH_KEYS) {
    delete patch[key];
  }
  return patch;
}

type VentaLineaDraft = {
  CONCEPTO: string;
  CANTIDAD: string;
  PRECIO_UNITARIO: string;
  IVA_PORCENTAJE: string;
};

function ventaLineaToDraft(row: VentaLineaRow): VentaLineaDraft {
  return {
    CONCEPTO: row.CONCEPTO,
    CANTIDAD: String(row.CANTIDAD),
    PRECIO_UNITARIO: String(row.PRECIO_UNITARIO),
    IVA_PORCENTAJE: String(row.IVA_PORCENTAJE ?? 0),
  };
}

function FacturaVentasLineasSection({ reciboId, canEdit }: { reciboId: string; canEdit: boolean }) {
  const { list, update } = useVentasLineas(reciboId);
  const [drafts, setDrafts] = useState<Record<string, VentaLineaDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!list.data) return;
    setDrafts(Object.fromEntries(list.data.map((row) => [row.ID_LINEA, ventaLineaToDraft(row)])));
  }, [list.data]);

  const handleDraftChange = (lineId: string, field: keyof VentaLineaDraft, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [lineId]: {
        ...(prev[lineId] ?? {
          CONCEPTO: "",
          CANTIDAD: "1",
          PRECIO_UNITARIO: "0",
          IVA_PORCENTAJE: "0",
        }),
        [field]: value,
      },
    }));
  };

  const handleSaveLine = async (row: VentaLineaRow) => {
    if (!canEdit) return;
    const draft = drafts[row.ID_LINEA];
    if (!draft?.CONCEPTO.trim()) {
      toast.error("El concepto de la línea es obligatorio.");
      return;
    }

    const cantidad = Number(draft.CANTIDAD);
    const precioUnitario = Number(draft.PRECIO_UNITARIO);
    const ivaPorcentaje = Number(draft.IVA_PORCENTAJE);
    if (
      !Number.isFinite(cantidad) ||
      !Number.isFinite(precioUnitario) ||
      !Number.isFinite(ivaPorcentaje)
    ) {
      toast.error("Cantidad, precio e IVA deben ser numéricos.");
      return;
    }

    setSavingId(row.ID_LINEA);
    try {
      const result = await update.mutateAsync({
        id: row.ID_LINEA,
        patch: {
          CONCEPTO: draft.CONCEPTO.trim(),
          CANTIDAD: cantidad,
          PRECIO_UNITARIO: precioUnitario,
          IVA_PORCENTAJE: ivaPorcentaje,
        },
      });
      toast.success("Línea actualizada.");
      if (result.pdfError) {
        toast.error(`PDF borrador: ${result.pdfError}`);
      }
      if (result.excelError) {
        toast.error(`Excel control: ${result.excelError}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar la línea.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-2 border-t pt-2">
      <h3 className="text-xs font-bold text-slate-900">Líneas del recibo</h3>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio unit.</TableHead>
              <TableHead className="text-right">IVA %</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              {canEdit ? <TableHead className="w-[88px]" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 6 : 5}
                  className="py-6 text-center text-muted-foreground"
                >
                  Cargando líneas...
                </TableCell>
              </TableRow>
            ) : list.isError ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 6 : 5}
                  className="py-6 text-center text-sm text-destructive"
                >
                  {(list.error as Error)?.message ?? "Error al cargar las líneas del recibo."}
                </TableCell>
              </TableRow>
            ) : (list.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 6 : 5}
                  className="py-6 text-center text-muted-foreground"
                >
                  Este recibo no tiene líneas registradas.
                </TableCell>
              </TableRow>
            ) : (
              (list.data ?? []).map((row) => {
                const draft = drafts[row.ID_LINEA] ?? ventaLineaToDraft(row);
                const previewSubtotal = calcVentaLineaSubtotal(
                  Number(draft.CANTIDAD),
                  Number(draft.PRECIO_UNITARIO),
                  Number(draft.IVA_PORCENTAJE),
                );
                const subtotalDisplay = Number.isFinite(previewSubtotal)
                  ? previewSubtotal
                  : row.SUBTOTAL;

                return (
                  <TableRow key={row.ID_LINEA}>
                    <TableCell>
                      {canEdit ? (
                        <Input
                          value={draft.CONCEPTO}
                          onChange={(e) =>
                            handleDraftChange(row.ID_LINEA, "CONCEPTO", e.target.value)
                          }
                          disabled={savingId === row.ID_LINEA}
                          className="h-8 min-w-[160px] text-xs"
                        />
                      ) : (
                        <span className="text-xs font-medium">{row.CONCEPTO}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.CANTIDAD}
                          onChange={(e) =>
                            handleDraftChange(row.ID_LINEA, "CANTIDAD", e.target.value)
                          }
                          disabled={savingId === row.ID_LINEA}
                          className="h-8 w-20 ml-auto text-right text-xs font-mono"
                        />
                      ) : (
                        <span className="font-mono text-xs">{row.CANTIDAD}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.PRECIO_UNITARIO}
                          onChange={(e) =>
                            handleDraftChange(row.ID_LINEA, "PRECIO_UNITARIO", e.target.value)
                          }
                          disabled={savingId === row.ID_LINEA}
                          className="h-8 w-24 ml-auto text-right text-xs font-mono"
                        />
                      ) : (
                        <span className="font-mono text-xs">
                          {formatCurrency(row.PRECIO_UNITARIO)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={draft.IVA_PORCENTAJE}
                          onChange={(e) =>
                            handleDraftChange(row.ID_LINEA, "IVA_PORCENTAJE", e.target.value)
                          }
                          disabled={savingId === row.ID_LINEA}
                          className="h-8 w-20 ml-auto text-right text-xs font-mono"
                        />
                      ) : (
                        <span className="font-mono text-xs">{row.IVA_PORCENTAJE ?? 0}%</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {formatCurrency(subtotalDisplay)}
                    </TableCell>
                    {canEdit ? (
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={savingId === row.ID_LINEA}
                          onClick={() => void handleSaveLine(row)}
                        >
                          {savingId === row.ID_LINEA ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Guardar"
                          )}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FacturaDetailBody({
  factura,
  canWrite,
  updatingEstadoId,
  onRequestEstadoChange,
  onPdfResolved,
}: {
  factura: ReciboRow;
  canWrite: boolean;
  updatingEstadoId: string | null;
  onRequestEstadoChange: (estado: EstadoPagoOption) => void;
  onPdfResolved?: () => void;
}) {
  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-lg border bg-muted/50 p-3">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

          <div className="space-y-2">
            {reciboTieneFacturaOficial(factura) && (
              <FacturaOficialPdfButton
                idRecibo={factura.ID_RECIBO}
                linkPdfRecibo={factura.LINK_PDF_RECIBO}
                linkFacturaKorefactu={factura.LINK_FACTURA_KOREFACTU}
                variant="block"
                onPdfResolved={() => onPdfResolved?.()}
              />
            )}

            {factura.LINK_PDF_BORRADOR && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 dark:bg-slate-900/20 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 shrink-0 text-slate-600 dark:text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Borrador
                    </p>
                    <p className="text-xs text-muted-foreground">PDF borrador del recibo</p>
                  </div>
                </div>
                <Button size="sm" variant="brand-outline" className="shrink-0 gap-2" asChild>
                  <a href={factura.LINK_PDF_BORRADOR} target="_blank" rel="noreferrer" download>
                    <Download className="h-4 w-4" />
                    Descargar PDF
                  </a>
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-3">
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
            <span>{formatReciboDireccionDisplay(factura.DIRECCION)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 rounded-md border bg-slate-50 p-2.5 border-t pt-2">
        <h3 className="text-xs font-bold text-blue-950">Desglose Fiscal de Importes</h3>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {RECIBO_TOTALES_READONLY_HINT}
        </p>
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
            <span className="font-medium">{factura.TIPO_DOC?.trim() || "Recibo"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Método Liquidación:</span>{" "}
            <span className="font-medium">{normalizeMetodoPago(factura.METODO_PAGO) || "—"}</span>
          </div>
        </div>
      </div>

      <FacturaVentasLineasSection
        reciboId={factura.ID_RECIBO}
        canEdit={canWrite && isFacturaBorrador(factura)}
      />

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
  onPdfResolved,
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
  onPdfResolved?: () => void;
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

  const canEditDatos = canWrite && isFacturaBorrador(factura);
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
                  Editar datos
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
                title="Editar datos"
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
              <Button type="submit" variant="brand" form="factura-form" disabled={submitting}>
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
                {canEditDatos && (
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    className="gap-2"
                    onClick={onEdit}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar datos
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
                onPdfResolved={onPdfResolved}
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
  const { invoiceId, newInvoice, alumnoId, remesaId, centroId, cursoId, mesPeriodo } =
    Route.useSearch();
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
  const [prefillLineas, setPrefillLineas] = useState<NuevaFacturaLineaPrefill[] | undefined>(
    undefined,
  );
  const [prefillMesPeriodo, setPrefillMesPeriodo] = useState<string | undefined>(undefined);
  const [updatingEstadoId, setUpdatingEstadoId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<FacturaConfirmAction | null>(null);
  const [ticketTpvInput, setTicketTpvInput] = useState("");
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const centroNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const centro of centrosList.data ?? []) {
      if (centro.ID_CENTRO) {
        map.set(centro.ID_CENTRO, centro.NOMBRE_CENTRO?.trim() || centro.ID_CENTRO);
      }
    }
    return map;
  }, [centrosList.data]);

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

  const rows = useMemo(() => {
    const flat = list.data?.pages.flat() ?? [];
    return sortRecibosByPeriodoAndAlumno(flat);
  }, [list.data]);

  const overlayFactura = useMemo(
    () => rows.find((r) => r.ID_RECIBO === overlay?.id) ?? null,
    [rows, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => {
    setOverlay(null);
    navigate({ search: (prev) => ({ ...prev, invoiceId: undefined }), replace: true });
  }, [navigate]);

  const clearNewInvoiceSearch = useCallback(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        newInvoice: undefined,
        alumnoId: undefined,
        remesaId: undefined,
        centroId: undefined,
        cursoId: undefined,
        mesPeriodo: undefined,
      }),
      replace: true,
    });
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

  useEffect(() => {
    if (newInvoice) {
      setCreating(true);
    }
  }, [newInvoice]);

  useEffect(() => {
    if (!newInvoice || !remesaId || !alumnoId) {
      setPrefillLineas(undefined);
      setPrefillMesPeriodo(undefined);
      return;
    }

    let cancelled = false;
    void fetchRemesaProcesoAlumnoPrefill(remesaId, alumnoId)
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        setPrefillMesPeriodo(snapshot.MES_PERIODO?.trim() || undefined);
        const raw = snapshot.LINEAS_SNAPSHOT;
        if (!Array.isArray(raw) || raw.length === 0) {
          setPrefillLineas(undefined);
          return;
        }
        const mapped = raw
          .map((item) => {
            const row = item as Record<string, unknown>;
            const concepto = String(row.concepto ?? row.CONCEPTO ?? "").trim();
            if (!concepto) return null;
            return {
              CONCEPTO: concepto,
              CANTIDAD: Number(row.cantidad ?? row.CANTIDAD ?? 1),
              PRECIO_UNITARIO: Number(row.precio_unitario ?? row.PRECIO_UNITARIO ?? 0),
              IVA_PORCENTAJE: Number(row.iva_porcentaje ?? row.IVA_PORCENTAJE ?? 0),
            } satisfies NuevaFacturaLineaPrefill;
          })
          .filter((linea): linea is NuevaFacturaLineaPrefill => linea !== null);
        setPrefillLineas(mapped.length > 0 ? mapped : undefined);
      })
      .catch((err) => {
        console.error("[facturas] prefill remesa proceso:", err);
        if (!cancelled) setPrefillLineas(undefined);
        if (!cancelled) setPrefillMesPeriodo(undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [newInvoice, remesaId, alumnoId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.REF_RECIBO?.toLowerCase().includes(q) ||
        r.NUM_FACTURA_KOREFACTU?.toLowerCase().includes(q) ||
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

  useEffect(() => {
    if (!confirmAction) {
      setTicketTpvInput("");
      return;
    }
    setTicketTpvInput(confirmAction.row.NUM_FACTURA_KOREFACTU?.trim() ?? "");
  }, [confirmAction]);

  // TPV ya emitió en terminal: Harmony solo marca Cobrado y guarda el nº ticket local.
  const marcarReciboTarjetaCobrado = async (
    row: ReciboRow,
    extraPatch?: Record<string, unknown>,
  ) => {
    const patch = { ...(extraPatch ?? {}) };
    delete patch.LINK_FACTURA_KOREFACTU;
    delete patch.URL_QR;
    delete patch.HUELLA_HASH;
    const numFactura = String(
      patch.NUM_FACTURA_KOREFACTU ?? row.NUM_FACTURA_KOREFACTU ?? "",
    ).trim();
    if (!numFactura) {
      throw new Error("Indica el nº de ticket TPV antes de marcar como Cobrado.");
    }
    await update.mutateAsync({
      id: row.ID_RECIBO,
      patch: {
        ...patch,
        ESTADO_PAGO: "Cobrado",
        NUM_FACTURA_KOREFACTU: numFactura,
      },
    });
    toast.success("Recibo TPV marcado como Cobrado.");
  };

  // Marcar cobrado emite en Korefactu (excepto Tarjeta/TPV). Si falla, el recibo sigue Borrador.
  const marcarReciboCobradoConVerifactu = async (
    row: ReciboRow,
    extraPatch?: Record<string, unknown>,
  ) => {
    const metodo = normalizeMetodoPago(String(extraPatch?.METODO_PAGO ?? row.METODO_PAGO ?? ""));
    if (isTarjetaPaymentMethod(metodo)) {
      await marcarReciboTarjetaCobrado(row, extraPatch);
      return;
    }

    const verifactu = await resolveCobradoVerifactuEmision(row.ID_RECIBO, row.REF_RECIBO);
    if (verifactu.notification !== "success" && verifactu.notification !== "pdf_missing") {
      throw new Error("Verifactu no emitió la factura. El recibo sigue en Borrador.");
    }
    if (!verifactu.LINK_FACTURA_KOREFACTU?.trim()) {
      throw new Error("Verifactu no emitió la factura. El recibo sigue en Borrador.");
    }
    await update.mutateAsync({
      id: row.ID_RECIBO,
      patch: buildReciboCobradoPatch(verifactu, extraPatch),
    });
    if (verifactu.excelError) {
      toast.warning(verifactu.excelError);
    }
    if (verifactu.notification === "pdf_missing") {
      toast.warning(VERIFACTU_EMITIDA_SIN_PDF_TOAST);
    } else {
      toast.success("Factura emitida con Verifactu correctamente.");
    }
  };

  const marcarReciboAnuladoConVerifactu = async (row: ReciboRow) => {
    if (reciboRequiereAnulacionKorefactu(row)) {
      const verifactu = await resolveAnulacionVerifactu(row.ID_RECIBO);
      const patch: Record<string, unknown> = {};
      if (!isFacturaAnulado(row)) {
        patch.ESTADO_PAGO = "Anulado";
      }
      if (verifactu.linkPdfRecibo && !verifactu.orphan) {
        patch.LINK_PDF_RECIBO = verifactu.linkPdfRecibo;
      }
      if (Object.keys(patch).length > 0) {
        await update.mutateAsync({
          id: row.ID_RECIBO,
          patch,
        });
      }
      toast.success(
        isFacturaAnulado(row)
          ? "Anulación reenviada a Verifactu correctamente."
          : "Anulación registrada en Verifactu correctamente.",
      );
      return;
    }

    await update.mutateAsync({
      id: row.ID_RECIBO,
      patch: { ESTADO_PAGO: "Anulado" },
    });
    toast.success("Factura anulada.");
  };

  const executeGenerarFactura = async (row: ReciboRow, extraPatch?: Record<string, unknown>) => {
    if (!isFacturaBorrador(row)) return;
    setUpdatingEstadoId(row.ID_RECIBO);
    try {
      await marcarReciboCobradoConVerifactu(row, extraPatch);
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

  const executeEstadoChange = async (
    row: ReciboRow,
    estado: EstadoPagoOption,
    extraPatch?: Record<string, unknown>,
  ) => {
    setUpdatingEstadoId(row.ID_RECIBO);
    try {
      if (estado === "Cobrado") {
        await marcarReciboCobradoConVerifactu(row, extraPatch);
        return;
      }
      if (estado === "Anulado") {
        await marcarReciboAnuladoConVerifactu(row);
        return;
      }
      await update.mutateAsync({ id: row.ID_RECIBO, patch: { ESTADO_PAGO: estado } });
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

    const action = confirmAction;
    const ticketPatch =
      confirmActionRequiereTicketTpv(action) && reciboTarjetaNecesitaTicket(action.row)
        ? { NUM_FACTURA_KOREFACTU: ticketTpvInput.trim() }
        : undefined;

    if (
      confirmActionRequiereTicketTpv(action) &&
      reciboTarjetaNecesitaTicket(action.row) &&
      !ticketTpvInput.trim()
    ) {
      toast.error("Indica el nº de ticket TPV.");
      return;
    }

    setIsConfirmingAction(true);
    try {
      if (action.type === "emitir") {
        await executeGenerarFactura(action.row, ticketPatch);
      } else {
        await executeEstadoChange(action.row, action.estado, ticketPatch);
      }
      setConfirmAction(null);
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const confirmCopy = confirmAction ? getFacturaConfirmCopy(confirmAction) : null;
  const confirmShowTicketTpv =
    confirmAction != null &&
    confirmActionRequiereTicketTpv(confirmAction) &&
    reciboTarjetaNecesitaTicket(confirmAction.row);

  const resetFilters = () => {
    setFiltroCurso("");
    setFiltroMes("");
  };

  const loadedCountLabel = list.hasNextPage
    ? `${filtered.length}+ facturas cargadas`
    : `${filtered.length} facturas consolidadas en el sistema`;

  if (!hasPermission(rol, "recibos:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabecera de control */}
      <PageHeader
        title="Gestión de Facturas"
        description={loadedCountLabel}
        actions={
          canWrite && (
            <Button variant="brand" onClick={() => setCreating(true)}>
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
            Error al cargar las facturas: {(list.error as Error)?.message}
          </div>
        )}

        {/* Tabla compacta y estilizada */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia / Factura</TableHead>
                <TableHead>Alumno / Titular</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead>Fecha / Periodo</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Total Doc</TableHead>
                <TableHead className="text-center">Factura</TableHead>
                <TableHead className="text-center">Borrador</TableHead>
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
                      <TableCell>
                        <FacturaReferenciaCell row={r} />
                      </TableCell>
                      <TableCell>
                        {r.ALUMNOS?.NOMBRE_ALUMNO ? (
                          <>
                            <div className="text-sm font-semibold">
                              <EntityLink type="alumno" id={r.ID_ALUMNO}>
                                {r.ALUMNOS.NOMBRE_ALUMNO}
                              </EntityLink>
                            </div>
                            {r.RECEPTOR_NOMBRE ? (
                              <div className="text-xs text-muted-foreground">
                                Titular: {r.RECEPTOR_NOMBRE}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="text-sm font-semibold">{r.RECEPTOR_NOMBRE || "—"}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.ID_CENTRO ? (centroNameById.get(r.ID_CENTRO) ?? "—") : "—"}
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
                          <CreditCard className="h-3 w-3" />{" "}
                          {normalizeMetodoPago(r.METODO_PAGO) || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold text-blue-950">
                        {formatCurrency(r.TOTAL_DOC)}
                      </TableCell>
                      <TableCell className="text-center">
                        {reciboTieneFacturaOficial(r) ? (
                          <div className="flex justify-center">
                            <FacturaOficialPdfButton
                              idRecibo={r.ID_RECIBO}
                              linkPdfRecibo={r.LINK_PDF_RECIBO}
                              linkFacturaKorefactu={r.LINK_FACTURA_KOREFACTU}
                              onPdfResolved={() => void list.refetch()}
                            />
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.LINK_PDF_BORRADOR ? (
                          <div className="flex justify-center">
                            <FacturaPdfDownloadButton link={r.LINK_PDF_BORRADOR} label="Borrador" />
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
                                  <DropdownMenuItem
                                    onClick={() => setOverlay({ id: r.ID_RECIBO, mode: "edit" })}
                                  >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Editar datos
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
        onPdfResolved={() => void list.refetch()}
        onSubmit={async (values) => {
          if (!overlay?.id || !overlayFactura) return;
          try {
            const patch = stripReciboTotalsFromPatch(values);
            const goingCobrado = normalizeEstadoPago(String(patch.ESTADO_PAGO ?? "")) === "Cobrado";
            const goingAnulado = normalizeEstadoPago(String(patch.ESTADO_PAGO ?? "")) === "Anulado";
            if (isFacturaBorrador(overlayFactura) && goingCobrado) {
              delete patch.ESTADO_PAGO;
              delete patch.LINK_PDF_RECIBO;
              setUpdatingEstadoId(overlay.id);
              await marcarReciboCobradoConVerifactu(overlayFactura, patch);
              setUpdatingEstadoId(null);
            } else if (goingAnulado) {
              const { ESTADO_PAGO: _estado, ...restPatch } = patch;
              if (Object.keys(restPatch).length > 0) {
                await update.mutateAsync({ id: overlay.id, patch: restPatch });
              }
              setUpdatingEstadoId(overlay.id);
              await marcarReciboAnuladoConVerifactu(overlayFactura);
              setUpdatingEstadoId(null);
            } else {
              await update.mutateAsync({ id: overlay.id, patch });
              toast.success("Factura actualizada");
            }
            setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          } finally {
            setUpdatingEstadoId(null);
          }
        }}
      />

      <NuevaFacturaDialog
        open={creating}
        onClose={() => {
          setCreating(false);
          setPrefillLineas(undefined);
          setPrefillMesPeriodo(undefined);
          if (newInvoice) clearNewInvoiceSearch();
        }}
        submitting={create.isPending}
        defaultCentroId={centroId ?? filterCenterId}
        defaultAlumnoId={alumnoId}
        defaultCursoId={cursoId}
        defaultMesPeriodo={mesPeriodo ?? prefillMesPeriodo}
        defaultLineas={prefillLineas}
        centros={centrosOrdenados}
        cursos={cursosEscolares}
        onSubmit={async (input) => {
          try {
            const result = await create.mutateAsync(input);
            toast.success(`Borrador ${result.refRecibo} guardado correctamente`);
            if (result.pdfError) {
              toast.warning(
                `Recibo creado, pero no se pudo generar el PDF borrador: ${result.pdfError}`,
              );
            }
            setCreating(false);
            setPrefillLineas(undefined);
            setPrefillMesPeriodo(undefined);
            if (newInvoice) clearNewInvoiceSearch();
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
          {confirmShowTicketTpv ? (
            <div className="space-y-2 py-1">
              <Label htmlFor="ticket-tpv-confirm">Nº ticket TPV *</Label>
              <Input
                id="ticket-tpv-confirm"
                value={ticketTpvInput}
                onChange={(e) => setTicketTpvInput(e.target.value)}
                placeholder="Ticket emitido en el TPV"
                autoFocus
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConfirmingAction}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                confirmCopy?.destructive &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
              disabled={isConfirmingAction || (confirmShowTicketTpv && !ticketTpvInput.trim())}
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
  const idAlumno = initial?.ID_ALUMNO ?? null;
  const [receptorNombre, setReceptorNombre] = useState(initial?.RECEPTOR_NOMBRE ?? "");
  const [cifDni, setCifDni] = useState(initial?.CIF_DNI ?? "");
  const [mail, setMail] = useState(initial?.MAIL ?? "");
  const [tlf, setTlf] = useState(initial?.TLF ?? "");
  const [fecha, setFecha] = useState(initial?.FECHA ?? "");
  const [mesPeriodo, setMesPeriodo] = useState(initial?.MES_PERIODO ?? "");
  const [calle, setCalle] = useState("");
  const [cp, setCp] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [provincia, setProvincia] = useState("");
  const [metodoPago, setMetodoPago] = useState(
    () => normalizeMetodoPago(initial?.METODO_PAGO) || "SEPA",
  );
  const [estadoPago, setEstadoPago] = useState(initial?.ESTADO_PAGO ?? "Borrador");
  const [numFacturaKorefactu, setNumFacturaKorefactu] = useState(
    initial?.NUM_FACTURA_KOREFACTU ?? "",
  );

  const metodoPagoOptions = useMemo((): string[] => {
    const opts: string[] = [...METODOS_PAGO_OPCIONES];
    if (
      normalizeMetodoPago(initial?.METODO_PAGO) === "Transferencia" &&
      !opts.includes("Transferencia")
    ) {
      opts.unshift("Transferencia");
    }
    return opts;
  }, [initial?.METODO_PAGO]);

  const isTarjetaForm = normalizeMetodoPago(metodoPago) === "Tarjeta";
  const korefactuUuidLocked = Boolean(initial?.LINK_FACTURA_KOREFACTU?.trim());

  useMemo(() => {
    if (open) {
      setRefRecibo(initial?.REF_RECIBO ?? "");
      setReceptorNombre(initial?.RECEPTOR_NOMBRE ?? "");
      setCifDni(initial?.CIF_DNI ?? "");
      setMail(initial?.MAIL ?? "");
      setTlf(initial?.TLF ?? "");
      setFecha(initial?.FECHA ?? "");
      setMesPeriodo(initial?.MES_PERIODO ?? "");
      const dir = direccionFieldsFromRaw(initial?.DIRECCION);
      setCalle(dir.calle);
      setCp(dir.cp);
      setMunicipio(dir.municipio);
      setProvincia(dir.provincia);
      setMetodoPago(normalizeMetodoPago(initial?.METODO_PAGO) || "SEPA");
      setEstadoPago(initial?.ESTADO_PAGO ?? "Borrador");
      setNumFacturaKorefactu(initial?.NUM_FACTURA_KOREFACTU ?? "");
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
          DIRECCION: [calle, cp, municipio, provincia].some((f) => f.trim())
            ? packReciboDireccionJson({ calle, cp, municipio, provincia })
            : null,
          TIPO_DOC: initial?.TIPO_DOC?.trim() || "Recibo",
          METODO_PAGO: normalizeMetodoPago(metodoPago) || null,
          ESTADO_PAGO: estadoPago || null,
          ...(isTarjetaForm && !korefactuUuidLocked
            ? { NUM_FACTURA_KOREFACTU: numFacturaKorefactu.trim() || null }
            : {}),
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
          <Label>Alumno</Label>
          <Input
            value={
              initial?.ALUMNOS?.NOMBRE_ALUMNO?.trim()
                ? initial.ALUMNOS.NOMBRE_ALUMNO.trim()
                : "Sin alumno vinculado"
            }
            readOnly
            disabled
            className="bg-muted"
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Calle</Label>
          <Input value={calle} onChange={(e) => setCalle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>CP</Label>
          <Input value={cp} onChange={(e) => setCp(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Municipio</Label>
          <Input value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Provincia</Label>
          <Input value={provincia} onChange={(e) => setProvincia(e.target.value)} />
        </div>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50/80 p-3 text-[11px] leading-relaxed text-amber-950">
        {RECIBO_TOTALES_READONLY_HINT}
      </div>

      {initial ? (
        <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3 font-mono sm:grid-cols-4">
          <div>
            <span className="block font-sans text-xs text-muted-foreground">Base (€)</span>
            <span className="font-semibold">{formatCurrency(initial.TOTAL_BASE ?? 0)}</span>
          </div>
          <div>
            <span className="block font-sans text-xs text-muted-foreground">Dto (€)</span>
            <span className="font-semibold">{formatCurrency(initial.DESCUENTO ?? 0)}</span>
          </div>
          <div>
            <span className="block font-sans text-xs text-muted-foreground">IVA (€)</span>
            <span className="font-semibold">{formatCurrency(initial.TOTAL_IVA ?? 0)}</span>
          </div>
          <div>
            <span className="block font-sans text-xs font-bold text-muted-foreground">
              TOTAL (€)
            </span>
            <span className="font-bold text-blue-950">
              {formatCurrency(initial.TOTAL_DOC ?? 0)}
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Tipo Doc</Label>
          <Input
            value={initial?.TIPO_DOC?.trim() || "Recibo"}
            readOnly
            disabled
            className="bg-muted"
          />
        </div>
        <div className="space-y-2">
          <Label>Método de Pago</Label>
          <Select value={metodoPago} onValueChange={setMetodoPago}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar método" />
            </SelectTrigger>
            <SelectContent>
              {metodoPagoOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      {isTarjetaForm && !korefactuUuidLocked ? (
        <div className="space-y-2">
          <Label>Nº ticket TPV (Verifactu)</Label>
          <Input
            value={numFacturaKorefactu}
            onChange={(e) => setNumFacturaKorefactu(e.target.value)}
            placeholder="Ticket emitido en el TPV"
          />
          <p className="text-[11px] text-muted-foreground">
            Se guarda en Nº factura del Excel. No se emite de nuevo con Verifactu.
          </p>
        </div>
      ) : null}

      {!embedded ? (
        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" disabled={submitting}>
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
