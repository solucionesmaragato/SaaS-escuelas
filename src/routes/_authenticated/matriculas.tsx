import { createFileRoute } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Pencil,
  Eye,
  Calendar,
  X,
} from "lucide-react";
import type {
  HorarioMatriculaRowInput,
  HorarioMatriculaSyncInput,
  MatriculaRow,
  ScheduleConflict,
} from "@/hooks/useMatriculas";
import type { HorarioMatricula } from "@/types/database";
import { cn } from "@/lib/utils";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useMatriculas } from "@/hooks/useMatriculas";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useAulas, type AulaData } from "@/hooks/useAulas";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useProfesores, type ProfesoresQueryData } from "@/hooks/useProfesores";
import { useTarifas, type TarifaData } from "@/hooks/useTarifas";
import {
  useCentros,
  getActiveCursoEscolar,
  type CentroData,
  type CursoEscolarData,
} from "@/hooks/useCentros";
import { useActiveTenant } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { canWriteUi } from "@/lib/rbac";
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

type HorarioEditRow = {
  clientKey: string;
  ID_HORARIO: string | null;
  /** Group membership inherited from the DB row (read-only), used only to exclude group-mates from collision checks. */
  ID_GRUPO: string | null;
  ID_GRUPO_HORARIO: string | null;
  idEspecialidad: string;
  idProfesor: string;
  idAula: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  saldo: string;
};

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

function sortHorarioEditRowsChronologically(rows: HorarioEditRow[]): HorarioEditRow[] {
  return [...rows].sort(compareHorariosChronologically);
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
  horariosSync?: HorarioMatriculaSyncInput;
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
        active
          ? "Horario activo. Pulsa para desactivar."
          : "Horario inactivo. Pulsa para activar."
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

function sortCursosEscolares(cursos: CursoEscolarData[]): CursoEscolarData[] {
  return [...cursos].sort((a, b) =>
    (a.NOMBRE_CURSO ?? "").localeCompare(b.NOMBRE_CURSO ?? "", "es", {
      sensitivity: "base",
    }),
  );
}

function cursosForCentro(centros: CentroData[], centroId: string): CursoEscolarData[] {
  const centro = centros.find((c) => c.ID_CENTRO === centroId);
  return sortCursosEscolares(centro?.CURSO_ESCOLAR ?? []);
}

function resolveCursoIdForCentro(
  centros: CentroData[],
  centroId: string,
  currentCursoId: string,
): string {
  const cursos = cursosForCentro(centros, centroId);
  if (cursos.some((c) => c.ID_CURSO === currentCursoId)) return currentCursoId;
  const active = getActiveCursoEscolar(cursos);
  return active?.ID_CURSO ?? cursos[0]?.ID_CURSO ?? "";
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
  horarioRows: HorarioEditRow[];
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
    horarioRows: initial
      ? matriculaHorariosRows(initial).map((horario) => horarioToEditRow(horario, initial))
      : [],
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
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="min-w-0">
        <h2 id={titleId} className="text-xl font-semibold">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
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
      <Button type="submit" form="matricula-form" disabled={submitting}>
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

  const sortedHorarios = useMemo(
    () => sortHorariosMatriculasChronologically(horarios),
    [horarios],
  );

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
            <TableCell
              className={MATRICULA_LIST_COL.estado}
              onClick={(e) => e.stopPropagation()}
            >
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
      <div className="space-y-2 sm:hidden">
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
                <MatriculaEstadoBadge estado={resolveHorarioEstado(horario)} />
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
      <div className="hidden overflow-x-auto sm:block">
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

function horarioToEditRow(horario: HorarioMatricula, matricula: MatriculaRow): HorarioEditRow {
  return {
    clientKey: horario.ID_HORARIO,
    ID_HORARIO: horario.ID_HORARIO,
    ID_GRUPO: horario.ID_GRUPO ?? null,
    ID_GRUPO_HORARIO: horario.ID_GRUPO_HORARIO ?? null,
    idEspecialidad: selectId(horario.ID_ESPECIALIDAD ?? matricula.ESPECIALIDAD),
    idProfesor: selectId(horario.ID_PROFESOR),
    idAula: selectId(horario.ID_AULA),
    dia: horario.DIA ?? "",
    horaInicio: horario.HORA_INICIO?.slice(0, 5) ?? "",
    horaFin: horario.HORA_FIN?.slice(0, 5) ?? "",
    saldo: horario.SALDO != null ? String(horario.SALDO) : "",
  };
}

function createEmptyHorarioRow(defaultEspecialidad = ""): HorarioEditRow {
  return {
    clientKey: crypto.randomUUID(),
    ID_HORARIO: null,
    ID_GRUPO: null,
    ID_GRUPO_HORARIO: null,
    idEspecialidad: defaultEspecialidad,
    idProfesor: "",
    idAula: "",
    dia: "",
    horaInicio: "",
    horaFin: "",
    saldo: "",
  };
}

function toTimeStr(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function parseSaldoInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatHorarioLimitLabel(current: number, max: number | null | undefined): string {
  const maxLabel = max != null ? String(max) : "—";
  return `Horarios asignados: ${current} / ${maxLabel}`;
}

function editRowsToHorarioInputs(rows: HorarioEditRow[]): HorarioMatriculaRowInput[] {
  return rows.map((row) => {
    const input: HorarioMatriculaRowInput = {
      ID_ESPECIALIDAD: row.idEspecialidad?.trim() || null,
      ID_PROFESOR: row.idProfesor.trim() || null,
      ID_AULA: row.idAula?.trim() || null,
      DIA: row.dia.trim() || null,
      HORA_INICIO: toTimeStr(row.horaInicio),
      HORA_FIN: toTimeStr(row.horaFin),
      SALDO: parseSaldoInput(row.saldo),
      ID_GRUPO: row.ID_GRUPO,
      ID_GRUPO_HORARIO: row.ID_GRUPO_HORARIO,
    };
    if (row.ID_HORARIO) {
      input.ID_HORARIO = row.ID_HORARIO.trim();
    }
    return input;
  });
}

function buildHorariosSyncInput(
  matriculaId: string,
  values: Omit<MatriculaFormValues, "horariosSync">,
  rows: HorarioEditRow[],
  deletedIds: string[],
): HorarioMatriculaSyncInput | undefined {
  const syncRows = editRowsToHorarioInputs(rows);
  const hasWork = syncRows.length > 0 || deletedIds.length > 0;
  if (!hasWork) return undefined;

  return {
    matriculaId,
    idCentro: values.ID_CENTRO,
    idCurso: values.ID_CURSO,
    rows: syncRows,
    deletedIds,
  };
}

/**
 * Runs `fn_comprobar_solapamientos` for every schedule row that has a
 * complete day/start/end triplet, aggregating EVERY conflict returned across
 * ALL rows into a single flat array so the caller can dedupe and report them
 * as one complete, coherent batch (never per-row).
 */
async function collectHorarioConflicts(
  checkSolapamientos: (params: {
    idAlumno: string | null;
    idProfesor: string | null;
    idAula: string | null;
    dia: string;
    horaInicio: string;
    horaFin: string;
    idHorarioExcluir?: string | null;
    idGrupo?: string | null;
    idGrupoHorario?: string | null;
  }) => Promise<ScheduleConflict[]>,
  idAlumno: string,
  rows: HorarioMatriculaRowInput[],
): Promise<ScheduleConflict[]> {
  const conflicts: ScheduleConflict[] = [];

  for (const row of rows) {
    if (!row.DIA || !row.HORA_INICIO || !row.HORA_FIN) continue;

    const rowConflicts = await checkSolapamientos({
      idAlumno,
      idProfesor: row.ID_PROFESOR,
      idAula: row.ID_AULA?.trim() || null,
      dia: row.DIA,
      horaInicio: row.HORA_INICIO,
      horaFin: row.HORA_FIN,
      idHorarioExcluir: row.ID_HORARIO ? row.ID_HORARIO.trim() : null,
      idGrupo: row.ID_GRUPO?.trim() || null,
      idGrupoHorario: row.ID_GRUPO_HORARIO?.trim() || null,
    });
    conflicts.push(...rowConflicts);
  }

  return conflicts;
}

function formatScheduleConflict(conflict: ScheduleConflict): string {
  if (conflict.nivel === "Recurrente") {
    return `[Clase Fija - ${conflict.tipo}] ${conflict.motivo} (${conflict.dia ?? "—"}, ${conflict.inicio}-${conflict.fin})`;
  }
  return `[Evento Puntual - ${conflict.tipo}] Ocupado por: ${conflict.motivo} (Fecha: ${conflict.fecha ?? "—"}, ${conflict.inicio}-${conflict.fin})`;
}

/**
 * Renders the FULL, already-aggregated batch of conflicts as a single
 * scrollable, dismissible toast body: maps every conflict to its message,
 * deduplicates the whole batch globally (a conflict pair often gets reported
 * once per side, e.g. teacher + classroom, and would otherwise repeat), and
 * renders the unique messages as a bounded-height list so a large batch of
 * conflicts never overflows the screen.
 */
function renderScheduleConflictsToast(conflicts: ScheduleConflict[]): ReactNode {
  const messages = Array.from(new Set(conflicts.map(formatScheduleConflict)));
  return (
    <ul className="max-h-[50vh] list-disc space-y-1 overflow-y-auto pl-4 pr-1 text-sm">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

function MatriculaHorariosEditableTable({
  rows,
  onChange,
  onRemoveRow,
  especialidades,
  profesores,
  aulas,
}: {
  rows: HorarioEditRow[];
  onChange: (rows: HorarioEditRow[]) => void;
  onRemoveRow: (index: number) => void;
  especialidades: EspecialidadData[];
  profesores: ProfesorData[];
  aulas: AulaData[];
}) {
  const sortedRows = useMemo(() => sortHorarioEditRowsChronologically(rows), [rows]);

  const resolveSourceIndex = (clientKey: string) =>
    rows.findIndex((row) => row.clientKey === clientKey);

  const updateRow = (sourceIndex: number, partial: Partial<HorarioEditRow>) => {
    if (sourceIndex < 0) return;
    onChange(rows.map((row, i) => (i === sourceIndex ? { ...row, ...partial } : row)));
  };

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay horarios. Usa «Añadir Horario» para crear uno.
      </p>
    );
  }

  const especialidadField = (row: HorarioEditRow, index: number, className?: string) => (
    <Select
      value={row.idEspecialidad || NONE_VALUE}
      onValueChange={(v) => updateRow(index, { idEspecialidad: v === NONE_VALUE ? "" : v })}
    >
      <SelectTrigger className={cn("h-9", className)}>
        <SelectValue placeholder="Especialidad" />
      </SelectTrigger>
      <SelectContent className="max-h-[240px] overflow-y-auto">
        <SelectItem value={NONE_VALUE}>— Sin asignar —</SelectItem>
        {especialidades.map((esp) => (
          <SelectItem key={esp.ID_ESPECIALIDAD} value={String(esp.ID_ESPECIALIDAD)}>
            {esp.ESPECIALIDAD}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const profesorField = (row: HorarioEditRow, index: number, className?: string) => (
    <Select
      value={row.idProfesor || NONE_VALUE}
      onValueChange={(v) => updateRow(index, { idProfesor: v === NONE_VALUE ? "" : v })}
    >
      <SelectTrigger className={cn("h-9", className)}>
        <SelectValue placeholder="Profesor" />
      </SelectTrigger>
      <SelectContent className="max-h-[240px] overflow-y-auto">
        <SelectItem value={NONE_VALUE}>— Sin asignar —</SelectItem>
        {profesores.map((profesor) => (
          <SelectItem key={profesor.ID_PROFESOR} value={String(profesor.ID_PROFESOR)}>
            {profesor.NOMBRE_PROFESOR}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const aulaField = (row: HorarioEditRow, index: number, className?: string) => (
    <Select
      value={row.idAula || NONE_VALUE}
      onValueChange={(v) => updateRow(index, { idAula: v === NONE_VALUE ? "" : v })}
    >
      <SelectTrigger className={cn("h-9", className)}>
        <SelectValue placeholder="Aula" />
      </SelectTrigger>
      <SelectContent className="max-h-[240px] overflow-y-auto">
        <SelectItem value={NONE_VALUE}>— Sin asignar —</SelectItem>
        {aulas.map((aula) => (
          <SelectItem key={aula.ID_AULA} value={String(aula.ID_AULA)}>
            {aula.NOMBRE_AULA}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const saldoField = (row: HorarioEditRow, index: number, className?: string) => (
    <Input
      type="number"
      inputMode="decimal"
      step="any"
      value={row.saldo}
      onChange={(e) => updateRow(index, { saldo: e.target.value })}
      className={cn("h-9", className)}
      placeholder="—"
    />
  );

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {sortedRows.map((row) => {
          const sourceIndex = resolveSourceIndex(row.clientKey);
          if (sourceIndex < 0) return null;

          return (
          <div key={row.clientKey} className="space-y-3 rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Especialidad</Label>
                {especialidadField(row, sourceIndex, "w-full")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-5 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemoveRow(sourceIndex)}
                aria-label="Eliminar horario"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Día</Label>
                <Select
                  value={row.dia || NONE_VALUE}
                  onValueChange={(v) => updateRow(sourceIndex, { dia: v === NONE_VALUE ? "" : v })}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Día" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— Día —</SelectItem>
                    {DIAS_SEMANA_OPCIONES.map((dia) => (
                      <SelectItem key={dia} value={dia}>
                        {dia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Inicio</Label>
                <Input
                  type="time"
                  value={row.horaInicio}
                  onChange={(e) => updateRow(sourceIndex, { horaInicio: e.target.value })}
                  className="h-9 w-full"
                  aria-label="Hora inicio"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fin</Label>
                <Input
                  type="time"
                  value={row.horaFin}
                  onChange={(e) => updateRow(sourceIndex, { horaFin: e.target.value })}
                  className="h-9 w-full"
                  aria-label="Hora fin"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Profesor</Label>
                {profesorField(row, sourceIndex, "w-full")}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Aula</Label>
                {aulaField(row, sourceIndex, "w-full")}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Saldo</Label>
              {saldoField(row, sourceIndex, "w-full")}
            </div>
          </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Especialidad</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Profesor</TableHead>
              <TableHead>Aula</TableHead>
              <TableHead className="w-[100px]">Saldo</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => {
              const sourceIndex = resolveSourceIndex(row.clientKey);
              if (sourceIndex < 0) return null;

              return (
              <TableRow key={row.clientKey}>
                <TableCell className="align-top">
                  {especialidadField(row, sourceIndex, "w-full min-w-[140px]")}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex w-[140px] flex-col gap-2">
                    <Select
                      value={row.dia || NONE_VALUE}
                      onValueChange={(v) =>
                        updateRow(sourceIndex, { dia: v === NONE_VALUE ? "" : v })
                      }
                    >
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder="Día" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>— Día —</SelectItem>
                        {DIAS_SEMANA_OPCIONES.map((dia) => (
                          <SelectItem key={dia} value={dia}>
                            {dia}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="time"
                      value={row.horaInicio}
                      onChange={(e) => updateRow(sourceIndex, { horaInicio: e.target.value })}
                      className="h-9 w-full"
                      aria-label="Hora inicio"
                    />
                    <Input
                      type="time"
                      value={row.horaFin}
                      onChange={(e) => updateRow(sourceIndex, { horaFin: e.target.value })}
                      className="h-9 w-full"
                      aria-label="Hora fin"
                    />
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  {profesorField(row, sourceIndex, "w-full min-w-[120px]")}
                </TableCell>
                <TableCell className="align-top">
                  {aulaField(row, sourceIndex, "w-full min-w-[120px]")}
                </TableCell>
                <TableCell className="align-top">{saldoField(row, sourceIndex, "w-full")}</TableCell>
                <TableCell className="align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveRow(sourceIndex)}
                    aria-label="Eliminar horario"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function MatriculaHorariosEditablePanel({
  rows,
  onChange,
  onAddRow,
  onRemoveRow,
  especialidades,
  profesores,
  aulas,
  maxHorarios,
}: {
  rows: HorarioEditRow[];
  onChange: (rows: HorarioEditRow[]) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  especialidades: EspecialidadData[];
  profesores: ProfesorData[];
  aulas: AulaData[];
  maxHorarios?: number | null;
}) {
  const [isSchedulesOpen, setIsSchedulesOpen] = useState(true);

  return (
    <div className="border-t pt-4">
      <div className="mb-3 flex items-center gap-1">
        <p className="text-xs text-muted-foreground">
          {formatHorarioLimitLabel(rows.length, maxHorarios)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground"
          aria-expanded={isSchedulesOpen}
          aria-label={isSchedulesOpen ? "Ocultar horarios" : "Ver horarios"}
          onClick={() => setIsSchedulesOpen((open) => !open)}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", isSchedulesOpen && "rotate-180")}
          />
        </Button>
      </div>
      {isSchedulesOpen && (
        <>
          <div className="rounded-md border bg-muted/10 p-2">
            <MatriculaHorariosEditableTable
              rows={rows}
              onChange={onChange}
              onRemoveRow={onRemoveRow}
              especialidades={especialidades}
              profesores={profesores}
              aulas={aulas}
            />
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onAddRow}>
            <Plus className="mr-2 h-4 w-4" />
            Añadir Horario
          </Button>
        </>
      )}
    </div>
  );
}

function MatriculasPage() {
  const { matriculaId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { rol, tenantId } = useActiveTenant();
  const canWrite = canWriteUi(rol, "matriculas:write");
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update, syncHorarios, remove, invalidateList, checkSolapamientos } =
    useMatriculas(filterCenterId);
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

  const matriculas = useMemo(() => list.data?.rows ?? [], [list.data?.rows]);
  const especialidadById = useMemo(
    () => list.data?.especialidadById ?? new Map<string, string>(),
    [list.data?.especialidadById],
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
      toast.error(err instanceof Error ? err.message : "Error al cambiar el estado.");
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
      toast.error(err instanceof Error ? err.message : "Error al actualizar el estado del horario.");
    } finally {
      setTogglingHorarioId(null);
    }
  };

  const handleCloseViewing = () => {
    setViewing(null);
    navigate({ search: (prev) => ({ ...prev, matriculaId: undefined }), replace: true });
  };

  useEffect(() => {
    if (matriculaId && matriculas.length > 0) {
      const target = matriculas.find((m) => m.ID_MATRICULA === matriculaId);
      if (target) setViewing(target);
    }
  }, [matriculaId, matriculas]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Matrículas Académicas"
        description={`${matriculas.length} matrículas registradas en el sistema`}
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva matrícula
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="mb-4 grid w-full grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="relative sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por alumno, especialidad, profesor o estado..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="matriculas-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
          <Select
            value={filtroCurso || "__all__"}
            onValueChange={(v) => setFiltroCurso(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Curso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Curso</SelectItem>
              {cursoFilterOptions.map((curso) => (
                <SelectItem key={curso.id} value={curso.id}>
                  {curso.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filtroEspecialidad || "__all__"}
            onValueChange={(v) => setFiltroEspecialidad(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Especialidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Especialidad</SelectItem>
              {especialidadFilterOptions.map((especialidad) => (
                <SelectItem key={especialidad.id} value={especialidad.id}>
                  {especialidad.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filtroEstado || "__all__"}
            onValueChange={(v) => setFiltroEstado(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Estado</SelectItem>
              {MATRICULA_ESTADO_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex h-10 items-center gap-2.5 rounded-md border border-input bg-background px-3 shadow-sm">
            <Switch
              id="matriculas-filter-incomplete"
              checked={filterIncomplete}
              onCheckedChange={setFilterIncomplete}
            />
            <Label
              htmlFor="matriculas-filter-incomplete"
              className="flex cursor-pointer select-none items-center gap-1.5 text-sm font-medium leading-none text-foreground"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
              <span className="truncate">Ver horarios incompletos</span>
            </Label>
          </div>
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error al obtener matrículas: {(list.error as Error)?.message}
          </div>
        )}

        <div className="w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
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
                  <TableCell colSpan={MATRICULA_TABLE_COL_COUNT} className="py-10 text-center text-muted-foreground">
                    {hasActiveFilters
                      ? "Sin resultados para los filtros aplicados."
                      : "No hay ninguna matrícula registrada."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => {
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
                        <TableCell
                          className={MATRICULA_LIST_COL.alumno}
                          onClick={(e) => e.stopPropagation()}
                        >
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
                        <TableCell
                          className={MATRICULA_LIST_COL.profesor}
                          onClick={(e) => e.stopPropagation()}
                        >
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
                            <TableCell colSpan={MATRICULA_TABLE_COL_COUNT} className="px-6 py-4 text-sm text-muted-foreground">
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
                })
              )}
            </TableBody>
          </Table>
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
          submitting={create.isPending || syncHorarios.isPending}
          onSubmit={async (values) => {
            try {
              const { horariosSync, ...patch } = values;

              if (horariosSync && horariosSync.rows.length > 0) {
                const conflicts = await collectHorarioConflicts(
                  checkSolapamientos,
                  values.ID_ALUMNO,
                  horariosSync.rows,
                );
                if (conflicts.length > 0) {
                  toast.error("No se puede guardar: horario en conflicto", {
                    description: renderScheduleConflictsToast(conflicts),
                    duration: Infinity,
                    closeButton: true,
                  });
                  return;
                }
              }

              const created = await create.mutateAsync(patch);
              const matriculaId = created?.ID_MATRICULA;
              if (!matriculaId) {
                throw new Error("No se pudo obtener el ID de la matrícula creada.");
              }
              if (horariosSync) {
                await syncHorarios.mutateAsync({
                  ...horariosSync,
                  matriculaId,
                });
              }
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
      {editing ? (
        <MatriculaFormDialog
          key={editing.ID_MATRICULA}
          open
          onClose={() => setEditing(null)}
          title="Modificar Matrícula"
          submitLabel="Guardar Cambios"
          initial={editing}
          submitting={update.isPending || syncHorarios.isPending}
          onSubmit={async (values) => {
            try {
              const { horariosSync, ...patch } = values;

              if (horariosSync && horariosSync.rows.length > 0) {
                const conflicts = await collectHorarioConflicts(
                  checkSolapamientos,
                  values.ID_ALUMNO,
                  horariosSync.rows,
                );
                if (conflicts.length > 0) {
                  toast.error("No se puede guardar: horario en conflicto", {
                    description: renderScheduleConflictsToast(conflicts),
                    duration: Infinity,
                    closeButton: true,
                  });
                  return;
                }
              }

              await update.mutateAsync({ id: editing.ID_MATRICULA, patch });
              if (horariosSync) {
                await syncHorarios.mutateAsync(horariosSync);
              }
              invalidateList();
              toast.success("Matrícula actualizada correctamente");
              setEditing(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al actualizar");
            }
          }}
        />
      ) : null}

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
              {horarioStatusConfirming && isMatriculaActiva(horarioStatusConfirming.currentEstado) ? (
                <>
                  Atención: Esto dará de baja al alumno del grupo asociado (si lo hay) y eliminará de
                  forma irreversible todas sus sesiones programadas en el calendario desde el día de
                  hoy.
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
                : horarioStatusConfirming && isMatriculaActiva(horarioStatusConfirming.currentEstado)
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: MatriculaRow | null;
  submitting: boolean;
  onSubmit: (values: MatriculaFormValues) => void;
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
  const [horarioRows, setHorarioRows] = useState<HorarioEditRow[]>(() => seedFormState().horarioRows);
  const [deletedHorarioIds, setDeletedHorarioIds] = useState<string[]>([]);

  const cursoOptions = useMemo(() => cursosForCentro(centros, idCentro), [centros, idCentro]);
  const maxHorarios = useMemo(() => {
    if (!idTarifa) return null;
    return tarifas.find((tarifa) => tarifa.ID_TARIFA === idTarifa)?.SESIONES_SEMANALES ?? null;
  }, [idTarifa, tarifas]);

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
    setDeletedHorarioIds([]);
    setHorarioRows(next.horarioRows);
  }, [open, editingKey, formReady, centros, initial]);

  const removeHorarioRow = (index: number) => {
    const row = horarioRows[index];
    if (row?.ID_HORARIO) {
      setDeletedHorarioIds((prev) => [...prev, row.ID_HORARIO!]);
    }
    setHorarioRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addHorarioRow = () => {
    setHorarioRows((prev) => [...prev, createEmptyHorarioRow(especialidad)]);
  };

  const matriculaIdForSync = initial?.ID_MATRICULA ?? "";

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
            const horariosSync = buildHorariosSyncInput(
              matriculaIdForSync,
              {
                ID_ALUMNO: idAlumno.trim(),
                ID_CENTRO: idCentro || null,
                ID_CURSO: idCurso || null,
                ID_TARIFA: idTarifa || null,
                ESPECIALIDAD: especialidad || null,
                ESTADO: estado || null,
                FECHA_ALTA: fechaAlta || null,
                FECHA_BAJA: fechaBaja || null,
                ID_PROFESOR: idProfesor || null,
              },
              horarioRows,
              deletedHorarioIds,
            );
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
              ...(horariosSync ? { horariosSync } : {}),
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
                          <SelectItem
                            key={alumno.ID_ALUMNO}
                            value={String(alumno.ID_ALUMNO)}
                          >
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
                        <SelectItem
                          key={esp.ID_ESPECIALIDAD}
                          value={String(esp.ID_ESPECIALIDAD)}
                        >
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
                      <SelectItem
                        key={profesor.ID_PROFESOR}
                        value={String(profesor.ID_PROFESOR)}
                      >
                        {profesor.NOMBRE_PROFESOR}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <MatriculaHorariosEditablePanel
                rows={horarioRows}
                onChange={setHorarioRows}
                onAddRow={addHorarioRow}
                onRemoveRow={removeHorarioRow}
                especialidades={especialidades}
                profesores={profesores}
                aulas={aulas}
                maxHorarios={maxHorarios}
              />
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
