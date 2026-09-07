import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock, Package, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  formatSupabaseError,
  usePrestamosMaterial,
  type PrestamoCategoria,
  type PrestamoMaterialCreateInput,
  type PrestamoMaterialData,
  type PrestamoMaterialUpdateInput,
} from "@/hooks/usePrestamosMaterial";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useActiveTenant } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { canWriteUi } from "@/lib/rbac";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type FilterTab = "activos" | "devueltos" | "todos";

const ESTADO_DEVOLUCION_OPTIONS = ["Prestado", "Devuelto", "Pendiente"] as const;

function todayDateKey(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function normalizeEstado(estado: string | null | undefined): string {
  return (estado ?? "Prestado").trim();
}

function estadoKey(estado: string | null | undefined): string {
  return normalizeEstado(estado).toLowerCase();
}

function isPrestadoActivo(estado: string | null | undefined): boolean {
  const key = estadoKey(estado);
  return key === "prestado" || key === "pendiente";
}

function sortPrestamos(rows: PrestamoMaterialData[]): PrestamoMaterialData[] {
  return [...rows].sort((a, b) => {
    const activoA = isPrestadoActivo(a.ESTADO_DEVOLUCION) ? 0 : 1;
    const activoB = isPrestadoActivo(b.ESTADO_DEVOLUCION) ? 0 : 1;
    if (activoA !== activoB) return activoA - activoB;

    const dateA = a.FECHA_PRESTAMO ? new Date(a.FECHA_PRESTAMO).getTime() : 0;
    const dateB = b.FECHA_PRESTAMO ? new Date(b.FECHA_PRESTAMO).getTime() : 0;
    return dateB - dateA;
  });
}

function formatDate(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

function resolveFechaDevolucionOnReturn(estadoDevolucion: string, fechaDevolucion: string): string {
  if (estadoKey(estadoDevolucion) !== "devuelto") {
    return fechaDevolucion.trim();
  }
  return fechaDevolucion.trim() || todayDateKey();
}

function cardFechaDevolucionLabel(row: PrestamoMaterialData): string {
  if (estadoKey(row.ESTADO_DEVOLUCION) === "devuelto") {
    const real = row.FECHA_DEVOLUCION?.trim();
    return real ? `Devuelto: ${formatDate(real)}` : "Devuelto";
  }
  const prevista = row.FECHA_FIN_PRESTAMO?.trim();
  return prevista ? `Devuelve: ${formatDate(prevista)}` : "Sin fecha prevista";
}

function categoriaLabel(value: string | null | undefined): string {
  if (value === "ALUMNO") return "Alumno";
  if (value === "PROFESOR") return "Profesor";
  return value?.trim() || "—";
}

function estadoDevolucionStatus(estado: string | null | undefined): StatusBadgeVariant {
  const key = estadoKey(estado);
  if (key === "devuelto") return "success";
  if (key === "pendiente") return "warning";
  return "info";
}

function normalizeRpcAlumnoIds(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        const id = row.ID_ALUMNO ?? row.id_alumno ?? row.id;
        return typeof id === "string" ? id.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
}

function canProfesorMarkReturned(
  row: PrestamoMaterialData,
  profesorId: string | null | undefined,
): boolean {
  const id = profesorId?.trim();
  if (!id) return false;
  return row.CREADO_POR?.trim() === id;
}

function resolveReceptorNombre(
  row: PrestamoMaterialData,
  alumnoById: Map<string, string>,
  profesorNombre: string | null | undefined,
  profesorId: string | null | undefined,
): string {
  const id = row.ID_RECEPTOR?.trim();
  if (!id) return "—";
  if (row.CATEGORIA === "ALUMNO") return alumnoById.get(id) ?? "—";
  if (row.CATEGORIA === "PROFESOR") {
    if (id === profesorId?.trim()) return profesorNombre?.trim() || "Yo";
    return "Profesor";
  }
  return "—";
}

function PrestamoCard({
  row,
  receptorNombre,
  canReturn,
  onOpen,
  onReturn,
  returning,
}: {
  row: PrestamoMaterialData;
  receptorNombre: string;
  canReturn: boolean;
  onOpen: () => void;
  onReturn: () => void;
  returning: boolean;
}) {
  const activo = isPrestadoActivo(row.ESTADO_DEVOLUCION);
  const estado = normalizeEstado(row.ESTADO_DEVOLUCION);
  const elemento = row.ELEMENTO?.trim() || "Material";
  const fechaLabel = cardFechaDevolucionLabel(row);

  return (
    <Card className="cursor-pointer p-4 transition-colors hover:bg-muted/40" onClick={onOpen}>
      {/* Móvil / tablet pequeña: receptor → elemento → fecha */}
      <div className="min-w-0 lg:hidden">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate font-medium leading-snug">{receptorNombre}</p>
          <StatusBadge status={estadoDevolucionStatus(row.ESTADO_DEVOLUCION)} className="shrink-0">
            {estado}
          </StatusBadge>
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{elemento}</p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">{fechaLabel}</p>
      </div>

      {/* Escritorio: elemento → receptor → fechas + acción rápida */}
      <div className="hidden min-w-0 lg:flex lg:items-start lg:justify-between lg:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{elemento}</p>
            <StatusBadge status={estadoDevolucionStatus(row.ESTADO_DEVOLUCION)}>
              {estado}
            </StatusBadge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {categoriaLabel(row.CATEGORIA)} · {receptorNombre}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Préstamo: {formatDate(row.FECHA_PRESTAMO)} · {fechaLabel}
          </p>
        </div>
        {activo && canReturn ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={returning}
            onClick={(e) => {
              e.stopPropagation();
              onReturn();
            }}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Devolver
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function PrestamoDetailDialog({
  prestamo,
  open,
  onClose,
  receptorNombre,
  canEdit,
  canReturn,
  onReturn,
  onSave,
  returning,
  saving,
}: {
  prestamo: PrestamoMaterialData | null;
  open: boolean;
  onClose: () => void;
  receptorNombre: string;
  canEdit: boolean;
  canReturn: boolean;
  onReturn: () => void;
  onSave: (patch: PrestamoMaterialUpdateInput) => Promise<void>;
  returning: boolean;
  saving: boolean;
}) {
  const [mode, setMode] = useState<"detail" | "edit">("detail");
  const [estadoDevolucion, setEstadoDevolucion] = useState("Prestado");
  const [fechaFinPrestamo, setFechaFinPrestamo] = useState("");
  const [fechaDevolucion, setFechaDevolucion] = useState("");
  const [notas, setNotas] = useState("");

  useEffect(() => {
    if (!open) setMode("detail");
  }, [open]);

  useEffect(() => {
    if (!prestamo) return;
    setMode("detail");
    setEstadoDevolucion(normalizeEstado(prestamo.ESTADO_DEVOLUCION));
    setFechaFinPrestamo(toDateInputValue(prestamo.FECHA_FIN_PRESTAMO));
    setFechaDevolucion(toDateInputValue(prestamo.FECHA_DEVOLUCION));
    setNotas(prestamo.NOTAS?.trim() ?? "");
  }, [prestamo?.ID_PRESTAMO, prestamo]);

  if (!prestamo) return null;

  const elemento = prestamo.ELEMENTO?.trim() || "Préstamo de material";
  const submitting = returning || saving;

  const handleEstadoChange = (next: string) => {
    setEstadoDevolucion(next);
    if (estadoKey(next) === "devuelto" && !fechaDevolucion.trim()) {
      setFechaDevolucion(todayDateKey());
    }
  };

  const handleSaveEdit = async () => {
    await onSave({
      ESTADO_DEVOLUCION: estadoDevolucion,
      FECHA_FIN_PRESTAMO: fechaFinPrestamo.trim() || null,
      FECHA_DEVOLUCION: resolveFechaDevolucionOnReturn(estadoDevolucion, fechaDevolucion) || null,
      NOTAS: notas.trim() || null,
    });
    setMode("detail");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setMode("detail");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "edit" ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setMode("detail")}
                disabled={submitting}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Package className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 truncate">
              {mode === "edit" ? "Editar préstamo" : elemento}
            </span>
          </DialogTitle>
        </DialogHeader>

        {mode === "edit" ? (
          <div className="space-y-4">
            <DetailField label="Receptor" value={receptorNombre} />
            <DetailField label="Elemento" value={elemento} />

            <div className="space-y-2">
              <Label>Estado devolución</Label>
              <Select
                value={estadoDevolucion}
                onValueChange={handleEstadoChange}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADO_DEVOLUCION_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Devolución prevista</Label>
                <Input
                  type="date"
                  value={fechaFinPrestamo}
                  onChange={(e) => setFechaFinPrestamo(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <Label>Devolución real</Label>
                <Input
                  type="date"
                  value={fechaDevolucion}
                  onChange={(e) => setFechaDevolucion(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                disabled={submitting}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={estadoDevolucionStatus(prestamo.ESTADO_DEVOLUCION)}>
                {normalizeEstado(prestamo.ESTADO_DEVOLUCION)}
              </StatusBadge>
              <Badge variant="secondary">{categoriaLabel(prestamo.CATEGORIA)}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Receptor" value={receptorNombre} />
              <DetailField label="Nº serie" value={prestamo.NUM_SERIE?.trim() || "—"} />
              <DetailField label="Fecha préstamo" value={formatDate(prestamo.FECHA_PRESTAMO)} />
              <DetailField
                label="Devolución prevista"
                value={formatDate(prestamo.FECHA_FIN_PRESTAMO)}
              />
              <DetailField label="Devolución real" value={formatDate(prestamo.FECHA_DEVOLUCION)} />
            </div>

            <DetailField
              label="Estado del material en la entrega"
              value={prestamo.ESTADO_MATERIAL?.trim() || "—"}
            />
            <DetailField label="Notas" value={prestamo.NOTAS?.trim() || "—"} />
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
          {mode === "edit" ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode("detail")}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="brand"
                disabled={submitting}
                onClick={() => void handleSaveEdit()}
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </>
          ) : (
            <>
              {isPrestadoActivo(prestamo.ESTADO_DEVOLUCION) && canReturn ? (
                <Button type="button" disabled={submitting} onClick={() => void onReturn()}>
                  {returning ? "Guardando..." : "Marcar como devuelto"}
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => setMode("edit")}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="break-words text-sm">{value}</p>
    </div>
  );
}

function NuevoPrestamoDialog({
  open,
  onClose,
  profesorId,
  profesorNombre,
  centerId,
  canMutate,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  profesorId: string | null | undefined;
  profesorNombre: string | null | undefined;
  centerId: string | null | undefined;
  canMutate: boolean;
  submitting: boolean;
  onSubmit: (values: PrestamoMaterialCreateInput) => Promise<void>;
}) {
  const { tenantId } = useActiveTenant();
  const { list: alumnosList } = useAlumnos();

  const [categoria, setCategoria] = useState<PrestamoCategoria | "">("");
  const [idReceptor, setIdReceptor] = useState("");
  const [elemento, setElemento] = useState("");
  const [estadoMaterial, setEstadoMaterial] = useState("");
  const [numSerie, setNumSerie] = useState("");
  const [fechaPrestamo, setFechaPrestamo] = useState(todayDateKey());
  const [fechaFinPrestamo, setFechaFinPrestamo] = useState("");
  const [notas, setNotas] = useState("");

  const alumnos = useMemo(() => alumnosList.data ?? [], [alumnosList.data]);
  const alumnoById = useMemo(
    () => new Map(alumnos.map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO])),
    [alumnos],
  );

  const alumnosPorProfesorQuery = useQuery({
    queryKey: ["obtener_id_alumnos_por_profesor", tenantId, profesorId],
    enabled: open && categoria === "ALUMNO" && !!profesorId?.trim(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("obtener_id_alumnos_por_profesor", {
        p_id_profesor: profesorId!.trim(),
      });
      if (error) throw error;
      return normalizeRpcAlumnoIds(data);
    },
  });

  const alumnoOptions = useMemo(() => {
    if (categoria !== "ALUMNO") return [];
    const center = centerId?.trim();
    const allowedIds = new Set(alumnosPorProfesorQuery.data ?? []);
    const options: { id: string; label: string }[] = [];

    for (const id of allowedIds) {
      const alumnoCentro = alumnos.find((a) => a.ID_ALUMNO === id)?.ID_CENTRO?.trim();
      if (center && alumnoCentro && alumnoCentro !== center) continue;
      const label = alumnoById.get(id);
      if (label) options.push({ id, label });
    }

    return options.sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
  }, [categoria, centerId, alumnosPorProfesorQuery.data, alumnos, alumnoById]);

  const resetForm = () => {
    setCategoria("");
    setIdReceptor("");
    setElemento("");
    setEstadoMaterial("");
    setNumSerie("");
    setFechaPrestamo(todayDateKey());
    setFechaFinPrestamo("");
    setNotas("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCategoriaChange = (next: PrestamoCategoria) => {
    setCategoria(next);
    if (next === "PROFESOR" && profesorId?.trim()) {
      setIdReceptor(profesorId.trim());
    } else {
      setIdReceptor("");
    }
  };

  const handleSubmit = async () => {
    if (!canMutate) return;
    if (!categoria) {
      toast.error("Selecciona si el préstamo es para un alumno o para ti");
      return;
    }
    if (!idReceptor.trim()) {
      toast.error(
        categoria === "ALUMNO" ? "Selecciona un alumno" : "No se pudo determinar el receptor",
      );
      return;
    }
    if (!elemento.trim()) {
      toast.error("Indica el elemento prestado");
      return;
    }
    if (!estadoMaterial.trim()) {
      toast.error("Describe el estado del material en la entrega");
      return;
    }
    if (!fechaPrestamo) {
      toast.error("Indica la fecha de préstamo");
      return;
    }

    const alumnoCentro =
      categoria === "ALUMNO"
        ? (alumnos.find((a) => a.ID_ALUMNO === idReceptor.trim())?.ID_CENTRO?.trim() ?? "")
        : "";
    const resolvedCentro = centerId?.trim() || alumnoCentro;
    if (!resolvedCentro) {
      toast.error(
        categoria === "ALUMNO"
          ? "No se pudo determinar el centro del alumno. Contacta con secretaría."
          : "No se pudo determinar el centro asignado a tu perfil.",
      );
      return;
    }

    await onSubmit({
      ELEMENTO: elemento.trim(),
      CATEGORIA: categoria,
      ID_RECEPTOR: idReceptor.trim(),
      ID_CENTRO: resolvedCentro,
      ESTADO_MATERIAL: estadoMaterial.trim(),
      NUM_SERIE: numSerie.trim() || null,
      FECHA_PRESTAMO: fechaPrestamo,
      FECHA_FIN_PRESTAMO: fechaFinPrestamo.trim() || null,
      ESTADO_DEVOLUCION: "Prestado",
      NOTAS: notas.trim() || null,
      CREADO_POR: profesorId?.trim() || null,
    });

    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-muted-foreground" />
            Nuevo préstamo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>¿Para quién es el préstamo? *</Label>
            <Select
              value={categoria || undefined}
              onValueChange={(value) => handleCategoriaChange(value as PrestamoCategoria)}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALUMNO">Alumno</SelectItem>
                <SelectItem value="PROFESOR">
                  Para mí ({profesorNombre?.trim() || "profesor"})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {categoria === "ALUMNO" ? (
            <div className="space-y-2">
              <Label>Alumno *</Label>
              <Select
                value={idReceptor || undefined}
                onValueChange={setIdReceptor}
                disabled={submitting || alumnosPorProfesorQuery.isLoading || alumnosList.isLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      alumnosPorProfesorQuery.isLoading || alumnosList.isLoading
                        ? "Cargando alumnos..."
                        : alumnoOptions.length === 0
                          ? "Sin alumnos disponibles"
                          : "Seleccionar alumno"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  {alumnoOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Elemento *</Label>
            <Input
              value={elemento}
              onChange={(e) => setElemento(e.target.value)}
              placeholder="Ej. Violín 4/4, Metrónomo..."
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Estado del material en la entrega *</Label>
            <Textarea
              value={estadoMaterial}
              onChange={(e) => setEstadoMaterial(e.target.value)}
              placeholder="Describe el estado del material..."
              rows={3}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Nº serie / referencia</Label>
            <Input
              value={numSerie}
              onChange={(e) => setNumSerie(e.target.value)}
              placeholder="Opcional"
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fecha préstamo *</Label>
              <Input
                type="date"
                value={fechaPrestamo}
                onChange={(e) => setFechaPrestamo(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label>Devolución prevista</Label>
              <Input
                type="date"
                value={fechaFinPrestamo}
                onChange={(e) => setFechaFinPrestamo(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
              rows={2}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="brand"
            disabled={submitting}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Guardando..." : "Registrar préstamo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherPrestamosDashboard({
  deepLinkPrestamoId,
  onClearDeepLink,
}: {
  deepLinkPrestamoId?: string;
  onClearDeepLink?: () => void;
} = {}) {
  const { rol, perfil, centerId } = useActiveTenant();
  const canMutate = canWriteUi(rol, "prestamos:write");
  const profesorId = perfil.ID_PROFESOR;
  const profesorNombre = perfil.NOMBRE;

  const { list, create, update } = usePrestamosMaterial();
  const { list: alumnosList } = useAlumnos();

  const [filter, setFilter] = useState<FilterTab>("activos");
  const [selectedPrestamo, setSelectedPrestamo] = useState<PrestamoMaterialData | null>(null);
  const [creating, setCreating] = useState(false);

  const alumnoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const alumno of alumnosList.data ?? []) {
      map.set(alumno.ID_ALUMNO, alumno.NOMBRE_ALUMNO);
    }
    return map;
  }, [alumnosList.data]);

  const prestamos = useMemo(() => sortPrestamos(list.data ?? []), [list.data]);

  useEffect(() => {
    if (!deepLinkPrestamoId || prestamos.length === 0) return;
    const target = prestamos.find((p) => p.ID_PRESTAMO === deepLinkPrestamoId);
    if (target) setSelectedPrestamo(target);
  }, [deepLinkPrestamoId, prestamos]);

  const filtered = useMemo(() => {
    if (filter === "activos") {
      return prestamos.filter((row) => isPrestadoActivo(row.ESTADO_DEVOLUCION));
    }
    if (filter === "devueltos") {
      return prestamos.filter((row) => estadoKey(row.ESTADO_DEVOLUCION) === "devuelto");
    }
    return prestamos;
  }, [prestamos, filter]);

  const activosCount = useMemo(
    () => prestamos.filter((row) => isPrestadoActivo(row.ESTADO_DEVOLUCION)).length,
    [prestamos],
  );

  const handleReturn = async (row: PrestamoMaterialData) => {
    if (!canMutate || !canProfesorMarkReturned(row, profesorId)) return;

    try {
      await update.mutateAsync({
        id: row.ID_PRESTAMO,
        patch: {
          ESTADO_DEVOLUCION: "Devuelto",
          FECHA_DEVOLUCION: row.FECHA_DEVOLUCION?.trim() || todayDateKey(),
        },
      });
      toast.success("Préstamo marcado como devuelto");
    } catch (err) {
      console.error("RETURN PRESTAMO ERROR:", err);
      toast.error(formatSupabaseError(err));
    }
  };

  const handleEditSave = async (row: PrestamoMaterialData, patch: PrestamoMaterialUpdateInput) => {
    if (!canMutate || !canProfesorMarkReturned(row, profesorId)) return;

    try {
      await update.mutateAsync({ id: row.ID_PRESTAMO, patch });
      toast.success("Préstamo actualizado");
    } catch (err) {
      console.error("UPDATE PRESTAMO ERROR:", err);
      toast.error(formatSupabaseError(err));
      throw err;
    }
  };

  const handleCreate = async (values: PrestamoMaterialCreateInput) => {
    try {
      await create.mutateAsync(values);
      toast.success("Préstamo registrado correctamente");
      setCreating(false);
    } catch (err) {
      console.error("CREATE PRESTAMO ERROR:", err);
      toast.error(formatSupabaseError(err));
    }
  };

  const selectedPrestamoFresh = useMemo(() => {
    if (!selectedPrestamo) return null;
    return (
      (list.data ?? []).find((p) => p.ID_PRESTAMO === selectedPrestamo.ID_PRESTAMO) ??
      selectedPrestamo
    );
  }, [list.data, selectedPrestamo]);

  const canEditSelected =
    !!selectedPrestamoFresh &&
    canMutate &&
    canProfesorMarkReturned(selectedPrestamoFresh, profesorId);

  const canReturnSelected =
    !!selectedPrestamoFresh &&
    canMutate &&
    isPrestadoActivo(selectedPrestamoFresh.ESTADO_DEVOLUCION) &&
    canProfesorMarkReturned(selectedPrestamoFresh, profesorId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterTab)}>
          <TabsList>
            <TabsTrigger value="activos">Activos ({activosCount})</TabsTrigger>
            <TabsTrigger value="devueltos">Devueltos</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>

        {canMutate ? (
          <Button
            type="button"
            variant="brand"
            className="w-full sm:w-auto"
            onClick={() => setCreating(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo préstamo
          </Button>
        ) : null}
      </div>

      {list.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar préstamos: {formatSupabaseError(list.error)}
        </div>
      ) : null}

      {list.isLoading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          {filter === "activos" ? (
            <>
              <Package className="mx-auto mb-3 h-8 w-8 opacity-40" />
              No tienes préstamos activos.
            </>
          ) : filter === "devueltos" ? (
            <>
              <Check className="mx-auto mb-3 h-8 w-8 opacity-40" />
              No hay préstamos devueltos en tu historial.
            </>
          ) : (
            <>
              <Clock className="mx-auto mb-3 h-8 w-8 opacity-40" />
              Aún no tienes préstamos registrados.
            </>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((row) => {
            const canReturn =
              canMutate &&
              isPrestadoActivo(row.ESTADO_DEVOLUCION) &&
              canProfesorMarkReturned(row, profesorId);
            const receptorNombre = resolveReceptorNombre(
              row,
              alumnoById,
              profesorNombre,
              profesorId,
            );

            return (
              <PrestamoCard
                key={row.ID_PRESTAMO}
                row={row}
                receptorNombre={receptorNombre}
                canReturn={canReturn}
                returning={update.isPending}
                onOpen={() => setSelectedPrestamo(row)}
                onReturn={() => void handleReturn(row)}
              />
            );
          })}
        </div>
      )}

      <PrestamoDetailDialog
        prestamo={selectedPrestamoFresh}
        open={!!selectedPrestamo}
        onClose={() => {
          setSelectedPrestamo(null);
          onClearDeepLink?.();
        }}
        receptorNombre={
          selectedPrestamoFresh
            ? resolveReceptorNombre(selectedPrestamoFresh, alumnoById, profesorNombre, profesorId)
            : "—"
        }
        canEdit={canEditSelected}
        canReturn={canReturnSelected}
        onReturn={() => selectedPrestamoFresh && void handleReturn(selectedPrestamoFresh)}
        onSave={(patch) =>
          selectedPrestamoFresh ? handleEditSave(selectedPrestamoFresh, patch) : Promise.resolve()
        }
        returning={update.isPending}
        saving={update.isPending}
      />

      <NuevoPrestamoDialog
        open={creating}
        onClose={() => setCreating(false)}
        profesorId={profesorId}
        profesorNombre={profesorNombre}
        centerId={centerId}
        canMutate={canMutate}
        submitting={create.isPending}
        onSubmit={handleCreate}
      />
    </div>
  );
}
