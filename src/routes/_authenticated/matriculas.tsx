import { createFileRoute } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Pencil,
  Eye,
  Calendar,
  X,
} from "lucide-react";
import type { MatriculaRow } from "@/hooks/useMatriculas";
import type { HorarioCreateInput, HorarioUpdateInput } from "@/hooks/useAlumnosTree";
import {
  buildScheduleAssignmentContext,
  isIndividualHorarioForOccupancy,
  MatriculaHorariosGroup,
  type ScheduleAssignmentContext,
  type SesionOccupancyRow,
} from "@/components/alumnos/AlumnoFormDialog";
import { useAlumnosTree } from "@/hooks/useAlumnosTree";
import { useGruposHorarios, type GrupoHorarioSlot } from "@/hooks/useGruposHorarios";
import { toProfesorEntityOptions } from "@/lib/profesorSelector";
import type { HorarioMatricula } from "@/types/database";
import { cn } from "@/lib/utils";
import { OVERLAY_PANEL_HEADER_CLASS_P6 } from "@/components/alumnos/AlumnoDetailOverlay";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useMatriculas, formatMatriculaEstadoError } from "@/hooks/useMatriculas";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useAulas, type AulaData } from "@/hooks/useAulas";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useProfesores, type ProfesoresQueryData } from "@/hooks/useProfesores";
import { useTarifas, type TarifaData } from "@/hooks/useTarifas";
import { useCentros, type CentroData, type CursoEscolarData } from "@/hooks/useCentros";
import { cursosForCentro, resolveCursoIdForCentro } from "@/lib/matriculaCursoUtils";
import { useActiveTenant } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { canWriteUi, hasPermission } from "@/lib/rbac";
import { tenantListKey } from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntityLink } from "@/components/navigation/EntityLink";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Alumno } from "@/types/database";
import type { EspecialidadData } from "@/hooks/useEspecialidades";
import type { ProfesorData } from "@/hooks/useProfesores";

type MatriculasSearch = {
  matriculaId?: string;
};

export const Route = createFileRoute("/_authenticated/matriculas")({
  validateSearch: (search: Record<string, unknown>): MatriculasSearch => {
    const matriculaId = search.matriculaId;
    return typeof matriculaId === "string" && matriculaId ? { matriculaId } : {};
  },
  component: MatriculasPage,
});

const NONE_VALUE = "__none__";
const MATRICULA_ESTADO_OPTIONS = ["Activo", "Inactivo"] as const;
const DIAS_SEMANA_OPCIONES = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;
type MatriculaEstado = (typeof MATRICULA_ESTADO_OPTIONS)[number];

type MatriculaCursoGroup = {
  idCurso: string;
  nombre: string;
  cursoVigente: boolean;
  fechaInicio: string | null;
  matriculas: MatriculaRow[];
};

const SIN_CURSO_GROUP_KEY = "__sin_curso__";

/** Shared 8-column layout: alert | expand | alumno | especialidad | profesor | estado | fecha | actions */
const MATRICULA_TABLE_COL_COUNT = 8;

const MATRICULA_ALERT_TOOLTIP =
  "Atención: Esta matrícula tiene menos horarios activos asignados que las sesiones permitidas por su tarifa (Horario incompleto).";

const MATRICULA_LIST_COL = {
  alert: "w-6 px-0",
  expand: "w-10 px-2",
  alumno: "font-medium",
  especialidad: "hidden sm:table-cell",
  profesor: "hidden text-sm md:table-cell",
  estado: "w-[110px] min-w-[110px] text-center align-middle",
  fecha: "hidden text-sm text-muted-foreground sm:table-cell",
  actions: "w-12",
} as const;

const MATRICULA_LIST_HEAD = {
  alert: "w-6",
  expand: "w-10",
  alumno: "",
  especialidad: "hidden sm:table-cell",
  profesor: "hidden md:table-cell",
  estado: "w-[110px] min-w-[110px] text-center",
  fecha: "hidden sm:table-cell",
  actions: "w-12",
} as const;

const DIA_SEMANA_WEIGHT: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sábado: 6,
  Domingo: 7,
};

function diaSemanaWeight(dia: string | null | undefined): number {
  const trimmed = dia?.trim() ?? "";
  return DIA_SEMANA_WEIGHT[trimmed] ?? 99;
}

function horaInicioSortKey(time: string | null | undefined): string {
  const trimmed = time?.trim() ?? "";
  if (!trimmed) return "99:99:99";
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

type HorarioChronologyFields = {
  dia?: string | null;
  horaInicio?: string | null;
  DIA?: string | null;
  HORA_INICIO?: string | null;
};

function compareHorariosChronologically(
  a: HorarioChronologyFields,
  b: HorarioChronologyFields,
): number {
  const dayDiff = diaSemanaWeight(a.dia ?? a.DIA) - diaSemanaWeight(b.dia ?? b.DIA);
  if (dayDiff !== 0) return dayDiff;
  return horaInicioSortKey(a.horaInicio ?? a.HORA_INICIO).localeCompare(
    horaInicioSortKey(b.horaInicio ?? b.HORA_INICIO),
  );
}

function sortHorariosMatriculasChronologically<T extends HorarioMatricula>(horarios: T[]): T[] {
  return [...horarios].sort(compareHorariosChronologically);
}

type MatriculaFormValues = {
  ID_ALUMNO: string;
  ID_CENTRO: string | null;
  ID_CURSO: string | null;
  ID_TARIFA: string | null;
  ESPECIALIDAD: string | null;
  ESTADO: string | null;
  FECHA_ALTA: string | null;
  FECHA_BAJA: string | null;
  ID_PROFESOR: string | null;
};

function normalizeMatriculaEstado(estado: string | null | undefined): MatriculaEstado {
  return estado?.trim().toLowerCase() === "inactivo" ? "Inactivo" : "Activo";
}

function isMatriculaActiva(estado: string | null | undefined): boolean {
  return normalizeMatriculaEstado(estado) === "Activo";
}

function toggleMatriculaEstado(estado: string | null | undefined): MatriculaEstado {
  return isMatriculaActiva(estado) ? "Inactivo" : "Activo";
}

function matriculaStatusLabel(matricula: MatriculaRow): string {
  const alumno = matricula.ALUMNOS?.NOMBRE_ALUMNO ?? "el alumno";
  const especialidad =
    matricula.ESPECIALIDADES?.ESPECIALIDAD ?? matricula.ESPECIALIDAD ?? "sin especialidad";
  return `${alumno} — ${especialidad}`;
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return trimmed;
}

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : [];
}

function resolveProfesoresList(listData: unknown): ProfesorData[] {
  if (Array.isArray(listData)) {
    return listData as ProfesorData[];
  }
  if (
    listData &&
    typeof listData === "object" &&
    "profesores" in listData &&
    Array.isArray((listData as ProfesoresQueryData).profesores)
  ) {
    return (listData as ProfesoresQueryData).profesores;
  }
  return [];
}

function MatriculaAlertSlot({ active }: { active: boolean }) {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden={!active}>
      {active ? (
        <span className="inline-flex" title={MATRICULA_ALERT_TOOLTIP}>
          <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
        </span>
      ) : null}
    </div>
  );
}

function MatriculaEstadoBadge({ estado }: { estado: string | null | undefined }) {
  const label = normalizeMatriculaEstado(estado);
  const active = label === "Activo";

  return (
    <span
      className={cn(
        "inline-flex h-7 w-20 shrink-0 cursor-default select-none items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition-all",
        active
          ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400",
      )}
    >
      {label}
    </span>
  );
}

function MatriculaEstadoToggle({
  estado,
  disabled,
  onClick,
}: {
  estado: string | null | undefined;
  disabled?: boolean;
  onClick: () => void;
}) {
  const label = normalizeMatriculaEstado(estado);
  const active = label === "Activo";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-label={
        active
          ? "Matrícula activa. Pulsa para desactivar."
          : "Matrícula inactiva. Pulsa para activar."
      }
      className={cn(
        "inline-flex h-7 w-20 shrink-0 items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400",
      )}
    >
      {label}
    </button>
  );
}

function HorarioEstadoControl({
  horarioId,
  estado,
  canWrite,
  loading,
  disabled,
  onToggle,
}: {
  horarioId: string;
  estado: string | null | undefined;
  canWrite: boolean;
  loading?: boolean;
  disabled?: boolean;
  onToggle?: (horarioId: string, currentEstado: string | null | undefined) => void;
}) {
  if (!canWrite || !onToggle) {
    return <MatriculaEstadoBadge estado={estado} />;
  }

  const label = normalizeMatriculaEstado(estado);
  const active = label === "Activo";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(horarioId, estado);
      }}
      disabled={disabled || loading}
      aria-label={
        active ? "Horario activo. Pulsa para desactivar." : "Horario inactivo. Pulsa para activar."
      }
      className={cn(
        "inline-flex h-7 w-20 shrink-0 items-center justify-center rounded-full border text-xs font-semibold shadow-sm transition-all hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "border-red-200 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400",
      )}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : label}
    </button>
  );
}

function formatHorarioSchedule(
  dia: string | null | undefined,
  horaInicio: string | null | undefined,
  horaFin: string | null | undefined,
): string {
  const day = dia?.trim() || "—";
  const start = horaInicio?.slice(0, 5) ?? "";
  const end = horaFin?.slice(0, 5) ?? "";
  if (start && end) return `${day}, ${start} - ${end}`;
  if (start) return `${day}, ${start}`;
  return day;
}

/** HORARIOS_MATRICULAS stores status in `ESTADO`; types may also expose `ESTADO_MATRICULA`. */
function resolveHorarioEstado(horario: HorarioMatricula): string | null | undefined {
  const record = horario as HorarioMatricula & { ESTADO?: string | null };
  return record.ESTADO ?? horario.ESTADO_MATRICULA;
}

function resolveHorarioEspecialidad(
  horario: HorarioMatricula,
  mat: MatriculaRow,
  especialidadById: Map<string, string>,
): string {
  const especialidadId = horario.ID_ESPECIALIDAD ?? mat.ESPECIALIDAD;
  if (!especialidadId) return "—";
  if (especialidadId === mat.ESPECIALIDAD && mat.ESPECIALIDADES?.ESPECIALIDAD) {
    return mat.ESPECIALIDADES.ESPECIALIDAD;
  }
  return especialidadById.get(especialidadId) ?? especialidadId;
}

type MatriculaFormSelectState = {
  idAlumno: string;
  idCentro: string;
  idCurso: string;
  idTarifa: string;
  especialidad: string;
  estado: MatriculaEstado;
  fechaAlta: string;
  fechaBaja: string;
  idProfesor: string;
};

function selectId(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function matriculaHorariosRows(matricula: MatriculaRow): HorarioMatricula[] {
  const record = matricula as unknown as Record<string, unknown>;
  const raw =
    record.HORARIOS_MATRICULAS ?? record.horarios_matriculas ?? record.Horarios_Matriculas;
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as HorarioMatricula[];
  if (typeof raw === "object") return [raw as HorarioMatricula];
  return [];
}

function sortMatriculasActivasPrimero(a: MatriculaRow, b: MatriculaRow): number {
  const aActivo = isMatriculaActiva(a.ESTADO) ? 0 : 1;
  const bActivo = isMatriculaActiva(b.ESTADO) ? 0 : 1;
  if (aActivo !== bActivo) return aActivo - bActivo;
  return (a.ALUMNOS?.NOMBRE_ALUMNO ?? "").localeCompare(b.ALUMNOS?.NOMBRE_ALUMNO ?? "", "es", {
    sensitivity: "base",
  });
}

function localTodayDateKey(): string {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function normalizeCursoDateKey(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

function findCursoEscolarInCentros(
  centros: CentroData[],
  idCentro: string | null | undefined,
  idCurso: string | null | undefined,
): CursoEscolarData | null {
  const cursoId = idCurso?.trim();
  if (!cursoId) return null;

  const centroId = idCentro?.trim();
  if (centroId) {
    const centro = centros.find((c) => c.ID_CENTRO === centroId);
    const found = centro?.CURSO_ESCOLAR?.find((c) => c.ID_CURSO === cursoId);
    if (found) return found;
  }

  for (const centro of centros) {
    const found = centro.CURSO_ESCOLAR?.find((c) => c.ID_CURSO === cursoId);
    if (found) return found;
  }

  return null;
}

function isCursoVigentePorFecha(fechaFin: string | null, todayKey: string): boolean {
  if (!fechaFin) return false;
  return fechaFin >= todayKey;
}

function matriculaMatchesEspecialidadFilter(
  matricula: MatriculaRow,
  especialidadId: string,
): boolean {
  const targetId = selectId(especialidadId);
  if (selectId(matricula.ESPECIALIDAD) === targetId) return true;
  return matriculaHorariosRows(matricula).some(
    (horario) => selectId(horario.ID_ESPECIALIDAD) === targetId,
  );
}

function readMatriculaField(
  row: MatriculaRow | null | undefined,
  upperKey: string,
  lowerKey: string,
): string {
  if (!row) return "";
  const record = row as unknown as Record<string, unknown>;
  return selectId(record[upperKey] ?? record[lowerKey]);
}

function matriculaFormStateFromRow(
  initial: MatriculaRow | null | undefined,
  centros: CentroData[] = [],
): MatriculaFormSelectState {
  const idAlumno = readMatriculaField(initial, "ID_ALUMNO", "id_alumno");
  const idCentro = readMatriculaField(initial, "ID_CENTRO", "id_centro");
  let idCurso = readMatriculaField(initial, "ID_CURSO", "id_curso");
  const idTarifa = readMatriculaField(initial, "ID_TARIFA", "id_tarifa");
  const especialidad = readMatriculaField(initial, "ESPECIALIDAD", "especialidad");
  const idProfesor = readMatriculaField(initial, "ID_PROFESOR", "id_profesor");

  if (!idCurso && idCentro && centros.length > 0) {
    idCurso = resolveCursoIdForCentro(centros, idCentro, "");
  }

  return {
    idAlumno,
    idCentro,
    idCurso,
    idTarifa,
    especialidad,
    estado: normalizeMatriculaEstado(initial?.ESTADO),
    fechaAlta: toDateInputValue(initial?.FECHA_ALTA),
    fechaBaja: toDateInputValue(initial?.FECHA_BAJA),
    idProfesor,
  };
}

const MATRICULA_OVERLAY_PANEL_CLASS =
  "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl sm:max-w-2xl lg:max-w-4xl max-h-[90vh] overflow-y-auto bg-card text-card-foreground border border-border shadow-xl rounded-lg z-50 p-6";

function MatriculaOverlayBackdrop({
  ariaLabel,
  onClose,
}: {
  ariaLabel: string;
  onClose: () => void;
}) {
  return (
    <button
      type="button"
      className="fixed inset-0 z-40 bg-black/10 sm:bg-black/20"
      aria-label={ariaLabel}
      onClick={onClose}
    />
  );
}

function MatriculaOverlayHeader({
  titleId,
  title,
  subtitle,
  onClose,
  edit,
}: {
  titleId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  edit?: { onClick: () => void; visible: boolean };
}) {
  return (
    <header className={OVERLAY_PANEL_HEADER_CLASS_P6}>
      <div className="min-w-0">
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {edit?.visible ? (
          <Button type="button" variant="brand" size="sm" className="gap-2" onClick={edit.onClick}>
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

function MatriculaOverlayFooter({
  onCancel,
  submitLabel,
  submitting,
}: {
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
        Cancelar
      </Button>
      <Button type="submit" variant="brand" form="matricula-form" disabled={submitting}>
        {submitting ? "Guardando..." : submitLabel}
      </Button>
    </div>
  );
}

function useMatriculaOverlayEffects(open: boolean, onClose: () => void) {
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

function MatriculaDetailContent({
  viewing,
  tarifaById,
  especialidadById,
}: {
  viewing: MatriculaRow;
  tarifaById: Map<string, string>;
  especialidadById: Map<string, string>;
}) {
  return (
    <>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Alumno</dt>
          <dd className="font-semibold">
            {viewing.ALUMNOS?.NOMBRE_ALUMNO ? (
              <EntityLink type="alumno" id={viewing.ID_ALUMNO}>
                {viewing.ALUMNOS.NOMBRE_ALUMNO}
              </EntityLink>
            ) : (
              (viewing.ID_ALUMNO ?? "—")
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Especialidad</dt>
          <dd>{viewing.ESPECIALIDADES?.ESPECIALIDAD ?? viewing.ESPECIALIDAD ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Centro</dt>
          <dd>{viewing.CENTROS?.NOMBRE_CENTRO ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Curso escolar</dt>
          <dd>{viewing.CURSO_ESCOLAR?.NOMBRE_CURSO ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Profesor</dt>
          <dd>
            {viewing.PROFESOR?.NOMBRE_PROFESOR ? (
              <EntityLink type="profesor" id={viewing.ID_PROFESOR}>
                {viewing.PROFESOR.NOMBRE_PROFESOR}
              </EntityLink>
            ) : (
              "Sin asignar"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Estado</dt>
          <dd>{viewing.ESTADO ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fecha Alta</dt>
          <dd>{viewing.FECHA_ALTA ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Fecha Baja</dt>
          <dd>{viewing.FECHA_BAJA ?? "—"}</dd>
        </div>
        <div className="sm:col-span-2 border-t pt-2">
          <dt className="text-muted-foreground">Tarifa</dt>
          <dd>
            {viewing.ID_TARIFA ? (tarifaById.get(viewing.ID_TARIFA) ?? viewing.ID_TARIFA) : "—"}
          </dd>
        </div>
      </dl>
      <MatriculaHorariosPanel matricula={viewing} especialidadById={especialidadById} />
    </>
  );
}

function MatriculaDetailOverlay({
  open,
  viewing,
  canWrite,
  tarifaById,
  especialidadById,
  onClose,
  onEdit,
}: {
  open: boolean;
  viewing: MatriculaRow | null;
  canWrite: boolean;
  tarifaById: Map<string, string>;
  especialidadById: Map<string, string>;
  onClose: () => void;
  onEdit: () => void;
}) {
  useMatriculaOverlayEffects(open, onClose);
  if (!open || !viewing) return null;

  const titleId = "matricula-detail-title";

  return createPortal(
    <>
      <MatriculaOverlayBackdrop ariaLabel="Cerrar ficha de matrícula" onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={MATRICULA_OVERLAY_PANEL_CLASS}
      >
        <MatriculaOverlayHeader
          titleId={titleId}
          title="Ficha de Matrícula"
          subtitle="Detalles técnicos del registro académico"
          onClose={onClose}
          edit={canWrite ? { onClick: onEdit, visible: true } : undefined}
        />
        <MatriculaDetailContent
          viewing={viewing}
          tarifaById={tarifaById}
          especialidadById={especialidadById}
        />
      </div>
    </>,
    document.body,
  );
}

function MatriculaHorariosTable({
  matricula,
  especialidadById,
  onRowClick,
  layout = "nested",
  canWrite = false,
  togglingHorarioId = null,
  onToggleHorarioEstado,
}: {
  matricula: MatriculaRow;
  especialidadById: Map<string, string>;
  onRowClick?: () => void;
  layout?: "nested" | "parent-grid";
  canWrite?: boolean;
  togglingHorarioId?: string | null;
  onToggleHorarioEstado?: (horarioId: string, currentEstado: string | null | undefined) => void;
}) {
  const horarios = matricula.HORARIOS_MATRICULAS ?? [];

  const sortedHorarios = useMemo(() => sortHorariosMatriculasChronologically(horarios), [horarios]);

  if (sortedHorarios.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Esta matrícula no tiene horarios registrados.</p>
    );
  }

  if (layout === "parent-grid") {
    return (
      <>
        {sortedHorarios.map((horario) => (
          <TableRow
            key={horario.ID_HORARIO}
            className={cn(
              "hidden bg-muted/10 hover:bg-muted/20 sm:table-row",
              onRowClick && "cursor-pointer",
            )}
            onClick={onRowClick}
          >
            <TableCell className={MATRICULA_LIST_COL.alert}>
              <MatriculaAlertSlot active={false} />
            </TableCell>
            <TableCell className={MATRICULA_LIST_COL.expand} />
            <TableCell className={MATRICULA_LIST_COL.alumno} />
            <TableCell className={MATRICULA_LIST_COL.especialidad}>
              {resolveHorarioEspecialidad(horario, matricula, especialidadById)}
            </TableCell>
            <TableCell className={MATRICULA_LIST_COL.profesor}>
              <span className="text-muted-foreground">
                {formatHorarioSchedule(horario.DIA, horario.HORA_INICIO, horario.HORA_FIN)}
              </span>
            </TableCell>
            <TableCell className={MATRICULA_LIST_COL.estado} onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-center">
                <HorarioEstadoControl
                  horarioId={horario.ID_HORARIO}
                  estado={resolveHorarioEstado(horario)}
                  canWrite={canWrite}
                  loading={togglingHorarioId === horario.ID_HORARIO}
                  disabled={togglingHorarioId !== null}
                  onToggle={onToggleHorarioEstado}
                />
              </div>
            </TableCell>
            <TableCell className={MATRICULA_LIST_COL.fecha}>
              {horario.SALDO != null ? horario.SALDO : "—"}
            </TableCell>
            <TableCell className={MATRICULA_LIST_COL.actions} />
          </TableRow>
        ))}
        <TableRow className="bg-muted/10 hover:bg-muted/20 sm:hidden">
          <TableCell colSpan={MATRICULA_TABLE_COL_COUNT} className="border-t px-4 py-3">
            <div className="space-y-2">
              {sortedHorarios.map((horario) => (
                <div
                  key={horario.ID_HORARIO}
                  className={cn(
                    "rounded-md border bg-background p-3 text-sm",
                    onRowClick && "cursor-pointer hover:bg-muted/50",
                  )}
                  onClick={onRowClick}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {resolveHorarioEspecialidad(horario, matricula, especialidadById)}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <HorarioEstadoControl
                        horarioId={horario.ID_HORARIO}
                        estado={resolveHorarioEstado(horario)}
                        canWrite={canWrite}
                        loading={togglingHorarioId === horario.ID_HORARIO}
                        disabled={togglingHorarioId !== null}
                        onToggle={onToggleHorarioEstado}
                      />
                      <span className="text-muted-foreground">
                        {horario.SALDO != null ? horario.SALDO : "—"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {formatHorarioSchedule(horario.DIA, horario.HORA_INICIO, horario.HORA_FIN)}
                  </p>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      </>
    );
  }

  return (
    <>
      <div className="space-y-2 md:hidden">
        {sortedHorarios.map((horario) => (
          <div
            key={horario.ID_HORARIO}
            className={cn(
              "rounded-md border bg-background p-3 text-sm",
              onRowClick && "cursor-pointer hover:bg-muted/50",
            )}
            onClick={onRowClick}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {resolveHorarioEspecialidad(horario, matricula, especialidadById)}
              </span>
              <div className="flex shrink-0 items-center gap-2">
              {canWrite && onToggleHorarioEstado ? (
                <HorarioEstadoControl
                  horarioId={horario.ID_HORARIO}
                  estado={resolveHorarioEstado(horario)}
                  canWrite={canWrite}
                  loading={togglingHorarioId === horario.ID_HORARIO}
                  disabled={togglingHorarioId !== null}
                  onToggle={onToggleHorarioEstado}
                />
              ) : (
                <MatriculaEstadoBadge estado={resolveHorarioEstado(horario)} />
              )}
              <span className="text-muted-foreground">
                {horario.SALDO != null ? horario.SALDO : "—"}
              </span>
            </div>
            </div>
            <p className="mt-1 text-muted-foreground">
              {formatHorarioSchedule(horario.DIA, horario.HORA_INICIO, horario.HORA_FIN)}
            </p>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Especialidad</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead className="w-[110px] min-w-[110px] text-center" aria-hidden="true" />
              <TableHead>Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedHorarios.map((horario) => (
              <TableRow
                key={horario.ID_HORARIO}
                className={cn(onRowClick && "cursor-pointer hover:bg-muted/50")}
                onClick={onRowClick}
              >
                <TableCell>
                  {resolveHorarioEspecialidad(horario, matricula, especialidadById)}
                </TableCell>
                <TableCell>
                  {formatHorarioSchedule(horario.DIA, horario.HORA_INICIO, horario.HORA_FIN)}
                </TableCell>
                <TableCell className="w-[110px] min-w-[110px] text-center align-middle">
                  <MatriculaEstadoBadge estado={resolveHorarioEstado(horario)} />
                </TableCell>
                <TableCell>{horario.SALDO != null ? horario.SALDO : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function MatriculaHorariosPanel({
  matricula,
  especialidadById,
}: {
  matricula: MatriculaRow;
  especialidadById: Map<string, string>;
}) {
  return (
    <div className="border-t pt-4">
      <h4 className="mb-3 text-sm font-semibold">Horarios de matrícula</h4>
      <div className="rounded-md border bg-muted/10 p-2">
        <MatriculaHorariosTable matricula={matricula} especialidadById={especialidadById} />
      </div>
    </div>
  );
}

function MatriculasPage() {
  const { matriculaId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { rol, tenantId } = useActiveTenant();
  const qc = useQueryClient();
  const canWrite = canWriteUi(rol, "matriculas:write");
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update, bulkUpdateEstadoByCurso, remove, invalidateList } =
    useMatriculas(filterCenterId);
  const { createHorario, updateHorario, removeHorario } = useAlumnosTree(null);
  const { list: tarifasList } = useTarifas();

  const tarifaById = useMemo(
    () => new Map(asArray<TarifaData>(tarifasList.data).map((t) => [t.ID_TARIFA, t.SERVICIO])),
    [tarifasList.data],
  );

  const [query, setQuery] = useState("");
  const [filtroCurso, setFiltroCurso] = useState("");
  const [filtroEspecialidad, setFiltroEspecialidad] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [editing, setEditing] = useState<MatriculaRow | null>(null);
  const [viewing, setViewing] = useState<MatriculaRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [statusConfirming, setStatusConfirming] = useState<MatriculaRow | null>(null);
  const [horarioStatusConfirming, setHorarioStatusConfirming] = useState<{
    horarioId: string;
    currentEstado: string | null | undefined;
  } | null>(null);
  const [togglingHorarioId, setTogglingHorarioId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [expandedCursoIds, setExpandedCursoIds] = useState<Set<string>>(() => new Set());
  const [bulkCursoId, setBulkCursoId] = useState("");
  const [bulkNuevoEstado, setBulkNuevoEstado] = useState<MatriculaEstado>("Inactivo");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const horarioSaving =
    createHorario.isPending || updateHorario.isPending || removeHorario.isPending;

  const invalidateHorarioSideEffects = () => {
    invalidateList();
    qc.invalidateQueries({ queryKey: tenantListKey("avisos-internos", rol, tenantId) });
  };

  const allMatriculasQuery = useMatriculas(null);
  const { list: grupoHorariosList } = useGruposHorarios();
  const occupancyMetaQuery = useQuery({
    queryKey: ["schedule-assignment-meta", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const [sesionesRes, aulasRes] = await Promise.all([
        supabase
          .from("SESIONES")
          .select(
            "ID_SESION,ID_ALUMNO,ID_AULA,ID_PROFESOR,ID_HORARIO,ID_GRUPO_HORARIO,FECHA_EXACTA,HORA_INICIO,HORA_FIN,ESTADO",
          )
          .eq("ID_CLIENTE", tenantId!),
        supabase.from("AULA").select("ID_AULA,CAPACIDAD").eq("ID_CLIENTE", tenantId!),
      ]);
      if (sesionesRes.error) throw sesionesRes.error;
      if (aulasRes.error) throw aulasRes.error;
      return {
        sesiones: (sesionesRes.data ?? []) as SesionOccupancyRow[],
        aulaCapacidadById: new Map(
          (aulasRes.data ?? []).map((aula) => [aula.ID_AULA, aula.CAPACIDAD as number | null]),
        ),
      };
    },
  });

  const grupoSlots = useMemo(
    () => asArray<GrupoHorarioSlot>(grupoHorariosList.data),
    [grupoHorariosList.data],
  );

  const tenantHorarios = useMemo(
    () =>
      (allMatriculasQuery.list.data?.rows ?? []).flatMap((mat) => mat.HORARIOS_MATRICULAS ?? []),
    [allMatriculasQuery.list.data],
  );

  const tenantIndividualHorarios = useMemo(
    () => tenantHorarios.filter(isIndividualHorarioForOccupancy),
    [tenantHorarios],
  );

  const scheduleAssignmentContext = useMemo((): ScheduleAssignmentContext | null => {
    if (!occupancyMetaQuery.data) return null;
    return buildScheduleAssignmentContext(
      grupoHorariosList.data ?? [],
      tenantHorarios,
      occupancyMetaQuery.data.sesiones,
      occupancyMetaQuery.data.aulaCapacidadById,
    );
  }, [grupoHorariosList.data, tenantHorarios, occupancyMetaQuery.data]);

  const matriculas = useMemo(() => list.data?.rows ?? [], [list.data?.rows]);
  const especialidadById = useMemo(
    () => list.data?.especialidadById ?? new Map<string, string>(),
    [list.data?.especialidadById],
  );

  const liveEditing = useMemo(() => {
    if (!editing) return null;
    return matriculas.find((m) => m.ID_MATRICULA === editing.ID_MATRICULA) ?? editing;
  }, [editing, matriculas]);

  const editingStudentConflictHorarios = useMemo(() => {
    if (!liveEditing?.ID_ALUMNO) return [];
    return matriculas
      .filter((m) => m.ID_ALUMNO === liveEditing.ID_ALUMNO)
      .flatMap((m) => matriculaHorariosRows(m));
  }, [liveEditing?.ID_ALUMNO, matriculas]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCursoGroup = (idCurso: string) => {
    setExpandedCursoIds((prev) => {
      const next = new Set(prev);
      if (next.has(idCurso)) next.delete(idCurso);
      else next.add(idCurso);
      return next;
    });
  };

  const cursoFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matriculas) {
      if (m.ID_CURSO) {
        map.set(m.ID_CURSO, m.CURSO_ESCOLAR?.NOMBRE_CURSO ?? m.ID_CURSO);
      }
    }
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [matriculas]);

  const bulkCursoTarget = useMemo(
    () => cursoFilterOptions.find((c) => c.id === bulkCursoId) ?? null,
    [cursoFilterOptions, bulkCursoId],
  );

  const bulkAffectedCount = useMemo(() => {
    if (!bulkCursoId) return 0;
    return matriculas.filter(
      (m) => m.ID_CURSO === bulkCursoId && normalizeMatriculaEstado(m.ESTADO) !== bulkNuevoEstado,
    ).length;
  }, [matriculas, bulkCursoId, bulkNuevoEstado]);

  useEffect(() => {
    if (cursoFilterOptions.length === 0) {
      setBulkCursoId("");
      return;
    }
    if (cursoFilterOptions.some((c) => c.id === bulkCursoId)) return;
    setBulkCursoId(cursoFilterOptions[0]?.id ?? "");
  }, [cursoFilterOptions, bulkCursoId]);

  const especialidadFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of matriculas) {
      if (m.ESPECIALIDAD) {
        map.set(
          selectId(m.ESPECIALIDAD),
          m.ESPECIALIDADES?.ESPECIALIDAD ?? selectId(m.ESPECIALIDAD),
        );
      }
      for (const horario of matriculaHorariosRows(m)) {
        const slotId = selectId(horario.ID_ESPECIALIDAD);
        if (!slotId) continue;
        map.set(slotId, especialidadById.get(slotId) ?? slotId);
      }
    }
    return Array.from(map.entries())
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [matriculas, especialidadById]);

  const filtered = useMemo(() => {
    let rows = matriculas;
    if (filtroCurso) {
      rows = rows.filter((m) => m.ID_CURSO === filtroCurso);
    }
    if (filtroEspecialidad) {
      rows = rows.filter((m) => matriculaMatchesEspecialidadFilter(m, filtroEspecialidad));
    }
    if (filtroEstado) {
      rows = rows.filter((m) => normalizeMatriculaEstado(m.ESTADO) === filtroEstado);
    }
    if (filterIncomplete) {
      rows = rows.filter((m) => m.ALERTA_SUBPROGRAMADO === true);
    }
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (m) =>
        m.ALUMNOS?.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
        m.ESPECIALIDADES?.ESPECIALIDAD?.toLowerCase().includes(q) ||
        m.PROFESOR?.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
        m.ESTADO?.toLowerCase().includes(q) ||
        m.ID_MATRICULA?.toLowerCase().includes(q),
    );
  }, [matriculas, query, filtroCurso, filtroEspecialidad, filtroEstado, filterIncomplete]);

  const matriculasGrouped = useMemo((): MatriculaCursoGroup[] => {
    const todayKey = localTodayDateKey();
    const byCurso = new Map<string, MatriculaRow[]>();
    for (const matricula of filtered) {
      const key = matricula.ID_CURSO?.trim() || SIN_CURSO_GROUP_KEY;
      const rows = byCurso.get(key) ?? [];
      rows.push(matricula);
      byCurso.set(key, rows);
    }

    const groups: MatriculaCursoGroup[] = [];
    for (const [idCurso, rows] of byCurso) {
      const sample = rows[0];
      const nombre =
        idCurso === SIN_CURSO_GROUP_KEY
          ? "Sin curso asignado"
          : (sample.CURSO_ESCOLAR?.NOMBRE_CURSO ?? idCurso);

      let cursoVigente = false;
      let fechaInicio: string | null = null;

      if (idCurso !== SIN_CURSO_GROUP_KEY) {
        const cursoData = findCursoEscolarInCentros(centrosOrdenados, sample.ID_CENTRO, idCurso);
        const fechaFin = normalizeCursoDateKey(cursoData?.FECHA_FIN);
        fechaInicio = normalizeCursoDateKey(cursoData?.FECHA_INICIO);
        cursoVigente = isCursoVigentePorFecha(fechaFin, todayKey);
      }

      groups.push({
        idCurso,
        nombre,
        cursoVigente,
        fechaInicio,
        matriculas: [...rows].sort(sortMatriculasActivasPrimero),
      });
    }

    return groups.sort((a, b) => {
      if (a.cursoVigente !== b.cursoVigente) return a.cursoVigente ? -1 : 1;
      const aStart = a.fechaInicio ?? "";
      const bStart = b.fechaInicio ?? "";
      if (aStart !== bStart) return bStart.localeCompare(aStart);
      return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });
  }, [filtered, centrosOrdenados]);

  const matriculasGroupedOrderKey = useMemo(
    () => matriculasGrouped.map((group) => group.idCurso).join("\0"),
    [matriculasGrouped],
  );

  useEffect(() => {
    const firstId = matriculasGroupedOrderKey.split("\0")[0];
    setExpandedCursoIds(firstId ? new Set([firstId]) : new Set());
  }, [matriculasGroupedOrderKey]);

  const hasActiveFilters =
    Boolean(query.trim()) ||
    Boolean(filtroCurso) ||
    Boolean(filtroEspecialidad) ||
    Boolean(filtroEstado) ||
    filterIncomplete;

  const handleConfirmStatusChange = async () => {
    if (!statusConfirming) return;
    const matricula = statusConfirming;
    const isDeactivating = isMatriculaActiva(matricula.ESTADO);
    const nextEstado = toggleMatriculaEstado(matricula.ESTADO);
    try {
      await update.mutateAsync({
        id: matricula.ID_MATRICULA,
        patch: { ESTADO: nextEstado },
      });
      invalidateList();
      toast.success(
        isDeactivating
          ? "Matrícula desactivada correctamente."
          : "Matrícula activada correctamente.",
      );
      setStatusConfirming(null);
    } catch (err) {
      toast.error(formatMatriculaEstadoError(err));
    }
  };

  const handleRequestHorarioEstadoToggle = (
    horarioId: string,
    currentEstado: string | null | undefined,
  ) => {
    if (togglingHorarioId) return;
    setHorarioStatusConfirming({ horarioId, currentEstado });
  };

  const handleConfirmHorarioEstadoChange = async () => {
    if (!horarioStatusConfirming || togglingHorarioId) return;
    const { horarioId, currentEstado } = horarioStatusConfirming;
    const nextEstado = toggleMatriculaEstado(currentEstado);
    setTogglingHorarioId(horarioId);
    try {
      let query = supabase
        .from("HORARIOS_MATRICULAS")
        .update({ ESTADO: nextEstado })
        .eq("ID_HORARIO", horarioId);
      if (tenantId) query = query.eq("ID_CLIENTE", tenantId);
      const { error } = await query;
      if (error) throw error;
      invalidateList();
      toast.success(
        nextEstado === "Activo"
          ? "Horario activado correctamente."
          : "Horario desactivado correctamente.",
      );
      setHorarioStatusConfirming(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar el estado del horario.",
      );
    } finally {
      setTogglingHorarioId(null);
    }
  };

  const handleCloseViewing = () => {
    setViewing(null);
    navigate({ search: (prev) => ({ ...prev, matriculaId: undefined }), replace: true });
  };

  const handleRequestBulkEstadoChange = () => {
    if (!bulkCursoId) return;
    if (bulkAffectedCount === 0) {
      toast.info("No hay matrículas con un estado distinto al seleccionado.");
      return;
    }
    setBulkConfirmOpen(true);
  };

  const handleConfirmBulkEstadoChange = async () => {
    if (!bulkCursoId) return;
    try {
      const updatedCount = await bulkUpdateEstadoByCurso.mutateAsync({
        idCurso: bulkCursoId,
        estado: bulkNuevoEstado,
      });
      invalidateList();
      toast.success(
        updatedCount === 1
          ? "1 matrícula actualizada correctamente."
          : `${updatedCount} matrículas actualizadas correctamente.`,
      );
      setBulkConfirmOpen(false);
    } catch (err) {
      toast.error(formatMatriculaEstadoError(err));
    }
  };

  useEffect(() => {
    if (matriculaId && matriculas.length > 0) {
      const target = matriculas.find((m) => m.ID_MATRICULA === matriculaId);
      if (target) setViewing(target);
    }
  }, [matriculaId, matriculas]);

  const renderMatriculaActionsMenu = (m: MatriculaRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setViewing(m)}>
          <Eye className="mr-2 h-4 w-4" /> Ver detalle
        </DropdownMenuItem>
        {canWrite && (
          <DropdownMenuItem onClick={() => setEditing(m)}>
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </DropdownMenuItem>
        )}
        {canWrite && (
          <DropdownMenuItem
            onClick={() => setDeleting(m)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderMatriculaMobileCard = (m: MatriculaRow) => {
    const isExpanded = expandedIds.has(m.ID_MATRICULA);
    const horarios = matriculaHorariosRows(m);

    return (
      <li key={m.ID_MATRICULA} className="bg-background">
        <div className="flex items-stretch gap-1">
          <MatriculaAlertSlot active={m.ALERTA_SUBPROGRAMADO === true} />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 p-3 text-left transition-colors hover:bg-muted/50"
            aria-expanded={isExpanded}
            onClick={() => toggleExpanded(m.ID_MATRICULA)}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {m.ALUMNOS?.NOMBRE_ALUMNO ?? m.ID_ALUMNO ?? "—"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {m.ESPECIALIDADES?.ESPECIALIDAD ?? m.ESPECIALIDAD ?? "—"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {m.PROFESOR?.NOMBRE_PROFESOR ?? "Sin asignar"}
              </p>
            </div>
            <div
              className="flex shrink-0 flex-col items-end gap-1.5"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
              {canWrite ? (
                <MatriculaEstadoToggle
                  estado={m.ESTADO}
                  disabled={update.isPending}
                  onClick={() => setStatusConfirming(m)}
                />
              ) : (
                <MatriculaEstadoBadge estado={m.ESTADO} />
              )}
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isExpanded && "rotate-180",
                )}
                aria-hidden
              />
            </div>
          </button>
          <div
            className="flex shrink-0 items-center pr-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {renderMatriculaActionsMenu(m)}
          </div>
        </div>
        {isExpanded &&
          (horarios.length === 0 ? (
            <p className="border-t bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              Esta matrícula no tiene horarios registrados.
            </p>
          ) : (
            <div className="border-t bg-muted/20 px-3 py-3">
              <MatriculaHorariosTable
                layout="nested"
                matricula={m}
                especialidadById={especialidadById}
                onRowClick={() => setViewing(m)}
                canWrite={canWrite}
                togglingHorarioId={togglingHorarioId}
                onToggleHorarioEstado={handleRequestHorarioEstadoToggle}
              />
            </div>
          ))}
      </li>
    );
  };

  if (!hasPermission(rol, "matriculas:read")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Matrículas Académicas"
        description={`${matriculas.length} matrículas registradas en el sistema`}
        actions={
          canWrite && (
            <Button variant="brand" onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva matrícula
            </Button>
          )
        }
      />

      {canWrite && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
          <Select
            value={bulkCursoId || NONE_VALUE}
            onValueChange={(v) => setBulkCursoId(v === NONE_VALUE ? "" : v)}
            disabled={cursoFilterOptions.length === 0 || bulkUpdateEstadoByCurso.isPending}
          >
            <SelectTrigger
              id="matriculas-bulk-curso-select"
              className="h-8 w-full min-w-0 text-sm sm:min-w-[10rem] sm:flex-1 [&>span]:truncate"
            >
              <SelectValue placeholder="Curso escolar" />
            </SelectTrigger>
            <SelectContent>
              {cursoFilterOptions.length === 0 ? (
                <SelectItem value={NONE_VALUE} disabled>
                  No hay cursos con matrículas
                </SelectItem>
              ) : (
                cursoFilterOptions.map((curso) => (
                  <SelectItem key={curso.id} value={curso.id}>
                    {curso.nombre}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Select
            value={bulkNuevoEstado}
            onValueChange={(v) => setBulkNuevoEstado(v as MatriculaEstado)}
            disabled={bulkUpdateEstadoByCurso.isPending}
          >
            <SelectTrigger
              id="matriculas-bulk-estado-select"
              className="h-8 w-full min-w-0 text-sm sm:min-w-[8rem] sm:max-w-[10rem] [&>span]:truncate"
            >
              <SelectValue placeholder="Nuevo estado" />
            </SelectTrigger>
            <SelectContent>
              {MATRICULA_ESTADO_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="brand"
            size="sm"
            className="h-8 shrink-0 max-md:px-2 px-3 text-xs"
            disabled={
              !bulkCursoId ||
              bulkAffectedCount === 0 ||
              bulkUpdateEstadoByCurso.isPending ||
              cursoFilterOptions.length === 0
            }
            onClick={handleRequestBulkEstadoChange}
          >
            {bulkUpdateEstadoByCurso.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Modificando...
              </>
            ) : (
              <>
                <span className="md:hidden">Modificar</span>
                <span className="hidden md:inline">Modificar matrículas</span>
              </>
            )}
          </Button>
        </div>
      )}

      <Card className="p-4">
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-nowrap lg:items-center lg:overflow-x-auto">
          <div className="relative min-w-0 w-full lg:min-w-[12rem] lg:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="matriculas-search"
              placeholder="Buscar alumno, especialidad..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 min-w-0 pl-8 text-sm"
            />
          </div>
          {showCentroFilter && (
            <div className="min-w-0 w-full lg:w-[140px] lg:shrink-0">
              <CentroTableFilter
                id="matriculas-centro-filter"
                centros={centrosOrdenados}
                value={selectedCenterId}
                onChange={setSelectedCenterId}
                hideLabel
              />
            </div>
          )}
          <div className="min-w-0 w-full lg:w-[9.5rem] lg:shrink-0">
            <Select
              value={filtroCurso || "__all__"}
              onValueChange={(v) => setFiltroCurso(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                id="matriculas-filtro-curso"
                className="h-8 w-full min-w-0 text-sm [&>span]:truncate"
              >
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los cursos</SelectItem>
                {cursoFilterOptions.map((curso) => (
                  <SelectItem key={curso.id} value={curso.id}>
                    {curso.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 w-full lg:w-[10rem] lg:shrink-0">
            <Select
              value={filtroEspecialidad || "__all__"}
              onValueChange={(v) => setFiltroEspecialidad(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                id="matriculas-filtro-especialidad"
                className="h-8 w-full min-w-0 text-sm [&>span]:truncate"
              >
                <SelectValue placeholder="Especialidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas las especialidades</SelectItem>
                {especialidadFilterOptions.map((especialidad) => (
                  <SelectItem key={especialidad.id} value={especialidad.id}>
                    {especialidad.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 w-full lg:w-[8.5rem] lg:shrink-0">
            <Select
              value={filtroEstado || "__all__"}
              onValueChange={(v) => setFiltroEstado(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                id="matriculas-filtro-estado"
                className="h-8 w-full min-w-0 text-sm [&>span]:truncate"
              >
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los estados</SelectItem>
                {MATRICULA_ESTADO_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 w-full items-center gap-2 sm:col-span-2 lg:w-auto lg:shrink-0 lg:whitespace-nowrap">
            <Switch
              id="matriculas-filter-incomplete"
              checked={filterIncomplete}
              onCheckedChange={setFilterIncomplete}
              className="shrink-0"
            />
            <Label
              htmlFor="matriculas-filter-incomplete"
              className="min-w-0 cursor-pointer select-none truncate text-xs font-medium leading-none text-foreground"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                <span className="truncate">Horarios incompletos</span>
              </span>
            </Label>
          </div>
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error al obtener matrículas: {(list.error as Error)?.message}
          </div>
        )}

        <div className="hidden w-full overflow-x-auto md:block">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className={MATRICULA_LIST_HEAD.alert} aria-hidden="true" />
                <TableHead className={MATRICULA_LIST_HEAD.expand} />
                <TableHead className={MATRICULA_LIST_HEAD.alumno}>Alumno</TableHead>
                <TableHead className={MATRICULA_LIST_HEAD.especialidad}>Especialidad</TableHead>
                <TableHead className={MATRICULA_LIST_HEAD.profesor}>Profesor Asignado</TableHead>
                <TableHead className={MATRICULA_LIST_HEAD.estado}>Estado</TableHead>
                <TableHead className={MATRICULA_LIST_HEAD.fecha}>Fecha Alta</TableHead>
                <TableHead className={MATRICULA_LIST_HEAD.actions} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={MATRICULA_TABLE_COL_COUNT}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={MATRICULA_TABLE_COL_COUNT}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {hasActiveFilters
                      ? "Sin resultados para los filtros aplicados."
                      : "No hay ninguna matrícula registrada."}
                  </TableCell>
                </TableRow>
              ) : (
                matriculasGrouped.map((group) => {
                  const isCursoExpanded = expandedCursoIds.has(group.idCurso);

                  return (
                    <Fragment key={group.idCurso}>
                      <TableRow
                        className="cursor-pointer bg-muted/30 hover:bg-muted/40"
                        onClick={() => toggleCursoGroup(group.idCurso)}
                      >
                        <TableCell colSpan={MATRICULA_TABLE_COL_COUNT} className="py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                  isCursoExpanded && "rotate-180",
                                )}
                                aria-hidden
                              />
                              <span className="font-semibold">{group.nombre}</span>
                              <span className="text-sm text-muted-foreground">
                                {group.matriculas.length}{" "}
                                {group.matriculas.length === 1 ? "matrícula" : "matrículas"}
                              </span>
                              {!group.cursoVigente ? (
                                <span className="rounded-full border border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground">
                                  Curso acabado
                                </span>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {isCursoExpanded ? "Ocultar" : "Expandir"}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isCursoExpanded &&
                        group.matriculas.map((m) => {
                          const isExpanded = expandedIds.has(m.ID_MATRICULA);
                          const horarios = matriculaHorariosRows(m);

                          return (
                            <Fragment key={m.ID_MATRICULA}>
                              <TableRow
                                className="cursor-pointer"
                                aria-expanded={isExpanded}
                                onClick={() => toggleExpanded(m.ID_MATRICULA)}
                              >
                                <TableCell
                                  className={MATRICULA_LIST_COL.alert}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MatriculaAlertSlot active={m.ALERTA_SUBPROGRAMADO === true} />
                                </TableCell>
                                <TableCell className={MATRICULA_LIST_COL.expand}>
                                  <ChevronDown
                                    className={cn(
                                      "h-4 w-4 text-muted-foreground transition-transform",
                                      isExpanded && "rotate-180",
                                    )}
                                    aria-hidden
                                  />
                                </TableCell>
                                <TableCell className={MATRICULA_LIST_COL.alumno}>
                                  {m.ALUMNOS?.NOMBRE_ALUMNO ? (
                                    <EntityLink type="alumno" id={m.ID_ALUMNO}>
                                      {m.ALUMNOS.NOMBRE_ALUMNO}
                                    </EntityLink>
                                  ) : (
                                    <span className="text-muted-foreground text-xs font-mono">
                                      {m.ID_ALUMNO || "—"}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className={MATRICULA_LIST_COL.especialidad}>
                                  {m.ESPECIALIDADES?.ESPECIALIDAD ?? (
                                    <span className="text-muted-foreground text-xs font-mono">
                                      {m.ESPECIALIDAD || "—"}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className={MATRICULA_LIST_COL.profesor}>
                                  {m.PROFESOR?.NOMBRE_PROFESOR ? (
                                    <EntityLink type="profesor" id={m.ID_PROFESOR}>
                                      {m.PROFESOR.NOMBRE_PROFESOR}
                                    </EntityLink>
                                  ) : (
                                    <span className="text-muted-foreground">Sin asignar</span>
                                  )}
                                </TableCell>
                                <TableCell
                                  className={MATRICULA_LIST_COL.estado}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex justify-center">
                                    {canWrite ? (
                                      <MatriculaEstadoToggle
                                        estado={m.ESTADO}
                                        disabled={update.isPending}
                                        onClick={() => setStatusConfirming(m)}
                                      />
                                    ) : (
                                      <MatriculaEstadoBadge estado={m.ESTADO} />
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className={MATRICULA_LIST_COL.fecha}>
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> {m.FECHA_ALTA ?? "—"}
                                  </div>
                                </TableCell>
                                <TableCell
                                  className={MATRICULA_LIST_COL.actions}
                                  onClick={(e) => e.stopPropagation()}
                                >
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
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => setViewing(m)}>
                                        <Eye className="mr-2 h-4 w-4" /> Ver detalle
                                      </DropdownMenuItem>
                                      {canWrite && (
                                        <DropdownMenuItem onClick={() => setEditing(m)}>
                                          <Pencil className="mr-2 h-4 w-4" /> Editar
                                        </DropdownMenuItem>
                                      )}
                                      {canWrite && (
                                        <DropdownMenuItem
                                          onClick={() => setDeleting(m)}
                                          className="text-destructive focus:text-destructive"
                                        >
                                          <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                        </DropdownMenuItem>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                              {isExpanded &&
                                (horarios.length === 0 ? (
                                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                                    <TableCell
                                      colSpan={MATRICULA_TABLE_COL_COUNT}
                                      className="px-6 py-4 text-sm text-muted-foreground"
                                    >
                                      Esta matrícula no tiene horarios registrados.
                                    </TableCell>
                                  </TableRow>
                                ) : (
                                  <MatriculaHorariosTable
                                    layout="parent-grid"
                                    matricula={m}
                                    especialidadById={especialidadById}
                                    onRowClick={() => setViewing(m)}
                                    canWrite={canWrite}
                                    togglingHorarioId={togglingHorarioId}
                                    onToggleHorarioEstado={handleRequestHorarioEstadoToggle}
                                  />
                                ))}
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden">
          {list.isLoading ? (
            <ul className="divide-y">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="p-3">
                  <Skeleton className="h-16 w-full rounded-lg" />
                </li>
              ))}
            </ul>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {hasActiveFilters
                ? "Sin resultados para los filtros aplicados."
                : "No hay ninguna matrícula registrada."}
            </p>
          ) : (
            <div className="divide-y">
              {matriculasGrouped.map((group) => {
                const isCursoExpanded = expandedCursoIds.has(group.idCurso);

                return (
                  <div key={group.idCurso}>
                    <button
                      type="button"
                      onClick={() => toggleCursoGroup(group.idCurso)}
                      className="flex w-full items-center justify-between gap-3 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                            isCursoExpanded && "rotate-180",
                          )}
                          aria-hidden
                        />
                        <span className="font-semibold">{group.nombre}</span>
                        <span className="text-sm text-muted-foreground">
                          {group.matriculas.length}{" "}
                          {group.matriculas.length === 1 ? "matrícula" : "matrículas"}
                        </span>
                        {!group.cursoVigente ? (
                          <span className="rounded-full border border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground">
                            Curso acabado
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {isCursoExpanded ? "Ocultar" : "Expandir"}
                      </span>
                    </button>
                    {isCursoExpanded ? (
                      <ul className="divide-y border-t bg-muted/10">
                        {group.matriculas.map((m) => renderMatriculaMobileCard(m))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <MatriculaDetailOverlay
        open={!!viewing}
        viewing={viewing}
        canWrite={canWrite}
        tarifaById={tarifaById}
        especialidadById={especialidadById}
        onClose={handleCloseViewing}
        onEdit={() => {
          if (!viewing) return;
          setEditing(viewing);
          handleCloseViewing();
        }}
      />

      {/* Create Modal */}
      {creating ? (
        <MatriculaFormDialog
          key="create"
          open
          onClose={() => setCreating(false)}
          title="Nueva Matrícula Académica"
          submitLabel="Matricular"
          submitting={create.isPending}
          onSubmit={async (values) => {
            try {
              await create.mutateAsync(values);
              invalidateList();
              toast.success("Matrícula creada con éxito");
              setCreating(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al guardar");
            }
          }}
        />
      ) : null}

      {/* Edit Modal */}
      {editing && liveEditing ? (
        <MatriculaFormDialog
          key={liveEditing.ID_MATRICULA}
          open
          onClose={() => setEditing(null)}
          title="Modificar Matrícula"
          submitLabel="Guardar Cambios"
          initial={liveEditing}
          submitting={update.isPending}
          grupoSlots={grupoSlots}
          scheduleAssignmentContext={scheduleAssignmentContext}
          tenantHorarios={tenantHorarios}
          tenantIndividualHorarios={tenantIndividualHorarios}
          studentConflictHorarios={editingStudentConflictHorarios}
          occupancySesiones={occupancyMetaQuery.data?.sesiones ?? []}
          horarioSaving={horarioSaving}
          onHorarioMutated={invalidateHorarioSideEffects}
          onCreateHorario={async (input) => {
            await createHorario.mutateAsync(input);
          }}
          onUpdateHorario={async (id, patch) => {
            await updateHorario.mutateAsync({ id, patch });
          }}
          onRemoveHorario={async (id) => {
            await removeHorario.mutateAsync(id);
          }}
          onSubmit={async (values) => {
            try {
              await update.mutateAsync({ id: liveEditing.ID_MATRICULA, patch: values });
              invalidateList();
              toast.success("Matrícula actualizada correctamente");
              setEditing(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al actualizar");
            }
          }}
        />
      ) : null}

      <AlertDialog
        open={bulkConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !bulkUpdateEstadoByCurso.isPending) setBulkConfirmOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modificar matrículas de forma masiva</AlertDialogTitle>
            <AlertDialogDescription>
              Se cambiará el estado de <strong>{bulkAffectedCount}</strong>{" "}
              {bulkAffectedCount === 1 ? "matrícula" : "matrículas"} del curso{" "}
              <strong>{bulkCursoTarget?.nombre ?? "seleccionado"}</strong> a{" "}
              <strong>{bulkNuevoEstado}</strong>.
              {showCentroFilter && selectedCenterId ? (
                <> Solo se incluyen matrículas del centro filtrado actualmente.</>
              ) : null}{" "}
              {bulkNuevoEstado === "Activo" ? (
                <>
                  El backend reactivará los horarios asociados, reincorporará alumnos en sus grupos
                  y regenerará las sesiones del calendario para el resto del curso escolar.
                </>
              ) : (
                <>Esta acción solo cambia el estado de la matrícula en el listado.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkUpdateEstadoByCurso.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!bulkCursoId || bulkUpdateEstadoByCurso.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmBulkEstadoChange();
              }}
            >
              {bulkUpdateEstadoByCurso.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Modificando...
                </>
              ) : (
                "Modificar matrículas"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!statusConfirming} onOpenChange={(o) => !o && setStatusConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusConfirming && isMatriculaActiva(statusConfirming.ESTADO)
                ? "Desactivar matrícula"
                : "Activar matrícula"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusConfirming && isMatriculaActiva(statusConfirming.ESTADO) ? (
                <>
                  ¿Seguro que quieres desactivar la matrícula de{" "}
                  <b>{matriculaStatusLabel(statusConfirming)}</b>? La matrícula pasará a estado
                  inactivo.
                </>
              ) : (
                <>
                  ¿Estás seguro de que quieres activar la matrícula de{" "}
                  <b>{statusConfirming ? matriculaStatusLabel(statusConfirming) : ""}</b>? La
                  matrícula volverá a estar activa.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmStatusChange();
              }}
              disabled={update.isPending}
            >
              {update.isPending
                ? "Guardando..."
                : statusConfirming && isMatriculaActiva(statusConfirming.ESTADO)
                  ? "Desactivar"
                  : "Activar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!horarioStatusConfirming}
        onOpenChange={(o) => !o && !togglingHorarioId && setHorarioStatusConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {horarioStatusConfirming && isMatriculaActiva(horarioStatusConfirming.currentEstado)
                ? "¿Desactivar este horario?"
                : "¿Activar este horario?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {horarioStatusConfirming &&
              isMatriculaActiva(horarioStatusConfirming.currentEstado) ? (
                <>
                  Atención: Esto dará de baja al alumno del grupo asociado (si lo hay) y eliminará
                  de forma irreversible todas sus sesiones programadas en el calendario desde el día
                  de hoy.
                </>
              ) : (
                <>
                  Esto dará de alta automáticamente al alumno en el grupo y regenerará todas sus
                  sesiones semanales en el calendario para el resto del curso escolar.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!togglingHorarioId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmHorarioEstadoChange();
              }}
              disabled={!!togglingHorarioId}
            >
              {togglingHorarioId
                ? "Guardando..."
                : horarioStatusConfirming &&
                    isMatriculaActiva(horarioStatusConfirming.currentEstado)
                  ? "Desactivar"
                  : "Activar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Modal */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Matrícula?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará definitivamente el registro de matrícula del alumno. Esta operación es
              irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                if (window.confirm("¿Seguro que desea eliminar...?")) {
                  try {
                    await remove.mutateAsync(deleting.ID_MATRICULA);
                    invalidateList();
                    toast.success("Matrícula eliminada permanentemente");
                    setDeleting(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Error al eliminar");
                  }
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

// ---------------------------------------------------------------------------
// DIÁLOGO DEL FORMULARIO COMPLETO INTERACTIVO 🛠️
// ---------------------------------------------------------------------------

function MatriculaFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  onSubmit,
  grupoSlots,
  scheduleAssignmentContext,
  tenantHorarios,
  tenantIndividualHorarios,
  studentConflictHorarios,
  occupancySesiones,
  horarioSaving,
  onHorarioMutated,
  onCreateHorario,
  onUpdateHorario,
  onRemoveHorario,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: MatriculaRow | null;
  submitting: boolean;
  onSubmit: (values: MatriculaFormValues) => void;
  grupoSlots?: GrupoHorarioSlot[];
  scheduleAssignmentContext?: ScheduleAssignmentContext | null;
  tenantHorarios?: HorarioMatricula[];
  tenantIndividualHorarios?: HorarioMatricula[];
  studentConflictHorarios?: HorarioMatricula[];
  occupancySesiones?: SesionOccupancyRow[];
  horarioSaving?: boolean;
  onHorarioMutated?: () => void;
  onCreateHorario?: (input: HorarioCreateInput) => Promise<void>;
  onUpdateHorario?: (id: string, patch: HorarioUpdateInput) => Promise<void>;
  onRemoveHorario?: (id: string) => Promise<void>;
}) {
  const { list: alumnosList } = useAlumnos();
  const { list: especialidadesList } = useEspecialidades();
  const { list: profesoresList } = useProfesores();
  const { list: aulasList } = useAulas();
  const { list: tarifasList } = useTarifas();
  const { list: centrosList } = useCentros();

  const alumnos = asArray<Alumno>(alumnosList.data);
  const especialidades = asArray<EspecialidadData>(especialidadesList.data);
  const profesores = resolveProfesoresList(profesoresList.data);
  const aulas = asArray<AulaData>(aulasList.data);
  const tarifas = asArray<TarifaData>(tarifasList.data);
  const centros = asArray<CentroData>(centrosList.data);

  const lookupsLoading =
    (alumnosList.isLoading && !alumnosList.data) ||
    (especialidadesList.isLoading && !especialidadesList.data) ||
    (profesoresList.isLoading && !profesoresList.data) ||
    (aulasList.isLoading && !aulasList.data) ||
    (tarifasList.isLoading && !tarifasList.data);

  const centrosLoading = centrosList.isLoading && !centrosList.data;
  const formReady = !lookupsLoading && !centrosLoading;
  const editingKey = initial?.ID_MATRICULA ? String(initial.ID_MATRICULA) : "create";
  const formInitKeyRef = useRef<string | null>(null);
  const seedFormState = () => matriculaFormStateFromRow(initial, centros);

  const [idAlumno, setIdAlumno] = useState(() => seedFormState().idAlumno);
  const [idCentro, setIdCentro] = useState(() => seedFormState().idCentro);
  const [idCurso, setIdCurso] = useState(() => seedFormState().idCurso);
  const [idTarifa, setIdTarifa] = useState(() => seedFormState().idTarifa);
  const [especialidad, setEspecialidad] = useState(() => seedFormState().especialidad);
  const [estado, setEstado] = useState<MatriculaEstado>(() => seedFormState().estado);
  const [fechaAlta, setFechaAlta] = useState(() => seedFormState().fechaAlta);
  const [fechaBaja, setFechaBaja] = useState(() => seedFormState().fechaBaja);
  const [idProfesor, setIdProfesor] = useState(() => seedFormState().idProfesor);

  const cursoOptions = useMemo(() => cursosForCentro(centros, idCentro), [centros, idCentro]);
  const maxHorarios = useMemo(() => {
    if (!idTarifa) return null;
    return tarifas.find((tarifa) => tarifa.ID_TARIFA === idTarifa)?.SESIONES_SEMANALES ?? null;
  }, [idTarifa, tarifas]);

  const horarioLookups = useMemo(
    () => ({
      profesorById: new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR])),
      aulaById: new Map(aulas.map((a) => [a.ID_AULA, a.NOMBRE_AULA])),
      tarifaById: new Map(tarifas.map((t) => [t.ID_TARIFA, t.SERVICIO])),
      especialidadById: new Map(especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD])),
    }),
    [profesores, aulas, tarifas, especialidades],
  );

  const horarioSelectOptions = useMemo(
    () => ({
      especialidades: especialidades.map((e) => ({
        id: e.ID_ESPECIALIDAD,
        label: e.ESPECIALIDAD,
      })),
      tarifas: tarifas.map((t) => ({
        id: t.ID_TARIFA,
        label: t.SERVICIO,
      })),
      profesores: toProfesorEntityOptions(profesores),
    }),
    [especialidades, tarifas, profesores],
  );

  const canEditHorarios = Boolean(
    initial?.ID_MATRICULA &&
    onCreateHorario &&
    onUpdateHorario &&
    onRemoveHorario &&
    grupoSlots &&
    scheduleAssignmentContext &&
    tenantHorarios &&
    tenantIndividualHorarios &&
    studentConflictHorarios,
  );

  const matriculaForHorarios = useMemo(() => {
    if (!initial) return null;
    return {
      ...initial,
      ESPECIALIDAD: especialidad || initial.ESPECIALIDAD,
      ID_PROFESOR: idProfesor || initial.ID_PROFESOR,
      ID_TARIFA: idTarifa || initial.ID_TARIFA,
      ID_CURSO: idCurso || initial.ID_CURSO,
      ID_CENTRO: idCentro || initial.ID_CENTRO,
    };
  }, [initial, especialidad, idProfesor, idTarifa, idCurso, idCentro]);

  useEffect(() => {
    if (!open) {
      formInitKeyRef.current = null;
      return;
    }
    if (!formReady) return;
    if (formInitKeyRef.current === editingKey) return;
    formInitKeyRef.current = editingKey;

    const next = matriculaFormStateFromRow(initial, centros);
    setIdAlumno(next.idAlumno);
    setIdCentro(next.idCentro);
    setIdCurso(next.idCurso);
    setIdTarifa(next.idTarifa);
    setEspecialidad(next.especialidad);
    setEstado(next.estado);
    setFechaAlta(next.fechaAlta);
    setFechaBaja(next.fechaBaja);
    setIdProfesor(next.idProfesor);
  }, [open, editingKey, formReady, centros, initial]);

  useMatriculaOverlayEffects(open, onClose);

  if (!open) return null;

  const titleId = "matricula-form-title";

  return createPortal(
    <>
      <MatriculaOverlayBackdrop ariaLabel="Cerrar formulario de matrícula" onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={MATRICULA_OVERLAY_PANEL_CLASS}
      >
        <MatriculaOverlayHeader titleId={titleId} title={title} onClose={onClose} />
        <form
          id="matricula-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!idAlumno.trim()) return;
            onSubmit({
              ID_ALUMNO: idAlumno.trim(),
              ID_CENTRO: idCentro || null,
              ID_CURSO: idCurso || null,
              ID_TARIFA: idTarifa || null,
              ESPECIALIDAD: especialidad || null,
              ESTADO: estado || null,
              FECHA_ALTA: fechaAlta || null,
              FECHA_BAJA: fechaBaja || null,
              ID_PROFESOR: idProfesor || null,
            });
          }}
          className="space-y-4"
        >
          {lookupsLoading || centrosLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Cargando opciones del formulario...
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Alumno *</Label>
                  <Select value={idAlumno || undefined} onValueChange={setIdAlumno}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar alumno" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      {alumnos.length === 0 ? (
                        <SelectItem value={NONE_VALUE} disabled>
                          No hay alumnos disponibles
                        </SelectItem>
                      ) : (
                        alumnos.map((alumno) => (
                          <SelectItem key={alumno.ID_ALUMNO} value={String(alumno.ID_ALUMNO)}>
                            {alumno.NOMBRE_ALUMNO}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tarifa</Label>
                  <Select
                    value={idTarifa || NONE_VALUE}
                    onValueChange={(v) => setIdTarifa(v === NONE_VALUE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tarifa" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      <SelectItem value={NONE_VALUE}>— Sin asignar —</SelectItem>
                      {tarifas.map((tarifa) => (
                        <SelectItem key={tarifa.ID_TARIFA} value={String(tarifa.ID_TARIFA)}>
                          {tarifa.SERVICIO}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Centro</Label>
                  {centrosLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      value={idCentro || NONE_VALUE}
                      onValueChange={(v) => {
                        const nextCentro = v === NONE_VALUE ? "" : v;
                        setIdCentro(nextCentro);
                        setIdCurso(
                          nextCentro ? resolveCursoIdForCentro(centros, nextCentro, idCurso) : "",
                        );
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar centro" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] overflow-y-auto">
                        <SelectItem value={NONE_VALUE}>— Sin asignar —</SelectItem>
                        {centros.map((centro) => (
                          <SelectItem key={centro.ID_CENTRO} value={String(centro.ID_CENTRO)}>
                            {centro.NOMBRE_CENTRO}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Curso escolar</Label>
                  {centrosLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      value={idCurso || NONE_VALUE}
                      onValueChange={(v) => setIdCurso(v === NONE_VALUE ? "" : v)}
                      disabled={!idCentro || cursoOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar curso" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px] overflow-y-auto">
                        <SelectItem value={NONE_VALUE}>— Sin asignar —</SelectItem>
                        {cursoOptions.map((curso) => (
                          <SelectItem key={curso.ID_CURSO} value={String(curso.ID_CURSO)}>
                            {curso.NOMBRE_CURSO}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {idCentro && !centrosLoading && cursoOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Este centro no tiene cursos escolares activos.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Especialidad</Label>
                  <Select
                    value={especialidad || NONE_VALUE}
                    onValueChange={(v) => setEspecialidad(v === NONE_VALUE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar especialidad" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] overflow-y-auto">
                      <SelectItem value={NONE_VALUE}>— Sin asignar —</SelectItem>
                      {especialidades.map((esp) => (
                        <SelectItem key={esp.ID_ESPECIALIDAD} value={String(esp.ID_ESPECIALIDAD)}>
                          {esp.ESPECIALIDAD}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Estado de la Matrícula</Label>
                  <Select value={estado} onValueChange={(v) => setEstado(v as MatriculaEstado)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATRICULA_ESTADO_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fecha de Alta</Label>
                  <Input
                    type="date"
                    value={fechaAlta}
                    onChange={(e) => setFechaAlta(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fecha de Baja (Si aplica)</Label>
                  <Input
                    type="date"
                    value={fechaBaja}
                    onChange={(e) => setFechaBaja(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Profesor Asignado</Label>
                <Select
                  value={idProfesor || NONE_VALUE}
                  onValueChange={(v) => setIdProfesor(v === NONE_VALUE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar profesor" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] overflow-y-auto">
                    <SelectItem value={NONE_VALUE}>— Sin asignar —</SelectItem>
                    {profesores.map((profesor) => (
                      <SelectItem key={profesor.ID_PROFESOR} value={String(profesor.ID_PROFESOR)}>
                        {profesor.NOMBRE_PROFESOR}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {canEditHorarios && matriculaForHorarios ? (
                <MatriculaHorariosGroup
                  matricula={matriculaForHorarios}
                  horarios={matriculaHorariosRows(matriculaForHorarios)}
                  alumnoId={matriculaForHorarios.ID_ALUMNO}
                  centros={centros}
                  alumnoCenterId={idCentro || matriculaForHorarios.ID_CENTRO}
                  selectOptions={horarioSelectOptions}
                  lookups={horarioLookups}
                  grupoSlots={grupoSlots!}
                  maxHorarios={maxHorarios}
                  horarioSaving={horarioSaving ?? false}
                  studentConflictHorarios={studentConflictHorarios!}
                  tenantIndividualHorarios={tenantIndividualHorarios!}
                  tenantOccupancyHorarios={tenantHorarios!}
                  occupancySesiones={occupancySesiones ?? []}
                  scheduleAssignmentContext={scheduleAssignmentContext ?? null}
                  onCreateHorario={async (input) => {
                    await onCreateHorario!(input);
                    onHorarioMutated?.();
                  }}
                  onUpdateHorario={async (id, patch) => {
                    await onUpdateHorario!(id, patch);
                    onHorarioMutated?.();
                  }}
                  onRemoveHorario={async (id) => {
                    await onRemoveHorario!(id);
                    onHorarioMutated?.();
                  }}
                />
              ) : null}
            </>
          )}
        </form>
        <MatriculaOverlayFooter
          onCancel={onClose}
          submitLabel={submitLabel}
          submitting={submitting || lookupsLoading || centrosLoading}
        />
      </div>
    </>,
    document.body,
  );
}
