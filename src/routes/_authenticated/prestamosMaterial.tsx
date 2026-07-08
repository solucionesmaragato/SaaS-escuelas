import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  Clock,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
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
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge";
import { EntityLink } from "@/components/navigation/EntityLink";
import { canWriteUi, hasAnyPermission } from "@/lib/rbac";
import type { Rol } from "@/types/database";
import { isAdminRole, isMasterRole } from "@/lib/tenantQuery";
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

function ensureSelectedEntityOption(
  options: EntityOption[],
  selectedId: string,
  resolveLabel: (id: string) => string | undefined,
): EntityOption[] {
  const id = selectedId.trim();
  if (!id || options.some((option) => option.id === id)) return options;
  const label = resolveLabel(id);
  if (!label) return options;
  return [...options, { id, label }].sort((a, b) =>
    a.label.localeCompare(b.label, "es", { sensitivity: "base" }),
  );
}

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

function resolveFechaDevolucionOnReturn(estadoDevolucion: string, fechaDevolucion: string): string {
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
  if (!nombre) return <span className="font-medium text-sm">—</span>;

  const entityType = row.CATEGORIA === "PROFESOR" ? "profesor" : "alumno";
  return (
    <span className="font-medium text-sm" onClick={(e) => e.stopPropagation()}>
      <EntityLink type={entityType} id={id}>
        {nombre}
      </EntityLink>
    </span>
  );
}

function SearchableEntitySelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  loading,
  selectedLabel,
}: {
  label: string;
  placeholder: string;
  options: EntityOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  selectedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.id === value);
  const displayLabel = selected?.label ?? selectedLabel?.trim() ?? "";

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
            {loading ? "Cargando..." : displayLabel || placeholder}
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
                      className={cn("mr-2 h-4 w-4", value === opt.id ? "opacity-100" : "opacity-0")}
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

function canAccessPrestamosPage(rol: Rol | null | undefined): boolean {
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

function toDateInputValue(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function normalizePrestamoCategoria(value: string | null | undefined): PrestamoCategoria | "" {
  const normalized = value?.trim().toUpperCase() ?? "";
  return isPrestamoCategoria(normalized) ? normalized : "";
}

type PrestamoFormFields = {
  categoria: PrestamoCategoria | "";
  idReceptor: string;
  elemento: string;
  estadoMaterial: string;
  numSerie: string;
  fechaPrestamo: string;
  fechaFinPrestamo: string;
  fechaDevolucion: string;
  estadoDevolucion: string;
  notas: string;
  creadoPorId: string;
  recogidoPorId: string;
  idCentro: string;
};

function buildPrestamoFormFields(
  initial: PrestamoMaterialData | undefined,
  perfiles: PerfilData[],
  profesorById: Map<string, string>,
  options: {
    showCentroSelector: boolean;
    assignedCenterId: string | null;
    centros: Array<{ ID_CENTRO: string }>;
  },
): PrestamoFormFields {
  if (!initial) {
    return {
      categoria: "",
      idReceptor: "",
      elemento: "",
      estadoMaterial: "",
      numSerie: "",
      fechaPrestamo: todayDateKey(),
      fechaFinPrestamo: "",
      fechaDevolucion: "",
      estadoDevolucion: "Prestado",
      notas: "",
      creadoPorId: "",
      recogidoPorId: "",
      idCentro: options.showCentroSelector
        ? (options.centros[0]?.ID_CENTRO ?? "")
        : (options.assignedCenterId?.trim() ?? ""),
    };
  }

  return {
    categoria: normalizePrestamoCategoria(initial.CATEGORIA),
    idReceptor: initial.ID_RECEPTOR?.trim() ?? "",
    elemento: initial.ELEMENTO?.trim() ?? "",
    estadoMaterial: initial.ESTADO_MATERIAL?.trim() ?? "",
    numSerie: initial.NUM_SERIE?.trim() ?? "",
    fechaPrestamo: toDateInputValue(initial.FECHA_PRESTAMO) || todayDateKey(),
    fechaFinPrestamo: toDateInputValue(initial.FECHA_FIN_PRESTAMO),
    fechaDevolucion: toDateInputValue(initial.FECHA_DEVOLUCION),
    estadoDevolucion: normalizeEstado(initial.ESTADO_DEVOLUCION),
    notas: initial.NOTAS?.trim() ?? "",
    creadoPorId: resolveStoredActorToProfesorId(initial.CREADO_POR, perfiles, profesorById),
    recogidoPorId: resolveStoredActorToProfesorId(initial.RECOGIDO_POR, perfiles, profesorById),
    idCentro: initial.ID_CENTRO?.trim() ?? "",
  };
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
    return `${base} bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900/50 dark:hover:bg-emerald-900/40`;
  }
  if (key === "pendiente") {
    return `${base} bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900/50 dark:hover:bg-amber-900/40`;
  }
  return `${base} bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-900/50 dark:hover:bg-sky-900/40`;
}

function estadoDevolucionStatus(estado: string | null | undefined): StatusBadgeVariant {
  const key = estadoKey(estado);
  if (key === "devuelto") return "success";
  if (key === "pendiente") return "warning";
  return "info";
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
  const Icon = key === "devuelto" ? Check : key === "pendiente" ? Clock : Package;

  return (
    <StatusBadge status={estadoDevolucionStatus(estado)} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </StatusBadge>
  );
}

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs break-all" : "break-words"}>{value || "—"}</p>
    </div>
  );
}

const PRESTAMO_OVERLAY_PANEL_CLASS = cn(
  ALUMNO_OVERLAY_PANEL_CLASS,
  "max-w-xl max-h-[90vh] overflow-y-auto p-6",
);

function PrestamoOverlayBackdrop({
  ariaLabel,
  onClose,
}: {
  ariaLabel: string;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className="fixed inset-0 z-40 bg-black/10"
      aria-label={ariaLabel}
      onClick={onClose}
    />
  );
}

function PrestamoOverlayHeader({
  titleId,
  title,
  onClose,
  back,
  edit,
}: {
  titleId: string;
  title: string;
  onClose: () => void;
  back?: { onClick: () => void };
  edit?: { onClick: () => void; visible: boolean };
}) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="flex min-w-0 items-center gap-3">
        {back ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 shrink-0"
            onClick={back.onClick}
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        ) : null}
        <h2 id={titleId} className="truncate text-xl font-semibold">
          {title}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {edit?.visible ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="gap-2 bg-black text-white hover:bg-black/90"
            onClick={edit.onClick}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

function PrestamoOverlayFooter({
  onCancel,
  submitLabel,
  submitting,
}: {
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2 border-t pt-4">
      <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
        Cancelar
      </Button>
      <Button type="submit" form="prestamo-form" disabled={submitting}>
        {submitting ? "Guardando..." : submitLabel}
      </Button>
    </div>
  );
}

function PrestamoDetailContent({
  prestamo,
  isMaster,
  actorLookups,
  profesorById,
  alumnoById,
}: {
  prestamo: PrestamoMaterialData;
  isMaster: boolean;
  actorLookups: ActorLookups;
  profesorById: Map<string, string>;
  alumnoById: Map<string, string>;
}) {
  return (
    <div className="space-y-4">
      {isMaster && (
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="ID_PRESTAMO" value={prestamo.ID_PRESTAMO} mono />
          <DetailField label="ID_CLIENTE" value={prestamo.ID_CLIENTE ?? ""} mono />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <DetailField
          label="Prestado por"
          value={displayActorNombre(prestamo.CREADO_POR, actorLookups, profesorById, alumnoById)}
        />
        <DetailField
          label="Recogido por"
          value={displayActorNombre(prestamo.RECOGIDO_POR, actorLookups, profesorById, alumnoById)}
        />
        <DetailField label="Categoría" value={categoriaLabel(prestamo.CATEGORIA)} />
        <DetailField
          label="Receptor"
          value={resolveReceptorNombre(prestamo, alumnoById, profesorById) || "—"}
        />
        <DetailField label="Elemento" value={formatText(prestamo.ELEMENTO)} />
        <DetailField label="Nº serie" value={formatText(prestamo.NUM_SERIE)} />
        <DetailField label="Fecha préstamo" value={formatDate(prestamo.FECHA_PRESTAMO)} />
        <DetailField
          label="Fecha devolución prevista"
          value={formatDate(prestamo.FECHA_FIN_PRESTAMO)}
        />
        <DetailField label="Fecha devolución real" value={formatDate(prestamo.FECHA_DEVOLUCION)} />
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Estado devolución</p>
          <EstadoDevolucionBadge estado={prestamo.ESTADO_DEVOLUCION} />
        </div>
      </div>
      <DetailField
        label="Estado del material en la entrega"
        value={formatText(prestamo.ESTADO_MATERIAL)}
      />
      <DetailField label="Notas" value={formatText(prestamo.NOTAS)} />
    </div>
  );
}

function usePrestamoOverlayEffects(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
}

function PrestamoDetailOverlay({
  open,
  mode,
  prestamo,
  canMutate,
  isMaster,
  submitting,
  actorLookups,
  profesorById,
  alumnoById,
  alumnos,
  profesores,
  perfiles,
  alumnosLoading,
  profesoresLoading,
  canEditActors,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  prestamo: PrestamoMaterialData | null;
  canMutate: boolean;
  isMaster: boolean;
  submitting: boolean;
  actorLookups: ActorLookups;
  profesorById: Map<string, string>;
  alumnoById: Map<string, string>;
  alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string; ID_CENTRO?: string | null }[];
  profesores: { ID_PROFESOR: string; NOMBRE_PROFESOR: string }[];
  perfiles: PerfilData[];
  alumnosLoading: boolean;
  profesoresLoading: boolean;
  canEditActors: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: PrestamoMaterialUpdateInput) => void;
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

  if (!prestamo) {
    return createPortal(
      <>
        <PrestamoOverlayBackdrop ariaLabel="Cerrar" onClose={onClose} />
        <div className={cn(PRESTAMO_OVERLAY_PANEL_CLASS, "flex items-center justify-center")}>
          <Skeleton className="h-8 w-48" />
        </div>
      </>,
      document.body,
    );
  }

  return createPortal(
    <>
      <PrestamoOverlayBackdrop ariaLabel="Cerrar detalle del préstamo" onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prestamo-overlay-title"
        className={PRESTAMO_OVERLAY_PANEL_CLASS}
      >
        {mode === "edit" ? (
          <>
            <PrestamoOverlayHeader
              titleId="prestamo-overlay-title"
              title="Editar préstamo de material"
              onClose={onClose}
              back={{ onClick: onCancelEdit }}
            />
            <PrestamoFormDialog
              key={prestamo.ID_PRESTAMO}
              open
              embedded
              title="Editar préstamo de material"
              submitLabel="Guardar cambios"
              initial={prestamo}
              submitting={submitting}
              isMaster={isMaster}
              canEditActors={canEditActors}
              actorLookups={actorLookups}
              profesorById={profesorById}
              alumnoById={alumnoById}
              alumnos={alumnos}
              profesores={profesores}
              perfiles={perfiles}
              alumnosLoading={alumnosLoading}
              profesoresLoading={profesoresLoading}
              onClose={onCancelEdit}
              onSubmit={onSubmit}
            />
            <PrestamoOverlayFooter
              onCancel={onCancelEdit}
              submitLabel="Guardar cambios"
              submitting={submitting}
            />
          </>
        ) : (
          <>
            <PrestamoOverlayHeader
              titleId="prestamo-overlay-title"
              title={formatText(prestamo.ELEMENTO)}
              onClose={onClose}
              edit={{ onClick: onEdit, visible: canMutate }}
            />
            <PrestamoDetailContent
              prestamo={prestamo}
              isMaster={isMaster}
              actorLookups={actorLookups}
              profesorById={profesorById}
              alumnoById={alumnoById}
            />
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function PrestamoCreateOverlay({
  open,
  onClose,
  submitting,
  actorLookups,
  profesorById,
  alumnoById,
  alumnos,
  profesores,
  perfiles,
  canEditActors,
  alumnosLoading,
  profesoresLoading,
  showCentroSelector,
  assignedCenterId,
  centros,
  centrosLoading,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  actorLookups: ActorLookups;
  profesorById: Map<string, string>;
  alumnoById: Map<string, string>;
  alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string; ID_CENTRO?: string | null }[];
  profesores: { ID_PROFESOR: string; NOMBRE_PROFESOR: string }[];
  perfiles: PerfilData[];
  canEditActors: boolean;
  alumnosLoading: boolean;
  profesoresLoading: boolean;
  showCentroSelector: boolean;
  assignedCenterId: string | null;
  centros: Array<{ ID_CENTRO: string; NOMBRE_CENTRO: string }>;
  centrosLoading: boolean;
  onSubmit: (values: PrestamoMaterialCreateInput) => void;
}) {
  usePrestamoOverlayEffects(open, onClose);

  if (!open) return null;

  return createPortal(
    <>
      <PrestamoOverlayBackdrop ariaLabel="Cerrar nuevo préstamo" onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prestamo-create-title"
        className={PRESTAMO_OVERLAY_PANEL_CLASS}
      >
        <PrestamoOverlayHeader
          titleId="prestamo-create-title"
          title="Nuevo préstamo de material"
          onClose={onClose}
        />
        <PrestamoFormDialog
          open
          embedded
          title="Nuevo préstamo de material"
          submitLabel="Registrar préstamo"
          submitting={submitting}
          actorLookups={actorLookups}
          profesorById={profesorById}
          alumnoById={alumnoById}
          alumnos={alumnos}
          profesores={profesores}
          perfiles={perfiles}
          canEditActors={canEditActors}
          alumnosLoading={alumnosLoading}
          profesoresLoading={profesoresLoading}
          showCentroSelector={showCentroSelector}
          assignedCenterId={assignedCenterId}
          centros={centros}
          centrosLoading={centrosLoading}
          onClose={onClose}
          onSubmit={onSubmit}
        />
        <PrestamoOverlayFooter
          onCancel={onClose}
          submitLabel="Registrar préstamo"
          submitting={submitting}
        />
      </div>
    </>,
    document.body,
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

  const alumnos = useMemo(() => alumnosList.data ?? [], [alumnosList.data]);
  const profesores = useMemo(
    () => profesoresList.data?.profesores ?? [],
    [profesoresList.data?.profesores],
  );
  const perfiles = useMemo(() => perfilesList.data ?? [], [perfilesList.data]);

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
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PrestamoMaterialData | null>(null);

  const overlayPrestamo = useMemo(
    () => (list.data ?? []).find((p) => p.ID_PRESTAMO === overlay?.id) ?? null,
    [list.data, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => setOverlay(null), []);
  const handleEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "detail" } : null));
  }, []);

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
      <PageHeader
        title="Préstamos de material"
        description={`${list.data?.length ?? 0} préstamos registrados`}
        actions={
          canMutate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo préstamo
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Select
            value={filtroEstado || ALL_VALUE}
            onValueChange={(v) => setFiltroEstado(v === ALL_VALUE ? "" : v)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Estado</SelectItem>
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
                <SelectValue placeholder="Centro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CENTROS_FILTER_VALUE}>Centro</SelectItem>
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
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Categoría</SelectItem>
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
              placeholder="Buscar préstamo..."
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
                <TableHead>Prestado por</TableHead>
                <TableHead>Receptor</TableHead>
                <TableHead>Nº serie</TableHead>
                <TableHead>Fecha préstamo</TableHead>
                <TableHead>Fecha devolución prevista</TableHead>
                <TableHead>Fecha devolución real</TableHead>
                <TableHead>Recogido por</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[50px]" />
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
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: row.ID_PRESTAMO, mode: "detail" })}
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
                    <TableCell>
                      {displayActorNombre(row.CREADO_POR, actorLookups, profesorById, alumnoById)}
                    </TableCell>
                    <TableCell>
                      <ReceptorCell row={row} alumnoById={alumnoById} profesorById={profesorById} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatText(row.NUM_SERIE)}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(row.FECHA_PRESTAMO)}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(row.FECHA_FIN_PRESTAMO)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(row.FECHA_DEVOLUCION)}
                    </TableCell>
                    <TableCell>
                      {displayActorNombre(row.RECOGIDO_POR, actorLookups, profesorById, alumnoById)}
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
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canMutate && (
                            <DropdownMenuItem
                              onClick={() => setOverlay({ id: row.ID_PRESTAMO, mode: "edit" })}
                            >
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
        <PrestamoCreateOverlay
          open={creating}
          onClose={() => setCreating(false)}
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

      <PrestamoDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        prestamo={overlayPrestamo}
        canMutate={canMutate}
        isMaster={isMaster}
        submitting={update.isPending}
        actorLookups={actorLookups}
        profesorById={profesorById}
        alumnoById={alumnoById}
        alumnos={alumnos}
        profesores={profesores}
        perfiles={perfiles}
        alumnosLoading={alumnosList.isLoading}
        profesoresLoading={profesoresList.isLoading}
        canEditActors={canEditActors}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onSubmit={async (patch) => {
          if (!overlay?.id) return;
          try {
            await update.mutateAsync({ id: overlay.id, patch });
            toast.success("Préstamo actualizado");
            setOverlay({ id: overlay.id, mode: "detail" });
          } catch (err) {
            console.error("UPDATE PRESTAMO ERROR:", err);
            toast.error(formatSupabaseError(err));
          }
        }}
      />

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
              <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={remove.isPending}
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
  embedded?: boolean;
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
    embedded = false,
  } = props;
  const { tenantId } = useActiveTenant();
  const editInitial = "initial" in props && props.initial != null ? props.initial : undefined;
  const isEdit = editInitial != null;
  const createProps = !isEdit ? (props as PrestamoFormDialogCreateProps) : null;
  const showCentroSelector = createProps?.showCentroSelector ?? false;
  const assignedCenterId = createProps?.assignedCenterId ?? null;
  const centros = createProps?.centros ?? [];
  const centrosLoading = createProps?.centrosLoading ?? false;
  const fieldsDisabled = readOnly || submitting;
  const showActorFieldsEditable = canEditActors && !readOnly;
  const showActorFieldsReadOnly = isEdit && !canEditActors;

  const buildFields = useCallback(
    (source?: PrestamoMaterialData) =>
      buildPrestamoFormFields(source, perfiles, profesorById, {
        showCentroSelector,
        assignedCenterId,
        centros,
      }),
    [perfiles, profesorById, showCentroSelector, assignedCenterId, centros],
  );

  const [categoria, setCategoria] = useState<PrestamoCategoria | "">(
    () => buildFields(editInitial).categoria,
  );
  const [idReceptor, setIdReceptor] = useState(() => buildFields(editInitial).idReceptor);
  const [elemento, setElemento] = useState(() => buildFields(editInitial).elemento);
  const [estadoMaterial, setEstadoMaterial] = useState(() => buildFields(editInitial).estadoMaterial);
  const [numSerie, setNumSerie] = useState(() => buildFields(editInitial).numSerie);
  const [fechaPrestamo, setFechaPrestamo] = useState(() => buildFields(editInitial).fechaPrestamo);
  const [fechaFinPrestamo, setFechaFinPrestamo] = useState(
    () => buildFields(editInitial).fechaFinPrestamo,
  );
  const [fechaDevolucion, setFechaDevolucion] = useState(
    () => buildFields(editInitial).fechaDevolucion,
  );
  const [estadoDevolucion, setEstadoDevolucion] = useState(
    () => buildFields(editInitial).estadoDevolucion,
  );
  const [notas, setNotas] = useState(() => buildFields(editInitial).notas);
  const [creadoPorId, setCreadoPorId] = useState(() => buildFields(editInitial).creadoPorId);
  const [recogidoPorId, setRecogidoPorId] = useState(() => buildFields(editInitial).recogidoPorId);
  const [idCentro, setIdCentro] = useState(() => buildFields(editInitial).idCentro);

  const applyFormFields = useCallback((fields: PrestamoFormFields) => {
    setCategoria(fields.categoria);
    setIdReceptor(fields.idReceptor);
    setElemento(fields.elemento);
    setEstadoMaterial(fields.estadoMaterial);
    setNumSerie(fields.numSerie);
    setFechaPrestamo(fields.fechaPrestamo);
    setFechaFinPrestamo(fields.fechaFinPrestamo);
    setFechaDevolucion(fields.fechaDevolucion);
    setEstadoDevolucion(fields.estadoDevolucion);
    setNotas(fields.notas);
    setCreadoPorId(fields.creadoPorId);
    setRecogidoPorId(fields.recogidoPorId);
    setIdCentro(fields.idCentro);
  }, []);

  const formCentroId = useMemo(() => {
    if (isEdit && editInitial?.ID_CENTRO?.trim()) {
      return editInitial.ID_CENTRO.trim();
    }
    if (showCentroSelector) return idCentro.trim();
    return assignedCenterId?.trim() ?? "";
  }, [isEdit, editInitial?.ID_CENTRO, showCentroSelector, idCentro, assignedCenterId]);

  const actorProfileOptions = useMemo(() => buildActorProfileOptions(perfiles), [perfiles]);

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
    const selectedId = idReceptor.trim();

    if (categoria === "ALUMNO") {
      if (!formCentroId) {
        return ensureSelectedEntityOption([], selectedId, (id) => alumnoById.get(id));
      }
      if (!selectedProfesorId && !(isEdit && selectedId)) {
        return ensureSelectedEntityOption([], selectedId, (id) => alumnoById.get(id));
      }
      if (alumnosPorProfesorQuery.isLoading && !(isEdit && selectedId)) return [];

      const centroAlumnoIds = alumnosByCentroId.get(formCentroId);
      if (!centroAlumnoIds || centroAlumnoIds.size === 0) {
        return ensureSelectedEntityOption([], selectedId, (id) => alumnoById.get(id));
      }

      const options: EntityOption[] = [];
      for (const id of rpcAlumnoIds) {
        if (!centroAlumnoIds.has(id)) continue;
        const label = alumnoById.get(id);
        if (label) options.push({ id, label });
      }

      return ensureSelectedEntityOption(
        options.sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" })),
        selectedId,
        (id) => alumnoById.get(id),
      );
    }
    if (categoria === "PROFESOR") {
      return ensureSelectedEntityOption(
        toProfesorEntityOptions(profesores, idReceptor),
        selectedId,
        (id) => profesorById.get(id),
      );
    }
    return [];
  }, [
    categoria,
    isEdit,
    profesores,
    idReceptor,
    formCentroId,
    selectedProfesorId,
    rpcAlumnoIds,
    alumnosByCentroId,
    alumnoById,
    profesorById,
    alumnosPorProfesorQuery.isLoading,
  ]);

  const receptorLoading =
    categoria === "ALUMNO"
      ? !idReceptor.trim() &&
        (alumnosLoading || (!!selectedProfesorId && alumnosPorProfesorQuery.isLoading))
      : categoria === "PROFESOR"
        ? profesoresLoading && !idReceptor.trim()
        : false;

  const receptorLabel =
    categoria === "ALUMNO" ? "Alumno *" : categoria === "PROFESOR" ? "Profesor *" : "Receptor *";

  useEffect(() => {
    if (!open) return;
    applyFormFields(buildFields(isEdit ? editInitial : undefined));
  }, [
    open,
    isEdit,
    editInitial?.ID_PRESTAMO,
    editInitial,
    buildFields,
    applyFormFields,
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

  const formBody = (
    <form
      id="prestamo-form"
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
            : (assignedCenterId?.trim() ?? "");
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
          updatePayload.FECHA_DEVOLUCION =
            resolveFechaDevolucionOnReturn(estadoDevolucion, fechaDevolucion) || null;
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
              <SelectValue
                placeholder={centrosLoading ? "Cargando centros…" : "Seleccionar centro"}
              />
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

      {isEdit && editInitial && isMaster && (
        <div className="space-y-2">
          <Label>ID_PRESTAMO</Label>
          <Input value={editInitial.ID_PRESTAMO} disabled readOnly className="font-mono text-sm" />
        </div>
      )}

      {showActorFieldsReadOnly && editInitial && (
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="Prestado por"
            value={displayActorNombre(editInitial.CREADO_POR, actorLookups, profesorById, alumnoById)}
          />
          <DetailField
            label="Recogido por"
            value={displayActorNombre(
              editInitial.RECOGIDO_POR,
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
            label="Prestado por"
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
        disabled={
          fieldsDisabled ||
          !isPrestamoCategoria(categoria) ||
          (categoria === "ALUMNO" && !selectedProfesorId && !idReceptor.trim())
        }
        loading={receptorLoading}
        selectedLabel={
          idReceptor.trim()
            ? categoria === "ALUMNO"
              ? alumnoById.get(idReceptor.trim())
              : categoria === "PROFESOR"
                ? profesorById.get(idReceptor.trim())
                : undefined
            : undefined
        }
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
    </form>
  );

  if (!open) return null;
  return formBody;
}
