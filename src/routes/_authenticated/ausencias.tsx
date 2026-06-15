import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  MoreHorizontal,
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
import {
  formatProfesorOptionLabel,
  profesorSelectorOptions,
} from "@/lib/profesorSelector";

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
      (new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) /
        (1000 * 3600 * 24),
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

function consumedPermisosNoRetribuidos(
  profesorId: string,
  permisos: AusenciaData[],
): number {
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

  if (key === "aprobado") {
    return (
      <Badge className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
        <Check className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  if (key === "denegado") {
    return (
      <Badge variant="destructive" className="gap-1">
        <X className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
      <Clock className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function estadoSelectTriggerClass(estado: string | null | undefined): string {
  const key = estadoKey(estado);
  const base = "h-8 w-[130px] text-xs border";
  if (key === "aprobado") {
    return `${base} bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100`;
  }
  if (key === "denegado") {
    return `${base} bg-red-100 text-red-800 border-red-200 hover:bg-red-100`;
  }
  return `${base} bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100`;
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
      {saldoText && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{saldoText}</div>
      )}
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
  return (
    isMasterRole(rol) ||
    isAdminRole(rol) ||
    isDireccionRole(rol) ||
    isProfesorRole(rol)
  );
}

function PermisosPage() {
  const { rol, perfil } = useActiveTenant();
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
  const { list, create, update, remove } = useAusencias(filterCenterId);

  const ausencias = list.data?.ausencias ?? [];
  const profesores = list.data?.profesores ?? [];

  const profById = useMemo(
    () => new Map(profesores.map((p) => [p.ID_PROFESOR, p])),
    [profesores],
  );

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AusenciaData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AusenciaData | null>(null);

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

  const metrics = useMemo(
    () => computeAccumulatedMetrics(metricsSource),
    [metricsSource],
  );

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

  const colSpan = canMutate ? (isMaster ? 9 : 7) : isMaster ? 8 : 6;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Permisos</h1>
          <p className="text-sm text-muted-foreground">
            {ausencias.length} solicitudes registradas
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir / Tramitar permiso
        </Button>
      </div>

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
                <TableHead>Trabajador</TableHead>
                <TableHead>Tipo de permiso</TableHead>
                <TableHead>Fecha de inicio</TableHead>
                <TableHead>Fecha de fin</TableHead>
                <TableHead>Estado del permiso</TableHead>
                <TableHead>Justificante</TableHead>
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
                  <TableRow key={a.ID_PERMISO}>
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
                    <TableCell className="font-medium">{a.NOMBRE_PROFESOR}</TableCell>
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
                      <EstadoInlineSelect
                        row={a}
                        disabled={!canMutate}
                        onUpdate={handleEstadoChange}
                      />
                    </TableCell>
                    <TableCell>
                      <JustificanteCell tipo={a.TIPO} justificante={a.JUSTIFICANTE} />
                    </TableCell>
                    {canMutate && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(a)}>
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
        title="Tramitar permiso"
        submitLabel="Registrar permiso"
        submitting={create.isPending}
        profesores={profesores}
        permisos={ausencias}
        onSubmit={async (values: AusenciaCreateInput) => {
          try {
            await create.mutateAsync(values);
            toast.success("Permiso registrado correctamente");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al registrar");
          }
        }}
      />

      {editing && (
        <PermisoFormDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          title="Editar permiso"
          submitLabel="Guardar cambios"
          initial={editing}
          submitting={update.isPending}
          profesores={profesores}
          permisos={ausencias}
          onSubmit={async (patch: AusenciaUpdateInput) => {
            try {
              await update.mutateAsync({
                id: editing.ID_PERMISO,
                patch: isMaster ? patch : toStrictAdminPatch(patch),
              });
              toast.success("Permiso actualizado");
              setEditing(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al actualizar");
            }
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este permiso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará definitivamente la solicitud. Esta acción es irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
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

type PermisoFormDialogCreateProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  submitting: boolean;
  profesores: ProfesorLookup[];
  permisos: AusenciaData[];
  onSubmit: (values: AusenciaCreateInput) => void;
};

type PermisoFormDialogEditProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial: AusenciaData;
  submitting: boolean;
  profesores: ProfesorLookup[];
  permisos: AusenciaData[];
  onSubmit: (values: AusenciaUpdateInput) => void;
};

type PermisoFormDialogProps = PermisoFormDialogCreateProps | PermisoFormDialogEditProps;

function PermisoFormDialog(props: PermisoFormDialogProps) {
  const { open, onClose, title, submitLabel, submitting, profesores, permisos } = props;
  const { rol, perfil } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const lockProfesor = isProfesorRole(rol) || isDireccionRole(rol);
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;
  const adminEditOnly = isEdit && !isMaster;

  const [idProfesor, setIdProfesor] = useState("");
  const [tipo, setTipo] = useState<string>(TIPO_OPTIONS[0]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [estado, setEstado] = useState<string>("Pendiente");
  const [justificante, setJustificante] = useState("");

  useEffect(() => {
    if (!open) return;
    const forcedProfesor = lockProfesor ? (perfil?.ID_PROFESOR ?? "") : "";
    setIdProfesor(forcedProfesor || initial?.ID_PROFESOR || "");
    setTipo(initial?.TIPO ?? TIPO_OPTIONS[0]);
    setFechaInicio(initial?.FECHA_INICIO ?? "");
    setFechaFin(initial?.FECHA_FIN ?? "");
    setEstado(normalizeEstado(initial?.ESTADO));
    setJustificante(initial?.JUSTIFICANTE ?? "");
  }, [open, initial, lockProfesor, perfil?.ID_PROFESOR]);

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
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
                const justificanteChanged =
                  justificante.trim() !== (initial.JUSTIFICANTE ?? "").trim();
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
                <span className="text-muted-foreground">
                  Asuntos Propios (AP) disponibles:{" "}
                </span>
                <span className="font-semibold">
                  {Math.round(selectedProfesor?.SALDO_AP ?? 0)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">
                  Permisos no retribuidos consumidos:{" "}
                </span>
                <span className="font-semibold">{permisosNoRetribuidosConsumidos}</span>
              </p>
            </div>
          )}

          {!adminEditOnly && (
            <>
              <div className="space-y-2">
                <Label>Trabajador *</Label>
                <Select
                  value={idProfesor}
                  onValueChange={setIdProfesor}
                  disabled={lockProfesor}
                >
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
