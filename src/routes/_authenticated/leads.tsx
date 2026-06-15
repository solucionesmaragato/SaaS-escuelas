import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, MoreHorizontal, Plus, Search, Trash2, Pencil, Eye, Phone } from "lucide-react";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import {
  getActiveCursoEscolar,
  type CentroData,
  type CursoEscolarData,
} from "@/hooks/useCentros";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import {
  useLeads,
  type LeadData,
  type AulaLookup,
  type EspecialidadLookup,
  type ProfesorLookup,
} from "@/hooks/useLeads";
import { useActiveTenant } from "@/context/AppContext";
import {
  formatProfesorOptionLabel,
  profesorSelectorOptions,
} from "@/lib/profesorSelector";
import { isAdminRole, isMasterRole, isProfesorRole } from "@/lib/tenantQuery";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/leads")({
  component: LeadsPage,
});

const PAGE_SIZE = 10;
const NONE_VALUE = "__none__";

const ESTADO_OPTIONS = [
  "Pendiente",
  "Contactado",
  "Matriculado",
  "Cerrado (No matriculado)",
] as const;

const sortLocale = { sensitivity: "base" } as const;

const STATUS_ORDER: Record<string, number> = {
  Pendiente: 1,
  Contactado: 2,
  "Cerrado (No matriculado)": 3,
  Cerrado: 3,
  Matriculado: 4,
};

function getStatusSortKey(estado: string | null | undefined): number {
  if (!estado) return 99;
  return STATUS_ORDER[estado] ?? 99;
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

function collectErrorText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    return [record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
  }
  return String(err);
}

function extractRestrictVetoMessage(err: unknown): string | null {
  const text = collectErrorText(err);
  const marker = "RESTRICT_VETO:";
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const custom = text.slice(idx + marker.length).trim();
  return custom || "Ya existe una sesión programada en ese horario.";
}

function cursosForCentro(centros: CentroData[], centroId: string): CursoEscolarData[] {
  const centro = centros.find((c) => c.ID_CENTRO === centroId);
  return centro?.CURSO_ESCOLAR ?? [];
}

function defaultCursoIdForCentro(centros: CentroData[], centroId: string): string {
  const cursos = cursosForCentro(centros, centroId);
  return getActiveCursoEscolar(cursos)?.ID_CURSO ?? cursos[0]?.ID_CURSO ?? "";
}

function resolveCursoIdForCentro(
  centros: CentroData[],
  centroId: string,
  currentCursoId: string,
): string {
  const cursos = cursosForCentro(centros, centroId);
  if (cursos.some((c) => c.ID_CURSO === currentCursoId)) return currentCursoId;
  return defaultCursoIdForCentro(centros, centroId);
}

function resolveLeadCreateCenterId(
  centros: CentroData[],
  activeCenterId: string | null | undefined,
  selectedCenterId: string,
): string {
  if (centros.length > 1) return selectedCenterId;
  return activeCenterId ?? centros[0]?.ID_CENTRO ?? "";
}

function estadoBadgeProps(estado: string | null | undefined) {
  const label = estado?.trim() || "Pendiente";
  switch (estado) {
    case "Matriculado":
      return {
        variant: "outline" as const,
        className:
          "border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
        label,
      };
    case "Cerrado (No matriculado)":
      return { variant: "destructive" as const, className: undefined, label };
    case "Contactado":
      return { variant: "default" as const, className: undefined, label };
    case "Pendiente":
      return {
        variant: "outline" as const,
        className:
          "border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
        label,
      };
    default:
      return { variant: "secondary" as const, className: undefined, label };
  }
}

function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const { variant, className, label } = estadoBadgeProps(estado);
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}

function EstadoStatusDropdown({
  lead,
  canWrite,
  isPending,
  onStatusChange,
}: {
  lead: LeadData;
  canWrite: boolean;
  isPending: boolean;
  onStatusChange: (leadId: string, estado: string) => void;
}) {
  const { variant, className, label } = estadoBadgeProps(lead.ESTADO);

  if (!canWrite) {
    return <EstadoBadge estado={lead.ESTADO} />;
  }

  const triggerVariant =
    variant === "destructive" ? "destructive" : variant === "default" ? "default" : "outline";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size="sm"
          disabled={isPending}
          className={cn("h-7 gap-1 px-2.5 text-xs font-semibold", className)}
          onClick={(e) => e.stopPropagation()}
        >
          {label}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {ESTADO_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt}
            disabled={lead.ESTADO === opt || isPending}
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(lead.ID_LEAD, opt);
            }}
          >
            {opt}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeadsPage() {
  const { rol, centerId } = useActiveTenant();
  const canWrite = isMasterRole(rol) || isAdminRole(rol);
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update, remove } = useLeads(filterCenterId);

  const leads = list.data?.leads ?? [];
  const profesores = list.data?.profesores ?? [];
  const aulas = list.data?.aulas ?? [];
  const especialidades = list.data?.especialidades ?? [];

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LeadData | null>(null);
  const [viewing, setViewing] = useState<LeadData | null>(null);
  const [creating, setCreating] = useState(false);
  const [createScheduleConflict, setCreateScheduleConflict] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LeadData | null>(null);

  const filtered = useMemo(() => {
    let rows = leads;
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = leads.filter(
        (lead) =>
          lead.NOMBRE?.toLowerCase().includes(q) ||
          lead.NOMBRE_CONTACTO?.toLowerCase().includes(q) ||
          lead.TELEFONO?.toLowerCase().includes(q) ||
          lead.ESPECIALIDADES?.ESPECIALIDAD?.toLowerCase().includes(q) ||
          lead.ESTADO?.toLowerCase().includes(q),
      );
    }
    return [...rows].sort(
      (a, b) => getStatusSortKey(a.ESTADO) - getStatusSortKey(b.ESTADO),
    );
  }, [leads, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleStatusChange = async (leadId: string, estado: string) => {
    try {
      await update.mutateAsync({ id: leadId, patch: { ESTADO: estado } });
      toast.success("Estado actualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el estado.");
    }
  };

  if (isProfesorRole(rol)) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          Los profesores consultan los leads desde su calendario de sesiones.
          Esta pantalla de gestión está reservada para administración.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nuevos Alumnos (Leads)</h1>
          <p className="text-sm text-muted-foreground">
            {leads.length} prospectos en seguimiento
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => {
              setCreateScheduleConflict(null);
              setCreating(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo lead
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, teléfono o especialidad..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="leads-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={(v) => { setSelectedCenterId(v); setPage(1); }}
            />
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Interesado (Contacto)</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Especialidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "No hay leads registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((lead) => (
                  <TableRow
                    key={lead.ID_LEAD}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => (canWrite ? setEditing(lead) : setViewing(lead))}
                  >
                    <TableCell className="font-medium text-sm">{lead.FECHA ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{lead.NOMBRE ?? "—"}</div>
                      {lead.NOMBRE_CONTACTO && (
                        <div className="text-xs text-muted-foreground">
                          Contacto: {lead.NOMBRE_CONTACTO}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.TELEFONO ? (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" /> {lead.TELEFONO}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.ESPECIALIDADES?.ESPECIALIDAD ?? (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <EstadoStatusDropdown
                        lead={lead}
                        canWrite={canWrite}
                        isPending={update.isPending}
                        onStatusChange={handleStatusChange}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewing(lead);
                            }}
                          >
                            <Eye className="mr-2 h-4 w-4" /> Ver detalle
                          </DropdownMenuItem>
                          {canWrite && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(lead);
                              }}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                          )}
                          {canWrite && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleting(lead);
                              }}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
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

        {filtered.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm border-t pt-4">
            <div className="text-muted-foreground">
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lead: {viewing?.NOMBRE}</DialogTitle>
            <DialogDescription className="sr-only">Lead details</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Fecha de entrada</dt><dd>{viewing.FECHA ?? "—"}</dd></div>
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="mt-1"><EstadoBadge estado={viewing.ESTADO} /></dd>
              </div>
              <div><dt className="text-muted-foreground">Contacto</dt><dd>{viewing.NOMBRE_CONTACTO ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Teléfono</dt><dd>{viewing.TELEFONO ?? "—"}</dd></div>
              <div>
                <dt className="text-muted-foreground">Especialidad de interés</dt>
                <dd>{viewing.ESPECIALIDADES?.ESPECIALIDAD ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Profesor asignado (Prueba)</dt>
                <dd>{viewing.PROFESOR?.NOMBRE_PROFESOR ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Clase de prueba</dt>
                <dd>
                  {viewing.DIA
                    ? `${viewing.DIA} (${viewing.HORA_INICIO ?? "—"} - ${viewing.HORA_FIN ?? "—"})`
                    : "No agendada"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Aula</dt>
                <dd>{viewing.AULA?.NOMBRE_AULA ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Resumen / Notas</dt>
                <dd className="mt-1 rounded-md bg-muted p-2 whitespace-pre-wrap">{viewing.RESUMEN ?? "Sin notas"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">¿Clase realizada?</dt>
                <dd>{viewing.CLASE_REALIZADA === true || viewing.CLASE_REALIZADA === "TRUE" ? "✅ Sí" : "❌ No / Pendiente"}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <LeadFormDialog
        open={creating}
        onClose={() => {
          setCreateScheduleConflict(null);
          setCreating(false);
        }}
        title="Nuevo Lead (Nuevo Alumno)"
        submitLabel="Crear"
        submitting={create.isPending}
        scheduleConflictMessage={createScheduleConflict}
        centros={centrosOrdenados}
        activeCenterId={centerId}
        profesores={profesores}
        aulas={aulas}
        especialidades={especialidades}
        onSubmit={async (values) => {
          try {
            setCreateScheduleConflict(null);
            await create.mutateAsync(values);
            toast.success("Lead creado correctamente");
            setCreating(false);
          } catch (err) {
            const vetoMsg = extractRestrictVetoMessage(err);
            if (vetoMsg) {
              setCreateScheduleConflict(vetoMsg);
              toast.error(vetoMsg);
              return;
            }
            toast.error(err instanceof Error ? err.message : "Error al crear");
          }
        }}
      />

      <LeadFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar Lead"
        submitLabel="Guardar"
        initial={editing}
        submitting={update.isPending}
        profesores={profesores}
        aulas={aulas}
        especialidades={especialidades}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.ID_LEAD, patch: values });
            toast.success("Lead actualizado");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el seguimiento de <b>{deleting?.NOMBRE}</b>. Esta acción es definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_LEAD);
                  toast.success("Lead eliminado con éxito");
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

type LeadFormValues = {
  NOMBRE: string;
  NOMBRE_CONTACTO: string | null;
  TELEFONO: string | null;
  ESTADO: string | null;
  ESPECIALIDAD: string | null;
  ID_PROFESOR: string | null;
  ID_AULA: string | null;
  DIA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  RESUMEN: string | null;
  ID_CENTRO?: string | null;
  ID_CURSO?: string | null;
};

function LeadFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  scheduleConflictMessage,
  centros,
  activeCenterId,
  profesores,
  aulas,
  especialidades,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: LeadData | null;
  submitting: boolean;
  scheduleConflictMessage?: string | null;
  centros?: CentroData[];
  activeCenterId?: string | null;
  profesores: ProfesorLookup[];
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
  onSubmit: (values: LeadFormValues) => void;
}) {
  const isCreateForm = centros !== undefined;
  const showCentroSelector = isCreateForm && centros.length > 1;

  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [estado, setEstado] = useState<string>(ESTADO_OPTIONS[0]);
  const [especialidad, setEspecialidad] = useState("");
  const [idCentro, setIdCentro] = useState("");
  const [idCurso, setIdCurso] = useState("");
  const [idProfesor, setIdProfesor] = useState("");
  const [idAula, setIdAula] = useState("");
  const [dia, setDia] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [resumen, setResumen] = useState("");

  const cursosOptions = useMemo(() => {
    if (!isCreateForm) return [];
    return [...centros.flatMap((c) => c.CURSO_ESCOLAR ?? [])].sort((a, b) =>
      a.NOMBRE_CURSO.localeCompare(b.NOMBRE_CURSO, "es", sortLocale),
    );
  }, [isCreateForm, centros]);

  const profesoresOrdenados = useMemo(
    () => profesorSelectorOptions(profesores, idProfesor),
    [profesores, idProfesor],
  );

  const aulasOrdenadas = useMemo(
    () =>
      [...aulas].sort((a, b) =>
        a.NOMBRE_AULA.localeCompare(b.NOMBRE_AULA, "es", sortLocale),
      ),
    [aulas],
  );

  const especialidadesOrdenadas = useMemo(
    () =>
      [...especialidades].sort((a, b) =>
        a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", sortLocale),
      ),
    [especialidades],
  );

  useEffect(() => {
    if (!open) return;
    setNombre(initial?.NOMBRE ?? "");
    setContacto(initial?.NOMBRE_CONTACTO ?? "");
    setTelefono(initial?.TELEFONO ?? "");
    setEstado(initial?.ESTADO ?? ESTADO_OPTIONS[0]);
    setEspecialidad(initial?.ESPECIALIDAD ?? "");
    setIdProfesor(initial?.ID_PROFESOR ?? "");
    setIdAula(initial?.ID_AULA ?? "");
    setDia(toDateInputValue(initial?.DIA));
    setHoraInicio(initial?.HORA_INICIO?.slice(0, 5) ?? "");
    setHoraFin(initial?.HORA_FIN?.slice(0, 5) ?? "");
    setResumen(initial?.RESUMEN ?? "");

    if (isCreateForm && centros) {
      const initialCentro =
        activeCenterId ?? centros[0]?.ID_CENTRO ?? "";
      setIdCentro(initialCentro);
      setIdCurso(defaultCursoIdForCentro(centros, initialCentro));
    }
  }, [open, initial, isCreateForm, centros, activeCenterId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Lead details</DialogDescription>
        </DialogHeader>
        {scheduleConflictMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Conflicto de horario</AlertTitle>
            <AlertDescription>{scheduleConflictMessage}</AlertDescription>
          </Alert>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nombre.trim()) return;
            const payload: LeadFormValues = {
              NOMBRE: nombre.trim(),
              NOMBRE_CONTACTO: contacto.trim() || null,
              TELEFONO: telefono.trim() || null,
              ESTADO: estado || null,
              ESPECIALIDAD: especialidad || null,
              ID_PROFESOR: idProfesor || null,
              ID_AULA: idAula || null,
              DIA: dia.trim() || null,
              HORA_INICIO: horaInicio || null,
              HORA_FIN: horaFin || null,
              RESUMEN: resumen.trim() || null,
            };

            if (isCreateForm && centros) {
              const centroPayload = resolveLeadCreateCenterId(centros, activeCenterId, idCentro);
              if (!centroPayload) {
                toast.error("No se pudo determinar el centro para este lead.");
                return;
              }
              if (!idCurso) {
                toast.error("Selecciona un curso escolar.");
                return;
              }
              payload.ID_CENTRO = centroPayload;
              payload.ID_CURSO = idCurso;
            }

            onSubmit(payload);
          }}
          className="space-y-4 pt-2"
        >
          <div className="space-y-2">
            <Label>Nombre del Alumno Interesado *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </div>

          {showCentroSelector ? (
            <div className="space-y-2">
              <Label>Centro *</Label>
              <Select
                value={idCentro}
                onValueChange={(v) => {
                  setIdCentro(v);
                  setIdCurso(resolveCursoIdForCentro(centros ?? [], v, idCurso));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar centro" />
                </SelectTrigger>
                <SelectContent>
                  {centros?.map((centro) => (
                    <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                      {centro.NOMBRE_CENTRO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isCreateForm ? (
            <div className="space-y-2">
              <Label>Curso escolar *</Label>
              <Select
                value={idCurso || NONE_VALUE}
                onValueChange={(v) => setIdCurso(v === NONE_VALUE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar curso escolar" />
                </SelectTrigger>
                <SelectContent>
                  {cursosOptions.length === 0 ? (
                    <SelectItem value={NONE_VALUE} disabled>
                      No hay cursos disponibles
                    </SelectItem>
                  ) : (
                    cursosOptions.map((curso) => (
                      <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                        {curso.NOMBRE_CURSO}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre del Contacto (Madre/Padre)</Label>
              <Input value={contacto} onChange={(e) => setContacto(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Especialidad de interés</Label>
              <Select
                value={especialidad || NONE_VALUE}
                onValueChange={(v) => setEspecialidad(v === NONE_VALUE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar especialidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sin especialidad</SelectItem>
                  {especialidadesOrdenadas.map((e) => (
                    <SelectItem key={e.ID_ESPECIALIDAD} value={e.ID_ESPECIALIDAD}>
                      {e.ESPECIALIDAD}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estado del lead</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
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
          </div>

          <div className="border-t pt-2 mt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-3">
              Agendar clase de prueba (opcional)
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Profesor asignado</Label>
                <Select
                  value={idProfesor || NONE_VALUE}
                  onValueChange={(v) => setIdProfesor(v === NONE_VALUE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar profesor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Sin profesor</SelectItem>
                    {profesoresOrdenados.map((p) => (
                      <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                        {formatProfesorOptionLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Aula</Label>
                <Select
                  value={idAula || NONE_VALUE}
                  onValueChange={(v) => setIdAula(v === NONE_VALUE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar aula" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Sin aula</SelectItem>
                    {aulasOrdenadas.map((a) => (
                      <SelectItem key={a.ID_AULA} value={a.ID_AULA}>
                        {a.NOMBRE_AULA}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-dia">Fecha de clase de prueba</Label>
                <Input
                  id="lead-dia"
                  type="date"
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>Hora inicio</Label>
                  <Input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hora fin</Label>
                  <Input
                    type="time"
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Resumen de llamadas / Notas de seguimiento</Label>
            <Textarea value={resumen} onChange={(e) => setResumen(e.target.value)} rows={3} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
