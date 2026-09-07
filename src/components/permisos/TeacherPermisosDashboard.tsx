import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarX,
  Check,
  Clock,
  ExternalLink,
  FileText,
  Plus,
  Stethoscope,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAusencias,
  type AusenciaCreateInput,
  type AusenciaData,
  type ProfesorLookup,
} from "@/hooks/useAusencias";
import { useActiveTenant } from "@/context/AppContext";
import { StatusBadge } from "@/components/ui/StatusBadge";
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

const TIPO_OPTIONS = [
  "Vacaciones",
  "Permiso no retribuido",
  "Asuntos propios",
  "Baja",
  "Permiso retribuido",
] as const;

const METRIC_TIPOS = ["Baja", "Permiso retribuido", "Permiso no retribuido"] as const;

type MetricTipo = (typeof METRIC_TIPOS)[number];
type FilterTab = "pendientes" | "aprobados" | "denegados" | "todos";

type AccumulatedMetrics = Record<MetricTipo, number>;

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

function normalizeEstado(estado: string | null | undefined): string {
  return (estado ?? "Pendiente").trim();
}

function estadoKey(estado: string | null | undefined): string {
  return normalizeEstado(estado).toLowerCase();
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

function estadoBadgeStatus(estado: string | null | undefined) {
  const key = estadoKey(estado);
  if (key === "aprobado") return "success" as const;
  if (key === "denegado") return "destructive" as const;
  return "pending" as const;
}

function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const label = normalizeEstado(estado);
  const key = estadoKey(estado);
  const Icon = key === "aprobado" ? Check : key === "denegado" ? CalendarX : Clock;

  return (
    <StatusBadge status={estadoBadgeStatus(estado)} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </StatusBadge>
  );
}

function formatDateRange(inicio: string, fin: string): string {
  return `${inicio} – ${fin}`;
}

function JustificanteDetail({ tipo, justificante }: { tipo: string; justificante: string | null }) {
  if (tipo === "Permiso retribuido" && !justificante?.trim()) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 text-sm">
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
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        Ver documento
      </a>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

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

function PermisoCard({ row, onOpen }: { row: AusenciaData; onOpen: () => void }) {
  const dias = elapsedDays(row.FECHA_INICIO, row.FECHA_FIN);

  return (
    <Card className="cursor-pointer p-4 transition-colors hover:bg-muted/40" onClick={onOpen}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-medium leading-snug">{row.TIPO}</p>
        <EstadoBadge estado={row.ESTADO} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground tabular-nums">
        {formatDateRange(row.FECHA_INICIO, row.FECHA_FIN)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {dias} {dias === 1 ? "día" : "días"}
      </p>
    </Card>
  );
}

function PermisoDetailDialog({
  permiso,
  open,
  onClose,
}: {
  permiso: AusenciaData | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!permiso) return null;

  const dias = elapsedDays(permiso.FECHA_INICIO, permiso.FECHA_FIN);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{permiso.TIPO}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <EstadoBadge estado={permiso.ESTADO} />

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Fecha de inicio" value={permiso.FECHA_INICIO} />
            <DetailField label="Fecha de fin" value={permiso.FECHA_FIN} />
            <DetailField label="Días solicitados" value={String(dias)} />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Justificante</p>
            <JustificanteDetail tipo={permiso.TIPO} justificante={permiso.JUSTIFICANTE} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function SolicitarPermisoDialog({
  open,
  onClose,
  profesorId,
  profesorNombre,
  selectedProfesor,
  permisos,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  profesorId: string | null | undefined;
  profesorNombre: string | null | undefined;
  selectedProfesor: ProfesorLookup | null;
  permisos: AusenciaData[];
  submitting: boolean;
  onSubmit: (values: AusenciaCreateInput) => Promise<void>;
}) {
  const [tipo, setTipo] = useState<string>(TIPO_OPTIONS[0]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [justificante, setJustificante] = useState("");

  const requiresJustificante = tipo === "Permiso retribuido";

  const permisosNoRetribuidosConsumidos = useMemo(() => {
    if (!profesorId) return 0;
    return Math.round(consumedPermisosNoRetribuidos(profesorId, permisos));
  }, [profesorId, permisos]);

  const resetForm = () => {
    setTipo(TIPO_OPTIONS[0]);
    setFechaInicio("");
    setFechaFin("");
    setJustificante("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!profesorId?.trim()) {
      toast.error("Tu perfil no tiene un trabajador asociado.");
      return;
    }
    if (!fechaInicio || !fechaFin) {
      toast.error("Indica las fechas de inicio y fin");
      return;
    }
    if (requiresJustificante && !justificante.trim()) {
      toast.error("El justificante es obligatorio para permisos retribuidos");
      return;
    }

    await onSubmit({
      ID_PROFESOR: profesorId.trim(),
      TIPO: tipo,
      FECHA_INICIO: fechaInicio,
      FECHA_FIN: fechaFin,
      JUSTIFICANTE: justificante.trim() || null,
      ESTADO: "Pendiente",
    });

    resetForm();
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-muted-foreground" />
            Solicitar permiso
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tus saldos
            </p>
            <p>
              <span className="text-muted-foreground">Vacaciones disponibles: </span>
              <span className="font-semibold">
                {Math.round(selectedProfesor?.SALDO_VACACIONES ?? 0)}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Asuntos propios (AP): </span>
              <span className="font-semibold">{Math.round(selectedProfesor?.SALDO_AP ?? 0)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Permisos no retribuidos consumidos: </span>
              <span className="font-semibold">{permisosNoRetribuidosConsumidos}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label>Trabajador</Label>
            <Input
              value={profesorNombre?.trim() || "—"}
              disabled
              readOnly
              className="bg-muted/50"
            />
          </div>

          <div className="space-y-2">
            <Label>Tipo de permiso *</Label>
            <Select value={tipo} onValueChange={setTipo} disabled={submitting}>
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
                disabled={submitting}
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha de fin *</Label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {requiresJustificante ? (
            <div className="space-y-2">
              <Label>Justificante *</Label>
              <Input
                value={justificante}
                onChange={(e) => setJustificante(e.target.value)}
                placeholder="URL del documento (p. ej. https://...)"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Introduce la URL del documento justificativo.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Enviando..." : "Enviar solicitud"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeacherPermisosDashboard({
  deepLinkPermisoId,
  onClearDeepLink,
}: {
  deepLinkPermisoId?: string;
  onClearDeepLink?: () => void;
} = {}) {
  const { perfil } = useActiveTenant();
  const profesorId = perfil.ID_PROFESOR;

  const { list, create } = useAusencias(undefined, profesorId ?? null);

  const [filter, setFilter] = useState<FilterTab>("pendientes");
  const [selectedPermiso, setSelectedPermiso] = useState<AusenciaData | null>(null);
  const [creating, setCreating] = useState(false);

  const ausencias = useMemo(() => list.data?.ausencias ?? [], [list.data?.ausencias]);
  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);

  const selectedProfesor = useMemo(
    () => profesores.find((p) => p.ID_PROFESOR === profesorId) ?? null,
    [profesores, profesorId],
  );

  const metrics = useMemo(() => computeAccumulatedMetrics(ausencias), [ausencias]);

  const pendientesCount = useMemo(
    () => ausencias.filter((a) => estadoKey(a.ESTADO) === "pendiente").length,
    [ausencias],
  );

  const filtered = useMemo(() => {
    if (filter === "pendientes") {
      return ausencias.filter((a) => estadoKey(a.ESTADO) === "pendiente");
    }
    if (filter === "aprobados") {
      return ausencias.filter((a) => estadoKey(a.ESTADO) === "aprobado");
    }
    if (filter === "denegados") {
      return ausencias.filter((a) => estadoKey(a.ESTADO) === "denegado");
    }
    return ausencias;
  }, [ausencias, filter]);

  useEffect(() => {
    if (!deepLinkPermisoId || ausencias.length === 0) return;
    const target = ausencias.find((row) => row.ID_PERMISO === deepLinkPermisoId);
    if (!target) return;
    setSelectedPermiso(target);
    onClearDeepLink?.();
  }, [deepLinkPermisoId, ausencias, onClearDeepLink]);

  const handleCreate = async (values: AusenciaCreateInput) => {
    try {
      await create.mutateAsync(values);
      toast.success("Solicitud enviada correctamente");
      setCreating(false);
    } catch (err) {
      console.error("CREATE PERMISO ERROR:", err);
      toast.error(err instanceof Error ? err.message : "Error al enviar la solicitud");
    }
  };

  if (!profesorId?.trim()) {
    return (
      <Card className="p-10 text-center text-muted-foreground">
        Tu perfil no tiene un trabajador asociado. Contacta con secretaría.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Tu acumulado anual</h2>
        <div className="grid gap-3 sm:grid-cols-3">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as FilterTab)}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="pendientes">Pendientes ({pendientesCount})</TabsTrigger>
            <TabsTrigger value="aprobados">Aprobados</TabsTrigger>
            <TabsTrigger value="denegados">Denegados</TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button type="button" className="w-full sm:w-auto" onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Solicitar permiso
        </Button>
      </div>

      {list.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Error al cargar permisos: {(list.error as Error)?.message}
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
          {filter === "pendientes" ? (
            <>
              <Clock className="mx-auto mb-3 h-8 w-8 opacity-40" />
              No tienes solicitudes pendientes.
            </>
          ) : filter === "aprobados" ? (
            <>
              <Check className="mx-auto mb-3 h-8 w-8 opacity-40" />
              No tienes permisos aprobados en este filtro.
            </>
          ) : filter === "denegados" ? (
            <>
              <CalendarX className="mx-auto mb-3 h-8 w-8 opacity-40" />
              No tienes solicitudes denegadas.
            </>
          ) : (
            <>
              <FileText className="mx-auto mb-3 h-8 w-8 opacity-40" />
              Aún no has solicitado ningún permiso.
            </>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((row) => (
            <PermisoCard key={row.ID_PERMISO} row={row} onOpen={() => setSelectedPermiso(row)} />
          ))}
        </div>
      )}

      <PermisoDetailDialog
        permiso={selectedPermiso}
        open={!!selectedPermiso}
        onClose={() => setSelectedPermiso(null)}
      />

      <SolicitarPermisoDialog
        open={creating}
        onClose={() => setCreating(false)}
        profesorId={profesorId}
        profesorNombre={perfil.NOMBRE}
        selectedProfesor={selectedProfesor}
        permisos={ausencias}
        submitting={create.isPending}
        onSubmit={handleCreate}
      />
    </div>
  );
}
