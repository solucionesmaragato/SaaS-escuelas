/* eslint-disable react-refresh/only-export-components -- large form module with shared helpers */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  alumnoFormSchema,
  alumnoRecordToFormValues,
  calcEdad,
  emptyAlumnoFormValues,
  type AlumnoFormInput,
  type AlumnoFormValues,
} from "@/lib/alumnoSchema";
import type { AlumnoTree, MatriculaTree } from "@/hooks/useAlumnosTree";
import type { HorarioCreateInput, HorarioUpdateInput } from "@/hooks/useAlumnosTree";
import { useAlumnoMatriculas } from "@/hooks/useAlumnoMatriculas";
import { useMatriculas } from "@/hooks/useMatriculas";
import {
  useCargosExtra,
  calcCargoExtraTotal,
  calcCargoExtraRowTotal,
  cargoExtraEstadoStatus,
  formatCargoExtraFecha,
  canEditCargoExtraRole,
  type CargoExtraRow,
} from "@/hooks/useCargosExtra";
import { CargoExtraDetailDialog } from "@/components/alumnos/CargoExtraDetailDialog";
import { useActiveTenant } from "@/context/AppContext";
import { formatCurrency } from "@/lib/format";
import type { CentroData } from "@/hooks/useCentros";
import type { Matricula } from "@/types/database";
import {
  cursosForCentro,
  formatCursoNombre,
  getActiveCursoIdsForCentro,
  resolveCursoIdForCentro,
} from "@/lib/matriculaCursoUtils";
import { countGrupoAlumnos, type GrupoHorarioSlot } from "@/hooks/useGruposHorarios";
import { SepaMandatoBlock } from "@/components/alumnos/SepaMandatoBlock";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  METODOS_PAGO_OPCIONES,
  collectBizumPhoneOptions,
  isBankRemittancePaymentMethod,
  isBizumPaymentMethod,
  normalizeMetodoPago,
  type MetodoPagoOption,
} from "@/lib/alumnoPaymentUtils";

function resolveMetodoPagoSelectValue(value: string | null | undefined): string {
  const normalized = normalizeMetodoPago(value);
  if (!normalized) return "__unset__";
  return normalized;
}

function canAddCargoExtraRole(rol: string | null | undefined): boolean {
  return canEditCargoExtraRole(rol);
}

function formatCentroNombre(
  idCentro: string | null | undefined,
  centroNombreById: Map<string, string>,
): string {
  const id = idCentro?.trim();
  if (!id) return "—";
  return centroNombreById.get(id) ?? id;
}

function buildAlumnoFormResetValues(alumno: AlumnoTree): AlumnoFormValues {
  return alumnoRecordToFormValues(alumno);
}

function estadoSelectCurrentValue(value: string | null | undefined): string {
  const current = value?.trim() ?? "";
  if (!current) return "__unset__";
  return current;
}

function resolveEstadoSelectValue(value: string | null | undefined): string {
  return estadoSelectCurrentValue(value);
}

function estadoSelectOptions(
  value: string | null | undefined,
  options: readonly string[],
): Array<{ value: string; label: string }> {
  const current = value?.trim() ?? "";
  const base = options.map((opt) => ({ value: opt, label: opt }));
  if (current && !options.includes(current)) {
    return [{ value: current, label: current }, ...base];
  }
  return base;
}

type LookupMaps = {
  profesorById: Map<string, string>;
  aulaById: Map<string, string>;
  tarifaById: Map<string, string>;
  especialidadById: Map<string, string>;
};

type SelectOption = { id: string; label: string };

type SelectOptions = {
  especialidades: SelectOption[];
  tarifas: SelectOption[];
  profesores: SelectOption[];
};

function profesorSelectOptions(
  options: SelectOption[],
  selectedId: string | undefined | null,
  profesorById: Map<string, string>,
): SelectOption[] {
  const id = selectedId?.trim();
  if (!id || options.some((option) => option.id === id)) return options;
  const name = profesorById.get(id);
  if (!name) return options;
  return [{ id, label: `${name} (Inactivo)` }, ...options];
}

const MATRICULA_ESTADOS = ["Activo", "Inactivo"] as const;
const ESTADO_OPCIONES = ["Cobrar", "Pagado", "Devolver"] as const;

function normalizeMatriculaEstado(
  estado: string | null | undefined,
): (typeof MATRICULA_ESTADOS)[number] {
  return estado?.trim().toLowerCase() === "inactivo" ? "Inactivo" : "Activo";
}

function formatHorarioLimitLabel(current: number, max: number | null | undefined): string {
  const maxLabel = max != null ? String(max) : "—";
  return `Horarios asignados: ${current} / ${maxLabel}`;
}

const TIPO_CLASE_OPCIONES = ["Individual", "Colectiva"] as const;
const TIPO_SESION_OPCIONES = ["Incluida", "Extra"] as const;
const DIAS_SEMANA_OPCIONES = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

type HorarioFormState = {
  idEspecialidad: string;
  tipoClase: (typeof TIPO_CLASE_OPCIONES)[number];
  tipoSesion: (typeof TIPO_SESION_OPCIONES)[number];
  idGrupo: string;
  dia: string;
  horaInicio: string;
  horaFin: string;
  duracion: string;
  idProfesor: string;
  idAula: string;
  precio: string;
  faltasRecuperables: string;
  faltasNoRecuperables: string;
  recuperaciones: string;
  saldo: string;
};

function normalizeTipoClase(
  value: string | null | undefined,
): (typeof TIPO_CLASE_OPCIONES)[number] {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "colectiva" || v === "grupo") return "Colectiva";
  return "Individual";
}

function normalizeTipoSesion(
  value: string | null | undefined,
): (typeof TIPO_SESION_OPCIONES)[number] {
  return value?.trim().toLowerCase() === "extra" ? "Extra" : "Incluida";
}

function parseHorarioNum(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function timeToMinutes(time: string): number | null {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const base = timeToMinutes(time);
  if (base == null) return "";
  return minutesToTime(base + minutes);
}

function durationMinutesBetween(start: string, end: string): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null || e < s) return null;
  return e - s;
}

function createEmptyHorarioFormState(defaults?: {
  idProfesor?: string | null;
  idEspecialidad?: string | null;
}): HorarioFormState {
  return horarioToFormState(null, defaults);
}

function horarioToFormState(
  horario: MatriculaTree["HORARIOS_MATRICULAS"][number] | null,
  defaults?: { idProfesor?: string | null; idEspecialidad?: string | null },
): HorarioFormState {
  const horaInicio = horario?.HORA_INICIO?.slice(0, 5) ?? "";
  const horaFin = horario?.HORA_FIN?.slice(0, 5) ?? "";
  const duracionFromDb =
    horario?.DURACION != null
      ? String(horario.DURACION)
      : horaInicio && horaFin
        ? String(durationMinutesBetween(horaInicio, horaFin) ?? "")
        : "";

  return {
    idEspecialidad: horario?.ID_ESPECIALIDAD ?? defaults?.idEspecialidad ?? "",
    tipoClase: normalizeTipoClase(horario?.TIPO_CLASE),
    tipoSesion: normalizeTipoSesion(horario?.TIPO_SESION),
    idGrupo: horario?.ID_GRUPO ?? "",
    dia: horario?.DIA ?? "",
    horaInicio,
    horaFin,
    duracion: duracionFromDb,
    idProfesor: horario?.ID_PROFESOR ?? defaults?.idProfesor ?? "",
    idAula: horario?.ID_AULA ?? "",
    precio: horario?.PRECIO != null ? String(horario.PRECIO) : "",
    faltasRecuperables:
      horario?.FALTAS_RECUPERABLES != null ? String(horario.FALTAS_RECUPERABLES) : "",
    faltasNoRecuperables:
      horario?.FALTAS_NO_RECUPERABLES != null ? String(horario.FALTAS_NO_RECUPERABLES) : "",
    recuperaciones: horario?.RECUPERACIONES != null ? String(horario.RECUPERACIONES) : "",
    saldo: horario?.SALDO != null ? String(horario.SALDO) : "",
  };
}

function buildCommonHorarioPatch(state: HorarioFormState): HorarioUpdateInput {
  return {
    ID_ESPECIALIDAD: state.idEspecialidad || null,
    TIPO_CLASE: state.tipoClase,
    TIPO_SESION: state.tipoSesion,
    PRECIO: parseHorarioNum(state.precio),
    FALTAS_RECUPERABLES: parseHorarioNum(state.faltasRecuperables),
    FALTAS_NO_RECUPERABLES: parseHorarioNum(state.faltasNoRecuperables),
    RECUPERACIONES: parseHorarioNum(state.recuperaciones),
    SALDO: parseHorarioNum(state.saldo),
  };
}

function slotToHorarioPatch(
  slot: GrupoHorarioSlot,
  idGrupo: string,
  common: HorarioUpdateInput,
): HorarioUpdateInput {
  return {
    ...common,
    ID_GRUPO: idGrupo,
    ID_GRUPO_HORARIO: slot.ID_GRUPO_HORARIO,
    DIA: slot.DIA_SEMANA ?? null,
    HORA_INICIO: slot.HORA_INICIO ?? null,
    HORA_FIN: slot.HORA_FIN ?? null,
    ID_PROFESOR: slot.ID_PROFESOR ?? null,
    ID_AULA: slot.ID_AULA ?? null,
    DURACION:
      slot.HORA_INICIO && slot.HORA_FIN
        ? durationMinutesBetween(slot.HORA_INICIO.slice(0, 5), slot.HORA_FIN.slice(0, 5))
        : null,
  };
}

function individualToHorarioPatch(
  state: HorarioFormState,
  common: HorarioUpdateInput,
): HorarioUpdateInput {
  return {
    ...common,
    ID_GRUPO: null,
    ID_GRUPO_HORARIO: null,
    DIA: state.dia || null,
    HORA_INICIO: state.horaInicio ? `${state.horaInicio}:00` : null,
    HORA_FIN: state.horaFin ? `${state.horaFin}:00` : null,
    DURACION: parseHorarioNum(state.duracion),
    ID_PROFESOR: state.idProfesor || null,
    ID_AULA: state.idAula || null,
  };
}

type ScheduleOccupancySlot = {
  dia: string;
  horaInicio: string;
  horaFin: string;
  idProfesor: string | null;
  idAula: string | null;
};

function schedulesTimeOverlap(
  diaA: string,
  startA: string,
  endA: string,
  diaB: string,
  startB: string,
  endB: string,
): boolean {
  if (diaA.trim().toLowerCase() !== diaB.trim().toLowerCase()) return false;
  const sA = timeToMinutes(startA.slice(0, 5));
  const eA = timeToMinutes(endA.slice(0, 5));
  const sB = timeToMinutes(startB.slice(0, 5));
  const eB = timeToMinutes(endB.slice(0, 5));
  if (sA == null || eA == null || sB == null || eB == null) return false;
  return sA < eB && sB < eA;
}

function isHorarioScheduleActivo(estado: string | null | undefined): boolean {
  const normalized = estado?.trim().toLowerCase() ?? "";
  return normalized === "activo" || normalized === "activa";
}

type HorarioScheduleEstadoSource = {
  ESTADO?: string | null;
  ESTADO_MATRICULA?: string | null;
};

function resolveHorarioScheduleEstado(
  horario: HorarioScheduleEstadoSource,
): string | null | undefined {
  return horario.ESTADO ?? horario.ESTADO_MATRICULA;
}

function hasStudentScheduleOverlap(
  dia: string,
  horaInicio: string,
  horaFin: string,
  studentHorarios: MatriculaTree["HORARIOS_MATRICULAS"],
  excludeHorarioId?: string | null,
  options?: {
    idGrupoHorario?: string | null;
    idSesionExcluir?: string | null;
    alumnoId?: string | null;
    sesiones?: SesionOccupancyRow[];
    fechaExacta?: string | null;
  },
): boolean {
  if (!dia.trim() || !horaInicio || !horaFin) return false;

  for (const horario of studentHorarios) {
    if (excludeHorarioId && horario.ID_HORARIO === excludeHorarioId) continue;
    if (isSameGrupoHorarioPeer(horario, options?.idGrupoHorario)) continue;
    if (!isHorarioScheduleActivo(resolveHorarioScheduleEstado(horario))) continue;
    if (
      schedulesTimeOverlap(
        dia,
        horaInicio,
        horaFin,
        horario.DIA ?? "",
        horario.HORA_INICIO ?? "",
        horario.HORA_FIN ?? "",
      )
    ) {
      return true;
    }
  }

  const alumnoId = options?.alumnoId?.trim();
  if (!alumnoId || !options?.fechaExacta?.trim()) return false;

  for (const sesion of options?.sesiones ?? []) {
    if (options.idSesionExcluir && sesion.ID_SESION === options.idSesionExcluir) continue;
    if (sesion.ID_ALUMNO?.trim() !== alumnoId) continue;
    if (isSameGrupoHorarioSesionPeer(sesion, options.idGrupoHorario)) continue;
    if (!isSesionOccupancyActiva(sesion.ESTADO)) continue;
    if (
      sesionMatchesCheck(sesion, {
        dia,
        horaInicio,
        horaFin,
        fechaExacta: options.fechaExacta,
      })
    ) {
      return true;
    }
  }

  return false;
}

function hasScheduleResourceConflict(
  dia: string,
  horaInicio: string,
  horaFin: string,
  idProfesor: string,
  idAula: string,
  existingSlots: ScheduleOccupancySlot[],
): boolean {
  if (!dia.trim() || !horaInicio || !horaFin) return false;
  if (!idProfesor && !idAula) return false;

  for (const slot of existingSlots) {
    if (!schedulesTimeOverlap(dia, horaInicio, horaFin, slot.dia, slot.horaInicio, slot.horaFin)) {
      continue;
    }
    const profesorConflict = !!idProfesor && !!slot.idProfesor && idProfesor === slot.idProfesor;
    const aulaConflict = !!idAula && !!slot.idAula && idAula === slot.idAula;
    if (profesorConflict || aulaConflict) return true;
  }

  return false;
}

export function isIndividualHorarioForOccupancy(horario: MatriculaHorario): boolean {
  if (!isHorarioScheduleActivo(resolveHorarioScheduleEstado(horario))) return false;
  if (horario.ID_GRUPO_HORARIO?.trim()) return false;
  return normalizeTipoClase(horario.TIPO_CLASE) === "Individual";
}

function buildScheduleOccupancySlots(
  grupoSlots: GrupoHorarioSlot[],
  horarios: MatriculaTree["HORARIOS_MATRICULAS"],
): ScheduleOccupancySlot[] {
  const slots: ScheduleOccupancySlot[] = [];

  for (const grupoSlot of grupoSlots) {
    slots.push({
      dia: grupoSlot.DIA_SEMANA ?? "",
      horaInicio: grupoSlot.HORA_INICIO ?? "",
      horaFin: grupoSlot.HORA_FIN ?? "",
      idProfesor: grupoSlot.ID_PROFESOR ?? null,
      idAula: grupoSlot.ID_AULA ?? null,
    });
  }

  for (const horario of horarios) {
    slots.push({
      dia: horario.DIA ?? "",
      horaInicio: horario.HORA_INICIO ?? "",
      horaFin: horario.HORA_FIN ?? "",
      idProfesor: horario.ID_PROFESOR ?? null,
      idAula: horario.ID_AULA ?? null,
    });
  }

  return slots;
}

function buildProfesorOcupacionShort(
  idProfesor: string,
  dia: string,
  grupoSlots: GrupoHorarioSlot[],
  individualHorarios: MatriculaHorario[] = [],
): string | null {
  if (!idProfesor || !dia.trim()) return null;
  const diaNorm = dia.trim().toLowerCase();
  const intervals: Array<{ start: string; end: string }> = [];

  for (const slot of grupoSlots) {
    if (slot.ID_PROFESOR !== idProfesor) continue;
    if ((slot.DIA_SEMANA ?? "").trim().toLowerCase() !== diaNorm) continue;
    intervals.push({
      start: slot.HORA_INICIO?.slice(0, 5) ?? "?",
      end: slot.HORA_FIN?.slice(0, 5) ?? "?",
    });
  }

  for (const horario of individualHorarios) {
    if (!isIndividualHorarioForOccupancy(horario)) continue;
    if (horario.ID_PROFESOR !== idProfesor) continue;
    if ((horario.DIA ?? "").trim().toLowerCase() !== diaNorm) continue;
    intervals.push({
      start: horario.HORA_INICIO?.slice(0, 5) ?? "?",
      end: horario.HORA_FIN?.slice(0, 5) ?? "?",
    });
  }

  if (intervals.length === 0) return "Profesor libre este día";

  intervals.sort((a, b) => a.start.localeCompare(b.start));
  return `Ocupado hoy: ${intervals.map((i) => `${i.start}-${i.end}`).join(", ")}`;
}

export const AULA_LLENA_MESSAGE = "AULA LLENA, BUSQUE OTRO HORARIO";

export const GRUPO_COMPLETO_PROMPT =
  "El grupo está completo, ¿asignar alumno de todos modos? Te recomendamos buscar otro grupo.";

const SESIONES_EXCLUDED_ESTADOS = new Set(["cancelada", "incidencia"]);

export type SesionOccupancyRow = {
  ID_SESION: string;
  ID_ALUMNO: string | null;
  ID_AULA: string | null;
  ID_PROFESOR: string | null;
  ID_HORARIO?: string | null;
  ID_GRUPO_HORARIO?: string | null;
  FECHA_EXACTA: string;
  HORA_INICIO: string;
  HORA_FIN: string;
  ESTADO: string | null;
};

export type GrupoOccupancyMeta = {
  ID_GRUPO: string;
  ID_ALUMNOS: string[];
  PLAZAS_MAXIMAS: number | null;
};

export type ScheduleAssignmentContext = {
  grupoSlots: GrupoHorarioSlot[];
  horarios: MatriculaHorario[];
  sesiones: SesionOccupancyRow[];
  aulaCapacidadById: Map<string, number | null>;
  grupos: GrupoOccupancyMeta[];
};

export type ScheduleAssignmentCheck = {
  idAlumno?: string | null;
  idProfesor?: string | null;
  idAula?: string | null;
  dia: string;
  horaInicio: string;
  horaFin: string;
  idHorarioExcluir?: string | null;
  idGrupo?: string | null;
  idGrupoHorario?: string | null;
  idSesionExcluir?: string | null;
  isIndividual?: boolean;
  extraAlumnoIds?: string[];
  fechaExacta?: string | null;
};

function weekdayLabelFromIsoDate(fecha: string): string {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
  const parsed = new Date(`${fecha.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return dias[parsed.getDay()] ?? "";
}

function isSesionOccupancyActiva(estado: string | null | undefined): boolean {
  const normalized = estado?.trim().toLowerCase() ?? "";
  return normalized.length > 0 && !SESIONES_EXCLUDED_ESTADOS.has(normalized);
}

function horarioTimeValue(value: string | null | undefined): string {
  return value?.slice(0, 5) ?? "";
}

function sesionMatchesCheck(
  sesion: SesionOccupancyRow,
  check: Pick<ScheduleAssignmentCheck, "dia" | "horaInicio" | "horaFin" | "fechaExacta">,
): boolean {
  const checkFecha = check.fechaExacta?.trim().slice(0, 10);
  if (!checkFecha) return false;

  const sesionFecha = sesion.FECHA_EXACTA?.trim().slice(0, 10);
  if (!sesionFecha || sesionFecha !== checkFecha) return false;

  const sesionDia = weekdayLabelFromIsoDate(sesion.FECHA_EXACTA);
  if (!sesionDia) return false;

  return schedulesTimeOverlap(
    check.dia,
    check.horaInicio,
    check.horaFin,
    sesionDia,
    sesion.HORA_INICIO,
    sesion.HORA_FIN,
  );
}

function isSameGrupoHorarioPeer(
  horario: MatriculaHorario,
  idGrupoHorario?: string | null,
): boolean {
  const peerId = idGrupoHorario?.trim();
  if (!peerId) return false;
  return horario.ID_GRUPO_HORARIO?.trim() === peerId;
}

function isSameGrupoHorarioSesionPeer(
  sesion: Pick<SesionOccupancyRow, "ID_GRUPO_HORARIO">,
  idGrupoHorario?: string | null,
): boolean {
  const peerId = idGrupoHorario?.trim();
  if (!peerId) return false;
  return sesion.ID_GRUPO_HORARIO?.trim() === peerId;
}

type GrupoSlotExclusion = Pick<
  ScheduleAssignmentCheck,
  | "idGrupoHorario"
  | "idGrupo"
  | "idProfesor"
  | "idAula"
  | "dia"
  | "horaInicio"
  | "horaFin"
  | "fechaExacta"
>;

function isExcludedGrupoSlot(slot: GrupoHorarioSlot, exclude: GrupoSlotExclusion): boolean {
  const excludeGrupoHorarioId = exclude.idGrupoHorario?.trim();
  if (excludeGrupoHorarioId && slot.ID_GRUPO_HORARIO?.trim() === excludeGrupoHorarioId) {
    return true;
  }

  const grupoId = exclude.idGrupo?.trim();
  const profId = exclude.idProfesor?.trim();
  const aulaId = exclude.idAula?.trim();
  const dia = exclude.dia?.trim();
  if (!grupoId || !profId || !aulaId || !dia || !exclude.horaInicio || !exclude.horaFin) {
    return false;
  }

  if (slot.ID_GRUPO !== grupoId) return false;
  if (slot.ID_PROFESOR?.trim() !== profId) return false;
  if (slot.ID_AULA?.trim() !== aulaId) return false;
  return schedulesTimeOverlap(
    dia,
    exclude.horaInicio,
    exclude.horaFin,
    slot.DIA_SEMANA ?? "",
    slot.HORA_INICIO ?? "",
    slot.HORA_FIN ?? "",
  );
}

function isExcludedSesionForGrupoSlot(
  sesion: SesionOccupancyRow,
  exclude: GrupoSlotExclusion,
): boolean {
  const excludeGrupoHorarioId = exclude.idGrupoHorario?.trim();
  const grupoId = exclude.idGrupo?.trim();
  if (!excludeGrupoHorarioId && !grupoId) return false;

  const profId = exclude.idProfesor?.trim();
  const aulaId = exclude.idAula?.trim();
  const dia = exclude.dia?.trim();
  if (!profId || !aulaId || !dia || !exclude.horaInicio || !exclude.horaFin) return false;

  if (sesion.ID_PROFESOR?.trim() !== profId) return false;
  if (sesion.ID_AULA?.trim() !== aulaId) return false;

  const sesionDia = weekdayLabelFromIsoDate(sesion.FECHA_EXACTA);
  if (sesionDia.trim().toLowerCase() !== dia.trim().toLowerCase()) return false;

  return schedulesTimeOverlap(
    dia,
    exclude.horaInicio,
    exclude.horaFin,
    sesionDia,
    sesion.HORA_INICIO,
    sesion.HORA_FIN,
  );
}

function collectAlumnosInAulaWindow(
  ctx: ScheduleAssignmentContext,
  dia: string,
  horaInicio: string,
  horaFin: string,
  idAula: string,
  exclude: {
    idHorario?: string | null;
    idSesion?: string | null;
  },
  fechaExacta?: string | null,
  extraAlumnoIds: string[] = [],
): Set<string> {
  const ids = new Set<string>();

  for (const horario of ctx.horarios) {
    if (exclude.idHorario && horario.ID_HORARIO === exclude.idHorario) continue;
    if (!isHorarioScheduleActivo(resolveHorarioScheduleEstado(horario))) continue;
    if (horario.ID_AULA?.trim() !== idAula) continue;
    if (
      !schedulesTimeOverlap(
        dia,
        horaInicio,
        horaFin,
        horario.DIA ?? "",
        horario.HORA_INICIO ?? "",
        horario.HORA_FIN ?? "",
      )
    ) {
      continue;
    }
    const alumnoId = horario.ID_ALUMNO?.trim();
    if (alumnoId) ids.add(alumnoId);
  }

  if (fechaExacta?.trim()) {
    const sesionCheck = { dia, horaInicio, horaFin, fechaExacta };
    for (const sesion of ctx.sesiones) {
      if (exclude.idSesion && sesion.ID_SESION === exclude.idSesion) continue;
      if (!isSesionOccupancyActiva(sesion.ESTADO)) continue;
      if (sesion.ID_AULA?.trim() !== idAula) continue;
      if (!sesionMatchesCheck(sesion, sesionCheck)) continue;
      const alumnoId = sesion.ID_ALUMNO?.trim();
      if (alumnoId) ids.add(alumnoId);
    }
  }

  for (const slot of ctx.grupoSlots) {
    if (slot.ID_AULA?.trim() !== idAula) continue;
    if (
      !schedulesTimeOverlap(
        dia,
        horaInicio,
        horaFin,
        slot.DIA_SEMANA ?? "",
        slot.HORA_INICIO ?? "",
        slot.HORA_FIN ?? "",
      )
    ) {
      continue;
    }
    const grupo = ctx.grupos.find((g) => g.ID_GRUPO === slot.ID_GRUPO);
    for (const alumnoId of grupo?.ID_ALUMNOS ?? []) {
      if (alumnoId?.trim()) ids.add(alumnoId.trim());
    }
  }

  for (const alumnoId of extraAlumnoIds) {
    if (alumnoId?.trim()) ids.add(alumnoId.trim());
  }

  return ids;
}

function buildAssignmentResourceSlots(
  ctx: ScheduleAssignmentContext,
  exclude: Pick<ScheduleAssignmentCheck, "idHorarioExcluir" | "idGrupoHorario"> &
    GrupoSlotExclusion,
): ScheduleOccupancySlot[] {
  const slots: ScheduleOccupancySlot[] = [];

  for (const slot of ctx.grupoSlots) {
    if (isExcludedGrupoSlot(slot, exclude)) continue;
    slots.push({
      dia: slot.DIA_SEMANA ?? "",
      horaInicio: slot.HORA_INICIO ?? "",
      horaFin: slot.HORA_FIN ?? "",
      idProfesor: slot.ID_PROFESOR ?? null,
      idAula: slot.ID_AULA ?? null,
    });
  }

  for (const horario of ctx.horarios) {
    if (exclude.idHorarioExcluir && horario.ID_HORARIO === exclude.idHorarioExcluir) continue;
    if (isSameGrupoHorarioPeer(horario, exclude.idGrupoHorario)) continue;
    if (!isHorarioScheduleActivo(resolveHorarioScheduleEstado(horario))) continue;
    slots.push({
      dia: horario.DIA ?? "",
      horaInicio: horario.HORA_INICIO ?? "",
      horaFin: horario.HORA_FIN ?? "",
      idProfesor: horario.ID_PROFESOR ?? null,
      idAula: horario.ID_AULA ?? null,
    });
  }

  for (const sesion of ctx.sesiones) {
    if (!exclude.fechaExacta?.trim()) continue;
    if (!isSesionOccupancyActiva(sesion.ESTADO)) continue;
    if (isExcludedSesionForGrupoSlot(sesion, exclude)) continue;
    if (!sesionMatchesCheck(sesion, exclude)) continue;
    const dia = weekdayLabelFromIsoDate(sesion.FECHA_EXACTA);
    if (!dia) continue;
    slots.push({
      dia,
      horaInicio: sesion.HORA_INICIO,
      horaFin: sesion.HORA_FIN,
      idProfesor: sesion.ID_PROFESOR ?? null,
      idAula: sesion.ID_AULA ?? null,
    });
  }

  return slots;
}

function buildProfAulaOccupancySlots(
  grupoSlots: GrupoHorarioSlot[],
  horarios: MatriculaHorario[],
  sesiones: SesionOccupancyRow[],
  excludeHorarioId?: string | null,
): ScheduleOccupancySlot[] {
  const slots: ScheduleOccupancySlot[] = [];

  for (const slot of grupoSlots) {
    slots.push({
      dia: slot.DIA_SEMANA ?? "",
      horaInicio: slot.HORA_INICIO ?? "",
      horaFin: slot.HORA_FIN ?? "",
      idProfesor: slot.ID_PROFESOR ?? null,
      idAula: slot.ID_AULA ?? null,
    });
  }

  for (const horario of horarios) {
    if (excludeHorarioId && horario.ID_HORARIO === excludeHorarioId) continue;
    if (!isHorarioScheduleActivo(resolveHorarioScheduleEstado(horario))) continue;
    slots.push({
      dia: horario.DIA ?? "",
      horaInicio: horario.HORA_INICIO ?? "",
      horaFin: horario.HORA_FIN ?? "",
      idProfesor: horario.ID_PROFESOR ?? null,
      idAula: horario.ID_AULA ?? null,
    });
  }

  return slots;
}

function hasBlockingIndividualClass(
  ctx: ScheduleAssignmentContext,
  check: ScheduleAssignmentCheck,
): boolean {
  if (check.isIndividual) return false;

  const aulaId = check.idAula?.trim();
  if (!aulaId || !check.dia.trim() || !check.horaInicio || !check.horaFin) return false;

  for (const horario of ctx.horarios) {
    if (check.idHorarioExcluir && horario.ID_HORARIO === check.idHorarioExcluir) continue;
    if (!isIndividualHorarioForOccupancy(horario)) continue;
    if (
      !schedulesTimeOverlap(
        check.dia,
        check.horaInicio,
        check.horaFin,
        horario.DIA ?? "",
        horario.HORA_INICIO ?? "",
        horario.HORA_FIN ?? "",
      )
    ) {
      continue;
    }
    const horarioAula = horario.ID_AULA?.trim();
    if (horarioAula !== aulaId) continue;
    return true;
  }

  for (const sesion of ctx.sesiones) {
    if (check.idSesionExcluir && sesion.ID_SESION === check.idSesionExcluir) continue;
    if (!isSesionOccupancyActiva(sesion.ESTADO)) continue;
    if (!sesionMatchesCheck(sesion, check)) continue;
    if (sesion.ID_GRUPO_HORARIO?.trim()) continue;

    const horarioId = sesion.ID_HORARIO?.trim();
    if (horarioId) {
      const linked = ctx.horarios.find((h) => h.ID_HORARIO === horarioId);
      if (linked && !isIndividualHorarioForOccupancy(linked)) continue;
    } else if (sesionMatchesGrupoSlot(sesion, ctx)) {
      continue;
    }

    const sesionAula = sesion.ID_AULA?.trim();
    if (sesionAula !== aulaId) continue;

    return true;
  }

  return false;
}

function sesionMatchesGrupoSlot(
  sesion: SesionOccupancyRow,
  ctx: ScheduleAssignmentContext,
): boolean {
  const sesionDia = weekdayLabelFromIsoDate(sesion.FECHA_EXACTA);
  if (!sesionDia) return false;
  const sesionAula = sesion.ID_AULA?.trim();
  if (!sesionAula) return false;

  for (const slot of ctx.grupoSlots) {
    if (slot.ID_AULA?.trim() !== sesionAula) continue;
    if (
      schedulesTimeOverlap(
        sesionDia,
        sesion.HORA_INICIO,
        sesion.HORA_FIN,
        slot.DIA_SEMANA ?? "",
        slot.HORA_INICIO ?? "",
        slot.HORA_FIN ?? "",
      )
    ) {
      return true;
    }
  }

  return false;
}

function hasDuplicateGrupoSlotConflict(
  ctx: ScheduleAssignmentContext,
  check: ScheduleAssignmentCheck,
): boolean {
  const grupoId = check.idGrupo?.trim();
  const profId = check.idProfesor?.trim();
  const aulaId = check.idAula?.trim();
  if (!profId || !aulaId || !check.dia.trim()) return false;

  for (const slot of ctx.grupoSlots) {
    if (grupoId && slot.ID_GRUPO === grupoId) continue;
    if (slot.ID_PROFESOR?.trim() !== profId) continue;
    if (slot.ID_AULA?.trim() !== aulaId) continue;
    if (
      !schedulesTimeOverlap(
        check.dia,
        check.horaInicio,
        check.horaFin,
        slot.DIA_SEMANA ?? "",
        slot.HORA_INICIO ?? "",
        slot.HORA_FIN ?? "",
      )
    ) {
      continue;
    }
    return true;
  }

  return false;
}

function hasAlumnoAssignmentOverlap(
  ctx: ScheduleAssignmentContext,
  check: ScheduleAssignmentCheck,
): boolean {
  const alumnoId = check.idAlumno?.trim();
  if (!alumnoId || !check.dia.trim() || !check.horaInicio || !check.horaFin) return false;

  for (const horario of ctx.horarios) {
    if (check.idHorarioExcluir && horario.ID_HORARIO === check.idHorarioExcluir) continue;
    if (horario.ID_ALUMNO?.trim() !== alumnoId) continue;
    if (isSameGrupoHorarioPeer(horario, check.idGrupoHorario)) continue;
    if (!isHorarioScheduleActivo(resolveHorarioScheduleEstado(horario))) continue;
    if (
      schedulesTimeOverlap(
        check.dia,
        check.horaInicio,
        check.horaFin,
        horario.DIA ?? "",
        horario.HORA_INICIO ?? "",
        horario.HORA_FIN ?? "",
      )
    ) {
      return true;
    }
  }

  for (const sesion of ctx.sesiones) {
    if (check.idSesionExcluir && sesion.ID_SESION === check.idSesionExcluir) continue;
    if (sesion.ID_ALUMNO?.trim() !== alumnoId) continue;
    if (isSameGrupoHorarioSesionPeer(sesion, check.idGrupoHorario)) continue;
    if (!isSesionOccupancyActiva(sesion.ESTADO)) continue;
    if (sesionMatchesCheck(sesion, check)) {
      return true;
    }
  }

  return false;
}

export function validateScheduleAssignmentHard(
  ctx: ScheduleAssignmentContext,
  check: ScheduleAssignmentCheck,
): string | null {
  if (!check.dia.trim() || !check.horaInicio || !check.horaFin) return null;

  const aulaId = check.idAula?.trim();
  if (aulaId) {
    const capacidad = ctx.aulaCapacidadById.get(aulaId);
    if (capacidad != null && capacidad > 0) {
      const occupants = collectAlumnosInAulaWindow(
        ctx,
        check.dia,
        check.horaInicio,
        check.horaFin,
        aulaId,
        {
          idHorario: check.idHorarioExcluir,
          idSesion: check.idSesionExcluir,
        },
        check.fechaExacta,
        check.extraAlumnoIds ?? [],
      );
      if (occupants.size > capacidad) {
        return AULA_LLENA_MESSAGE;
      }
    }
  }

  if (hasBlockingIndividualClass(ctx, check)) {
    return "Este horario ya tiene una clase individual asignada.";
  }

  const resourceSlots = buildAssignmentResourceSlots(ctx, check);
  if (
    hasScheduleResourceConflict(
      check.dia,
      check.horaInicio,
      check.horaFin,
      check.idProfesor ?? "",
      check.idAula ?? "",
      resourceSlots,
    )
  ) {
    return "El profesor y/o el aula seleccionada ya están ocupados en este horario";
  }

  if (hasAlumnoAssignmentOverlap(ctx, check)) {
    return "El alumno ya tiene otra clase asignada en este horario";
  }

  if (hasDuplicateGrupoSlotConflict(ctx, check)) {
    return "Ya existe otro grupo en este horario, aula y profesor.";
  }

  return null;
}

export function checkGrupoPlazasWarning(
  ctx: ScheduleAssignmentContext,
  idGrupo: string,
  alumnoIdsToAdd: string[],
): boolean {
  const grupo = ctx.grupos.find((g) => g.ID_GRUPO === idGrupo);
  if (!grupo || grupo.PLAZAS_MAXIMAS == null) return false;
  const current = new Set(grupo.ID_ALUMNOS);
  for (const id of alumnoIdsToAdd) {
    if (id?.trim()) current.add(id.trim());
  }
  return current.size > grupo.PLAZAS_MAXIMAS;
}

export function buildScheduleAssignmentContext(
  grupoSlots: GrupoHorarioSlot[],
  horarios: MatriculaHorario[],
  sesiones: SesionOccupancyRow[],
  aulaCapacidadById: Map<string, number | null>,
): ScheduleAssignmentContext {
  const gruposMap = new Map<string, GrupoOccupancyMeta>();
  for (const slot of grupoSlots) {
    const grupo = slot.GRUPOS;
    if (!grupo) continue;
    gruposMap.set(slot.ID_GRUPO, {
      ID_GRUPO: slot.ID_GRUPO,
      ID_ALUMNOS: [...(grupo.ID_ALUMNOS ?? [])],
      PLAZAS_MAXIMAS: grupo.PLAZAS_MAXIMAS,
    });
  }

  return {
    grupoSlots,
    horarios,
    sesiones,
    aulaCapacidadById,
    grupos: Array.from(gruposMap.values()),
  };
}

export function assignmentCheckFromGrupoSlot(
  slot: Pick<
    GrupoHorarioSlot,
    "ID_PROFESOR" | "ID_AULA" | "DIA_SEMANA" | "HORA_INICIO" | "HORA_FIN" | "ID_GRUPO_HORARIO"
  >,
  overrides: Partial<ScheduleAssignmentCheck> = {},
): ScheduleAssignmentCheck {
  return {
    idProfesor: slot.ID_PROFESOR,
    idAula: slot.ID_AULA,
    dia: slot.DIA_SEMANA ?? "",
    horaInicio: horarioTimeValue(slot.HORA_INICIO),
    horaFin: horarioTimeValue(slot.HORA_FIN),
    idGrupoHorario: slot.ID_GRUPO_HORARIO,
    isIndividual: false,
    ...overrides,
  };
}

function getGrupoCapacityMeta(
  idGrupo: string,
  grupoSlots: GrupoHorarioSlot[],
): { enrolled: number; max: number | null } | null {
  const slot = grupoSlots.find((s) => s.ID_GRUPO === idGrupo);
  const grupo = slot?.GRUPOS;
  if (!grupo) return null;
  return {
    enrolled: countGrupoAlumnos(grupo.ID_ALUMNOS),
    max: grupo.PLAZAS_MAXIMAS,
  };
}

function getSelectedGrupoIdTarifa(
  idGrupo: string,
  grupoSlots: GrupoHorarioSlot[],
): string | null | undefined {
  if (!idGrupo) return undefined;
  const slot = grupoSlots.find((s) => s.ID_GRUPO === idGrupo);
  return slot?.GRUPOS?.ID_TARIFA;
}

function isTariffFreeGrupo(idGrupo: string, grupoSlots: GrupoHorarioSlot[]): boolean {
  if (!idGrupo) return false;
  const idTarifa = getSelectedGrupoIdTarifa(idGrupo, grupoSlots);
  return idTarifa == null || idTarifa === "";
}

function mergeHorarioFormState(
  enrollment: HorarioFormState,
  block: HorarioFormState,
): HorarioFormState {
  return {
    ...enrollment,
    dia: block.dia,
    horaInicio: block.horaInicio,
    horaFin: block.horaFin,
    duracion: block.duracion,
    idProfesor: block.idProfesor,
    idAula: block.idAula,
    precio: block.precio,
    faltasRecuperables: block.faltasRecuperables,
    faltasNoRecuperables: block.faltasNoRecuperables,
    recuperaciones: block.recuperaciones,
    saldo: block.saldo,
    idEspecialidad: block.idEspecialidad || enrollment.idEspecialidad,
  };
}

type MatriculaHorario = MatriculaTree["HORARIOS_MATRICULAS"][number];

function compareMatriculaHorarioOrder(a: MatriculaHorario, b: MatriculaHorario): number {
  const dayCmp = (a.DIA ?? "").localeCompare(b.DIA ?? "", "es");
  if (dayCmp !== 0) return dayCmp;
  const startCmp = (a.HORA_INICIO ?? "").localeCompare(b.HORA_INICIO ?? "");
  if (startCmp !== 0) return startCmp;
  return (a.ID_HORARIO ?? "").localeCompare(b.ID_HORARIO ?? "");
}

function sortMatriculaHorarios(horarios: MatriculaHorario[]): MatriculaHorario[] {
  return [...horarios].sort(compareMatriculaHorarioOrder);
}

function buildHorariosByMatricula(
  treeMatriculas: MatriculaTree[] | undefined,
): Map<string, MatriculaHorario[]> {
  const map = new Map<string, MatriculaHorario[]>();
  for (const mat of treeMatriculas ?? []) {
    map.set(mat.ID_MATRICULA, []);
  }
  for (const mat of treeMatriculas ?? []) {
    for (const horario of mat.HORARIOS_MATRICULAS ?? []) {
      const matriculaId = horario.ID_MATRICULA ?? mat.ID_MATRICULA;
      if (!matriculaId) continue;
      const bucket = map.get(matriculaId) ?? [];
      if (!bucket.some((existing) => existing.ID_HORARIO === horario.ID_HORARIO)) {
        bucket.push(horario);
      }
      map.set(matriculaId, bucket);
    }
  }
  for (const [matriculaId, horarios] of map) {
    map.set(matriculaId, sortMatriculaHorarios(horarios));
  }
  return map;
}

function matriculaEnrollmentFromHorarios(
  matricula: Matricula,
  horarios: MatriculaHorario[],
): HorarioFormState {
  const seedHorario = horarios[0] ?? null;
  return horarioToFormState(seedHorario, {
    idProfesor: matricula.ID_PROFESOR,
    idEspecialidad: matricula.ESPECIALIDAD ?? seedHorario?.ID_ESPECIALIDAD,
  });
}

function MatriculaEnrollmentFields({
  form,
  setForm,
  selectOptions,
  grupoSlots,
  saving,
  defaultProfesorId,
  alumnoCenterId,
  matriculaTarifaId,
  matriculaCursoId,
  centros = [],
}: {
  form: HorarioFormState;
  setForm: Dispatch<SetStateAction<HorarioFormState>>;
  selectOptions: SelectOptions;
  grupoSlots: GrupoHorarioSlot[];
  saving: boolean;
  defaultProfesorId?: string | null;
  alumnoCenterId?: string | null;
  matriculaTarifaId?: string | null;
  matriculaCursoId?: string | null;
  centros?: CentroData[];
}) {
  const hasEspecialidad = !!form.idEspecialidad;
  const isColectiva = form.tipoClase === "Colectiva";
  const cascadeDisabled = saving || !hasEspecialidad;

  const grupoOptions = useMemo(() => {
    const centerId = alumnoCenterId?.trim();
    if (!form.idEspecialidad || !centerId) return [];
    const tarifaId = matriculaTarifaId?.trim() || null;
    const matriculaCurso = matriculaCursoId?.trim() || null;
    const activeCursoIds = getActiveCursoIdsForCentro(centros, centerId);
    const seen = new Set<string>();
    const options: { id: string; label: string }[] = [];
    for (const slot of grupoSlots) {
      const grupo = slot.GRUPOS;
      if (!grupo) continue;
      if (grupo.ID_ESPECIALIDAD !== form.idEspecialidad) continue;
      if (grupo.ID_CENTRO !== centerId) continue;
      if (tarifaId && grupo.ID_TARIFA !== tarifaId) continue;
      const grupoCursoId = grupo.ID_CURSO?.trim();
      if (!grupoCursoId || !activeCursoIds.has(grupoCursoId)) continue;
      if (matriculaCurso && grupoCursoId !== matriculaCurso) continue;
      if (seen.has(slot.ID_GRUPO)) continue;
      seen.add(slot.ID_GRUPO);
      options.push({
        id: slot.ID_GRUPO,
        label: grupo.NOMBRE_GRUPO ?? slot.ID_GRUPO,
      });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [
    grupoSlots,
    form.idEspecialidad,
    alumnoCenterId,
    matriculaTarifaId,
    matriculaCursoId,
    centros,
  ]);

  const grupoCapacity = useMemo(
    () => (form.idGrupo ? getGrupoCapacityMeta(form.idGrupo, grupoSlots) : null),
    [form.idGrupo, grupoSlots],
  );

  const grupoLleno =
    grupoCapacity != null &&
    grupoCapacity.max != null &&
    grupoCapacity.enrolled >= grupoCapacity.max;

  const handleEspecialidadChange = (idEspecialidad: string) => {
    setForm((prev) => ({
      ...prev,
      idEspecialidad,
      idGrupo: "",
      dia: "",
      horaInicio: "",
      horaFin: "",
      duracion: "",
      idProfesor: defaultProfesorId ?? "",
      idAula: "",
    }));
  };

  const handleTipoClaseChange = (value: string) => {
    if (!value) return;
    const next = value as HorarioFormState["tipoClase"];
    setForm((prev) => {
      if (next === "Individual") {
        return {
          ...prev,
          tipoClase: next,
          idGrupo: "",
          dia: "",
          horaInicio: "",
          horaFin: "",
          duracion: "",
          idProfesor: defaultProfesorId ?? prev.idProfesor,
          idAula: "",
        };
      }
      return {
        ...prev,
        tipoClase: next,
        idGrupo: "",
        dia: "",
        horaInicio: "",
        horaFin: "",
        duracion: "",
        idProfesor: "",
        idAula: "",
      };
    });
  };

  return (
    <div className="space-y-4 rounded-md border bg-muted/10 p-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Especialidad <span className="text-destructive">*</span>
        </Label>
        <Select
          value={form.idEspecialidad || undefined}
          onValueChange={handleEspecialidadChange}
          disabled={saving}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Seleccionar especialidad" />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.especialidades.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Tipo de clase</Label>
          <ToggleGroup
            type="single"
            value={form.tipoClase}
            onValueChange={handleTipoClaseChange}
            className="flex w-full rounded-md border p-1"
            disabled={cascadeDisabled}
          >
            {TIPO_CLASE_OPCIONES.map((opt) => (
              <ToggleGroupItem
                key={opt}
                value={opt}
                className="flex-1 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {opt}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Tipo de sesión</Label>
          <ToggleGroup
            type="single"
            value={form.tipoSesion}
            onValueChange={(v) =>
              v && setForm((prev) => ({ ...prev, tipoSesion: v as HorarioFormState["tipoSesion"] }))
            }
            className="flex w-full rounded-md border p-1"
            disabled={cascadeDisabled}
          >
            {TIPO_SESION_OPCIONES.map((opt) => (
              <ToggleGroupItem
                key={opt}
                value={opt}
                className="flex-1 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {opt}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {isColectiva && hasEspecialidad && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Grupo</Label>
          <Select
            value={form.idGrupo || undefined}
            onValueChange={(v) =>
              setForm((prev) => ({
                ...prev,
                idGrupo: v,
                ...(isTariffFreeGrupo(v, grupoSlots) ? { precio: "0" } : {}),
              }))
            }
            disabled={cascadeDisabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Seleccionar grupo" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {grupoOptions.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.idGrupo && grupoCapacity && (
            <p
              className={cn(
                "text-xs",
                grupoLleno ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {grupoLleno
                ? `⚠️ Grupo lleno · Plazas: ${grupoCapacity.enrolled} ocupadas / ${grupoCapacity.max} máximas`
                : `Plazas: ${grupoCapacity.enrolled} ocupadas / ${grupoCapacity.max ?? "—"} máximas`}
            </p>
          )}
          {form.idEspecialidad && grupoOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {matriculaTarifaId?.trim() && matriculaCursoId?.trim()
                ? "Sin grupos para esta tarifa, especialidad y curso en este centro."
                : matriculaTarifaId?.trim()
                  ? "Sin grupos para esta tarifa y especialidad en este centro."
                  : "Sin grupos para esta especialidad."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LockedScheduleBlock({
  slot,
  index,
  lookups,
}: {
  slot: GrupoHorarioSlot;
  index: number;
  lookups: LookupMaps;
}) {
  return (
    <Card className="space-y-2 bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">Bloque {index + 1}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Día</Label>
          <Input className="h-8 bg-muted/50" value={slot.DIA_SEMANA ?? "—"} readOnly disabled />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Inicio</Label>
          <Input
            className="h-8 bg-muted/50"
            value={slot.HORA_INICIO?.slice(0, 5) ?? "—"}
            readOnly
            disabled
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Fin</Label>
          <Input
            className="h-8 bg-muted/50"
            value={slot.HORA_FIN?.slice(0, 5) ?? "—"}
            readOnly
            disabled
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Profesor</Label>
          <Input
            className="h-8 bg-muted/50"
            value={slot.ID_PROFESOR ? (lookups.profesorById.get(slot.ID_PROFESOR) ?? "—") : "—"}
            readOnly
            disabled
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Aula</Label>
          <Input
            className="h-8 bg-muted/50"
            value={slot.ID_AULA ? (lookups.aulaById.get(slot.ID_AULA) ?? "—") : "—"}
            readOnly
            disabled
          />
        </div>
      </div>
    </Card>
  );
}

function HorarioSubForm({
  horario,
  lookups,
  selectOptions,
  grupoSlots,
  defaultProfesorId,
  defaultEspecialidadId,
  sharedForm,
  showEnrollmentFields = true,
  blockIndex,
  tariffSessionLimit,
  appendMode = false,
  assignedGrupoHorarioIds,
  tenantIndividualHorarios,
  tenantOccupancyHorarios,
  occupancySesiones,
  scheduleAssignmentContext,
  alumnoId,
  conflictCheckHorarios,
  studentConflictHorarios,
  alumnoCenterId,
  matriculaTarifaId,
  matriculaCursoId,
  centros = [],
  saving,
  onSave,
  onDelete,
  onCancel,
}: {
  horario: MatriculaTree["HORARIOS_MATRICULAS"][number] | null;
  lookups: LookupMaps;
  selectOptions: SelectOptions;
  grupoSlots: GrupoHorarioSlot[];
  defaultProfesorId?: string | null;
  defaultEspecialidadId?: string | null;
  sharedForm?: HorarioFormState;
  showEnrollmentFields?: boolean;
  blockIndex?: number;
  tariffSessionLimit?: number | null;
  appendMode?: boolean;
  assignedGrupoHorarioIds?: ReadonlySet<string>;
  tenantIndividualHorarios?: MatriculaHorario[];
  tenantOccupancyHorarios?: MatriculaHorario[];
  occupancySesiones?: SesionOccupancyRow[];
  scheduleAssignmentContext?: ScheduleAssignmentContext | null;
  alumnoId?: string | null;
  conflictCheckHorarios?: MatriculaTree["HORARIOS_MATRICULAS"];
  studentConflictHorarios?: MatriculaTree["HORARIOS_MATRICULAS"];
  alumnoCenterId?: string | null;
  matriculaTarifaId?: string | null;
  matriculaCursoId?: string | null;
  centros?: CentroData[];
  saving: boolean;
  onSave: (patch: HorarioUpdateInput | HorarioUpdateInput[]) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<HorarioFormState>(() =>
    appendMode
      ? createEmptyHorarioFormState({
          idProfesor: defaultProfesorId,
          idEspecialidad: defaultEspecialidadId,
        })
      : horarioToFormState(horario, {
          idProfesor: defaultProfesorId,
          idEspecialidad: defaultEspecialidadId,
        }),
  );

  const [grupoCompletoConfirmOpen, setGrupoCompletoConfirmOpen] = useState(false);
  const grupoCompletoProceedRef = useRef<(() => Promise<void>) | null>(null);

  const horarioId = horario?.ID_HORARIO ?? null;
  const enrollmentForm = appendMode ? form : (sharedForm ?? form);
  const isColectiva = enrollmentForm.tipoClase === "Colectiva";
  const isIndividualSchedule =
    horario != null ? isIndividualHorarioForOccupancy(horario) : !isColectiva;
  const isGrupoScheduleTimesLocked = Boolean(horario?.ID_GRUPO?.trim());
  const scheduleItemGrupoId =
    horario?.ID_GRUPO?.trim() ||
    (!horario ? (appendMode ? form.idGrupo : enrollmentForm.idGrupo)?.trim() : "") ||
    "";
  const rowEspecialidad = (horario?.ID_ESPECIALIDAD ?? form.idEspecialidad)?.trim() ?? "";
  const enrollmentEspecialidad = defaultEspecialidadId?.trim() ?? "";
  const showScheduleEspecialidad =
    !scheduleItemGrupoId || rowEspecialidad !== enrollmentEspecialidad;
  const showStandaloneScheduleEspecialidad =
    Boolean(horario && !showEnrollmentFields && !appendMode) ||
    (showScheduleEspecialidad && !(showEnrollmentFields || appendMode));
  const hasEspecialidad = showStandaloneScheduleEspecialidad
    ? !!form.idEspecialidad
    : !!enrollmentForm.idEspecialidad;
  const cascadeDisabled = saving || !hasEspecialidad;
  const isTariffFreeGrupoSelected = isTariffFreeGrupo(enrollmentForm.idGrupo, grupoSlots);

  useEffect(() => {
    if (!isTariffFreeGrupoSelected) return;
    setForm((prev) => (prev.precio === "0" ? prev : { ...prev, precio: "0" }));
  }, [isTariffFreeGrupoSelected, enrollmentForm.idGrupo]);

  const occupancySlots = useMemo(() => {
    if (!isIndividualSchedule) {
      if (!appendMode) return [];
      return buildScheduleOccupancySlots(grupoSlots, conflictCheckHorarios ?? []);
    }

    const excludeHorarioId = horario?.ID_HORARIO;
    if (scheduleAssignmentContext) {
      return buildProfAulaOccupancySlots(
        scheduleAssignmentContext.grupoSlots,
        scheduleAssignmentContext.horarios,
        scheduleAssignmentContext.sesiones,
        excludeHorarioId,
      );
    }

    return buildProfAulaOccupancySlots(
      grupoSlots,
      tenantOccupancyHorarios ?? tenantIndividualHorarios ?? [],
      occupancySesiones ?? [],
      excludeHorarioId,
    );
  }, [
    isIndividualSchedule,
    appendMode,
    grupoSlots,
    conflictCheckHorarios,
    scheduleAssignmentContext,
    tenantOccupancyHorarios,
    tenantIndividualHorarios,
    occupancySesiones,
    horario?.ID_HORARIO,
  ]);

  const scheduleResourceConflict = useMemo(
    () =>
      isIndividualSchedule &&
      hasScheduleResourceConflict(
        form.dia,
        form.horaInicio,
        form.horaFin,
        form.idProfesor,
        form.idAula,
        occupancySlots,
      ),
    [
      isIndividualSchedule,
      form.dia,
      form.horaInicio,
      form.horaFin,
      form.idProfesor,
      form.idAula,
      occupancySlots,
    ],
  );

  const studentScheduleConflict = useMemo(
    () =>
      appendMode &&
      hasStudentScheduleOverlap(
        form.dia,
        form.horaInicio,
        form.horaFin,
        studentConflictHorarios ?? [],
        horario?.ID_HORARIO,
        {
          idGrupoHorario: horario?.ID_GRUPO_HORARIO,
          alumnoId,
          sesiones: scheduleAssignmentContext?.sesiones ?? occupancySesiones ?? [],
        },
      ),
    [
      appendMode,
      form.dia,
      form.horaInicio,
      form.horaFin,
      studentConflictHorarios,
      horario?.ID_HORARIO,
      horario?.ID_GRUPO_HORARIO,
      alumnoId,
      scheduleAssignmentContext?.sesiones,
      occupancySesiones,
    ],
  );

  useEffect(() => {
    if (appendMode) {
      setForm(
        createEmptyHorarioFormState({
          idProfesor: defaultProfesorId,
          idEspecialidad: defaultEspecialidadId,
        }),
      );
      return;
    }
    setForm(
      horarioToFormState(horario, {
        idProfesor: defaultProfesorId,
        idEspecialidad: defaultEspecialidadId,
      }),
    );
  }, [horarioId, defaultProfesorId, defaultEspecialidadId, appendMode]);

  const grupoHorarioBlocks = useMemo(() => {
    if (!enrollmentForm.idGrupo) return [];
    return grupoSlots
      .filter((s) => s.ID_GRUPO === enrollmentForm.idGrupo)
      .sort((a, b) => {
        const dayCmp = (a.DIA_SEMANA ?? "").localeCompare(b.DIA_SEMANA ?? "", "es");
        if (dayCmp !== 0) return dayCmp;
        return (a.HORA_INICIO ?? "").localeCompare(b.HORA_INICIO ?? "");
      });
  }, [enrollmentForm.idGrupo, grupoSlots]);

  const aulaOptions = useMemo(
    () =>
      Array.from(lookups.aulaById.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [lookups.aulaById],
  );

  const hasIndividualScheduleWindow =
    isIndividualSchedule && !!form.dia.trim() && !!form.horaInicio && !!form.horaFin;

  const chivato = useMemo(
    () =>
      isIndividualSchedule
        ? buildProfesorOcupacionShort(
            form.idProfesor,
            form.dia,
            grupoSlots,
            tenantIndividualHorarios ?? [],
          )
        : null,
    [isIndividualSchedule, form.idProfesor, form.dia, grupoSlots, tenantIndividualHorarios],
  );

  const profesorOptions = useMemo(
    () => profesorSelectOptions(selectOptions.profesores, form.idProfesor, lookups.profesorById),
    [selectOptions.profesores, form.idProfesor, lookups.profesorById],
  );

  const isProfesorOccupied = (idProfesor: string) =>
    hasScheduleResourceConflict(
      form.dia,
      form.horaInicio,
      form.horaFin,
      idProfesor,
      "",
      occupancySlots,
    );

  const isAulaOccupied = (idAula: string) =>
    hasScheduleResourceConflict(
      form.dia,
      form.horaInicio,
      form.horaFin,
      "",
      idAula,
      occupancySlots,
    );

  const patchField = <K extends keyof HorarioFormState>(key: K, value: HorarioFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleHoraInicioChange = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, horaInicio: value };
      const mins = parseHorarioNum(prev.duracion);
      if (value && mins != null) {
        next.horaFin = addMinutesToTime(value, mins);
      }
      return next;
    });
  };

  const handleDuracionChange = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, duracion: value };
      const mins = parseHorarioNum(value);
      if (prev.horaInicio && mins != null) {
        next.horaFin = addMinutesToTime(prev.horaInicio, mins);
      }
      return next;
    });
  };

  const handleHoraFinChange = (value: string) => {
    setForm((prev) => {
      const next = { ...prev, horaFin: value };
      if (prev.horaInicio && value) {
        const mins = durationMinutesBetween(prev.horaInicio, value);
        if (mins != null) next.duracion = String(mins);
      }
      return next;
    });
  };

  const validateHardAssignment = (check: ScheduleAssignmentCheck): string | null => {
    if (!scheduleAssignmentContext) return null;
    return validateScheduleAssignmentHard(scheduleAssignmentContext, check);
  };

  const requireScheduleAssignmentContext = (): boolean => {
    if (scheduleAssignmentContext) return true;
    toast.error("No se pudo validar la ocupación del horario. Inténtalo de nuevo.");
    return false;
  };

  const handleSave = async () => {
    const effectiveForm = appendMode
      ? form
      : sharedForm
        ? mergeHorarioFormState(sharedForm, form)
        : form;

    if (!effectiveForm.idEspecialidad) {
      toast.error("Selecciona una especialidad.");
      return;
    }

    const common = buildCommonHorarioPatch(effectiveForm);
    if (isTariffFreeGrupoSelected) {
      common.PRECIO = 0;
    }

    const rowGrupoId = horario?.ID_GRUPO?.trim() ?? "";
    const rowGrupoHorarioId = horario?.ID_GRUPO_HORARIO?.trim() ?? "";
    if (horario && rowGrupoId && rowGrupoHorarioId) {
      const slot = grupoSlots.find(
        (s) => s.ID_GRUPO === rowGrupoId && s.ID_GRUPO_HORARIO === rowGrupoHorarioId,
      );
      if (!slot) {
        toast.error("No se encontró el horario del grupo configurado para este bloque.");
        return;
      }
      if (!requireScheduleAssignmentContext()) return;
      const hard = validateHardAssignment(
        assignmentCheckFromGrupoSlot(slot, {
          idAlumno: alumnoId,
          idHorarioExcluir: horario.ID_HORARIO,
          idGrupo: rowGrupoId,
          idGrupoHorario: rowGrupoHorarioId,
        }),
      );
      if (hard) {
        toast.error(hard);
        return;
      }
      await onSave(slotToHorarioPatch(slot, rowGrupoId, common));
      return;
    }

    const executeColectivaCreate = async () => {
      if (appendMode && effectiveForm.tipoSesion === "Extra") {
        await onSave(individualToHorarioPatch(effectiveForm, common));
        return;
      }
      const slotsToCreate = grupoHorarioBlocks.filter(
        (slot) => !assignedGrupoHorarioIds?.has(slot.ID_GRUPO_HORARIO),
      );
      if (slotsToCreate.length === 0) {
        toast.error("Todos los horarios del grupo ya están asignados a esta matrícula.");
        return;
      }
      await onSave(
        slotsToCreate.map((slot) => slotToHorarioPatch(slot, effectiveForm.idGrupo, common)),
      );
    };

    if (isColectiva && !horario) {
      if (!effectiveForm.idGrupo) {
        toast.error("Selecciona un grupo.");
        return;
      }
      if (grupoHorarioBlocks.length === 0) {
        toast.error("El grupo seleccionado no tiene horarios configurados.");
        return;
      }

      const slotsToValidate =
        appendMode && effectiveForm.tipoSesion === "Extra"
          ? []
          : grupoHorarioBlocks.filter(
              (slot) => !assignedGrupoHorarioIds?.has(slot.ID_GRUPO_HORARIO),
            );

      if (!requireScheduleAssignmentContext()) return;

      if (appendMode && effectiveForm.tipoSesion === "Extra") {
        const hard = validateHardAssignment({
          idAlumno: alumnoId,
          idProfesor: effectiveForm.idProfesor,
          idAula: effectiveForm.idAula,
          dia: effectiveForm.dia,
          horaInicio: effectiveForm.horaInicio,
          horaFin: effectiveForm.horaFin,
          isIndividual: true,
          extraAlumnoIds: alumnoId?.trim() ? [alumnoId.trim()] : [],
        });
        if (hard) {
          toast.error(hard);
          return;
        }
      }

      for (const slot of slotsToValidate) {
        const hard = validateHardAssignment(
          assignmentCheckFromGrupoSlot(slot, {
            idAlumno: alumnoId,
            idGrupo: effectiveForm.idGrupo,
            extraAlumnoIds: alumnoId?.trim() ? [alumnoId.trim()] : [],
          }),
        );
        if (hard) {
          toast.error(hard);
          return;
        }
      }

      if (
        scheduleAssignmentContext &&
        alumnoId?.trim() &&
        checkGrupoPlazasWarning(scheduleAssignmentContext, effectiveForm.idGrupo, [alumnoId.trim()])
      ) {
        grupoCompletoProceedRef.current = executeColectivaCreate;
        setGrupoCompletoConfirmOpen(true);
        return;
      }

      await executeColectivaCreate();
      return;
    }

    if (isIndividualSchedule) {
      if (!requireScheduleAssignmentContext()) return;
      const hard = validateHardAssignment({
        idAlumno: alumnoId,
        idProfesor: effectiveForm.idProfesor,
        idAula: effectiveForm.idAula,
        dia: effectiveForm.dia,
        horaInicio: effectiveForm.horaInicio,
        horaFin: effectiveForm.horaFin,
        idHorarioExcluir: horario?.ID_HORARIO,
        isIndividual: true,
        extraAlumnoIds: alumnoId?.trim() ? [alumnoId.trim()] : [],
      });
      if (hard) {
        toast.error(hard);
        return;
      }
    }

    await onSave(individualToHorarioPatch(effectiveForm, common));
  };

  const saveDisabled =
    saving ||
    !hasEspecialidad ||
    (isColectiva && !horario && (!enrollmentForm.idGrupo || grupoHorarioBlocks.length === 0)) ||
    (isIndividualSchedule && scheduleResourceConflict);

  const blockTitle =
    blockIndex != null ? `Bloque ${blockIndex + 1}` : horario ? "Horario" : "Nuevo horario";

  const exceedsTariffLimit =
    !isTariffFreeGrupoSelected &&
    tariffSessionLimit != null &&
    blockIndex != null &&
    blockIndex >= tariffSessionLimit;

  const showGrupoLockedSchedule =
    !horario &&
    isColectiva &&
    !!enrollmentForm.idGrupo &&
    grupoHorarioBlocks.length > 0 &&
    (showEnrollmentFields || (appendMode && enrollmentForm.tipoSesion === "Incluida"));

  return (
    <>
      <Card className="space-y-4 border-dashed p-4">
        {((!showEnrollmentFields && !isColectiva) || appendMode) && (
          <p className="text-xs font-medium text-muted-foreground">{blockTitle}</p>
        )}

        {showStandaloneScheduleEspecialidad && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Especialidad <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.idEspecialidad || undefined}
              onValueChange={(v) => patchField("idEspecialidad", v)}
              disabled={saving}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleccionar especialidad" />
              </SelectTrigger>
              <SelectContent>
                {selectOptions.especialidades.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(showEnrollmentFields || appendMode) && (
          <MatriculaEnrollmentFields
            form={form}
            setForm={setForm}
            selectOptions={selectOptions}
            grupoSlots={grupoSlots}
            saving={saving}
            defaultProfesorId={defaultProfesorId}
            alumnoCenterId={alumnoCenterId}
            matriculaTarifaId={matriculaTarifaId}
            matriculaCursoId={matriculaCursoId}
            centros={centros}
          />
        )}

        {showGrupoLockedSchedule && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Horarios del grupo</Label>
            {grupoHorarioBlocks.map((slot, index) => (
              <LockedScheduleBlock
                key={slot.ID_GRUPO_HORARIO}
                slot={slot}
                index={index}
                lookups={lookups}
              />
            ))}
          </div>
        )}

        {(horario != null || !isColectiva || (appendMode && !showGrupoLockedSchedule)) &&
          hasEspecialidad && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Día</Label>
                  <Select
                    value={form.dia || undefined}
                    onValueChange={(v) => patchField("dia", v)}
                    disabled={cascadeDisabled || isGrupoScheduleTimesLocked}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar día" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIAS_SEMANA_OPCIONES.map((dia) => (
                        <SelectItem key={dia} value={dia}>
                          {dia}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Hora inicio</Label>
                  <Input
                    className="h-9"
                    type="time"
                    value={form.horaInicio}
                    onChange={(e) => handleHoraInicioChange(e.target.value)}
                    disabled={cascadeDisabled || isGrupoScheduleTimesLocked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Duración (min)</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min={1}
                    step={1}
                    value={form.duracion}
                    onChange={(e) => handleDuracionChange(e.target.value)}
                    disabled={cascadeDisabled || isGrupoScheduleTimesLocked}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Hora fin</Label>
                  <Input
                    className="h-9"
                    type="time"
                    value={form.horaFin}
                    onChange={(e) => handleHoraFinChange(e.target.value)}
                    disabled={cascadeDisabled || isGrupoScheduleTimesLocked}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label className="text-xs text-muted-foreground">Profesor</Label>
                  <Select
                    value={form.idProfesor || undefined}
                    onValueChange={(v) => patchField("idProfesor", v)}
                    disabled={cascadeDisabled || isGrupoScheduleTimesLocked}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {profesorOptions.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled={
                            hasIndividualScheduleWindow &&
                            p.id !== form.idProfesor &&
                            isProfesorOccupied(p.id)
                          }
                        >
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label className="text-xs text-muted-foreground">Aula</Label>
                  <Select
                    value={form.idAula || undefined}
                    onValueChange={(v) => patchField("idAula", v)}
                    disabled={cascadeDisabled || isGrupoScheduleTimesLocked}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {aulaOptions.map((a) => (
                        <SelectItem
                          key={a.id}
                          value={a.id}
                          disabled={
                            hasIndividualScheduleWindow &&
                            a.id !== form.idAula &&
                            isAulaOccupied(a.id)
                          }
                        >
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {chivato && !appendMode && <p className="text-xs text-muted-foreground">{chivato}</p>}
              {isIndividualSchedule && scheduleResourceConflict && (
                <p className="text-xs font-medium text-destructive">
                  El profesor y/o el aula seleccionada ya están ocupados en este horario
                </p>
              )}
              {appendMode && studentScheduleConflict && (
                <p className="text-xs font-medium text-destructive">
                  El alumno ya tiene otra clase asignada en este horario
                </p>
              )}
            </div>
          )}

        {exceedsTariffLimit && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Precio (€)</Label>
            <Input
              className="h-9"
              type="number"
              step="0.01"
              value={form.precio}
              onChange={(e) => patchField("precio", e.target.value)}
              disabled={cascadeDisabled}
            />
          </div>
        )}

        <Accordion type="single" collapsible>
          <AccordionItem value="advanced" className="border-none">
            <AccordionTrigger
              className="py-2 text-sm text-muted-foreground hover:no-underline"
              disabled={!hasEspecialidad}
            >
              Opciones avanzadas
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ["faltasRecuperables", "Faltas recuperables", "1"],
                    ["faltasNoRecuperables", "Faltas no recuperables", "1"],
                    ["recuperaciones", "Recuperaciones", "1"],
                    ["saldo", "Saldo", "0.01"],
                  ] as const
                ).map(([key, label, step]) => (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      className="h-9"
                      type="number"
                      step={step}
                      value={form[key]}
                      onChange={(e) => patchField(key, e.target.value)}
                      disabled={cascadeDisabled}
                    />
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
          )}
          {onDelete && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={saving}
              onClick={() => void onDelete()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar
            </Button>
          )}
          <Button
            type="button"
            variant="brand"
            size="sm"
            disabled={saveDisabled}
            onClick={() => void handleSave()}
          >
            {saving ? "Guardando…" : horario ? "Guardar horario" : "Crear horario"}
          </Button>
        </div>
      </Card>

      <AlertDialog open={grupoCompletoConfirmOpen} onOpenChange={setGrupoCompletoConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Grupo completo</AlertDialogTitle>
            <AlertDialogDescription>{GRUPO_COMPLETO_PROMPT}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={() => {
                void (async () => {
                  const proceed = grupoCompletoProceedRef.current;
                  grupoCompletoProceedRef.current = null;
                  setGrupoCompletoConfirmOpen(false);
                  if (proceed) await proceed();
                })();
              }}
            >
              Asignar de todos modos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function MatriculaHorariosGroup({
  matricula,
  horarios,
  alumnoId,
  centros,
  selectOptions,
  lookups,
  grupoSlots,
  maxHorarios,
  horarioSaving,
  studentConflictHorarios,
  tenantIndividualHorarios,
  tenantOccupancyHorarios,
  occupancySesiones,
  scheduleAssignmentContext,
  alumnoCenterId,
  onCreateHorario,
  onUpdateHorario,
  onRemoveHorario,
}: {
  matricula: Matricula & { ID_CURSO?: string | null };
  horarios: MatriculaTree["HORARIOS_MATRICULAS"];
  alumnoId: string;
  centros: CentroData[];
  selectOptions: SelectOptions;
  lookups: LookupMaps;
  grupoSlots: GrupoHorarioSlot[];
  maxHorarios: number | null;
  horarioSaving: boolean;
  studentConflictHorarios: MatriculaTree["HORARIOS_MATRICULAS"];
  tenantIndividualHorarios: MatriculaHorario[];
  tenantOccupancyHorarios: MatriculaHorario[];
  occupancySesiones: SesionOccupancyRow[];
  scheduleAssignmentContext: ScheduleAssignmentContext | null;
  alumnoCenterId?: string | null;
  onCreateHorario: (input: HorarioCreateInput) => Promise<void>;
  onUpdateHorario: (id: string, patch: HorarioUpdateInput) => Promise<void>;
  onRemoveHorario: (id: string) => Promise<void>;
}) {
  const matriculaHorarios = useMemo(
    () =>
      sortMatriculaHorarios(
        horarios.filter((horario) => horario.ID_MATRICULA === matricula.ID_MATRICULA),
      ),
    [horarios, matricula.ID_MATRICULA],
  );
  const matriculaHorarioIds = useMemo(
    () => matriculaHorarios.map((horario) => horario.ID_HORARIO).join("|"),
    [matriculaHorarios],
  );
  const [draftHorarioIds, setDraftHorarioIds] = useState<string[]>([]);
  const [isSchedulesOpen, setIsSchedulesOpen] = useState(false);
  const [sharedEnrollment, setSharedEnrollment] = useState<HorarioFormState>(() =>
    matriculaEnrollmentFromHorarios(matricula, matriculaHorarios),
  );

  useEffect(() => {
    setSharedEnrollment(matriculaEnrollmentFromHorarios(matricula, matriculaHorarios));
  }, [matricula.ID_MATRICULA, matricula.ID_PROFESOR, matricula.ESPECIALIDAD, matriculaHorarioIds]);

  const assignedGrupoHorarioIds = useMemo(
    () =>
      new Set(
        matriculaHorarios
          .map((h) => h.ID_GRUPO_HORARIO)
          .filter((id): id is string => Boolean(id?.trim())),
      ),
    [matriculaHorarioIds],
  );

  const hasExistingHorarios = matriculaHorarios.length > 0;
  useEffect(() => {
    setDraftHorarioIds([]);
  }, [matricula.ID_MATRICULA]);

  const appendEmptyHorario = () => {
    setDraftHorarioIds((prev) => [...prev, `draft-${Date.now()}-${prev.length}`]);
  };

  const removeDraftHorario = (draftId: string) => {
    setDraftHorarioIds((prev) => prev.filter((id) => id !== draftId));
  };

  const { independentHorarios, grupoHorariosByGrupoId } = useMemo(() => {
    const independent: MatriculaHorario[] = [];
    const byGrupoId = new Map<string, MatriculaHorario[]>();
    for (const horario of matriculaHorarios) {
      const grupoId = horario.ID_GRUPO?.trim();
      if (!grupoId) {
        independent.push(horario);
        continue;
      }
      const bucket = byGrupoId.get(grupoId) ?? [];
      bucket.push(horario);
      byGrupoId.set(grupoId, bucket);
    }
    for (const [grupoId, bucket] of byGrupoId) {
      byGrupoId.set(grupoId, sortMatriculaHorarios(bucket));
    }
    return { independentHorarios: independent, grupoHorariosByGrupoId: byGrupoId };
  }, [matriculaHorarios]);

  const matriculaCursoId = matricula.ID_CURSO ?? null;

  const renderExistingHorarioSubForm = (horario: MatriculaHorario, blockIndex: number) => (
    <HorarioSubForm
      key={horario.ID_HORARIO}
      horario={horario}
      lookups={lookups}
      selectOptions={selectOptions}
      grupoSlots={grupoSlots}
      defaultProfesorId={matricula.ID_PROFESOR}
      defaultEspecialidadId={matricula.ESPECIALIDAD}
      alumnoCenterId={alumnoCenterId}
      matriculaTarifaId={matricula.ID_TARIFA}
      matriculaCursoId={matriculaCursoId}
      centros={centros}
      sharedForm={sharedEnrollment}
      showEnrollmentFields={false}
      blockIndex={blockIndex}
      tariffSessionLimit={maxHorarios}
      tenantIndividualHorarios={tenantIndividualHorarios}
      tenantOccupancyHorarios={tenantOccupancyHorarios}
      occupancySesiones={occupancySesiones}
      scheduleAssignmentContext={scheduleAssignmentContext}
      alumnoId={alumnoId}
      saving={horarioSaving}
      onSave={async (patchOrPatches) => {
        const patch = Array.isArray(patchOrPatches) ? patchOrPatches[0] : patchOrPatches;
        try {
          await onUpdateHorario(horario.ID_HORARIO, patch);
          toast.success("Horario actualizado");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error al actualizar");
        }
      }}
      onDelete={async () => {
        try {
          await onRemoveHorario(horario.ID_HORARIO);
          toast.success("Horario eliminado");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Error al eliminar");
        }
      }}
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <p className="text-xs text-muted-foreground">
          {formatHorarioLimitLabel(matriculaHorarios.length, maxHorarios)}
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
          {hasExistingHorarios && (
            <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
              <div className="border-b bg-muted/20 px-3 py-3">
                <MatriculaEnrollmentFields
                  form={sharedEnrollment}
                  setForm={setSharedEnrollment}
                  selectOptions={selectOptions}
                  grupoSlots={grupoSlots}
                  saving={horarioSaving}
                  defaultProfesorId={matricula.ID_PROFESOR}
                  alumnoCenterId={alumnoCenterId}
                  matriculaTarifaId={matricula.ID_TARIFA}
                  matriculaCursoId={matriculaCursoId}
                  centros={centros}
                />
              </div>
              <div className="space-y-3 p-3">
                {Array.from(grupoHorariosByGrupoId.entries()).map(([grupoId, grupoHorarios]) => (
                  <div
                    key={grupoId}
                    className="overflow-hidden rounded-md border border-primary/20 bg-muted/10 p-2 space-y-1"
                  >
                    {grupoHorarios.map((horario, index) =>
                      renderExistingHorarioSubForm(horario, index),
                    )}
                  </div>
                ))}

                {independentHorarios.length > 0 && (
                  <div className="space-y-2">
                    {independentHorarios.map((horario, index) =>
                      renderExistingHorarioSubForm(horario, index),
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {draftHorarioIds.length > 0 && (
            <div
              className={cn(
                "space-y-2",
                hasExistingHorarios && "rounded-lg border border-dashed bg-muted/10 p-3",
              )}
            >
              {draftHorarioIds.map((draftId, draftIndex) => (
                <HorarioSubForm
                  key={draftId}
                  horario={null}
                  lookups={lookups}
                  selectOptions={selectOptions}
                  grupoSlots={grupoSlots}
                  defaultProfesorId={matricula.ID_PROFESOR}
                  defaultEspecialidadId={
                    hasExistingHorarios
                      ? sharedEnrollment.idEspecialidad || matricula.ESPECIALIDAD
                      : matricula.ESPECIALIDAD
                  }
                  alumnoCenterId={alumnoCenterId}
                  matriculaTarifaId={matricula.ID_TARIFA}
                  matriculaCursoId={matriculaCursoId}
                  centros={centros}
                  showEnrollmentFields={!hasExistingHorarios}
                  blockIndex={matriculaHorarios.length + draftIndex}
                  tariffSessionLimit={maxHorarios}
                  appendMode={hasExistingHorarios}
                  assignedGrupoHorarioIds={assignedGrupoHorarioIds}
                  tenantIndividualHorarios={tenantIndividualHorarios}
                  tenantOccupancyHorarios={tenantOccupancyHorarios}
                  occupancySesiones={occupancySesiones}
                  scheduleAssignmentContext={scheduleAssignmentContext}
                  alumnoId={alumnoId}
                  conflictCheckHorarios={matriculaHorarios}
                  studentConflictHorarios={studentConflictHorarios}
                  saving={horarioSaving}
                  onCancel={() => removeDraftHorario(draftId)}
                  onSave={async (patchOrPatches) => {
                    const patches = Array.isArray(patchOrPatches)
                      ? patchOrPatches
                      : [patchOrPatches];
                    if (patches.length === 0) return;
                    try {
                      for (const patch of patches) {
                        const { ID_HORARIO: _omitHorario, ...createPayload } = {
                          ID_MATRICULA: matricula.ID_MATRICULA,
                          ID_ALUMNO: alumnoId,
                          ID_TARIFA: matricula.ID_TARIFA,
                          ...patch,
                        } as HorarioCreateInput & { ID_HORARIO?: string | null };
                        await onCreateHorario(createPayload as HorarioCreateInput);
                      }
                      toast.success(
                        patches.length === 1
                          ? "Horario creado"
                          : `${patches.length} horarios creados`,
                      );
                      removeDraftHorario(draftId);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Error al crear horario");
                    }
                  }}
                />
              ))}
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="brand-outline"
            disabled={horarioSaving}
            onClick={appendEmptyHorario}
          >
            <Plus className="mr-2 h-4 w-4" />
            Añadir horario
          </Button>
        </>
      )}
    </div>
  );
}

function MatriculaRowEditor({
  matricula,
  centros,
  alumnoCenterId,
  selectOptions,
  lookups,
  saving,
  onSave,
  onDelete,
}: {
  matricula: Matricula & { ID_CURSO?: string | null };
  centros: CentroData[];
  alumnoCenterId: string | null;
  selectOptions: SelectOptions;
  lookups: LookupMaps;
  saving: boolean;
  onSave: (patch: {
    ESPECIALIDAD: string | null;
    ID_PROFESOR: string | null;
    ESTADO: string | null;
    ID_CURSO: string | null;
    ID_TARIFA: string | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [especialidad, setEspecialidad] = useState(matricula.ESPECIALIDAD ?? "");
  const [idProfesor, setIdProfesor] = useState(matricula.ID_PROFESOR ?? "");
  const [estado, setEstado] = useState(normalizeMatriculaEstado(matricula.ESTADO));
  const [idCurso, setIdCurso] = useState(() => {
    const saved = matricula.ID_CURSO?.trim() ?? "";
    if (saved) return saved;
    const centerId = matricula.ID_CENTRO?.trim() || alumnoCenterId?.trim() || "";
    return centerId ? resolveCursoIdForCentro(centros, centerId, "") : "";
  });
  const [idTarifa, setIdTarifa] = useState(matricula.ID_TARIFA ?? "");

  useEffect(() => {
    setEspecialidad(matricula.ESPECIALIDAD ?? "");
    setIdProfesor(matricula.ID_PROFESOR ?? "");
    setEstado(normalizeMatriculaEstado(matricula.ESTADO));
    setIdTarifa(matricula.ID_TARIFA ?? "");
    const centerId = matricula.ID_CENTRO?.trim() || alumnoCenterId?.trim() || "";
    const savedCurso = matricula.ID_CURSO?.trim() ?? "";
    setIdCurso(savedCurso || (centerId ? resolveCursoIdForCentro(centros, centerId, "") : ""));
  }, [
    matricula.ID_MATRICULA,
    matricula.ESPECIALIDAD,
    matricula.ID_PROFESOR,
    matricula.ESTADO,
    matricula.ID_CURSO,
    matricula.ID_TARIFA,
    matricula.ID_CENTRO,
    centros,
    alumnoCenterId,
  ]);

  const matriculaCenterId = matricula.ID_CENTRO?.trim() || alumnoCenterId?.trim() || "";
  const cursoOptions = useMemo(
    () => (matriculaCenterId ? cursosForCentro(centros, matriculaCenterId) : []),
    [centros, matriculaCenterId],
  );

  const centroNombre = matriculaCenterId
    ? (centros.find((c) => c.ID_CENTRO === matriculaCenterId)?.NOMBRE_CENTRO ?? matriculaCenterId)
    : "—";

  const savedEstado = normalizeMatriculaEstado(matricula.ESTADO);
  const dirty =
    especialidad !== (matricula.ESPECIALIDAD ?? "") ||
    idProfesor !== (matricula.ID_PROFESOR ?? "") ||
    estado !== savedEstado ||
    idCurso !== (matricula.ID_CURSO ?? "") ||
    idTarifa !== (matricula.ID_TARIFA ?? "");

  const cursoNombre = formatCursoNombre(idCurso, centros, matriculaCenterId);
  const tarifaLabel = idTarifa
    ? (selectOptions.tarifas.find((t) => t.id === idTarifa)?.label ??
      lookups.tarifaById.get(idTarifa) ??
      "Sin tarifa")
    : "Sin tarifa";

  const profesorOptions = useMemo(
    () => profesorSelectOptions(selectOptions.profesores, idProfesor, lookups.profesorById),
    [selectOptions.profesores, idProfesor, lookups.profesorById],
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {tarifaLabel}
          {cursoNombre !== "—" ? (
            <span className="ml-2 font-normal text-muted-foreground">· {cursoNombre}</span>
          ) : null}
          <span className="ml-2 font-normal text-muted-foreground">· {centroNombre}</span>
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="brand"
            disabled={saving || !dirty || !idCurso?.trim() || cursoOptions.length === 0}
            onClick={() => {
              if (!idCurso?.trim()) {
                toast.error("Selecciona un curso escolar.");
                return;
              }
              void onSave({
                ESPECIALIDAD: especialidad || null,
                ID_PROFESOR: idProfesor || null,
                ESTADO: estado || null,
                ID_CURSO: idCurso.trim(),
                ID_TARIFA: idTarifa || null,
              });
            }}
          >
            Guardar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={saving}
            onClick={() => void onDelete()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Centro: <span className="font-medium text-foreground">{centroNombre}</span>
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Curso escolar <span className="text-destructive">*</span>
          </Label>
          <Select
            value={idCurso || undefined}
            onValueChange={setIdCurso}
            disabled={saving || !matriculaCenterId || cursoOptions.length === 0}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Seleccionar curso" />
            </SelectTrigger>
            <SelectContent>
              {cursoOptions.map((curso) => (
                <SelectItem key={curso.ID_CURSO} value={String(curso.ID_CURSO)}>
                  {curso.NOMBRE_CURSO}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {matriculaCenterId && cursoOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Este centro no tiene cursos escolares activos.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tarifa</Label>
          <Select value={idTarifa || undefined} onValueChange={setIdTarifa} disabled={saving}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.tarifas.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Especialidad</Label>
          <Select
            value={especialidad || undefined}
            onValueChange={setEspecialidad}
            disabled={saving}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.especialidades.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Profesor</Label>
          <Select value={idProfesor || undefined} onValueChange={setIdProfesor} disabled={saving}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {profesorOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Estado</Label>
          <Select
            value={estado}
            onValueChange={(val) => setEstado(val as "Activo" | "Inactivo")}
            disabled={saving}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATRICULA_ESTADOS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Card>
  );
}

export type DraftMatriculaInput = {
  ESPECIALIDAD: string;
  ID_TARIFA: string | null;
  ID_PROFESOR: string | null;
  ID_CURSO: string | null;
};

function DraftMatriculaPanel({
  centros,
  alumnoCenterId,
  selectOptions,
  lookups,
  draftMatriculas,
  onAdd,
  onRemove,
}: {
  centros: CentroData[];
  alumnoCenterId: string | null;
  selectOptions: SelectOptions;
  lookups: LookupMaps;
  draftMatriculas: DraftMatriculaInput[];
  onAdd: (input: DraftMatriculaInput) => void;
  onRemove: (index: number) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newEspecialidad, setNewEspecialidad] = useState("");
  const [newTarifa, setNewTarifa] = useState("");
  const [newProfesor, setNewProfesor] = useState("");
  const [newCurso, setNewCurso] = useState("");

  const cursoOptions = useMemo(
    () => (alumnoCenterId ? cursosForCentro(centros, alumnoCenterId) : []),
    [centros, alumnoCenterId],
  );

  const cursoNombreById = useMemo(() => {
    const map = new Map<string, string>();
    for (const centro of centros) {
      for (const curso of centro.CURSO_ESCOLAR ?? []) {
        map.set(curso.ID_CURSO, curso.NOMBRE_CURSO);
      }
    }
    return map;
  }, [centros]);

  useEffect(() => {
    if (!showAdd || !alumnoCenterId) return;
    setNewCurso((prev) => resolveCursoIdForCentro(centros, alumnoCenterId, prev));
  }, [showAdd, alumnoCenterId, centros]);

  const newMatriculaProfesorOptions = useMemo(
    () => profesorSelectOptions(selectOptions.profesores, newProfesor, lookups.profesorById),
    [selectOptions.profesores, newProfesor, lookups.profesorById],
  );

  const resetAddForm = () => {
    setNewEspecialidad("");
    setNewTarifa("");
    setNewProfesor("");
    setNewCurso(alumnoCenterId ? resolveCursoIdForCentro(centros, alumnoCenterId, "") : "");
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      {draftMatriculas.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Añade las matrículas del nuevo alumno. Se guardarán junto con su ficha.
        </p>
      ) : (
        <div className="space-y-2">
          {draftMatriculas.map((mat, index) => (
            <Card key={index} className="flex items-center justify-between p-3">
              <div className="text-sm">
                <span className="font-medium">
                  {selectOptions.especialidades.find((e) => e.id === mat.ESPECIALIDAD)?.label ??
                    mat.ESPECIALIDAD}
                </span>
                {mat.ID_TARIFA && (
                  <span className="ml-2 text-muted-foreground">
                    {selectOptions.tarifas.find((t) => t.id === mat.ID_TARIFA)?.label}
                  </span>
                )}
                {mat.ID_CURSO && (
                  <span className="ml-2 text-muted-foreground">
                    {cursoNombreById.get(mat.ID_CURSO) ?? mat.ID_CURSO}
                  </span>
                )}
                {mat.ID_PROFESOR && (
                  <span className="ml-2 text-muted-foreground">
                    {lookups.profesorById.get(mat.ID_PROFESOR) ?? mat.ID_PROFESOR}
                  </span>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {showAdd ? (
        <Card className="space-y-3 border-dashed p-4">
          <p className="text-sm font-medium">Nueva matrícula</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Curso escolar *</Label>
              <Select
                value={newCurso || undefined}
                onValueChange={setNewCurso}
                disabled={!alumnoCenterId || cursoOptions.length === 0}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar curso" />
                </SelectTrigger>
                <SelectContent>
                  {cursoOptions.map((curso) => (
                    <SelectItem key={curso.ID_CURSO} value={String(curso.ID_CURSO)}>
                      {curso.NOMBRE_CURSO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {alumnoCenterId && cursoOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Este centro no tiene cursos escolares activos.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Especialidad *</Label>
              <Select value={newEspecialidad || undefined} onValueChange={setNewEspecialidad}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {selectOptions.especialidades.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tarifa</Label>
              <Select value={newTarifa || undefined} onValueChange={setNewTarifa}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {selectOptions.tarifas.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Profesor</Label>
              <Select value={newProfesor || undefined} onValueChange={setNewProfesor}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {newMatriculaProfesorOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetAddForm}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="brand"
              size="sm"
              disabled={!newEspecialidad || (cursoOptions.length > 0 && !newCurso)}
              onClick={() => {
                onAdd({
                  ESPECIALIDAD: newEspecialidad,
                  ID_TARIFA: newTarifa || null,
                  ID_PROFESOR: newProfesor || null,
                  ID_CURSO: newCurso || null,
                });
                resetAddForm();
              }}
            >
              Añadir a la lista
            </Button>
          </div>
        </Card>
      ) : (
        <Button type="button" variant="brand-outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir Matrícula
        </Button>
      )}
    </div>
  );
}

function MatriculaManagePanel({
  centros,
  alumnoId,
  alumnoCenterId,
  selectOptions,
  lookups,
  tarifaSesionesById,
  grupoSlots,
  onCreateHorario,
  onUpdateHorario,
  onRemoveHorario,
  horarioSaving,
  treeMatriculas,
}: {
  centros: CentroData[];
  alumnoId: string | null;
  alumnoCenterId?: string | null;
  selectOptions: SelectOptions;
  lookups: LookupMaps;
  tarifaSesionesById: Map<string, number | null>;
  grupoSlots: GrupoHorarioSlot[];
  onCreateHorario: (input: HorarioCreateInput) => Promise<void>;
  onUpdateHorario: (id: string, patch: HorarioUpdateInput) => Promise<void>;
  onRemoveHorario: (id: string) => Promise<void>;
  horarioSaving: boolean;
  treeMatriculas?: MatriculaTree[];
}) {
  const { tenantId } = useActiveTenant();
  const { list, create, update, remove } = useAlumnoMatriculas(alumnoId);
  const allMatriculasQuery = useMatriculas(null);
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
  const [showAdd, setShowAdd] = useState(false);
  const [newEspecialidad, setNewEspecialidad] = useState("");
  const [newTarifa, setNewTarifa] = useState("");
  const [newProfesor, setNewProfesor] = useState("");
  const [newCurso, setNewCurso] = useState("");

  const effectiveCenterId = alumnoCenterId?.trim() ?? "";
  const cursoOptions = useMemo(
    () => (effectiveCenterId ? cursosForCentro(centros, effectiveCenterId) : []),
    [centros, effectiveCenterId],
  );

  useEffect(() => {
    if (!showAdd || !effectiveCenterId) return;
    setNewCurso((prev) => resolveCursoIdForCentro(centros, effectiveCenterId, prev));
  }, [showAdd, effectiveCenterId, centros]);

  const matriculaSaving = create.isPending || update.isPending || remove.isPending;
  const matriculas = list.data && list.data.length > 0 ? list.data : (treeMatriculas ?? []);

  const newMatriculaProfesorOptions = useMemo(
    () => profesorSelectOptions(selectOptions.profesores, newProfesor, lookups.profesorById),
    [selectOptions.profesores, newProfesor, lookups.profesorById],
  );

  const horariosByMatricula = useMemo(
    () => buildHorariosByMatricula(treeMatriculas),
    [treeMatriculas],
  );

  const studentConflictHorarios = useMemo(
    () => (treeMatriculas ?? []).flatMap((mat) => mat.HORARIOS_MATRICULAS ?? []),
    [treeMatriculas],
  );

  const tenantIndividualHorarios = useMemo(
    () =>
      (allMatriculasQuery.list.data?.rows ?? [])
        .flatMap((mat) => mat.HORARIOS_MATRICULAS ?? [])
        .filter(isIndividualHorarioForOccupancy),
    [allMatriculasQuery.list.data],
  );

  const tenantHorarios = useMemo(
    () =>
      (allMatriculasQuery.list.data?.rows ?? []).flatMap(
        (mat) => mat.HORARIOS_MATRICULAS ?? [],
      ) as MatriculaHorario[],
    [allMatriculasQuery.list.data],
  );

  const scheduleAssignmentContext = useMemo(() => {
    if (!occupancyMetaQuery.data) return null;
    return buildScheduleAssignmentContext(
      grupoSlots,
      tenantHorarios,
      occupancyMetaQuery.data.sesiones,
      occupancyMetaQuery.data.aulaCapacidadById,
    );
  }, [grupoSlots, tenantHorarios, occupancyMetaQuery.data]);

  if (!alumnoId) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Guarda el alumno primero para gestionar matrículas.
      </p>
    );
  }

  if (list.isLoading && !(treeMatriculas && treeMatriculas.length > 0)) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Cargando matrículas…</p>;
  }

  if (list.isError) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        {(list.error as Error)?.message ?? "Error al cargar matrículas."}
      </p>
    );
  }

  const resetAddForm = () => {
    setNewEspecialidad("");
    setNewTarifa("");
    setNewProfesor("");
    setNewCurso(effectiveCenterId ? resolveCursoIdForCentro(centros, effectiveCenterId, "") : "");
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      {matriculas.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
          Este alumno no tiene matrículas registradas.
        </p>
      ) : (
        matriculas.map((mat) => {
          const horarios = horariosByMatricula.get(mat.ID_MATRICULA) ?? [];
          const maxHorarios = mat.ID_TARIFA
            ? (tarifaSesionesById.get(mat.ID_TARIFA) ?? null)
            : null;
          return (
            <div key={mat.ID_MATRICULA} className="space-y-3">
              <MatriculaRowEditor
                matricula={mat}
                centros={centros}
                alumnoCenterId={alumnoCenterId ?? null}
                selectOptions={selectOptions}
                lookups={lookups}
                saving={matriculaSaving}
                onSave={async (patch) => {
                  try {
                    await update.mutateAsync({ id: mat.ID_MATRICULA, patch });
                    toast.success("Matrícula actualizada");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Error al actualizar");
                  }
                }}
                onDelete={async () => {
                  try {
                    await remove.mutateAsync(mat.ID_MATRICULA);
                    toast.success("Matrícula eliminada");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Error al eliminar");
                  }
                }}
              />

              <MatriculaHorariosGroup
                key={mat.ID_MATRICULA}
                matricula={mat}
                horarios={horarios}
                alumnoId={alumnoId}
                centros={centros}
                alumnoCenterId={alumnoCenterId}
                selectOptions={selectOptions}
                lookups={lookups}
                grupoSlots={grupoSlots}
                maxHorarios={maxHorarios}
                horarioSaving={horarioSaving}
                studentConflictHorarios={studentConflictHorarios}
                tenantIndividualHorarios={tenantIndividualHorarios}
                tenantOccupancyHorarios={tenantHorarios}
                occupancySesiones={occupancyMetaQuery.data?.sesiones ?? []}
                scheduleAssignmentContext={scheduleAssignmentContext}
                onCreateHorario={onCreateHorario}
                onUpdateHorario={onUpdateHorario}
                onRemoveHorario={onRemoveHorario}
              />
            </div>
          );
        })
      )}

      {showAdd ? (
        <Card className="space-y-3 border-dashed p-4">
          <p className="text-sm font-medium">Nueva matrícula</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Curso escolar *</Label>
              <Select
                value={newCurso || undefined}
                onValueChange={setNewCurso}
                disabled={matriculaSaving || !effectiveCenterId || cursoOptions.length === 0}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar curso" />
                </SelectTrigger>
                <SelectContent>
                  {cursoOptions.map((curso) => (
                    <SelectItem key={curso.ID_CURSO} value={String(curso.ID_CURSO)}>
                      {curso.NOMBRE_CURSO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {effectiveCenterId && cursoOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Este centro no tiene cursos escolares activos.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Especialidad *</Label>
              <Select
                value={newEspecialidad || undefined}
                onValueChange={setNewEspecialidad}
                disabled={matriculaSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {selectOptions.especialidades.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tarifa</Label>
              <Select
                value={newTarifa || undefined}
                onValueChange={setNewTarifa}
                disabled={matriculaSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {selectOptions.tarifas.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Profesor</Label>
              <Select
                value={newProfesor || undefined}
                onValueChange={setNewProfesor}
                disabled={matriculaSaving}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {newMatriculaProfesorOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetAddForm}
              disabled={matriculaSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="brand"
              size="sm"
              disabled={
                matriculaSaving || !newEspecialidad || (cursoOptions.length > 0 && !newCurso)
              }
              onClick={async () => {
                try {
                  await create.mutateAsync({
                    ESPECIALIDAD: newEspecialidad,
                    ID_TARIFA: newTarifa || null,
                    ID_PROFESOR: newProfesor || null,
                    ID_CURSO: newCurso || null,
                  });
                  toast.success("Matrícula creada");
                  resetAddForm();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al crear matrícula");
                }
              }}
            >
              {matriculaSaving ? "Guardando…" : "Guardar matrícula"}
            </Button>
          </div>
        </Card>
      ) : (
        <Button type="button" variant="brand-outline" size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir Matrícula
        </Button>
      )}
    </div>
  );
}

export function AlumnoFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  lookups,
  selectOptions,
  tarifaSesionesById,
  grupoSlots,
  horarioSaving,
  centros = [],
  showCentroSelector = false,
  assignedCenterId = null,
  defaultCreateCenterId = null,
  activeTab: controlledActiveTab,
  onTabChange,
  onSubmit,
  onCreateHorario,
  onUpdateHorario,
  onRemoveHorario,
  variant = "dialog",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: AlumnoTree | null;
  submitting: boolean;
  lookups: LookupMaps;
  selectOptions: SelectOptions;
  tarifaSesionesById: Map<string, number | null>;
  grupoSlots: GrupoHorarioSlot[];
  horarioSaving: boolean;
  centros?: CentroData[];
  showCentroSelector?: boolean;
  assignedCenterId?: string | null;
  defaultCreateCenterId?: string | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onSubmit: (
    values: AlumnoFormValues,
    draft?: { id: string; matriculas: DraftMatriculaInput[] },
  ) => void;
  onCreateHorario: (input: HorarioCreateInput) => Promise<void>;
  onUpdateHorario: (id: string, patch: HorarioUpdateInput) => Promise<void>;
  onRemoveHorario: (id: string) => Promise<void>;
  variant?: "dialog" | "embedded";
}) {
  const { rol } = useActiveTenant();
  const initialId = initial?.ID_ALUMNO ?? null;
  const isCreate = !initial;
  const {
    create: createCargoExtra,
    update: updateCargoExtra,
    listByAlumno: cargosExtraByAlumno,
  } = useCargosExtra({
    alumnoId: initialId,
  });
  const [internalActiveTab, setInternalActiveTab] = useState("resumen");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = onTabChange ?? setInternalActiveTab;
  const form = useForm<AlumnoFormInput, unknown, AlumnoFormValues>({
    resolver: zodResolver(alumnoFormSchema),
    defaultValues: initial ? buildAlumnoFormResetValues(initial) : emptyAlumnoFormValues(),
  });

  const nacimiento = form.watch("NACIMIENTO");
  const watchedCentro = form.watch("ID_CENTRO");
  const centroNombreById = useMemo(
    () => new Map(centros.map((c) => [c.ID_CENTRO, c.NOMBRE_CENTRO])),
    [centros],
  );
  const alumnoCenterId =
    watchedCentro?.trim() || initial?.ID_CENTRO?.trim() || assignedCenterId?.trim() || null;
  const nombreAlumno = form.watch("NOMBRE_ALUMNO") ?? "";
  const metodoPago = normalizeMetodoPago(form.watch("METODO_PAGO"));
  const tlfComunicacion = form.watch("TLF_COMUNICACION");
  const tlfAlumno = form.watch("TLF_ALUMNO");
  const tlfMadre = form.watch("TLF_MADRE");
  const tlfPadre = form.watch("TLF_PADRE");
  const bizumPhones = useMemo(
    () =>
      collectBizumPhoneOptions({
        TLF_COMUNICACION: tlfComunicacion,
        TLF_ALUMNO: tlfAlumno,
        TLF_MADRE: tlfMadre,
        TLF_PADRE: tlfPadre,
      }),
    [tlfComunicacion, tlfAlumno, tlfMadre, tlfPadre],
  );
  const edad = useMemo(() => calcEdad(nacimiento), [nacimiento]);
  const isSepa = isBankRemittancePaymentMethod(metodoPago);
  const isBizum = isBizumPaymentMethod(metodoPago);

  const editingKey = initialId ? String(initialId) : "create";
  const formInitKeyRef = useRef<string | null>(null);
  const [draftAlumnoId, setDraftAlumnoId] = useState("");
  const [draftMatriculas, setDraftMatriculas] = useState<DraftMatriculaInput[]>([]);
  const [cargoExtraOpen, setCargoExtraOpen] = useState(false);
  const [cargoExtraDetailOpen, setCargoExtraDetailOpen] = useState(false);
  const [selectedCargoExtra, setSelectedCargoExtra] = useState<CargoExtraRow | null>(null);
  const [cargoConcepto, setCargoConcepto] = useState("");
  const [cargoCantidad, setCargoCantidad] = useState("1");
  const [cargoPrecioUnitario, setCargoPrecioUnitario] = useState("");
  const [cargoPorcentajeIva, setCargoPorcentajeIva] = useState("0");
  const canAddCargoExtra = canAddCargoExtraRole(rol);
  const cargoExtraTotal = calcCargoExtraTotal(
    cargoCantidad,
    cargoPrecioUnitario,
    cargoPorcentajeIva,
  );

  const resetCargoExtraForm = () => {
    setCargoConcepto("");
    setCargoCantidad("1");
    setCargoPrecioUnitario("");
    setCargoPorcentajeIva("0");
  };

  const handleOpenCargoExtra = () => {
    resetCargoExtraForm();
    setCargoExtraOpen(true);
  };

  const handleCloseCargoExtra = () => {
    setCargoExtraOpen(false);
    resetCargoExtraForm();
  };

  const handleSaveCargoExtra = async () => {
    if (!initialId || !alumnoCenterId) {
      toast.error("Guarda el alumno antes de añadir cargos extra.");
      return;
    }

    try {
      await createCargoExtra.mutateAsync({
        ID_ALUMNO: initialId,
        ID_CENTRO: alumnoCenterId,
        CONCEPTO: cargoConcepto,
        CANTIDAD: Number(cargoCantidad),
        PRECIO_UNITARIO: Number(cargoPrecioUnitario),
        PORCENTAJE_IVA: Number(cargoPorcentajeIva),
      });

      const { data: alumnoRow, error: alumnoError } = await supabase
        .from("ALUMNOS")
        .select("TOTAL_MENSUAL")
        .eq("ID_ALUMNO", initialId)
        .maybeSingle();

      if (alumnoError) throw alumnoError;
      if (alumnoRow?.TOTAL_MENSUAL != null) {
        form.setValue("TOTAL_MENSUAL", alumnoRow.TOTAL_MENSUAL);
      }

      toast.success("Cargo extra añadido correctamente.");
      handleCloseCargoExtra();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo añadir el cargo extra.");
    }
  };

  useEffect(() => {
    if (!open) {
      formInitKeyRef.current = null;
      return;
    }
    if (formInitKeyRef.current === editingKey) return;
    formInitKeyRef.current = editingKey;

    if (initial) {
      form.reset(buildAlumnoFormResetValues(initial));
      return;
    }
    form.reset({
      ...emptyAlumnoFormValues(),
      ID_CENTRO: showCentroSelector ? defaultCreateCenterId : assignedCenterId,
    });
    setDraftAlumnoId(crypto.randomUUID());
    setDraftMatriculas([]);
  }, [
    open,
    editingKey,
    initial,
    form,
    showCentroSelector,
    assignedCenterId,
    defaultCreateCenterId,
  ]);

  const handleFormSubmit = (values: AlumnoFormValues) => {
    if (showCentroSelector && !values.ID_CENTRO?.trim()) {
      form.setError("ID_CENTRO", { message: "Selecciona un centro" });
      return;
    }
    const ajusteManual = values.AJUSTE_MANUAL_EUR;
    const ajusteDistintoDeCero =
      ajusteManual != null && Number.isFinite(Number(ajusteManual)) && Number(ajusteManual) !== 0;
    if (ajusteDistintoDeCero && !values.MOTIVO_AJUSTE?.trim()) {
      form.setError("MOTIVO_AJUSTE", {
        message: "El motivo es obligatorio cuando el ajuste manual es distinto de 0.",
      });
      setActiveTab("pago");
      return;
    }
    const draft = isCreate ? { id: draftAlumnoId, matriculas: draftMatriculas } : undefined;
    if (isCreate && !showCentroSelector && assignedCenterId) {
      onSubmit({ ...values, ID_CENTRO: assignedCenterId }, draft);
      return;
    }
    onSubmit(values, draft);
  };

  const formBody = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-2 grid h-auto w-full grid-cols-2 gap-1 p-1 md:h-9 md:grid-cols-4 md:gap-0">
            <TabsTrigger value="resumen" className="text-xs md:text-sm">Resumen</TabsTrigger>
            <TabsTrigger value="personales" className="text-xs md:text-sm">
              Datos personales
            </TabsTrigger>
            <TabsTrigger value="pago" className="text-xs md:text-sm">Datos de pago</TabsTrigger>
            <TabsTrigger value="matricula" className="text-xs md:text-sm">Académico</TabsTrigger>
          </TabsList>

          {showCentroSelector && (
            <p className="mb-4 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Centro: </span>
              <span className="font-medium">
                {formatCentroNombre(watchedCentro, centroNombreById)}
              </span>
            </p>
          )}

          <TabsContent value="resumen" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {showCentroSelector && (
              <FormField
                control={form.control as any}
                name="ID_CENTRO"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Centro *</FormLabel>
                    <Select
                      value={field.value ? String(field.value) : "__unset__"}
                      onValueChange={(v) => field.onChange(v === "__unset__" ? null : v)}
                      disabled={submitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar centro" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {centros.map((centro) => (
                          <SelectItem key={centro.ID_CENTRO} value={String(centro.ID_CENTRO)}>
                            {centro.NOMBRE_CENTRO}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control as any}
              name="NOMBRE_ALUMNO"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre alumno *</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={submitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control as any}
              name="TLF_COMUNICACION"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tel. comunicación</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} disabled={submitting} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control as any}
              name="MAIL"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control as any}
              name="ESTADO_MATRICULA"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado matrícula</FormLabel>
                  <Select
                    value={resolveEstadoSelectValue(field.value)}
                    onValueChange={(v) => field.onChange(v === "__unset__" ? null : v)}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__unset__">—</SelectItem>
                      {estadoSelectOptions(field.value, ESTADO_OPCIONES).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control as any}
              name="ESTADO_RESERVA"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado reserva</FormLabel>
                  <Select
                    value={resolveEstadoSelectValue(field.value)}
                    onValueChange={(v) => field.onChange(v === "__unset__" ? null : v)}
                    disabled={submitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__unset__">—</SelectItem>
                      {estadoSelectOptions(field.value, ESTADO_OPCIONES).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control as any}
              name="TOTAL_MENSUAL"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total mensual (€)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      value={field.value ?? ""}
                      readOnly
                      disabled
                      className="bg-muted/40"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control as any}
              name="NOTAS"
              render={({ field }) => (
                <FormItem className="sm:col-span-2 lg:col-span-3">
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={3} disabled={submitting} />
                  </FormControl>
                </FormItem>
              )}
            />
          </TabsContent>

          <TabsContent value="personales" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control as any}
                name="DNI"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>DNI</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="NACIMIENTO"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nacimiento</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ?? ""}
                        disabled={submitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Label>Edad actual</Label>
                <Input value={edad} disabled readOnly className="bg-muted/40" />
              </div>
              <FormField
                control={form.control as any}
                name="NOMBRE_MADRE"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tutor A — Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="TLF_MADRE"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tutor A — Teléfono</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="NOMBRE_PADRE"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tutor B — Nombre</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="TLF_PADRE"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tutor B — Teléfono</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="DIRECCION"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="CP"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CP</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="MUNICIPIO"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Municipio</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="PROVINCIA"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provincia</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <p className="text-sm font-medium">Autorizaciones legales</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["AUT_MEDIOS", "Medios"],
                    ["AUT_INSTALACIONES", "Instalaciones"],
                    ["AUT_WEB", "Web"],
                    ["AUT_RRSS", "RRSS"],
                    ["AUT_COMUNICACION_TOTAL", "Comunicación total"],
                  ] as const
                ).map(([name, label]) => (
                  <FormField
                    key={name}
                    control={form.control as any}
                    name={name}
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                        <FormLabel className="!mt-0">{label}</FormLabel>
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                            disabled={submitting}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pago" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control as any}
                name="METODO_PAGO"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Método de pago</FormLabel>
                    <Select
                      value={resolveMetodoPagoSelectValue(field.value)}
                      onValueChange={(v) => {
                        const next = v === "__unset__" ? null : (v as MetodoPagoOption);
                        field.onChange(next);
                        const normalized = normalizeMetodoPago(next);
                        if (!isBankRemittancePaymentMethod(normalized)) {
                          form.setValue("IBAN", null);
                          form.setValue("TITULAR_CUENTA", null);
                          form.setValue("MANDATO", null);
                        }
                        if (!isBizumPaymentMethod(normalized)) {
                          form.setValue("TLF_BIZUM", null);
                        }
                      }}
                      disabled={submitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar método" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__unset__">—</SelectItem>
                        {METODOS_PAGO_OPCIONES.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isSepa && (
                <>
                  <FormField
                    control={form.control as any}
                    name="IBAN"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IBAN</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} disabled={submitting} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control as any}
                    name="TITULAR_CUENTA"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Titular cuenta</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} disabled={submitting} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </>
              )}

              {isBizum && (
                <FormField
                  control={form.control as any}
                  name="TLF_BIZUM"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono Bizum</FormLabel>
                      <Select
                        value={field.value ?? "__unset__"}
                        onValueChange={(v) => field.onChange(v === "__unset__" ? null : v)}
                        disabled={submitting || bizumPhones.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar teléfono" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__unset__">—</SelectItem>
                          {bizumPhones.map((phone) => (
                            <SelectItem key={phone} value={phone}>
                              {phone}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {bizumPhones.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Añade un teléfono del alumno o tutores en Datos personales.
                        </p>
                      )}
                    </FormItem>
                  )}
                />
              )}

              {isSepa && (
                <SepaMandatoBlock
                  alumnoId={initialId}
                  alumnoNombre={nombreAlumno.trim() || "Alumno"}
                  interactive
                  createMode={isCreate}
                  disabled={submitting}
                />
              )}

              <FormField
                control={form.control as any}
                name="DTO_HERMANOS_PORCENTAJE"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dto. hermanos (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={submitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">
                El ajuste manual (positivo o negativo) se convertirá en una línea del recibo al
                generar la remesa. No modifica un recibo ya generado; si el importe es distinto de
                0, el motivo es obligatorio.
              </p>
              <FormField
                control={form.control as any}
                name="AJUSTE_MANUAL_EUR"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ajuste manual (€)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={submitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control as any}
                name="MOTIVO_AJUSTE"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Motivo ajuste</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} disabled={submitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {!isCreate && initialId && (
              <div className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold tracking-tight">Cargos extra</h3>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Precio unit.</TableHead>
                        <TableHead className="text-right">IVA %</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Recibo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cargosExtraByAlumno.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                            Cargando cargos extra...
                          </TableCell>
                        </TableRow>
                      ) : cargosExtraByAlumno.isError ? (
                        <TableRow>
                          <TableCell
                            colSpan={8}
                            className="py-6 text-center text-sm text-destructive"
                          >
                            {(cargosExtraByAlumno.error as Error)?.message ??
                              "Error al cargar los cargos extra."}
                          </TableCell>
                        </TableRow>
                      ) : (cargosExtraByAlumno.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                            Sin cargos extra
                          </TableCell>
                        </TableRow>
                      ) : (
                        (cargosExtraByAlumno.data ?? []).map((row) => (
                          <TableRow
                            key={row.ID_CARGO}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => {
                              setSelectedCargoExtra(row);
                              setCargoExtraDetailOpen(true);
                            }}
                          >
                            <TableCell>{row.CONCEPTO}</TableCell>
                            <TableCell className="text-right">{row.CANTIDAD}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(row.PRECIO_UNITARIO)}
                            </TableCell>
                            <TableCell className="text-right">{row.PORCENTAJE_IVA}%</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(calcCargoExtraRowTotal(row))}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                status={cargoExtraEstadoStatus(row.ESTADO)}
                                className="capitalize"
                              >
                                {row.ESTADO ?? "—"}
                              </StatusBadge>
                            </TableCell>
                            <TableCell>{formatCargoExtraFecha(row)}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {row.ID_RECIBO_VINCULADO ? (
                                <span title={row.ID_RECIBO_VINCULADO}>Vinculado a recibo</span>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {!isCreate && initialId && canAddCargoExtra && (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="brand-outline"
                  size="sm"
                  onClick={handleOpenCargoExtra}
                  disabled={submitting}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Añadir cargo extra
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="matricula">
            {isCreate ? (
              <DraftMatriculaPanel
                centros={centros}
                alumnoCenterId={alumnoCenterId}
                selectOptions={selectOptions}
                lookups={lookups}
                draftMatriculas={draftMatriculas}
                onAdd={(input) => setDraftMatriculas((prev) => [...prev, input])}
                onRemove={(index) =>
                  setDraftMatriculas((prev) => prev.filter((_, i) => i !== index))
                }
              />
            ) : (
              <MatriculaManagePanel
                centros={centros}
                alumnoId={initial?.ID_ALUMNO ?? null}
                alumnoCenterId={alumnoCenterId}
                selectOptions={selectOptions}
                lookups={lookups}
                tarifaSesionesById={tarifaSesionesById}
                grupoSlots={grupoSlots}
                horarioSaving={horarioSaving}
                treeMatriculas={Array.isArray(initial?.MATRICULAS) ? initial.MATRICULAS : undefined}
                onCreateHorario={onCreateHorario}
                onUpdateHorario={onUpdateHorario}
                onRemoveHorario={onRemoveHorario}
              />
            )}
          </TabsContent>
        </Tabs>

        {variant === "dialog" ? (
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        ) : (
          <div className="mt-6 flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );

  const cargoExtraDialog = (
    <Dialog open={cargoExtraOpen} onOpenChange={(next) => !next && handleCloseCargoExtra()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir cargo extra</DialogTitle>
          <DialogDescription>
            El cargo quedará pendiente hasta generar la remesa mensual del alumno.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cargo-concepto">Concepto *</Label>
            <Input
              id="cargo-concepto"
              value={cargoConcepto}
              onChange={(e) => setCargoConcepto(e.target.value)}
              disabled={createCargoExtra.isPending}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cargo-cantidad">Cantidad *</Label>
              <Input
                id="cargo-cantidad"
                type="number"
                min="0.01"
                step="0.01"
                value={cargoCantidad}
                onChange={(e) => setCargoCantidad(e.target.value)}
                disabled={createCargoExtra.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cargo-precio">Precio unitario (€) *</Label>
              <Input
                id="cargo-precio"
                type="number"
                step="0.01"
                value={cargoPrecioUnitario}
                onChange={(e) => setCargoPrecioUnitario(e.target.value)}
                disabled={createCargoExtra.isPending}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cargo-iva">IVA (%) *</Label>
              <Input
                id="cargo-iva"
                type="number"
                step="0.01"
                value={cargoPorcentajeIva}
                onChange={(e) => setCargoPorcentajeIva(e.target.value)}
                disabled={createCargoExtra.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label>Total</Label>
              <Input
                value={cargoExtraTotal != null ? formatCurrency(cargoExtraTotal) : "—"}
                readOnly
                disabled
                className="bg-muted/40"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={handleCloseCargoExtra}
            disabled={createCargoExtra.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="brand"
            onClick={handleSaveCargoExtra}
            disabled={createCargoExtra.isPending}
          >
            {createCargoExtra.isPending ? "Guardando..." : "Guardar cargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const cargoExtraDetailDialog = (
    <CargoExtraDetailDialog
      open={cargoExtraDetailOpen}
      onOpenChange={setCargoExtraDetailOpen}
      cargo={selectedCargoExtra}
      canEdit={canAddCargoExtra}
      updating={updateCargoExtra.isPending}
      onUpdate={(input) => updateCargoExtra.mutateAsync(input)}
      onUpdated={async (updated) => {
        setSelectedCargoExtra(updated);
        if (!initialId) return;
        const { data: alumnoRow, error: alumnoError } = await supabase
          .from("ALUMNOS")
          .select("TOTAL_MENSUAL")
          .eq("ID_ALUMNO", initialId)
          .maybeSingle();
        if (alumnoError) return;
        if (alumnoRow?.TOTAL_MENSUAL != null) {
          form.setValue("TOTAL_MENSUAL", alumnoRow.TOTAL_MENSUAL);
        }
      }}
    />
  );

  if (variant === "embedded") {
    if (!open) return null;
    return (
      <>
        {formBody}
        {cargoExtraDialog}
        {cargoExtraDetailDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {formBody}
        </DialogContent>
      </Dialog>
      {cargoExtraDialog}
      {cargoExtraDetailDialog}
    </>
  );
}
