import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, MoreVertical, Pencil, Plus, Search, X } from "lucide-react";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { getActiveCursoEscolar, type CentroData, type CursoEscolarData } from "@/hooks/useCentros";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import {
  useLeads,
  type LeadData,
  type AulaLookup,
  type EspecialidadLookup,
  type ProfesorLookup,
} from "@/hooks/useLeads";
import { useActiveTenant } from "@/context/AppContext";
import { formatProfesorOptionLabel, profesorSelectorOptions } from "@/lib/profesorSelector";
import { isAdminRole, isMasterRole, isProfesorRole } from "@/lib/tenantQuery";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge";
import {
  ContactCompactCell,
  ContactEmailRich,
  ContactPhoneRich,
} from "@/components/ui/ContactQuickActions";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type LeadsSearch = {
  leadId?: string;
};

export const Route = createFileRoute("/_authenticated/leads")({
  validateSearch: (search: Record<string, unknown>): LeadsSearch => {
    const leadId =
      typeof search.leadId === "string" && search.leadId ? search.leadId : undefined;
    return leadId ? { leadId } : {};
  },
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

function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

function resolveLeadEstado(estado: string | null | undefined): string {
  if (!estado?.trim()) return ESTADO_OPTIONS[0];
  const trimmed = estado.trim();
  if ((ESTADO_OPTIONS as readonly string[]).includes(trimmed)) return trimmed;
  if (trimmed === "Cerrado") return "Cerrado (No matriculado)";
  return trimmed;
}

type LeadFormState = {
  nombre: string;
  contacto: string;
  telefono: string;
  email: string;
  estado: string;
  especialidad: string;
  idProfesor: string;
  idAula: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  resumen: string;
};

function getLeadFormStateFromInitial(initial?: LeadData | null): LeadFormState {
  return {
    nombre: initial?.NOMBRE ?? "",
    contacto: initial?.NOMBRE_CONTACTO ?? "",
    telefono: initial?.TELEFONO ?? "",
    email: initial?.EMAIL_LEAD ?? "",
    estado: resolveLeadEstado(initial?.ESTADO),
    especialidad: initial?.ESPECIALIDAD ?? "",
    idProfesor: initial?.ID_PROFESOR ?? "",
    idAula: initial?.ID_AULA ?? "",
    dia: toDateInputValue(initial?.DIA),
    horaInicio: toTimeInputValue(initial?.HORA_INICIO),
    horaFin: toTimeInputValue(initial?.HORA_FIN),
    resumen: initial?.RESUMEN ?? "",
  };
}

function aulasParaSelector(
  aulas: AulaLookup[],
  selectedId?: string | null,
  selectedName?: string | null,
): AulaLookup[] {
  const id = selectedId?.trim();
  if (!id) return aulas;
  if (aulas.some((a) => a.ID_AULA === id)) return aulas;
  return [{ ID_AULA: id, NOMBRE_AULA: selectedName?.trim() || id }, ...aulas];
}

function especialidadesParaSelector(
  especialidades: EspecialidadLookup[],
  selectedId?: string | null,
  selectedName?: string | null,
): EspecialidadLookup[] {
  const id = selectedId?.trim();
  if (!id) return especialidades;
  if (especialidades.some((e) => e.ID_ESPECIALIDAD === id)) return especialidades;
  return [
    { ID_ESPECIALIDAD: id, ESPECIALIDAD: selectedName?.trim() || id },
    ...especialidades,
  ];
}

function safeSelectValue(value: string, options: { id: string }[]): string {
  if (!value) return NONE_VALUE;
  return options.some((opt) => opt.id === value) ? value : NONE_VALUE;
}

function nullableField(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildLeadFormPayload(state: LeadFormState): LeadFormValues {
  return {
    NOMBRE: state.nombre.trim(),
    NOMBRE_CONTACTO: nullableField(state.contacto),
    TELEFONO: nullableField(state.telefono),
    EMAIL_LEAD: nullableField(state.email),
    ESTADO: state.estado || null,
    ESPECIALIDAD: state.especialidad || null,
    ID_PROFESOR: state.idProfesor || null,
    ID_AULA: state.idAula || null,
    DIA: nullableField(state.dia),
    HORA_INICIO: state.horaInicio || null,
    HORA_FIN: state.horaFin || null,
    RESUMEN: nullableField(state.resumen),
  };
}

function buildLeadUpdatePatch(
  initial: LeadData,
  values: LeadFormValues,
  touchedFields: Set<string>,
): LeadFormValues {
  const patch: LeadFormValues = { ...values };

  const preserveIfUntouched = (
    key: "ESTADO" | "ESPECIALIDAD" | "ID_PROFESOR" | "ID_AULA",
    formValue: string | null,
    initialValue: string | null,
  ) => {
    if (touchedFields.has(key)) return;
    if ((formValue === null || formValue === "") && initialValue) {
      patch[key] = initialValue;
    }
  };

  preserveIfUntouched("ESTADO", values.ESTADO, initial.ESTADO);
  preserveIfUntouched("ESPECIALIDAD", values.ESPECIALIDAD, initial.ESPECIALIDAD);
  preserveIfUntouched("ID_PROFESOR", values.ID_PROFESOR, initial.ID_PROFESOR);
  preserveIfUntouched("ID_AULA", values.ID_AULA, initial.ID_AULA);

  return patch;
}

function applyLeadFormState(
  state: LeadFormState,
  setters: {
    setNombre: (value: string) => void;
    setContacto: (value: string) => void;
    setTelefono: (value: string) => void;
    setEmail: (value: string) => void;
    setEstado: (value: string) => void;
    setEspecialidad: (value: string) => void;
    setIdProfesor: (value: string) => void;
    setIdAula: (value: string) => void;
    setDia: (value: string) => void;
    setHoraInicio: (value: string) => void;
    setHoraFin: (value: string) => void;
    setResumen: (value: string) => void;
  },
) {
  setters.setNombre(state.nombre);
  setters.setContacto(state.contacto);
  setters.setTelefono(state.telefono);
  setters.setEmail(state.email);
  setters.setEstado(state.estado);
  setters.setEspecialidad(state.especialidad);
  setters.setIdProfesor(state.idProfesor);
  setters.setIdAula(state.idAula);
  setters.setDia(state.dia);
  setters.setHoraInicio(state.horaInicio);
  setters.setHoraFin(state.horaFin);
  setters.setResumen(state.resumen);
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

function estadoBadgeStatus(estado: string | null | undefined): StatusBadgeVariant {
  switch (estado) {
    case "Matriculado":
      return "success";
    case "Cerrado (No matriculado)":
      return "destructive";
    case "Contactado":
      return "info";
    case "Pendiente":
      return "pending";
    default:
      return "neutral";
  }
}

function estadoTriggerProps(estado: string | null | undefined) {
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
  const label = estado?.trim() || "Pendiente";
  return <StatusBadge status={estadoBadgeStatus(estado)}>{label}</StatusBadge>;
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
  const { variant, className, label } = estadoTriggerProps(lead.ESTADO);

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

type LeadFormValues = {
  NOMBRE: string;
  NOMBRE_CONTACTO: string | null;
  TELEFONO: string | null;
  EMAIL_LEAD: string | null;
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

function LeadDetailOverlay({
  open,
  mode,
  lead,
  canWrite,
  submitting,
  profesores,
  aulas,
  especialidades,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  lead: LeadData | null;
  canWrite: boolean;
  submitting: boolean;
  profesores: ProfesorLookup[];
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: LeadFormValues) => void;
}) {
  const navigate = useNavigate();
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

  if (!lead) {
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
        aria-label="Cerrar detalle del lead"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-overlay-title"
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
                <h2 id="lead-overlay-title" className="truncate text-xl font-semibold">
                  Editar lead
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
            <LeadFormDialog
              key={lead.ID_LEAD}
              open
              embedded
              title="Editar lead"
              submitLabel="Guardar"
              initial={lead}
              submitting={submitting}
              profesores={profesores}
              aulas={aulas}
              especialidades={especialidades}
              onClose={onCancelEdit}
              onSubmit={onSubmit}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="lead-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="lead-overlay-title" className="truncate text-xl font-semibold">
                  {lead.NOMBRE ?? "Lead"}
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
              <div>
                <dt className="text-muted-foreground">Fecha de entrada</dt>
                <dd>{lead.FECHA ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd className="mt-1">
                  <EstadoBadge estado={lead.ESTADO} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Contacto</dt>
                <dd>{lead.NOMBRE_CONTACTO ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Teléfono</dt>
                <dd>
                  {lead.TELEFONO ? (
                    <ContactPhoneRich phone={lead.TELEFONO} />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Email</dt>
                <dd>
                  {lead.EMAIL_LEAD ? (
                    <ContactEmailRich email={lead.EMAIL_LEAD} />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Especialidad de interés</dt>
                <dd>{lead.ESPECIALIDADES?.ESPECIALIDAD ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Profesor asignado (Prueba)</dt>
                <dd>
                  {lead.PROFESOR?.NOMBRE_PROFESOR && lead.ID_PROFESOR ? (
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline focus-visible:outline-none"
                      title="Ir al perfil del profesor"
                      onClick={() => {
                        onClose();
                        void navigate({ to: "/profesores" });
                      }}
                    >
                      {lead.PROFESOR.NOMBRE_PROFESOR}
                    </button>
                  ) : (
                    lead.PROFESOR?.NOMBRE_PROFESOR ?? "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Clase de prueba</dt>
                <dd>
                  {lead.DIA
                    ? `${lead.DIA} (${lead.HORA_INICIO ?? "—"} - ${lead.HORA_FIN ?? "—"})`
                    : "No agendada"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Aula</dt>
                <dd>{lead.AULA?.NOMBRE_AULA ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Resumen / Notas</dt>
                <dd className="mt-1 rounded-md bg-muted p-2 whitespace-pre-wrap">
                  {lead.RESUMEN ?? "Sin notas"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">¿Clase realizada?</dt>
                <dd>
                  {lead.CLASE_REALIZADA === true || lead.CLASE_REALIZADA === "TRUE"
                    ? "✅ Sí"
                    : "❌ No / Pendiente"}
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

function LeadsPage() {
  const navigate = useNavigate();
  const { leadId } = Route.useSearch();
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

  const leads = useMemo(() => list.data?.leads ?? [], [list.data?.leads]);
  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);
  const aulas = useMemo(() => list.data?.aulas ?? [], [list.data?.aulas]);
  const especialidades = useMemo(
    () => list.data?.especialidades ?? [],
    [list.data?.especialidades],
  );

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createScheduleConflict, setCreateScheduleConflict] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LeadData | null>(null);

  const overlayLead = useMemo(
    () => leads.find((l) => l.ID_LEAD === overlay?.id) ?? null,
    [leads, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => {
    setOverlay(null);
    navigate({ to: "/leads", search: {}, replace: true });
  }, [navigate]);
  const handleEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "detail" } : null));
  }, []);

  useEffect(() => {
    if (leadId) {
      setOverlay({ id: leadId, mode: "detail" });
    }
  }, [leadId]);

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
    return [...rows].sort((a, b) => getStatusSortKey(a.ESTADO) - getStatusSortKey(b.ESTADO));
  }, [leads, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activePageRows = pageRows.filter(
    (lead) =>
      lead.ESTADO !== "Matriculado" &&
      lead.ESTADO !== "Cerrado (No matriculado)" &&
      lead.ESTADO !== "Cerrado",
  );
  const matriculadoPageRows = pageRows.filter((lead) => lead.ESTADO === "Matriculado");
  const cerradoPageRows = pageRows.filter(
    (lead) => lead.ESTADO === "Cerrado (No matriculado)" || lead.ESTADO === "Cerrado",
  );

  const handleStatusChange = async (leadId: string, estado: string) => {
    try {
      await update.mutateAsync({ id: leadId, patch: { ESTADO: estado } });
      toast.success("Estado actualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar el estado.");
    }
  };

  const renderLeadTableRow = (lead: LeadData) => (
    <TableRow
      key={lead.ID_LEAD}
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={() => setOverlay({ id: lead.ID_LEAD, mode: "detail" })}
    >
      <TableCell className="font-medium text-sm">{lead.FECHA ?? "—"}</TableCell>
      <TableCell>
        <div className="font-medium">{lead.NOMBRE ?? "—"}</div>
        {lead.NOMBRE_CONTACTO && (
          <div className="text-xs text-muted-foreground">Contacto: {lead.NOMBRE_CONTACTO}</div>
        )}
      </TableCell>
      <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
        <ContactCompactCell phone={lead.TELEFONO} email={lead.EMAIL_LEAD} />
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
        {canWrite ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setOverlay({ id: lead.ID_LEAD, mode: "edit" })}>
                Editar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
    </TableRow>
  );

  const renderLeadCollapsibleSection = (rows: LeadData[], label: string) => {
    if (rows.length === 0) return null;
    return (
      <TableRow>
        <TableCell colSpan={6} className="p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-3 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              {label} ({rows.length})
            </summary>
            <table className="w-full caption-bottom text-sm">
              <tbody>{rows.map((lead) => renderLeadTableRow(lead))}</tbody>
            </table>
          </details>
        </TableCell>
      </TableRow>
    );
  };

  if (isProfesorRole(rol)) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          Los profesores consultan los leads desde su calendario de sesiones. Esta pantalla de
          gestión está reservada para administración.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Nuevos Alumnos"
        description={`${leads.length} prospectos en seguimiento`}
        actions={
          canWrite && (
            <Button
              onClick={() => {
                setCreateScheduleConflict(null);
                setCreating(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Nuevo lead
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, teléfono o especialidad..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="leads-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={(v) => {
                setSelectedCenterId(v);
                setPage(1);
              }}
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
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "No hay leads registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {activePageRows.map((lead) => renderLeadTableRow(lead))}
                  {renderLeadCollapsibleSection(
                    cerradoPageRows,
                    "Cerrado (No matriculado)",
                  )}
                  {renderLeadCollapsibleSection(matriculadoPageRows, "Matriculado")}
                </>
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
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      <LeadDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        lead={overlayLead}
        canWrite={canWrite}
        submitting={update.isPending}
        profesores={profesores}
        aulas={aulas}
        especialidades={especialidades}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onSubmit={async (values) => {
          if (!overlay?.id) return;
          try {
            await update.mutateAsync({ id: overlay.id, patch: values });
            toast.success("Lead actualizado");
            setOverlay({ id: overlay.id, mode: "detail" });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

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

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el seguimiento de <b>{deleting?.NOMBRE}</b>. Esta acción es definitiva.
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

function LeadFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  embedded,
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
  embedded?: boolean;
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
  const isEditing = Boolean(initial?.ID_LEAD);
  const editingKey = initial?.ID_LEAD ?? "create";
  const initialFormState = getLeadFormStateFromInitial(initial);
  const formInitKeyRef = useRef<string | null>(null);
  const touchedFieldsRef = useRef<Set<string>>(new Set());

  const [nombre, setNombre] = useState(() => initialFormState.nombre);
  const [contacto, setContacto] = useState(() => initialFormState.contacto);
  const [telefono, setTelefono] = useState(() => initialFormState.telefono);
  const [email, setEmail] = useState(() => initialFormState.email);
  const [estado, setEstado] = useState(() => initialFormState.estado);
  const [especialidad, setEspecialidad] = useState(() => initialFormState.especialidad);
  const [idCentro, setIdCentro] = useState("");
  const [idCurso, setIdCurso] = useState("");
  const [idProfesor, setIdProfesor] = useState(() => initialFormState.idProfesor);
  const [idAula, setIdAula] = useState(() => initialFormState.idAula);
  const [dia, setDia] = useState(() => initialFormState.dia);
  const [horaInicio, setHoraInicio] = useState(() => initialFormState.horaInicio);
  const [horaFin, setHoraFin] = useState(() => initialFormState.horaFin);
  const [resumen, setResumen] = useState(() => initialFormState.resumen);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<LeadFormValues | null>(null);

  const markFieldTouched = useCallback((field: string) => {
    touchedFieldsRef.current.add(field);
  }, []);

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
      [...aulasParaSelector(aulas, idAula, initial?.AULA?.NOMBRE_AULA)].sort((a, b) =>
        a.NOMBRE_AULA.localeCompare(b.NOMBRE_AULA, "es", sortLocale),
      ),
    [aulas, idAula, initial?.AULA?.NOMBRE_AULA],
  );

  const especialidadesOrdenadas = useMemo(
    () =>
      [...especialidadesParaSelector(
        especialidades,
        especialidad,
        initial?.ESPECIALIDADES?.ESPECIALIDAD,
      )].sort((a, b) =>
        a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", sortLocale),
      ),
    [especialidades, especialidad, initial?.ESPECIALIDADES?.ESPECIALIDAD],
  );

  const especialidadSelectValue = safeSelectValue(
    especialidad,
    especialidadesOrdenadas.map((e) => ({ id: e.ID_ESPECIALIDAD })),
  );
  const profesorSelectValue = safeSelectValue(
    idProfesor,
    profesoresOrdenados.map((p) => ({ id: p.ID_PROFESOR })),
  );
  const aulaSelectValue = safeSelectValue(
    idAula,
    aulasOrdenadas.map((a) => ({ id: a.ID_AULA })),
  );

  useEffect(() => {
    if (!open) {
      formInitKeyRef.current = null;
      touchedFieldsRef.current = new Set();
      return;
    }

    if (formInitKeyRef.current === editingKey) return;
    formInitKeyRef.current = editingKey;
    touchedFieldsRef.current = new Set();

    applyLeadFormState(getLeadFormStateFromInitial(initial), {
      setNombre,
      setContacto,
      setTelefono,
      setEmail,
      setEstado,
      setEspecialidad,
      setIdProfesor,
      setIdAula,
      setDia,
      setHoraInicio,
      setHoraFin,
      setResumen,
    });

    if (isCreateForm && centros) {
      const initialCentro = activeCenterId ?? centros[0]?.ID_CENTRO ?? "";
      setIdCentro(initialCentro);
      setIdCurso(defaultCursoIdForCentro(centros, initialCentro));
    }
  }, [open, editingKey, initial, isCreateForm, centros, activeCenterId]);

  const formBody = (
    <>
      {scheduleConflictMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Conflicto de horario</AlertTitle>
          <AlertDescription>{scheduleConflictMessage}</AlertDescription>
        </Alert>
      ) : null}
      <form
        id="lead-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nombre.trim()) return;
          const payload = buildLeadFormPayload({
            nombre,
            contacto,
            telefono,
            email,
            estado,
            especialidad,
            idProfesor,
            idAula,
            dia,
            horaInicio,
            horaFin,
            resumen,
          });

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

          if (!isCreateForm) {
            const safePayload =
              isEditing && initial
                ? buildLeadUpdatePatch(initial, payload, touchedFieldsRef.current)
                : payload;
            setPendingPayload(safePayload);
            setConfirmOpen(true);
            return;
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

        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Especialidad de interés</Label>
            <Select
              value={especialidadSelectValue}
              onValueChange={(v) => {
                markFieldTouched("ESPECIALIDAD");
                setEspecialidad(v === NONE_VALUE ? "" : v);
              }}
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
            <Select
              value={estado}
              onValueChange={(value) => {
                markFieldTouched("ESTADO");
                setEstado(value);
              }}
            >
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
                value={profesorSelectValue}
                onValueChange={(v) => {
                  markFieldTouched("ID_PROFESOR");
                  setIdProfesor(v === NONE_VALUE ? "" : v);
                }}
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
                value={aulaSelectValue}
                onValueChange={(v) => {
                  markFieldTouched("ID_AULA");
                  setIdAula(v === NONE_VALUE ? "" : v);
                }}
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
                  onChange={(e) => {
                    markFieldTouched("HORA_INICIO");
                    setHoraInicio(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora fin</Label>
                <Input
                  type="time"
                  value={horaFin}
                  onChange={(e) => {
                    markFieldTouched("HORA_FIN");
                    setHoraFin(e.target.value);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Resumen de llamadas / Notas de seguimiento</Label>
          <Textarea value={resumen} onChange={(e) => setResumen(e.target.value)} rows={3} />
        </div>

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

      {!isCreateForm && (
        <AlertDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            setConfirmOpen(open);
            if (!open) setPendingPayload(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Confirmar modificaciones?</AlertDialogTitle>
              <AlertDialogDescription>
                Estás a punto de guardar los cambios en este prospecto.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={submitting || !pendingPayload}
                onClick={() => {
                  if (!pendingPayload) return;
                  onSubmit(pendingPayload);
                  setConfirmOpen(false);
                  setPendingPayload(null);
                }}
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
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
          <DialogDescription className="sr-only">Lead details</DialogDescription>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
