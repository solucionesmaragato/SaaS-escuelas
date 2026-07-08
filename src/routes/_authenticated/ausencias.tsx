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
  Clock,
  Check,
  X,
  AlertTriangle,
  ExternalLink,
  Stethoscope,
  FileText,
  CalendarX,
} from "lucide-react";
import {
  useAusencias,
  type AusenciaCreateInput,
  type AusenciaData,
  type AusenciaUpdateInput,
  type ProfesorLookup,
} from "@/hooks/useAusencias";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useActiveTenant } from "@/context/AppContext";
import {
  canManageUsuarios,
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
} from "@/lib/tenantQuery";
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
import { toast } from "sonner";
import { formatProfesorOptionLabel, profesorSelectorOptions } from "@/lib/profesorSelector";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntityLink } from "@/components/navigation/EntityLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ausencias")({
  component: PermisosPage,
});

const TIPO_OPTIONS = [
  "Vacaciones",
  "Permiso no retribuido",
  "Asuntos propios",
  "Baja",
  "Permiso retribuido",
] as const;

const ESTADO_OPTIONS = ["Pendiente", "Aprobado", "Denegado"] as const;

const METRIC_TIPOS = ["Baja", "Permiso retribuido", "Permiso no retribuido"] as const;

type MetricTipo = (typeof METRIC_TIPOS)[number];

type AccumulatedMetrics = Record<MetricTipo, number>;

function normalizeEstado(estado: string | null | undefined): string {
  return (estado ?? "Pendiente").trim();
}

function estadoKey(estado: string | null | undefined): string {
  return normalizeEstado(estado).toLowerCase();
}

/** Admin DB trigger: only ESTADO and JUSTIFICANTE may be sent. */
function toStrictAdminPatch(patch: AusenciaUpdateInput): AusenciaUpdateInput {
  const result: AusenciaUpdateInput = {};
  if (patch.ESTADO !== undefined) result.ESTADO = patch.ESTADO;
  if (patch.JUSTIFICANTE !== undefined) result.JUSTIFICANTE = patch.JUSTIFICANTE;
  return result;
}

function elapsedDays(fechaInicio: string, fechaFin: string): number {
  return (
    Math.ceil(
      (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / (1000 * 3600 * 24),
    ) + 1
  );
}

function computeAccumulatedMetrics(rows: AusenciaData[]): AccumulatedMetrics {
  const metrics: AccumulatedMetrics = {
    Baja: 0,
    "Permiso retribuido": 0,
    "Permiso no retribuido": 0,
  };

  for (const row of rows) {
    if (estadoKey(row.ESTADO) !== "aprobado") continue;
    if (!METRIC_TIPOS.includes(row.TIPO as MetricTipo)) continue;
    metrics[row.TIPO as MetricTipo] += elapsedDays(row.FECHA_INICIO, row.FECHA_FIN);
  }

  return metrics;
}

function consumedPermisosNoRetribuidos(profesorId: string, permisos: AusenciaData[]): number {
  return permisos
    .filter(
      (p) =>
        p.ID_PROFESOR === profesorId &&
        p.TIPO === "Permiso no retribuido" &&
        estadoKey(p.ESTADO) === "aprobado",
    )
    .reduce((sum, p) => sum + elapsedDays(p.FECHA_INICIO, p.FECHA_FIN), 0);
}

function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const label = normalizeEstado(estado);
  const key = estadoKey(estado);
  const Icon = key === "aprobado" ? Check : key === "denegado" ? X : Clock;
  const status = key === "aprobado" ? "success" : key === "denegado" ? "destructive" : "pending";

  return (
    <StatusBadge status={status} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </StatusBadge>
  );
}

function estadoSelectTriggerClass(estado: string | null | undefined): string {
  const key = estadoKey(estado);
  const base = "h-8 w-[130px] text-xs border";
  if (key === "aprobado") {
    return `${base} bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-900/50 dark:hover:bg-emerald-900/40`;
  }
  if (key === "denegado") {
    return `${base} bg-red-100 text-red-800 border-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-900/40`;
  }
  return `${base} bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-900/50 dark:hover:bg-yellow-900/40`;
}

function EstadoInlineSelect({
  row,
  onUpdate,
  disabled,
}: {
  row: AusenciaData;
  onUpdate: (row: AusenciaData, estado: string) => void;
  disabled: boolean;
}) {
  const value = normalizeEstado(row.ESTADO);

  if (disabled) {
    return <EstadoBadge estado={row.ESTADO} />;
  }

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next !== value) onUpdate(row, next);
      }}
    >
      <SelectTrigger className={estadoSelectTriggerClass(value)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ESTADO_OPTIONS.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TipoPermisoCell({
  tipo,
  idProfesor,
  profById,
}: {
  tipo: string;
  idProfesor: string;
  profById: Map<string, ProfesorLookup>;
}) {
  const prof = profById.get(idProfesor);
  let saldoText: string | null = null;

  if (tipo === "Vacaciones" && prof) {
    saldoText = `(Quedan: ${Math.round(prof.SALDO_VACACIONES ?? 0)} días)`;
  } else if (tipo === "Asuntos propios" && prof) {
    saldoText = `(Quedan: ${Math.round(prof.SALDO_AP ?? 0)} días)`;
  }

  return (
    <div>
      <div className="font-medium text-sm">{tipo}</div>
      {saldoText && <div className="text-[11px] text-muted-foreground mt-0.5">{saldoText}</div>}
    </div>
  );
}

function JustificanteCell({ tipo, justificante }: { tipo: string; justificante: string | null }) {
  if (tipo === "Permiso retribuido" && !justificante?.trim()) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 text-xs">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Falta documento
      </span>
    );
  }
  if (justificante?.trim()) {
    return (
      <a
        href={justificante}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="h-3 w-3" />
        Ver documento
      </a>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

function PermisoDetailOverlay({
  open,
  mode,
  permiso,
  canMutate,
  isMaster,
  isManagementRole,
  submitting,
  profesores,
  permisos,
  profById,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  permiso: AusenciaData | null;
  canMutate: boolean;
  isMaster: boolean;
  isManagementRole: boolean;
  submitting: boolean;
  profesores: ProfesorLookup[];
  permisos: AusenciaData[];
  profById: Map<string, ProfesorLookup>;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: AusenciaUpdateInput) => void;
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

  if (!permiso) {
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
        aria-label="Cerrar detalle del permiso"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="permiso-overlay-title"
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
                <h2 id="permiso-overlay-title" className="truncate text-xl font-semibold">
                  Editar permiso
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
            <PermisoFormDialog
              open
              embedded
              title="Editar permiso"
              submitLabel="Guardar cambios"
              isManagementRole={isManagementRole}
              initial={permiso}
              submitting={submitting}
              profesores={profesores}
              permisos={permisos}
              onClose={onCancelEdit}
              onSubmit={onSubmit}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="permiso-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="permiso-overlay-title" className="truncate text-xl font-semibold">
                  Detalle del permiso
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canMutate && (
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
              {isMaster && (
                <>
                  <div>
                    <dt className="text-muted-foreground">ID_PERMISO</dt>
                    <dd className="font-mono text-xs">{permiso.ID_PERMISO}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ID_CLIENTE</dt>
                    <dd className="font-mono text-xs">{permiso.ID_CLIENTE}</dd>
                  </div>
                </>
              )}
              <div>
                <dt className="text-muted-foreground">Trabajador</dt>
                <dd className="font-medium">
                  <EntityLink type="profesor" id={permiso.ID_PROFESOR}>
                    {permiso.NOMBRE_PROFESOR}
                  </EntityLink>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tipo de permiso</dt>
                <dd>
                  <TipoPermisoCell
                    tipo={permiso.TIPO}
                    idProfesor={permiso.ID_PROFESOR}
                    profById={profById}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha de inicio</dt>
                <dd>{permiso.FECHA_INICIO}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha de fin</dt>
                <dd>{permiso.FECHA_FIN}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Días solicitados</dt>
                <dd>{elapsedDays(permiso.FECHA_INICIO, permiso.FECHA_FIN)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado del permiso</dt>
                <dd>
                  <EstadoBadge estado={permiso.ESTADO} />
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Justificante</dt>
                <dd className="mt-1">
                  <JustificanteCell tipo={permiso.TIPO} justificante={permiso.JUSTIFICANTE} />
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

const METRIC_CONFIG: {
  tipo: MetricTipo;
  label: string;
  icon: typeof Stethoscope;
  iconClass: string;
}[] = [
  { tipo: "Baja", label: "Bajas", icon: Stethoscope, iconClass: "text-rose-600" },
  {
    tipo: "Permiso retribuido",
    label: "Permisos retribuidos",
    icon: FileText,
    iconClass: "text-blue-600",
  },
  {
    tipo: "Permiso no retribuido",
    label: "Permisos no retribuidos",
    icon: CalendarX,
    iconClass: "text-orange-600",
  },
];

function MetricCard({
  label,
  days,
  icon: Icon,
  iconClass,
  loading,
}: {
  label: string;
  days: number;
  icon: typeof Stethoscope;
  iconClass: string;
  loading: boolean;
}) {
  return (
    <Card className="p-4">
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="flex items-start gap-3">
          <div className={`rounded-md bg-muted p-2 ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tracking-tight">{days}</p>
            <p className="text-[11px] text-muted-foreground">días acumulados</p>
          </div>
        </div>
      )}
    </Card>
  );
}

function canAccessPermisosPage(rol: string | null | undefined): boolean {
  return isMasterRole(rol) || isAdminRole(rol) || isDireccionRole(rol) || isProfesorRole(rol);
}

function isManagementRoleGate(rol: string | null | undefined): boolean {
  return (
    isAdminRole(rol) ||
    isSecretariaRole(rol) ||
    isMasterRole(rol) ||
    isDireccionRole(rol)
  );
}

function PermisosPage() {
  const { rol, perfil } = useActiveTenant();
  const isManagementRole = isManagementRoleGate(rol);
  const isMaster = isMasterRole(rol);
  const isAdmin = isAdminRole(rol);
  const canMutate = canManageUsuarios(rol);
  const showPersonalMetrics = isProfesorRole(rol) || isDireccionRole(rol);
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const scopedProfesorId = !isManagementRole ? (perfil.ID_PROFESOR ?? null) : null;
  const { list, create, update, remove } = useAusencias(filterCenterId, scopedProfesorId);

  const ausencias = useMemo(() => list.data?.ausencias ?? [], [list.data?.ausencias]);
  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);

  const profById = useMemo(() => new Map(profesores.map((p) => [p.ID_PROFESOR, p])), [profesores]);

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AusenciaData | null>(null);

  const overlayPermiso = useMemo(
    () => ausencias.find((a) => a.ID_PERMISO === overlay?.id) ?? null,
    [ausencias, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => setOverlay(null), []);
  const handleEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return ausencias;
    const q = query.toLowerCase();
    return ausencias.filter(
      (a) =>
        a.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
        a.TIPO?.toLowerCase().includes(q) ||
        a.ESTADO?.toLowerCase().includes(q),
    );
  }, [ausencias, query]);

  const metricsSource = useMemo(() => {
    if (isMaster || isAdmin) return filtered;
    if (!perfil?.ID_PROFESOR) return [];
    return ausencias.filter((a) => a.ID_PROFESOR === perfil.ID_PROFESOR);
  }, [isMaster, isAdmin, filtered, ausencias, perfil?.ID_PROFESOR]);

  const metrics = useMemo(() => computeAccumulatedMetrics(metricsSource), [metricsSource]);

  const handleEstadoChange = async (row: AusenciaData, estado: string) => {
    try {
      await update.mutateAsync({
        id: row.ID_PERMISO,
        patch: { ESTADO: estado },
      });
      toast.success(`Estado actualizado a «${estado}»`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el estado");
    }
  };

  if (!canAccessPermisosPage(rol)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const colSpan =
    5 +
    (isManagementRole ? 1 : 0) +
    (isMaster ? 2 : 0) +
    (canMutate ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title={isManagementRole ? "Registro de permisos" : "Solicitud de permisos"}
        description={`${ausencias.length} solicitudes registradas`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {isManagementRole ? "+ Añadir / Tramitar permiso" : "+ Solicitar permiso"}
          </Button>
        }
      />

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {showPersonalMetrics ? "Tu acumulado anual" : "Total acumulado en el centro"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {METRIC_CONFIG.map(({ tipo, label, icon, iconClass }) => (
            <MetricCard
              key={tipo}
              label={label}
              days={metrics[tipo]}
              icon={icon}
              iconClass={iconClass}
              loading={list.isLoading}
            />
          ))}
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por trabajador, tipo o estado..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="ausencias-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar permisos: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isMaster && <TableHead>ID_PERMISO</TableHead>}
                {isMaster && <TableHead>ID_CLIENTE</TableHead>}
                {isManagementRole && <TableHead>Trabajador</TableHead>}
                <TableHead>Tipo de permiso</TableHead>
                <TableHead>Fecha de inicio</TableHead>
                <TableHead>Fecha de fin</TableHead>
                <TableHead>Justificante</TableHead>
                <TableHead>Estado del permiso</TableHead>
                {canMutate && <TableHead className="w-12" />}
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
                    {query ? "Sin resultados." : "No hay permisos registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow
                    key={a.ID_PERMISO}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: a.ID_PERMISO, mode: "detail" })}
                  >
                    {isMaster && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {a.ID_PERMISO}
                      </TableCell>
                    )}
                    {isMaster && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {a.ID_CLIENTE}
                      </TableCell>
                    )}
                    {isManagementRole && (
                      <TableCell className="font-medium" onClick={(e) => e.stopPropagation()}>
                        <EntityLink type="profesor" id={a.ID_PROFESOR}>
                          {a.NOMBRE_PROFESOR}
                        </EntityLink>
                      </TableCell>
                    )}
                    <TableCell>
                      <TipoPermisoCell
                        tipo={a.TIPO}
                        idProfesor={a.ID_PROFESOR}
                        profById={profById}
                      />
                    </TableCell>
                    <TableCell>{a.FECHA_INICIO}</TableCell>
                    <TableCell>{a.FECHA_FIN}</TableCell>
                    <TableCell>
                      <JustificanteCell tipo={a.TIPO} justificante={a.JUSTIFICANTE} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <EstadoInlineSelect
                        row={a}
                        disabled={!canMutate}
                        onUpdate={handleEstadoChange}
                      />
                    </TableCell>
                    {canMutate && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setOverlay({ id: a.ID_PERMISO, mode: "edit" })}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            {isMaster && (
                              <DropdownMenuItem
                                onClick={() => setDeleting(a)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                              </DropdownMenuItem>
                            )}
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

      <PermisoFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title={isManagementRole ? "Tramitar permiso" : "Solicitar permiso"}
        submitLabel={isManagementRole ? "Registrar permiso" : "Enviar solicitud"}
        isManagementRole={isManagementRole}
        submitting={create.isPending}
        profesores={profesores}
        permisos={ausencias}
        onSubmit={async (values: AusenciaCreateInput) => {
          try {
            const payload = { ...values };
            if (!isManagementRole && perfil.ID_PROFESOR) {
              payload.ID_PROFESOR = perfil.ID_PROFESOR;
            }
            await create.mutateAsync(payload);
            toast.success(
              isManagementRole ? "Permiso registrado correctamente" : "Solicitud enviada correctamente",
            );
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al registrar");
          }
        }}
      />

      <PermisoDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        permiso={overlayPermiso}
        canMutate={canMutate}
        isMaster={isMaster}
        isManagementRole={isManagementRole}
        submitting={update.isPending}
        profesores={profesores}
        permisos={ausencias}
        profById={profById}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onSubmit={async (patch: AusenciaUpdateInput) => {
          if (!overlay?.id) return;
          try {
            await update.mutateAsync({
              id: overlay.id,
              patch: isMaster ? patch : toStrictAdminPatch(patch),
            });
            toast.success("Permiso actualizado");
            setOverlay({ id: overlay.id, mode: "detail" });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este permiso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará definitivamente la solicitud. Esta acción es irreversible.
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
                  await remove.mutateAsync(deleting.ID_PERMISO);
                  toast.success("Permiso eliminado");
                  setDeleting(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al eliminar");
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type PermisoFormDialogBaseProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  isManagementRole: boolean;
  submitting: boolean;
  profesores: ProfesorLookup[];
  permisos: AusenciaData[];
  embedded?: boolean;
};

type PermisoFormDialogCreateProps = PermisoFormDialogBaseProps & {
  onSubmit: (values: AusenciaCreateInput) => void;
};

type PermisoFormDialogEditProps = PermisoFormDialogBaseProps & {
  initial: AusenciaData;
  onSubmit: (values: AusenciaUpdateInput) => void;
};

type PermisoFormDialogProps = PermisoFormDialogCreateProps | PermisoFormDialogEditProps;

function PermisoFormDialog(props: PermisoFormDialogProps) {
  const {
    open,
    onClose,
    title,
    submitLabel,
    isManagementRole,
    submitting,
    profesores,
    permisos,
    embedded,
  } = props;
  const { rol, perfil } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;
  const adminEditOnly = isEdit && !isMaster;

  const [idProfesor, setIdProfesor] = useState("");
  const [tipo, setTipo] = useState<string>(TIPO_OPTIONS[0]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [estado, setEstado] = useState<string>("Pendiente");
  const [justificante, setJustificante] = useState("");

  const selfProfesorDisplayName = useMemo(() => {
    if (!perfil?.ID_PROFESOR) return perfil?.NOMBRE ?? "";
    return (
      profesores.find((p) => p.ID_PROFESOR === perfil.ID_PROFESOR)?.NOMBRE_PROFESOR ??
      perfil.NOMBRE ??
      ""
    );
  }, [perfil?.ID_PROFESOR, perfil?.NOMBRE, profesores]);

  useEffect(() => {
    if (!open) return;
    const forcedProfesor = !isManagementRole ? (perfil?.ID_PROFESOR ?? "") : "";
    setIdProfesor(forcedProfesor || initial?.ID_PROFESOR || "");
    setTipo(initial?.TIPO ?? TIPO_OPTIONS[0]);
    setFechaInicio(initial?.FECHA_INICIO ?? "");
    setFechaFin(initial?.FECHA_FIN ?? "");
    setEstado(normalizeEstado(initial?.ESTADO));
    setJustificante(initial?.JUSTIFICANTE ?? "");
  }, [open, initial, isManagementRole, perfil?.ID_PROFESOR]);

  const profesoresSelector = useMemo(
    () => profesorSelectorOptions(profesores, idProfesor),
    [profesores, idProfesor],
  );

  const selectedProfesor = useMemo(
    () => profesores.find((p) => p.ID_PROFESOR === idProfesor) ?? null,
    [profesores, idProfesor],
  );

  const permisosNoRetribuidosConsumidos = useMemo(() => {
    if (!idProfesor) return 0;
    return Math.round(consumedPermisosNoRetribuidos(idProfesor, permisos));
  }, [idProfesor, permisos]);

  const requiresJustificante = tipo === "Permiso retribuido";

  const formBody = (
    <form
      id={embedded ? "permiso-form" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!idProfesor || !fechaInicio || !fechaFin) return;
        if (requiresJustificante && !justificante.trim()) {
          toast.error("El justificante es obligatorio para permisos retribuidos");
          return;
        }

        if (isEdit && initial) {
          if (adminEditOnly) {
            const patch: AusenciaUpdateInput = { ESTADO: estado };
            const justificanteChanged = justificante.trim() !== (initial.JUSTIFICANTE ?? "").trim();
            if (requiresJustificante || justificanteChanged) {
              patch.JUSTIFICANTE = justificante.trim() || null;
            }
            (props as PermisoFormDialogEditProps).onSubmit(patch);
            return;
          }

          const patch: AusenciaUpdateInput = {
            ID_PROFESOR: idProfesor,
            TIPO: tipo,
            FECHA_INICIO: fechaInicio,
            FECHA_FIN: fechaFin,
            JUSTIFICANTE: justificante.trim() || null,
            ESTADO: estado,
          };
          if (!isManagementRole && perfil?.ID_PROFESOR) {
            patch.ID_PROFESOR = perfil.ID_PROFESOR;
          }
          (props as PermisoFormDialogEditProps).onSubmit(patch);
          return;
        }

        const payload: AusenciaCreateInput = {
          ID_PROFESOR: idProfesor,
          TIPO: tipo,
          FECHA_INICIO: fechaInicio,
          FECHA_FIN: fechaFin,
          JUSTIFICANTE: justificante.trim() || null,
          ESTADO: canMutate ? estado : "Pendiente",
        };
        if (!isManagementRole && perfil?.ID_PROFESOR) {
          payload.ID_PROFESOR = perfil.ID_PROFESOR;
        }
        (props as PermisoFormDialogCreateProps).onSubmit(payload);
      }}
      className="space-y-4 pt-1"
    >
      {idProfesor && (
        <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5 text-sm">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Saldos del trabajador seleccionado
          </p>
          <p>
            <span className="text-muted-foreground">Vacaciones disponibles: </span>
            <span className="font-semibold">
              {Math.round(selectedProfesor?.SALDO_VACACIONES ?? 0)}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">Asuntos Propios (AP) disponibles: </span>
            <span className="font-semibold">{Math.round(selectedProfesor?.SALDO_AP ?? 0)}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Permisos no retribuidos consumidos: </span>
            <span className="font-semibold">{permisosNoRetribuidosConsumidos}</span>
          </p>
        </div>
      )}

      {!adminEditOnly && (
        <>
          <div className="space-y-2">
            <Label>Trabajador *</Label>
            {isProfesorRole(rol) ? (
              <Input
                value={selfProfesorDisplayName}
                disabled
                readOnly
                tabIndex={-1}
                aria-readonly="true"
                className="bg-muted/50"
              />
            ) : (
              <Select value={idProfesor} onValueChange={setIdProfesor}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar trabajador" />
                </SelectTrigger>
                <SelectContent>
                  {profesoresSelector.map((p) => (
                    <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                      {formatProfesorOptionLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tipo de permiso *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPO_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fecha de inicio *</Label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha de fin *</Label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                required
              />
            </div>
          </div>
        </>
      )}

      {canMutate && (
        <div className="space-y-2">
          <Label>Estado del permiso</Label>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ESTADO_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(requiresJustificante || (isEdit && canMutate)) && (
        <div className="space-y-2">
          <Label>Justificante {requiresJustificante ? "*" : ""}</Label>
          <Input
            value={justificante}
            onChange={(e) => setJustificante(e.target.value)}
            placeholder="URL del documento (p. ej. https://...)"
            required={requiresJustificante}
          />
          <p className="text-xs text-muted-foreground">
            Próximamente: carga de archivo. Por ahora, introduce la URL del documento.
          </p>
        </div>
      )}

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
