import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Pencil,
  DollarSign,
  Clock,
  X,
} from "lucide-react";
import {
  useTarifas,
  type TarifaData,
  type TarifaCreateInput,
  type TarifaUpdateInput,
} from "@/hooks/useTarifas";
import { useActiveTenant } from "@/context/AppContext";
import { isAdminRole, isDireccionRole, isMasterRole, isProfesorRole } from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tarifas")({
  component: TarifasPage,
});

const FORMATO_VENTA_OPTIONS = ["Suelto", "Pack"] as const;

const TIPO_COBRO_OPTIONS = ["Mensual", "Trimestral", "Anual"] as const;

function pickSelectOption<T extends readonly string[]>(
  options: T,
  value: string | null | undefined,
): T[number] {
  if (value && (options as readonly string[]).includes(value)) {
    return value as T[number];
  }
  return options[0];
}

function formatPrecio(precio: number | null): string {
  return formatCurrency(precio);
}

const TABLE_COLS = 6;

type PendingTarifaUpdate = { id: string; values: TarifaUpdateInput };

function TarifaDetailOverlay({
  open,
  mode,
  tarifa,
  canWrite,
  submitting,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  tarifa: TarifaData | null;
  canWrite: boolean;
  submitting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: TarifaUpdateInput) => void;
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

  if (!tarifa) {
    return createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/10"
          aria-label="Cerrar"
          onClick={onClose}
        />
        <div
          className={cn(
            ALUMNO_OVERLAY_PANEL_CLASS,
            "max-w-xl flex items-center justify-center p-6",
          )}
        >
          <Skeleton className="h-8 w-48" />
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle de la tarifa"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tarifa-overlay-title"
        className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "max-w-xl p-6")}
      >
        {mode === "edit" ? (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={onCancelEdit}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </Button>
                <h2 id="tarifa-overlay-title" className="truncate text-xl font-semibold">
                  Editar tarifa
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
            <TarifaFormDialog
              open
              embedded
              title="Editar tarifa"
              submitLabel="Guardar"
              initial={tarifa}
              submitting={submitting}
              onClose={onCancelEdit}
              onSubmit={onSubmit}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="tarifa-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="tarifa-overlay-title" className="truncate text-xl font-semibold">
                  Vista detalle
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canWrite && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-2 bg-black text-white hover:bg-black/90"
                    onClick={onEdit}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
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
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2">
                <dt className="text-muted-foreground">Servicio / concepto</dt>
                <dd className="font-semibold">{tarifa.SERVICIO}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Precio</dt>
                <dd className="font-mono tabular-nums">{formatPrecio(tarifa.PRECIO)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Formato de venta</dt>
                <dd>{tarifa.FORMATO_VENTA ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tipo de cobro</dt>
                <dd>{tarifa.TIPO_COBRO ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sesiones / semana</dt>
                <dd>{tarifa.SESIONES_SEMANALES ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Horas totales / semana</dt>
                <dd>{tarifa.TOTAL_HORAS_SEMANALES ?? "—"}</dd>
              </div>
              {tarifa.DETALLES && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Detalles</dt>
                  <dd className="whitespace-pre-wrap">{tarifa.DETALLES}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function TarifasPage() {
  const { rol } = useActiveTenant();
  const canWrite = isMasterRole(rol) || isAdminRole(rol);
  const canDelete = isMasterRole(rol);
  const isReadOnly = isDireccionRole(rol);

  const { list, create, update, remove } = useTarifas();

  const tarifas = useMemo(() => list.data ?? [], [list.data]);

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TarifaData | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingTarifaUpdate | null>(null);

  const overlayTarifa = useMemo(
    () => tarifas.find((t) => t.ID_TARIFA === overlay?.id) ?? null,
    [tarifas, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => setOverlay(null), []);
  const handleEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
  }, []);

  const executePendingUpdate = async () => {
    if (!pendingUpdate) return;
    try {
      await update.mutateAsync({ id: pendingUpdate.id, patch: pendingUpdate.values });
      toast.success("Tarifa actualizada.");
      setOverlay((prev) => (prev?.id === pendingUpdate.id ? { ...prev, mode: "detail" } : prev));
      setPendingUpdate(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar.");
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return tarifas;
    const q = query.toLowerCase();
    return tarifas.filter(
      (t) =>
        t.SERVICIO?.toLowerCase().includes(q) ||
        t.FORMATO_VENTA?.toLowerCase().includes(q) ||
        t.TIPO_COBRO?.toLowerCase().includes(q) ||
        t.DETALLES?.toLowerCase().includes(q),
    );
  }, [tarifas, query]);

  if (isProfesorRole(rol)) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          No tienes permiso para consultar el catálogo de tarifas.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Estructura de Tarifas"
        description={
          <>
            {tarifas.length} planes de cobro · ordenados alfabéticamente
            {isReadOnly && " · solo lectura"}
          </>
        }
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva tarifa
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por servicio, formato, tipo de cobro..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error al cargar tarifas: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs font-semibold">Servicio</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Precio</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Formato</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Tipo cobro</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Carga lectiva</TableHead>
                <TableHead className="h-9 w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={TABLE_COLS} className="py-2">
                      <Skeleton className="h-7 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={TABLE_COLS}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {query ? "Sin resultados." : "No hay ninguna tarifa registrada."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow
                    key={t.ID_TARIFA}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: t.ID_TARIFA, mode: "detail" })}
                  >
                    <TableCell className="py-2 font-medium text-sm">{t.SERVICIO}</TableCell>
                    <TableCell
                      className="py-2 text-sm font-mono tabular-nums"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {formatPrecio(t.PRECIO)}
                    </TableCell>
                    <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                      <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0">
                        {t.FORMATO_VENTA ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {t.TIPO_COBRO ?? "—"}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {t.SESIONES_SEMANALES != null && <div>{t.SESIONES_SEMANALES} ses/sem</div>}
                      {t.TOTAL_HORAS_SEMANALES != null && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          {t.TOTAL_HORAS_SEMANALES}h/sem
                        </div>
                      )}
                      {t.SESIONES_SEMANALES == null && t.TOTAL_HORAS_SEMANALES == null && "—"}
                    </TableCell>
                    <TableCell className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {(canWrite || canDelete) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Acciones de la tarifa"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canWrite && (
                              <DropdownMenuItem
                                onClick={() => setOverlay({ id: t.ID_TARIFA, mode: "edit" })}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleting(t)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <TarifaFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Nueva tarifa"
        submitLabel="Crear"
        submitting={create.isPending}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(values as TarifaCreateInput);
            toast.success("Tarifa creada.");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear.");
          }
        }}
      />

      <TarifaDetailOverlay
        open={overlay != null}
        mode={overlay?.mode ?? "detail"}
        tarifa={overlayTarifa}
        canWrite={canWrite}
        submitting={update.isPending}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onSubmit={(values) => {
          if (!overlay?.id) return;
          setPendingUpdate({ id: overlay.id, values });
        }}
      />

      <AlertDialog open={!!pendingUpdate} onOpenChange={(o) => !o && setPendingUpdate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas guardar los cambios en esta tarifa?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={update.isPending}
              onClick={(e) => {
                e.preventDefault();
                void executePendingUpdate();
              }}
            >
              {update.isPending ? "Guardando..." : "Confirmar y guardar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canDelete && (
        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar tarifa</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará permanentemente el plan <b>{deleting?.SERVICIO}</b>. Esta acción no se
                puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!deleting) return;
                  try {
                    await remove.mutateAsync(deleting.ID_TARIFA);
                    toast.success("Tarifa eliminada.");
                    setDeleting(null);
                    setOverlay((prev) => (prev?.id === deleting.ID_TARIFA ? null : prev));
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Error al eliminar.");
                  }
                }}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function TarifaFormDialog({
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
  initial?: TarifaData | null;
  submitting: boolean;
  onSubmit: (values: TarifaCreateInput | TarifaUpdateInput) => void;
}) {
  const [servicio, setServicio] = useState("");
  const [precio, setPrecio] = useState("");
  const [formatoVenta, setFormatoVenta] = useState<string>(FORMATO_VENTA_OPTIONS[0]);
  const [tipoCobro, setTipoCobro] = useState<string>(TIPO_COBRO_OPTIONS[0]);
  const [sesionesSemanales, setSesionesSemanales] = useState("");
  const [totalHorasSemanales, setTotalHorasSemanales] = useState("");
  const [detalles, setDetalles] = useState("");

  useEffect(() => {
    if (!open) return;
    setServicio(initial?.SERVICIO ?? "");
    setPrecio(initial?.PRECIO != null ? String(initial.PRECIO) : "");
    setFormatoVenta(pickSelectOption(FORMATO_VENTA_OPTIONS, initial?.FORMATO_VENTA));
    setTipoCobro(pickSelectOption(TIPO_COBRO_OPTIONS, initial?.TIPO_COBRO));
    setSesionesSemanales(
      initial?.SESIONES_SEMANALES != null ? String(initial.SESIONES_SEMANALES) : "",
    );
    setTotalHorasSemanales(
      initial?.TOTAL_HORAS_SEMANALES != null ? String(initial.TOTAL_HORAS_SEMANALES) : "",
    );
    setDetalles(initial?.DETALLES ?? "");
  }, [open, initial]);

  const parseOptionalFloat = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = parseFloat(trimmed);
    return Number.isNaN(n) ? null : n;
  };

  const parseOptionalInt = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = parseInt(trimmed, 10);
    return Number.isNaN(n) ? null : n;
  };

  const formBody = open ? (
    <form
      id="tarifa-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!servicio.trim()) return;
        onSubmit({
          SERVICIO: servicio.trim(),
          PRECIO: parseOptionalFloat(precio),
          FORMATO_VENTA: formatoVenta || null,
          TIPO_COBRO: tipoCobro || null,
          SESIONES_SEMANALES: parseOptionalInt(sesionesSemanales),
          TOTAL_HORAS_SEMANALES: parseOptionalFloat(totalHorasSemanales),
          DETALLES: detalles.trim() || null,
        });
      }}
      className={embedded ? "space-y-4" : "flex-1 overflow-y-auto space-y-4 py-2"}
    >
      <div className="space-y-2">
        <Label htmlFor="tarifa-servicio">Servicio / concepto *</Label>
        <Input
          id="tarifa-servicio"
          value={servicio}
          onChange={(e) => setServicio(e.target.value)}
          placeholder="Ej: 1h/Semana Instrumento Individual"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tarifa-precio">Precio (€)</Label>
          <div className="relative">
            <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="tarifa-precio"
              type="number"
              step="0.01"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className="pl-9"
              placeholder="85.00"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tarifa-formato">Formato de venta</Label>
          <Select value={formatoVenta} onValueChange={setFormatoVenta}>
            <SelectTrigger id="tarifa-formato">
              <SelectValue placeholder="Seleccionar formato" />
            </SelectTrigger>
            <SelectContent>
              {FORMATO_VENTA_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="tarifa-tipo-cobro">Tipo de cobro</Label>
          <Select value={tipoCobro} onValueChange={setTipoCobro}>
            <SelectTrigger id="tarifa-tipo-cobro">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              {TIPO_COBRO_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tarifa-sesiones">Sesiones / semana</Label>
          <Input
            id="tarifa-sesiones"
            type="number"
            value={sesionesSemanales}
            onChange={(e) => setSesionesSemanales(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tarifa-horas">Horas totales / semana</Label>
          <Input
            id="tarifa-horas"
            type="number"
            step="0.1"
            value={totalHorasSemanales}
            onChange={(e) => setTotalHorasSemanales(e.target.value)}
            placeholder="1.5"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tarifa-detalles">Detalles</Label>
        <Textarea
          id="tarifa-detalles"
          value={detalles}
          onChange={(e) => setDetalles(e.target.value)}
          placeholder="Condiciones, cláusulas o notas del plan..."
          rows={3}
        />
      </div>
    </form>
  ) : null;

  if (embedded) {
    if (!open) return null;
    return formBody;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Formulario de tarifa</DialogDescription>
        </DialogHeader>
        {formBody}
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="tarifa-form" disabled={submitting}>
            {submitting ? "Guardando..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
