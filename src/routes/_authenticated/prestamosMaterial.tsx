import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  ChevronsUpDown,
  Clock,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  usePrestamosMaterial,
  formatSupabaseError,
  isPrestamoCategoria,
  PRESTAMO_CATEGORIA_VALUES,
  type PrestamoCategoria,
  type PrestamoMaterialCreateInput,
  type PrestamoMaterialData,
  type PrestamoMaterialUpdateInput,
} from "@/hooks/usePrestamosMaterial";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { ALL_CENTROS_FILTER_VALUE } from "@/lib/centroFilter";
import { useAlumnos } from "@/hooks/useAlumnos";
import { usePerfiles, type PerfilData } from "@/hooks/usePerfiles";
import { useProfesores } from "@/hooks/useProfesores";
import { toProfesorEntityOptions } from "@/lib/profesorSelector";
import { useActiveTenant } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { canWriteUi, hasAnyPermission } from "@/lib/rbac";
import { isAdminRole, isMasterRole } from "@/lib/tenantQuery";
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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/prestamosMaterial")({
  component: PrestamosMaterialPage,
});

const ALL_VALUE = "__all__";

const ESTADO_DEVOLUCION_OPTIONS = ["Prestado", "Devuelto", "Pendiente"] as const;

function categoriaLabel(value: string | null | undefined): string {
  if (value === "ALUMNO") return "Alumno";
  if (value === "PROFESOR") return "Profesor";
  return formatText(value);
}

type EntityOption = { id: string; label: string };

type ActorLookups = {
  byEmail: Map<string, string>;
  byIdPerfil: Map<string, string>;
  byId: Map<string, string>;
  byIdProfesor: Map<string, string>;
};

function buildActorLookups(perfiles: PerfilData[]): ActorLookups {
  const byEmail = new Map<string, string>();
  const byIdPerfil = new Map<string, string>();
  const byId = new Map<string, string>();
  const byIdProfesor = new Map<string, string>();

  for (const perfil of perfiles) {
    if (perfil.EMAIL?.trim()) {
      byEmail.set(perfil.EMAIL.trim().toLowerCase(), perfil.NOMBRE);
    }
    byIdPerfil.set(perfil.ID_PERFIL, perfil.NOMBRE);
    byId.set(perfil.ID, perfil.NOMBRE);
    if (perfil.ID_PROFESOR) {
      byIdProfesor.set(perfil.ID_PROFESOR, perfil.NOMBRE);
    }
  }

  return { byEmail, byIdPerfil, byId, byIdProfesor };
}

function resolveActorNombre(
  value: string | null | undefined,
  actorLookups: ActorLookups,
  profesorById: Map<string, string>,
  alumnoById: Map<string, string>,
): string {
  const raw = value?.trim();
  if (!raw) return "";

  const emailMatch = actorLookups.byEmail.get(raw.toLowerCase());
  if (emailMatch) return emailMatch;
  if (actorLookups.byIdPerfil.has(raw)) return actorLookups.byIdPerfil.get(raw)!;
  if (actorLookups.byId.has(raw)) return actorLookups.byId.get(raw)!;
  if (actorLookups.byIdProfesor.has(raw)) return actorLookups.byIdProfesor.get(raw)!;
  if (profesorById.has(raw)) return profesorById.get(raw)!;
  if (alumnoById.has(raw)) return alumnoById.get(raw)!;

  return "";
}

function displayActorNombre(
  value: string | null | undefined,
  actorLookups: ActorLookups,
  profesorById: Map<string, string>,
  alumnoById: Map<string, string>,
): string {
  const nombre = resolveActorNombre(value, actorLookups, profesorById, alumnoById);
  return nombre || "—";
}

function resolveStoredActorToProfesorId(
  value: string | null | undefined,
  perfiles: PerfilData[],
  profesorById: Map<string, string>,
): string {
  const raw = value?.trim();
  if (!raw) return "";

  if (profesorById.has(raw)) return raw;

  for (const perfil of perfiles) {
    if (!perfil.ID_PROFESOR) continue;
    if (perfil.ID_PROFESOR === raw) return perfil.ID_PROFESOR;
    if (perfil.ID_PERFIL === raw) return perfil.ID_PROFESOR;
    if (perfil.ID === raw) return perfil.ID_PROFESOR;
    if (perfil.EMAIL?.trim().toLowerCase() === raw.toLowerCase()) {
      return perfil.ID_PROFESOR;
    }
  }

  return "";
}

function buildActorProfileOptions(perfiles: PerfilData[]): EntityOption[] {
  const seen = new Set<string>();
  const options: EntityOption[] = [];

  for (const perfil of [...perfiles].sort((a, b) =>
    a.NOMBRE.localeCompare(b.NOMBRE, "es", { sensitivity: "base" }),
  )) {
    if (!perfil.ID_PROFESOR || seen.has(perfil.ID_PROFESOR)) continue;
    seen.add(perfil.ID_PROFESOR);
    options.push({ id: perfil.ID_PROFESOR, label: perfil.NOMBRE });
  }

  return options;
}

const ACTOR_NONE_VALUE = "__none__";

function ActorProfesorSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  allowEmpty,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: EntityOption[];
  disabled?: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value || (allowEmpty ? ACTOR_NONE_VALUE : undefined)}
        onValueChange={(next) => {
          onChange(next === ACTOR_NONE_VALUE ? "" : next);
        }}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Seleccionar trabajador" />
        </SelectTrigger>
        <SelectContent className="max-h-[300px] overflow-y-auto">
          {allowEmpty && <SelectItem value={ACTOR_NONE_VALUE}>— Sin asignar —</SelectItem>}
          {options.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function resolveReceptorNombre(
  row: PrestamoMaterialData,
  alumnoById: Map<string, string>,
  profesorById: Map<string, string>,
): string {
  const id = row.ID_RECEPTOR?.trim();
  if (!id) return "";
  if (row.CATEGORIA === "ALUMNO") return alumnoById.get(id) ?? "";
  if (row.CATEGORIA === "PROFESOR") return profesorById.get(id) ?? "";
  return "";
}

function resolveFechaDevolucionOnReturn(
  estadoDevolucion: string,
  fechaDevolucion: string,
): string {
  if (estadoKey(estadoDevolucion) !== "devuelto") {
    return fechaDevolucion.trim();
  }
  return fechaDevolucion.trim() || todayDateKey();
}

function ReceptorCell({
  row,
  alumnoById,
  profesorById,
}: {
  row: PrestamoMaterialData;
  alumnoById: Map<string, string>;
  profesorById: Map<string, string>;
}) {
  const id = row.ID_RECEPTOR?.trim();
  if (!id) return <span className="text-muted-foreground">—</span>;

  const nombre = resolveReceptorNombre(row, alumnoById, profesorById);
  return <span className="font-medium text-sm">{nombre || "—"}</span>;
}

function SearchableEntitySelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  loading,
}: {
  label: string;
  placeholder: string;
  options: EntityOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.id === value);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled || loading}
          >
            {loading
              ? "Cargando..."
              : selected
                ? selected.label
                : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0 pointer-events-auto"
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Command shouldFilter>
            <CommandInput placeholder="Buscar..." />
            <CommandList className="max-h-[250px] overflow-y-auto pointer-events-auto">
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.label} ${opt.id}`}
                    onSelect={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === opt.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function canAccessPrestamosPage(rol: string | null | undefined): boolean {
  return hasAnyPermission(rol, ["prestamos:read", "prestamos:write"]);
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

function formatText(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
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

function estadoDevolucionSelectTriggerClass(estado: string | null | undefined): string {
  const key = estadoKey(estado);
  const base = "h-8 w-[130px] text-xs border";
  if (key === "devuelto") {
    return `${base} bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100`;
  }
  if (key === "pendiente") {
    return `${base} bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100`;
  }
  return `${base} bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-100`;
}

function EstadoDevolucionInlineSelect({
  row,
  disabled,
  onUpdate,
}: {
  row: PrestamoMaterialData;
  disabled: boolean;
  onUpdate: (row: PrestamoMaterialData, estado: string) => void;
}) {
  const value = normalizeEstado(row.ESTADO_DEVOLUCION);

  if (disabled) {
    return <EstadoDevolucionBadge estado={row.ESTADO_DEVOLUCION} />;
  }

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== value) onUpdate(row, next);
      }}
    >
      <SelectTrigger className={estadoDevolucionSelectTriggerClass(value)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[300px] overflow-y-auto">
        {ESTADO_DEVOLUCION_OPTIONS.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EstadoDevolucionBadge({ estado }: { estado: string | null | undefined }) {
  const label = normalizeEstado(estado);
  const key = estadoKey(estado);

  if (key === "devuelto") {
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
        <Check className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  if (key === "pendiente") {
    return (
      <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
        <Clock className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-sky-100 text-sky-800 hover:bg-sky-100 border-sky-200">
      <Package className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function PrestamosMaterialPage() {
  const { rol, centerId } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const isAdmin = isAdminRole(rol);
  const showCentroSelector = isAdmin || isMaster;
  const canEditActors = isMaster || isAdmin;
  const canMutate = canWriteUi(rol, "prestamos:write");
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
    centrosLoading,
  } = useAdminCentroFilter();
  const { list, create, update, remove } = usePrestamosMaterial(filterCenterId);
  const { list: alumnosList } = useAlumnos();
  const { list: profesoresList } = useProfesores();
  const { list: perfilesList } = usePerfiles();

  const alumnos = alumnosList.data ?? [];
  const profesores = profesoresList.data?.profesores ?? [];
  const perfiles = perfilesList.data ?? [];

  const alumnoById = useMemo(
    () => new Map(alumnos.map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO])),
    [alumnos],
  );
  const profesorById = useMemo(
    () => new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR])),
    [profesores],
  );
  const actorLookups = useMemo(() => buildActorLookups(perfiles), [perfiles]);

  const [query, setQuery] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [editing, setEditing] = useState<PrestamoMaterialData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PrestamoMaterialData | null>(null);

  const handleQuickEstadoUpdate = async (row: PrestamoMaterialData, nextEstado: string) => {
    if (!canMutate) return;

    const patch: PrestamoMaterialUpdateInput = {
      ESTADO_DEVOLUCION: nextEstado,
    };

    if (estadoKey(nextEstado) === "devuelto") {
      patch.FECHA_DEVOLUCION = row.FECHA_DEVOLUCION?.trim() || todayDateKey();
    }

    try {
      await update.mutateAsync({ id: row.ID_PRESTAMO, patch });
      toast.success("Estado de devolución actualizado");
    } catch (err) {
      console.error("QUICK ESTADO UPDATE ERROR:", err);
      toast.error(formatSupabaseError(err));
    }
  };

  const handleMarcarDevuelto = async (row: PrestamoMaterialData) => {
    if (!canMutate) return;
    try {
      await update.mutateAsync({
        id: row.ID_PRESTAMO,
        patch: {
          ESTADO_DEVOLUCION: "Devuelto",
          FECHA_DEVOLUCION: todayDateKey(),
        },
      });
      toast.success("Préstamo marcado como devuelto");
    } catch (err) {
      console.error("MARCAR DEVUELTO ERROR:", err);
      toast.error(formatSupabaseError(err));
    }
  };

  const filtered = useMemo(() => {
    let rows = list.data ?? [];

    if (filtroCategoria) {
      rows = rows.filter((r) => r.CATEGORIA === filtroCategoria);
    }
    if (filtroEstado) {
      rows = rows.filter((r) => normalizeEstado(r.ESTADO_DEVOLUCION) === filtroEstado);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => {
        const receptorNombre = resolveReceptorNombre(r, alumnoById, profesorById);
        const creadoPorNombre = resolveActorNombre(
          r.CREADO_POR,
          actorLookups,
          profesorById,
          alumnoById,
        );
        const recogidoPorNombre = resolveActorNombre(
          r.RECOGIDO_POR,
          actorLookups,
          profesorById,
          alumnoById,
        );
        return (
          r.ELEMENTO?.toLowerCase().includes(q) ||
          r.CATEGORIA?.toLowerCase().includes(q) ||
          receptorNombre.toLowerCase().includes(q) ||
          creadoPorNombre.toLowerCase().includes(q) ||
          recogidoPorNombre.toLowerCase().includes(q) ||
          r.ESTADO_MATERIAL?.toLowerCase().includes(q) ||
          r.NUM_SERIE?.toLowerCase().includes(q) ||
          r.NOTAS?.toLowerCase().includes(q) ||
          (isMaster && r.ID_PRESTAMO?.toLowerCase().includes(q)) ||
          (isMaster && r.ID_CLIENTE?.toLowerCase().includes(q))
        );
      });
    }

    return sortPrestamos(rows);
  }, [
    list.data,
    query,
    filtroCategoria,
    filtroEstado,
    isMaster,
    alumnoById,
    profesorById,
    actorLookups,
  ]);

  if (!canAccessPrestamosPage(rol)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const colSpan = isMaster ? 12 : 10;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Préstamos de material</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} préstamos registrados
          </p>
        </div>
        {canMutate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo préstamo
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Select
            value={filtroEstado || ALL_VALUE}
            onValueChange={(v) => setFiltroEstado(v === ALL_VALUE ? "" : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todos los estados" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todos los estados</SelectItem>
              {ESTADO_DEVOLUCION_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {showCentroFilter && (
            <Select
              value={selectedCenterId ?? ALL_CENTROS_FILTER_VALUE}
              onValueChange={(next) =>
                setSelectedCenterId(next === ALL_CENTROS_FILTER_VALUE ? null : next)
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos los centros" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CENTROS_FILTER_VALUE}>Todos los centros</SelectItem>
                {centrosOrdenados.map((centro) => (
                  <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                    {centro.NOMBRE_CENTRO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select
            value={filtroCategoria || ALL_VALUE}
            onValueChange={(v) => setFiltroCategoria(v === ALL_VALUE ? "" : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Todas las categorías</SelectItem>
              {PRESTAMO_CATEGORIA_VALUES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {categoriaLabel(cat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por elemento, categoría, nº serie, notas..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar préstamos: {formatSupabaseError(list.error)}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isMaster && <TableHead>ID_PRESTAMO</TableHead>}
                {isMaster && <TableHead>ID_CLIENTE</TableHead>}
                <TableHead>Elemento</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Receptor</TableHead>
                <TableHead>Nº serie</TableHead>
                <TableHead>Fecha préstamo</TableHead>
                <TableHead>Fecha devolución prevista</TableHead>
                <TableHead>Fecha devolución real</TableHead>
                <TableHead>Recogido por</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={colSpan}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                    {query || filtroCategoria || filtroEstado
                      ? "Sin resultados."
                      : "Aún no hay préstamos de material registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow
                    key={row.ID_PRESTAMO}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditing(row)}
                  >
                    {isMaster && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.ID_PRESTAMO}
                      </TableCell>
                    )}
                    {isMaster && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {row.ID_CLIENTE}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{formatText(row.ELEMENTO)}</TableCell>
                    <TableCell>{categoriaLabel(row.CATEGORIA)}</TableCell>
                    <TableCell>
                      <ReceptorCell
                        row={row}
                        alumnoById={alumnoById}
                        profesorById={profesorById}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatText(row.NUM_SERIE)}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(row.FECHA_PRESTAMO)}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(row.FECHA_FIN_PRESTAMO)}</TableCell>
                    <TableCell className="tabular-nums" onClick={(ev) => ev.stopPropagation()}>
                      {row.FECHA_DEVOLUCION?.trim() ? (
                        formatDate(row.FECHA_DEVOLUCION)
                      ) : canMutate && estadoKey(row.ESTADO_DEVOLUCION) !== "devuelto" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={update.isPending}
                          onClick={() => void handleMarcarDevuelto(row)}
                        >
                          Marcar como devuelto
                        </Button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {displayActorNombre(
                        row.RECOGIDO_POR,
                        actorLookups,
                        profesorById,
                        alumnoById,
                      )}
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <EstadoDevolucionInlineSelect
                        row={row}
                        disabled={!canMutate || update.isPending}
                        onUpdate={handleQuickEstadoUpdate}
                      />
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canMutate && (
                            <DropdownMenuItem onClick={() => setEditing(row)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                          )}
                          {isAdmin && (
                            <DropdownMenuItem
                              onClick={() => setDeleting(row)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canMutate && (
        <PrestamoFormDialog
          open={creating}
          onClose={() => setCreating(false)}
          title="Nuevo préstamo de material"
          submitLabel="Registrar préstamo"
          submitting={create.isPending}
          actorLookups={actorLookups}
          profesorById={profesorById}
          alumnoById={alumnoById}
          alumnos={alumnos}
          profesores={profesores}
          perfiles={perfiles}
          canEditActors={canEditActors}
          alumnosLoading={alumnosList.isLoading}
          profesoresLoading={profesoresList.isLoading}
          showCentroSelector={showCentroSelector}
          assignedCenterId={centerId}
          centros={centrosOrdenados}
          centrosLoading={centrosLoading}
          onSubmit={async (values) => {
            try {
              await create.mutateAsync(values);
              toast.success("Préstamo registrado correctamente");
              setCreating(false);
            } catch (err) {
              console.error("CREATE PRESTAMO ERROR:", err);
              toast.error(formatSupabaseError(err));
            }
          }}
        />
      )}

      {editing && (
        <PrestamoFormDialog
          open
          onClose={() => setEditing(null)}
          title={canMutate ? "Editar préstamo de material" : "Préstamo de material"}
          submitLabel="Guardar cambios"
          initial={editing}
          submitting={update.isPending}
          readOnly={!canMutate}
          isMaster={isMaster}
          canEditActors={canEditActors}
          actorLookups={actorLookups}
          profesorById={profesorById}
          alumnoById={alumnoById}
          alumnos={alumnos}
          profesores={profesores}
          perfiles={perfiles}
          alumnosLoading={alumnosList.isLoading}
          profesoresLoading={profesoresList.isLoading}
          onSubmit={async (patch) => {
            try {
              await update.mutateAsync({ id: editing.ID_PRESTAMO, patch });
              toast.success("Préstamo actualizado");
              setEditing(null);
            } catch (err) {
              console.error("UPDATE PRESTAMO ERROR:", err);
              toast.error(formatSupabaseError(err));
            }
          }}
        />
      )}

      {isAdmin && (
        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Estás seguro de eliminar este préstamo?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El registro del préstamo de este material se
                eliminará permanentemente de la base de datos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!deleting) return;
                  try {
                    await remove.mutateAsync(deleting.ID_PRESTAMO);
                    toast.success("Préstamo eliminado");
                    setDeleting(null);
                  } catch (err) {
                    console.error("DELETE PRESTAMO ERROR:", err);
                    toast.error(formatSupabaseError(err));
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

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs break-all" : "break-words"}>{value}</p>
    </div>
  );
}

type PrestamoFormSharedProps = {
  alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string; ID_CENTRO?: string | null }[];
  profesores: { ID_PROFESOR: string; NOMBRE_PROFESOR: string }[];
  perfiles: PerfilData[];
  alumnosLoading: boolean;
  profesoresLoading: boolean;
  actorLookups: ActorLookups;
  profesorById: Map<string, string>;
  alumnoById: Map<string, string>;
  isMaster?: boolean;
  canEditActors?: boolean;
  readOnly?: boolean;
};

type PrestamoFormDialogCreateProps = PrestamoFormSharedProps & {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: undefined;
  submitting: boolean;
  showCentroSelector: boolean;
  assignedCenterId: string | null;
  centros: Array<{ ID_CENTRO: string; NOMBRE_CENTRO: string }>;
  centrosLoading?: boolean;
  onSubmit: (values: PrestamoMaterialCreateInput) => void;
};

type PrestamoFormDialogEditProps = PrestamoFormSharedProps & {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial: PrestamoMaterialData;
  submitting: boolean;
  onSubmit: (values: PrestamoMaterialUpdateInput) => void;
};

type PrestamoFormDialogProps = PrestamoFormDialogCreateProps | PrestamoFormDialogEditProps;

function PrestamoFormDialog(props: PrestamoFormDialogProps) {
  const {
    open,
    onClose,
    title,
    submitLabel,
    submitting,
    alumnos,
    profesores,
    perfiles,
    alumnosLoading,
    profesoresLoading,
    actorLookups,
    profesorById,
    alumnoById,
    isMaster = false,
    canEditActors = false,
    readOnly = false,
  } = props;
  const { tenantId } = useActiveTenant();
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;
  const createProps = !isEdit ? (props as PrestamoFormDialogCreateProps) : null;
  const showCentroSelector = createProps?.showCentroSelector ?? false;
  const assignedCenterId = createProps?.assignedCenterId ?? null;
  const centros = createProps?.centros ?? [];
  const centrosLoading = createProps?.centrosLoading ?? false;
  const fieldsDisabled = readOnly || submitting;
  const showActorFieldsEditable = canEditActors && !readOnly;
  const showActorFieldsReadOnly = isEdit && !canEditActors;
  const formInitializedRef = useRef(false);

  const [categoria, setCategoria] = useState<PrestamoCategoria | "">("");
  const [idReceptor, setIdReceptor] = useState("");
  const [elemento, setElemento] = useState("");
  const [estadoMaterial, setEstadoMaterial] = useState("");
  const [numSerie, setNumSerie] = useState("");
  const [fechaPrestamo, setFechaPrestamo] = useState(todayDateKey());
  const [fechaFinPrestamo, setFechaFinPrestamo] = useState("");
  const [fechaDevolucion, setFechaDevolucion] = useState("");
  const [estadoDevolucion, setEstadoDevolucion] = useState<string>("Prestado");
  const [notas, setNotas] = useState("");
  const [creadoPorId, setCreadoPorId] = useState("");
  const [recogidoPorId, setRecogidoPorId] = useState("");
  const [idCentro, setIdCentro] = useState("");

  const formCentroId = useMemo(
    () => (showCentroSelector ? idCentro.trim() : assignedCenterId?.trim() ?? ""),
    [showCentroSelector, idCentro, assignedCenterId],
  );

  const actorProfileOptions = useMemo(
    () => buildActorProfileOptions(perfiles),
    [perfiles],
  );

  const selectedProfesorId = creadoPorId.trim();

  const alumnosByCentroId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const alumno of alumnos) {
      const centro = alumno.ID_CENTRO?.trim();
      if (!centro) continue;
      const ids = map.get(centro) ?? new Set<string>();
      ids.add(alumno.ID_ALUMNO);
      map.set(centro, ids);
    }
    return map;
  }, [alumnos]);

  const alumnosPorProfesorQuery = useQuery({
    queryKey: ["obtener_id_alumnos_por_profesor", tenantId, selectedProfesorId],
    enabled: open && categoria === "ALUMNO" && !!selectedProfesorId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("obtener_id_alumnos_por_profesor", {
        p_id_profesor: selectedProfesorId,
      });
      if (error) throw error;
      return normalizeRpcAlumnoIds(data);
    },
  });

  const rpcAlumnoIds = useMemo(
    () => new Set(alumnosPorProfesorQuery.data ?? []),
    [alumnosPorProfesorQuery.data],
  );

  const receptorOptions = useMemo<EntityOption[]>(() => {
    if (categoria === "ALUMNO") {
      if (!formCentroId || !selectedProfesorId) return [];
      if (alumnosPorProfesorQuery.isLoading) return [];

      const centroAlumnoIds = alumnosByCentroId.get(formCentroId);
      if (!centroAlumnoIds || centroAlumnoIds.size === 0) return [];

      const options: EntityOption[] = [];
      for (const id of rpcAlumnoIds) {
        if (!centroAlumnoIds.has(id)) continue;
        const label = alumnoById.get(id);
        if (label) options.push({ id, label });
      }

      return options.sort((a, b) =>
        a.label.localeCompare(b.label, "es", { sensitivity: "base" }),
      );
    }
    if (categoria === "PROFESOR") {
      return toProfesorEntityOptions(profesores, idReceptor);
    }
    return [];
  }, [
    categoria,
    profesores,
    idReceptor,
    formCentroId,
    selectedProfesorId,
    rpcAlumnoIds,
    alumnosByCentroId,
    alumnoById,
    alumnosPorProfesorQuery.isLoading,
  ]);

  const receptorLoading =
    categoria === "ALUMNO"
      ? alumnosLoading ||
        (!!selectedProfesorId && alumnosPorProfesorQuery.isLoading)
      : categoria === "PROFESOR"
        ? profesoresLoading
        : false;

  const receptorLabel =
    categoria === "ALUMNO" ? "Alumno *" : categoria === "PROFESOR" ? "Profesor *" : "Receptor *";

  useEffect(() => {
    if (!open) {
      formInitializedRef.current = false;
      return;
    }
    if (formInitializedRef.current) return;
    formInitializedRef.current = true;

    const initialCategoria = initial?.CATEGORIA?.trim() ?? "";

    setCategoria(isPrestamoCategoria(initialCategoria) ? initialCategoria : "");
    setIdReceptor(initial?.ID_RECEPTOR?.trim() ?? "");
    setElemento(initial?.ELEMENTO ?? "");
    setEstadoMaterial(initial?.ESTADO_MATERIAL ?? "");
    setNumSerie(initial?.NUM_SERIE ?? "");
    setFechaPrestamo(initial?.FECHA_PRESTAMO ?? todayDateKey());
    setFechaFinPrestamo(initial?.FECHA_FIN_PRESTAMO ?? "");
    setFechaDevolucion(initial?.FECHA_DEVOLUCION ?? "");
    setEstadoDevolucion(normalizeEstado(initial?.ESTADO_DEVOLUCION));
    setNotas(initial?.NOTAS ?? "");
    setCreadoPorId(
      resolveStoredActorToProfesorId(initial?.CREADO_POR, perfiles, profesorById),
    );
    setRecogidoPorId(
      resolveStoredActorToProfesorId(initial?.RECOGIDO_POR, perfiles, profesorById),
    );
    setIdCentro(
      showCentroSelector
        ? centros[0]?.ID_CENTRO ?? ""
        : assignedCenterId?.trim() ?? "",
    );
  }, [
    open,
    initial,
    perfiles,
    profesorById,
    showCentroSelector,
    assignedCenterId,
    centros,
  ]);

  const handleCategoriaChange = (next: PrestamoCategoria) => {
    setCategoria(next);
    setIdReceptor("");
  };

  const handleEstadoDevolucionChange = (next: string) => {
    setEstadoDevolucion(next);
    if (estadoKey(next) === "devuelto" && !fechaDevolucion.trim()) {
      setFechaDevolucion(todayDateKey());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para la gestión de préstamos de materiales e instrumentos
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (readOnly) return;
            if (!isPrestamoCategoria(categoria)) {
              toast.error("La categoría debe ser ALUMNO o PROFESOR");
              return;
            }
            if (!idReceptor.trim()) {
              toast.error(
                categoria === "ALUMNO"
                  ? "Debes seleccionar un alumno"
                  : "Debes seleccionar un profesor",
              );
              return;
            }
            if (!elemento.trim()) {
              toast.error("Debes indicar el elemento prestado");
              return;
            }
            if (!estadoMaterial.trim()) {
              toast.error(
                "Debes indicar el estado del material y artículos en el momento de la entrega",
              );
              return;
            }
            if (!fechaPrestamo) {
              toast.error("Debes indicar la fecha de préstamo");
              return;
            }

            let resolvedCentroId = "";
            if (!isEdit) {
              resolvedCentroId = showCentroSelector
                ? idCentro.trim()
                : assignedCenterId?.trim() ?? "";
              if (!resolvedCentroId) {
                toast.error(
                  showCentroSelector
                    ? "Debes seleccionar un centro"
                    : "No se pudo determinar el centro asignado a tu perfil.",
                );
                return;
              }
            }

            const payload: PrestamoMaterialCreateInput = {
              ELEMENTO: elemento.trim(),
              CATEGORIA: categoria,
              ID_RECEPTOR: idReceptor.trim(),
              ID_CENTRO: resolvedCentroId,
              ESTADO_MATERIAL: estadoMaterial.trim(),
              NUM_SERIE: numSerie.trim() || null,
              FECHA_PRESTAMO: fechaPrestamo,
              FECHA_FIN_PRESTAMO: fechaFinPrestamo.trim() || null,
              ESTADO_DEVOLUCION: estadoDevolucion,
              NOTAS: notas.trim() || null,
            };

            if (isEdit) {
              const { ID_CENTRO: _omitCentro, ...updatePayload } = payload;
              updatePayload.FECHA_DEVOLUCION = resolveFechaDevolucionOnReturn(
                estadoDevolucion,
                fechaDevolucion,
              ) || null;
              if (showActorFieldsEditable) {
                updatePayload.CREADO_POR = creadoPorId.trim() || null;
                updatePayload.RECOGIDO_POR = recogidoPorId.trim() || null;
              }
              (props as PrestamoFormDialogEditProps).onSubmit(updatePayload);
              return;
            }

            if (showActorFieldsEditable) {
              payload.CREADO_POR = creadoPorId.trim() || null;
              payload.RECOGIDO_POR = recogidoPorId.trim() || null;
            }

            console.log("FINAL PAYLOAD (FORM CREATE):", payload);
            (props as PrestamoFormDialogCreateProps).onSubmit(payload);
          }}
          className="space-y-4"
        >
          {!isEdit && showCentroSelector && (
            <div className="space-y-2">
              <Label>Centro *</Label>
              <Select
                value={idCentro || undefined}
                onValueChange={(next) => {
                  setIdCentro(next);
                  if (categoria === "ALUMNO") setIdReceptor("");
                }}
                disabled={fieldsDisabled || centrosLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={centrosLoading ? "Cargando centros…" : "Seleccionar centro"} />
                </SelectTrigger>
                <SelectContent>
                  {centros.map((centro) => (
                    <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                      {centro.NOMBRE_CENTRO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isEdit && initial && isMaster && (
            <div className="space-y-2">
              <Label>ID_PRESTAMO</Label>
              <Input value={initial.ID_PRESTAMO} disabled readOnly className="font-mono text-sm" />
            </div>
          )}

          {showActorFieldsReadOnly && initial && (
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField
                label="Creado por"
                value={displayActorNombre(
                  initial.CREADO_POR,
                  actorLookups,
                  profesorById,
                  alumnoById,
                )}
              />
              <DetailField
                label="Recogido por"
                value={displayActorNombre(
                  initial.RECOGIDO_POR,
                  actorLookups,
                  profesorById,
                  alumnoById,
                )}
              />
            </div>
          )}

          {showActorFieldsEditable && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ActorProfesorSelect
                label="Creado por"
                value={creadoPorId}
                onChange={(next) => {
                  setCreadoPorId(next);
                  if (categoria === "ALUMNO") setIdReceptor("");
                }}
                options={actorProfileOptions}
                disabled={fieldsDisabled}
              />
              <ActorProfesorSelect
                label="Recogido por"
                value={recogidoPorId}
                onChange={setRecogidoPorId}
                options={actorProfileOptions}
                disabled={fieldsDisabled}
                allowEmpty
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Categoría *</Label>
            <Select
              value={categoria === "" ? undefined : categoria}
              onValueChange={(v) => handleCategoriaChange(v as PrestamoCategoria)}
              disabled={fieldsDisabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent>
                {PRESTAMO_CATEGORIA_VALUES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {categoriaLabel(cat)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SearchableEntitySelect
            label={receptorLabel}
            placeholder={
              !isPrestamoCategoria(categoria)
                ? "Selecciona una categoría primero"
                : categoria === "ALUMNO"
                  ? "Seleccionar alumno"
                  : "Seleccionar profesor"
            }
            options={receptorOptions}
            value={idReceptor}
            onChange={setIdReceptor}
            disabled={fieldsDisabled || !isPrestamoCategoria(categoria)}
            loading={receptorLoading}
          />

          <div className="space-y-2">
            <Label>Elemento *</Label>
            <Input
              value={elemento}
              onChange={(e) => setElemento(e.target.value)}
              placeholder="Ej. Violín 4/4, Metrónomo, Libro de solfeo..."
              required
              disabled={fieldsDisabled}
            />
          </div>

          <div className="space-y-2">
            <Label>Estado del material y artículos en el momento de la entrega *</Label>
            <Textarea
              value={estadoMaterial}
              onChange={(e) => setEstadoMaterial(e.target.value)}
              placeholder="Describe el estado del material en la entrega..."
              rows={3}
              required
              disabled={fieldsDisabled}
            />
          </div>

          <div className="space-y-2">
            <Label>Nº serie / referencia</Label>
            <Input
              value={numSerie}
              onChange={(e) => setNumSerie(e.target.value)}
              placeholder="Opcional"
              disabled={fieldsDisabled}
            />
          </div>

          <div className={cn("grid gap-4", isEdit ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            <div className="space-y-2">
              <Label>Fecha préstamo *</Label>
              <Input
                type="date"
                value={fechaPrestamo}
                onChange={(e) => setFechaPrestamo(e.target.value)}
                required
                disabled={fieldsDisabled}
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha devolución prevista</Label>
              <Input
                type="date"
                value={fechaFinPrestamo}
                onChange={(e) => setFechaFinPrestamo(e.target.value)}
                disabled={fieldsDisabled}
              />
            </div>
            {isEdit && (
              <div className="space-y-2">
                <Label>Fecha devolución real</Label>
                <Input
                  type="date"
                  value={fechaDevolucion}
                  onChange={(e) => setFechaDevolucion(e.target.value)}
                  disabled={fieldsDisabled}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Estado devolución</Label>
            <Select
              value={estadoDevolucion}
              onValueChange={handleEstadoDevolucionChange}
              disabled={fieldsDisabled}
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

          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={3}
              disabled={fieldsDisabled}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {readOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button
                type="submit"
                disabled={
                  submitting ||
                  !isPrestamoCategoria(categoria) ||
                  !idReceptor.trim() ||
                  !elemento.trim() ||
                  !estadoMaterial.trim() ||
                  !fechaPrestamo ||
                  (showCentroSelector && !idCentro.trim())
                }
              >
                {submitting ? "Guardando..." : submitLabel}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
