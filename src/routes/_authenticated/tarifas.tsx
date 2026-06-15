import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil, DollarSign, Clock } from "lucide-react";
import {
  useTarifas,
  type TarifaData,
  type TarifaCreateInput,
  type TarifaUpdateInput,
} from "@/hooks/useTarifas";
import { useActiveTenant } from "@/context/AppContext";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
} from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
  if (precio == null) return "—";
  return `${precio.toFixed(2)}€`;
}

function TarifasPage() {
  const { rol } = useActiveTenant();
  const canWrite = isMasterRole(rol) || isAdminRole(rol);
  const canDelete = isMasterRole(rol);
  const isReadOnly = isDireccionRole(rol);

  const { list, create, update, remove } = useTarifas();

  const tarifas = list.data ?? [];

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<TarifaData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TarifaData | null>(null);

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estructura de Tarifas</h1>
          <p className="text-sm text-muted-foreground">
            {tarifas.length} planes de cobro · ordenados alfabéticamente
            {isReadOnly && " · solo lectura"}
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva tarifa
          </Button>
        )}
      </div>

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
                <TableHead className="h-9 text-xs font-semibold">Columnas horarios matrículas</TableHead>
                {canDelete && (
                  <TableHead className="h-9 text-xs font-semibold text-right w-12">Acciones</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canDelete ? 7 : 6} className="py-2">
                      <Skeleton className="h-7 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canDelete ? 7 : 6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {query ? "Sin resultados." : "No hay ninguna tarifa registrada."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow
                    key={t.ID_TARIFA}
                    className={
                      canWrite
                        ? "cursor-pointer hover:bg-muted/50 transition-colors"
                        : undefined
                    }
                    onClick={canWrite ? () => setEditing(t) : undefined}
                  >
                    <TableCell className="py-2 font-medium text-sm">{t.SERVICIO}</TableCell>
                    <TableCell className="py-2 text-sm font-mono tabular-nums">
                      {formatPrecio(t.PRECIO)}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0">
                        {t.FORMATO_VENTA ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {t.TIPO_COBRO ?? "—"}
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {t.SESIONES_SEMANALES != null && (
                        <div>{t.SESIONES_SEMANALES} ses/sem</div>
                      )}
                      {t.TOTAL_HORAS_SEMANALES != null && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3 shrink-0" />
                          {t.TOTAL_HORAS_SEMANALES}h/sem
                        </div>
                      )}
                      {t.SESIONES_SEMANALES == null && t.TOTAL_HORAS_SEMANALES == null && "—"}
                    </TableCell>
                    <TableCell className="py-2 text-sm font-mono tabular-nums text-muted-foreground">
                      {t.COLUMNAS_HORARIOS_MATRICULAS ?? "—"}
                    </TableCell>
                    {canDelete && (
                      <TableCell
                        className="py-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(t);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleting(t);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
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

      <TarifaFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar tarifa"
        submitLabel="Guardar"
        initial={editing}
        submitting={update.isPending}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.ID_TARIFA, patch: values });
            toast.success("Tarifa actualizada.");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar.");
          }
        }}
      />

      {canDelete && (
        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar tarifa</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará permanentemente el plan <b>{deleting?.SERVICIO}</b>. Esta acción no
                se puede deshacer.
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
  const [columnasHorariosMatriculas, setColumnasHorariosMatriculas] = useState("");
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
    setColumnasHorariosMatriculas(
      initial?.COLUMNAS_HORARIOS_MATRICULAS != null
        ? String(initial.COLUMNAS_HORARIOS_MATRICULAS)
        : "",
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Formulario de tarifa</DialogDescription>
        </DialogHeader>
        {open && (
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
                COLUMNAS_HORARIOS_MATRICULAS: parseOptionalInt(columnasHorariosMatriculas),
                DETALLES: detalles.trim() || null,
              });
            }}
            className="flex-1 overflow-y-auto space-y-4 py-2"
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
              <Label htmlFor="tarifa-columnas">Columnas horarios matrículas</Label>
              <Input
                id="tarifa-columnas"
                type="number"
                step="1"
                value={columnasHorariosMatriculas}
                onChange={(e) => setColumnasHorariosMatriculas(e.target.value)}
                placeholder="0"
              />
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
        )}
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
