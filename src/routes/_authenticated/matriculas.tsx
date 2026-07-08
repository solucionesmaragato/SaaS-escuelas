import { createFileRoute } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
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
} from "@/hooks/useMatriculas";
import type { HorarioMatricula } from "@/types/database";
import { cn } from "@/lib/utils";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useMatriculas } from "@/hooks/useMatriculas";
import { useAlumnos } from "@/hooks/useAlumnos";
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

type HorarioEditRow = {
  clientKey: string;
  ID_HORARIO: string | null;
  idEspecialidad: string;
  idProfesor: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  saldo: string;
};

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
      ? (initial.HORARIOS_MATRICULAS ?? []).map((horario) => horarioToEditRow(horario, initial))
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
}: {
  matricula: MatriculaRow;
  especialidadById: Map<string, string>;
  onRowClick?: () => void;
}) {
  const horarios = matricula.HORARIOS_MATRICULAS ?? [];

  if (horarios.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Esta matrícula no tiene horarios registrados.</p>
    );
  }

  return (
    <>
      <div className="space-y-2 sm:hidden">
        {horarios.map((horario) => (
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
              <span className="text-muted-foreground">
                {horario.SALDO != null ? horario.SALDO : "—"}
              </span>
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
              <TableHead>Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {horarios.map((horario) => (
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
    idEspecialidad: selectId(horario.ID_ESPECIALIDAD ?? matricula.ESPECIALIDAD),
    idProfesor: selectId(horario.ID_PROFESOR),
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
    idEspecialidad: defaultEspecialidad,
    idProfesor: "",
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

function editRowsToHorarioInputs(rows: HorarioEditRow[]): HorarioMatriculaRowInput[] {
  return rows.map((row) => {
    const input: HorarioMatriculaRowInput = {
      ID_PROFESOR: row.idProfesor.trim() || null,
      DIA: row.dia.trim() || null,
      HORA_INICIO: toTimeStr(row.horaInicio),
      HORA_FIN: toTimeStr(row.horaFin),
      SALDO: parseSaldoInput(row.saldo),
    };
    if (row.ID_HORARIO) {
      input.ID_HORARIO = row.ID_HORARIO;
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

function MatriculaHorariosEditableTable({
  rows,
  onChange,
  onRemoveRow,
  especialidades,
  profesores,
}: {
  rows: HorarioEditRow[];
  onChange: (rows: HorarioEditRow[]) => void;
  onRemoveRow: (index: number) => void;
  especialidades: EspecialidadData[];
  profesores: ProfesorData[];
}) {
  const updateRow = (index: number, partial: Partial<HorarioEditRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...partial } : row)));
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
        {rows.map((row, index) => (
          <div key={row.clientKey} className="space-y-3 rounded-md border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Especialidad</Label>
                {especialidadField(row, index, "w-full")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-5 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemoveRow(index)}
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
                  onValueChange={(v) => updateRow(index, { dia: v === NONE_VALUE ? "" : v })}
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
                  onChange={(e) => updateRow(index, { horaInicio: e.target.value })}
                  className="h-9 w-full"
                  aria-label="Hora inicio"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fin</Label>
                <Input
                  type="time"
                  value={row.horaFin}
                  onChange={(e) => updateRow(index, { horaFin: e.target.value })}
                  className="h-9 w-full"
                  aria-label="Hora fin"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Profesor</Label>
                {profesorField(row, index, "w-full")}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Saldo</Label>
                {saldoField(row, index, "w-full")}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Especialidad</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead>Profesor</TableHead>
              <TableHead className="w-[100px]">Saldo</TableHead>
              <TableHead className="w-[52px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.clientKey}>
                <TableCell className="align-top">
                  {especialidadField(row, index, "w-full min-w-[140px]")}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex w-[140px] flex-col gap-2">
                    <Select
                      value={row.dia || NONE_VALUE}
                      onValueChange={(v) => updateRow(index, { dia: v === NONE_VALUE ? "" : v })}
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
                      onChange={(e) => updateRow(index, { horaInicio: e.target.value })}
                      className="h-9 w-full"
                      aria-label="Hora inicio"
                    />
                    <Input
                      type="time"
                      value={row.horaFin}
                      onChange={(e) => updateRow(index, { horaFin: e.target.value })}
                      className="h-9 w-full"
                      aria-label="Hora fin"
                    />
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  {profesorField(row, index, "w-full min-w-[120px]")}
                </TableCell>
                <TableCell className="align-top">{saldoField(row, index, "w-full")}</TableCell>
                <TableCell className="align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveRow(index)}
                    aria-label="Eliminar horario"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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
}: {
  rows: HorarioEditRow[];
  onChange: (rows: HorarioEditRow[]) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  especialidades: EspecialidadData[];
  profesores: ProfesorData[];
}) {
  return (
    <div className="border-t pt-4">
      <h4 className="mb-3 text-sm font-semibold">Horarios de matrícula</h4>
      <div className="rounded-md border bg-muted/10 p-2">
        <MatriculaHorariosEditableTable
          rows={rows}
          onChange={onChange}
          onRemoveRow={onRemoveRow}
          especialidades={especialidades}
          profesores={profesores}
        />
      </div>
      <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onAddRow}>
        <Plus className="mr-2 h-4 w-4" />
        Añadir Horario
      </Button>
    </div>
  );
}

function MatriculasPage() {
  const { matriculaId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { rol } = useActiveTenant();
  const canWrite = canWriteUi(rol, "matriculas:write");
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update, syncHorarios, remove, invalidateList } =
    useMatriculas(filterCenterId);
  const { list: tarifasList } = useTarifas();

  const tarifaById = useMemo(
    () => new Map(asArray<TarifaData>(tarifasList.data).map((t) => [t.ID_TARIFA, t.SERVICIO])),
    [tarifasList.data],
  );

  const [query, setQuery] = useState("");
  const [filtroCurso, setFiltroCurso] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [editing, setEditing] = useState<MatriculaRow | null>(null);
  const [viewing, setViewing] = useState<MatriculaRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
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

  const filtered = useMemo(() => {
    let rows = matriculas;
    if (filtroCurso) {
      rows = rows.filter((m) => m.ID_CURSO === filtroCurso);
    }
    if (filtroEstado) {
      rows = rows.filter((m) => normalizeMatriculaEstado(m.ESTADO) === filtroEstado);
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
  }, [matriculas, query, filtroCurso, filtroEstado]);

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
        <div className="mb-4 grid w-full grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
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
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error al obtener matrículas: {(list.error as Error)?.message}
          </div>
        )}

        <div className="w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Alumno</TableHead>
                <TableHead className="hidden sm:table-cell">Especialidad</TableHead>
                <TableHead className="hidden md:table-cell">Profesor Asignado</TableHead>
                <TableHead className="w-[110px] min-w-[110px] text-center">Estado</TableHead>
                <TableHead className="hidden sm:table-cell">Fecha Alta</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {query
                      ? "Sin resultados para tu búsqueda."
                      : "No hay ninguna matrícula registrada."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((m) => {
                  const isExpanded = expandedIds.has(m.ID_MATRICULA);
                  const horarios = m.HORARIOS_MATRICULAS ?? [];

                  return (
                    <Fragment key={m.ID_MATRICULA}>
                      <TableRow
                        className="cursor-pointer"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpanded(m.ID_MATRICULA)}
                      >
                        <TableCell className="w-10 px-2">
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              isExpanded && "rotate-180",
                            )}
                            aria-hidden
                          />
                        </TableCell>
                        <TableCell className="font-medium" onClick={(e) => e.stopPropagation()}>
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
                        <TableCell className="hidden sm:table-cell">
                          {m.ESPECIALIDADES?.ESPECIALIDAD ?? (
                            <span className="text-muted-foreground text-xs font-mono">
                              {m.ESPECIALIDAD || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-sm md:table-cell" onClick={(e) => e.stopPropagation()}>
                          {m.PROFESOR?.NOMBRE_PROFESOR ? (
                            <EntityLink type="profesor" id={m.ID_PROFESOR}>
                              {m.PROFESOR.NOMBRE_PROFESOR}
                            </EntityLink>
                          ) : (
                            <span className="text-muted-foreground">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="w-[110px] min-w-[110px] text-center align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="cursor-pointer focus:outline-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm("¿Seguro que desea eliminar...?")) {
                                const newEstado =
                                  normalizeMatriculaEstado(m.ESTADO) === "Activo"
                                    ? "Inactivo"
                                    : "Activo";
                                update
                                  .mutateAsync({ id: m.ID_MATRICULA, patch: { ESTADO: newEstado } })
                                  .then(() => invalidateList())
                                  .catch((err) =>
                                    toast.error(
                                      err instanceof Error ? err.message : "Error al actualizar estado",
                                    ),
                                  );
                              }
                            }}
                          >
                            <MatriculaEstadoBadge estado={m.ESTADO} />
                          </button>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {m.FECHA_ALTA ?? "—"}
                          </div>
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
                      {isExpanded && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={7} className="p-0">
                            {horarios.length === 0 ? (
                              <p className="px-6 py-4 text-sm text-muted-foreground">
                                Esta matrícula no tiene horarios registrados.
                              </p>
                            ) : (
                              <div className="border-t bg-muted/10 px-4 py-3">
                                <MatriculaHorariosTable
                                  matricula={m}
                                  especialidadById={especialidadById}
                                  onRowClick={() => setViewing(m)}
                                />
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
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
  const { list: tarifasList } = useTarifas();
  const { list: centrosList } = useCentros();

  const alumnos = asArray<Alumno>(alumnosList.data);
  const especialidades = asArray<EspecialidadData>(especialidadesList.data);
  const profesores = resolveProfesoresList(profesoresList.data);
  const tarifas = asArray<TarifaData>(tarifasList.data);
  const centros = asArray<CentroData>(centrosList.data);

  const lookupsLoading =
    (alumnosList.isLoading && !alumnosList.data) ||
    (especialidadesList.isLoading && !especialidadesList.data) ||
    (profesoresList.isLoading && !profesoresList.data) ||
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
