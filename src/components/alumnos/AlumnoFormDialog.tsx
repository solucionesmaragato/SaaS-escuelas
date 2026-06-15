import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  alumnoFormSchema,
  alumnoToFormValues,
  calcEdad,
  emptyAlumnoFormValues,
  type AlumnoFormInput,
  type AlumnoFormValues,
} from "@/lib/alumnoSchema";
import type { AlumnoTree, MatriculaTree } from "@/hooks/useAlumnosTree";
import type { HorarioCreateInput, HorarioUpdateInput } from "@/hooks/useAlumnosTree";
import { useAlumnoMatriculas } from "@/hooks/useAlumnoMatriculas";
import type { Matricula } from "@/types/database";
import { countGrupoAlumnos, type GrupoHorarioSlot } from "@/hooks/useGruposHorarios";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  METODOS_PAGO_OPCIONES,
  collectBizumPhoneOptions,
  isBankRemittancePaymentMethod,
  isBizumPaymentMethod,
  normalizeMetodoPago,
} from "@/lib/alumnoPaymentUtils";

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

function normalizeMatriculaEstado(estado: string | null | undefined): (typeof MATRICULA_ESTADOS)[number] {
  return estado?.trim().toLowerCase() === "inactivo" ? "Inactivo" : "Activo";
}

function formatHorarioLimitLabel(current: number, max: number | null | undefined): string {
  const maxLabel = max != null ? String(max) : "—";
  return `Horarios asignados: ${current} / ${maxLabel}`;
}

function isHorarioLimitReached(current: number, max: number | null | undefined): boolean {
  return max != null && current >= max;
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

function normalizeTipoClase(value: string | null | undefined): (typeof TIPO_CLASE_OPCIONES)[number] {
  const v = value?.trim().toLowerCase() ?? "";
  if (v === "colectiva" || v === "grupo") return "Colectiva";
  return "Individual";
}

function normalizeTipoSesion(value: string | null | undefined): (typeof TIPO_SESION_OPCIONES)[number] {
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
        ? durationMinutesBetween(
            slot.HORA_INICIO.slice(0, 5),
            slot.HORA_FIN.slice(0, 5),
          )
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

function hasStudentScheduleOverlap(
  dia: string,
  horaInicio: string,
  horaFin: string,
  studentHorarios: MatriculaTree["HORARIOS_MATRICULAS"],
  excludeHorarioId?: string | null,
): boolean {
  if (!dia.trim() || !horaInicio || !horaFin) return false;

  for (const horario of studentHorarios) {
    if (excludeHorarioId && horario.ID_HORARIO === excludeHorarioId) continue;
    if (!isHorarioScheduleActivo(horario.ESTADO_MATRICULA)) continue;
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
    if (
      !schedulesTimeOverlap(
        dia,
        horaInicio,
        horaFin,
        slot.dia,
        slot.horaInicio,
        slot.horaFin,
      )
    ) {
      continue;
    }
    const profesorConflict =
      !!idProfesor && !!slot.idProfesor && idProfesor === slot.idProfesor;
    const aulaConflict = !!idAula && !!slot.idAula && idAula === slot.idAula;
    if (profesorConflict || aulaConflict) return true;
  }

  return false;
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
): string | null {
  if (!idProfesor || !dia.trim()) return null;
  const diaNorm = dia.trim().toLowerCase();
  const slots = grupoSlots
    .filter(
      (s) =>
        s.ID_PROFESOR === idProfesor &&
        (s.DIA_SEMANA ?? "").trim().toLowerCase() === diaNorm,
    )
    .sort((a, b) => (a.HORA_INICIO ?? "").localeCompare(b.HORA_INICIO ?? ""));

  if (slots.length === 0) return "Profesor libre este día";

  const parts = slots.map((s) => {
    const ini = s.HORA_INICIO?.slice(0, 5) ?? "?";
    const fin = s.HORA_FIN?.slice(0, 5) ?? "?";
    return `${ini}-${fin}`;
  });

  return `Ocupado hoy: ${parts.join(", ")}`;
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
  const grupo = slot?.GRUPOS as { ID_TARIFA?: string | null } | null | undefined;
  return grupo?.ID_TARIFA;
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
}: {
  form: HorarioFormState;
  setForm: Dispatch<SetStateAction<HorarioFormState>>;
  selectOptions: SelectOptions;
  grupoSlots: GrupoHorarioSlot[];
  saving: boolean;
  defaultProfesorId?: string | null;
}) {
  const hasEspecialidad = !!form.idEspecialidad;
  const isColectiva = form.tipoClase === "Colectiva";
  const cascadeDisabled = saving || !hasEspecialidad;

  const grupoOptions = useMemo(() => {
    if (!form.idEspecialidad) return [];
    const seen = new Set<string>();
    const options: { id: string; label: string }[] = [];
    for (const slot of grupoSlots) {
      if (slot.GRUPOS?.ID_ESPECIALIDAD !== form.idEspecialidad) continue;
      if (seen.has(slot.ID_GRUPO)) continue;
      seen.add(slot.ID_GRUPO);
      options.push({
        id: slot.ID_GRUPO,
        label: slot.GRUPOS?.NOMBRE_GRUPO ?? slot.ID_GRUPO,
      });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [grupoSlots, form.idEspecialidad]);

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
            <p className="text-xs text-muted-foreground">Sin grupos para esta especialidad.</p>
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
            value={
              slot.ID_PROFESOR
                ? lookups.profesorById.get(slot.ID_PROFESOR) ?? "—"
                : "—"
            }
            readOnly
            disabled
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Aula</Label>
          <Input
            className="h-8 bg-muted/50"
            value={slot.ID_AULA ? lookups.aulaById.get(slot.ID_AULA) ?? "—" : "—"}
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
  conflictCheckHorarios,
  studentConflictHorarios,
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
  conflictCheckHorarios?: MatriculaTree["HORARIOS_MATRICULAS"];
  studentConflictHorarios?: MatriculaTree["HORARIOS_MATRICULAS"];
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

  const horarioId = horario?.ID_HORARIO ?? null;
  const enrollmentForm = appendMode ? form : (sharedForm ?? form);
  const hasEspecialidad = !!enrollmentForm.idEspecialidad;
  const isColectiva = enrollmentForm.tipoClase === "Colectiva";
  const cascadeDisabled = saving || !hasEspecialidad;
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
    showScheduleEspecialidad && !(showEnrollmentFields || appendMode);
  const isTariffFreeGrupoSelected = isTariffFreeGrupo(
    enrollmentForm.idGrupo,
    grupoSlots,
  );

  useEffect(() => {
    if (!isTariffFreeGrupoSelected) return;
    setForm((prev) => (prev.precio === "0" ? prev : { ...prev, precio: "0" }));
  }, [isTariffFreeGrupoSelected, enrollmentForm.idGrupo]);

  const occupancySlots = useMemo(
    () =>
      appendMode
        ? buildScheduleOccupancySlots(grupoSlots, conflictCheckHorarios ?? [])
        : [],
    [appendMode, grupoSlots, conflictCheckHorarios],
  );

  const scheduleResourceConflict = useMemo(
    () =>
      appendMode &&
      hasScheduleResourceConflict(
        form.dia,
        form.horaInicio,
        form.horaFin,
        form.idProfesor,
        form.idAula,
        occupancySlots,
      ),
    [
      appendMode,
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
      ),
    [
      appendMode,
      form.dia,
      form.horaInicio,
      form.horaFin,
      studentConflictHorarios,
      horario?.ID_HORARIO,
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
  }, [horarioId, defaultProfesorId, defaultEspecialidadId, horario, appendMode]);

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

  const grupoCapacity = useMemo(
    () =>
      enrollmentForm.idGrupo
        ? getGrupoCapacityMeta(enrollmentForm.idGrupo, grupoSlots)
        : null,
    [enrollmentForm.idGrupo, grupoSlots],
  );

  const grupoLleno =
    grupoCapacity != null &&
    grupoCapacity.max != null &&
    grupoCapacity.enrolled >= grupoCapacity.max;

  const aulaOptions = useMemo(
    () =>
      Array.from(lookups.aulaById.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [lookups.aulaById],
  );

  const chivato = useMemo(
    () =>
      !isColectiva
        ? buildProfesorOcupacionShort(form.idProfesor, form.dia, grupoSlots)
        : null,
    [isColectiva, form.idProfesor, form.dia, grupoSlots],
  );

  const profesorOptions = useMemo(
    () =>
      profesorSelectOptions(selectOptions.profesores, form.idProfesor, lookups.profesorById),
    [selectOptions.profesores, form.idProfesor, lookups.profesorById],
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

    if (isColectiva) {
      if (!effectiveForm.idGrupo) {
        toast.error("Selecciona un grupo.");
        return;
      }
      if (grupoHorarioBlocks.length === 0) {
        toast.error("El grupo seleccionado no tiene horarios configurados.");
        return;
      }
      if (!horario && grupoLleno) {
        toast.error("El grupo está lleno.");
        return;
      }

      if (horario) {
        const slot =
          grupoHorarioBlocks.find((s) => s.ID_GRUPO_HORARIO === horario.ID_GRUPO_HORARIO) ??
          grupoHorarioBlocks[0];
        await onSave(slotToHorarioPatch(slot, effectiveForm.idGrupo, common));
      } else if (appendMode) {
        await onSave(individualToHorarioPatch(effectiveForm, common));
      } else {
        await onSave(
          grupoHorarioBlocks.map((slot) =>
            slotToHorarioPatch(slot, effectiveForm.idGrupo, common),
          ),
        );
      }
      return;
    }

    await onSave(individualToHorarioPatch(effectiveForm, common));
  };

  const saveDisabled =
    saving ||
    !hasEspecialidad ||
    (isColectiva &&
      !horario &&
      (!enrollmentForm.idGrupo || grupoHorarioBlocks.length === 0 || grupoLleno));

  const blockTitle =
    blockIndex != null ? `Bloque ${blockIndex + 1}` : horario ? "Horario" : "Nuevo horario";

  const exceedsTariffLimit =
    !isTariffFreeGrupoSelected &&
    tariffSessionLimit != null &&
    blockIndex != null &&
    blockIndex >= tariffSessionLimit;

  return (
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
        />
      )}

      {showEnrollmentFields &&
        !horario &&
        isColectiva &&
        enrollmentForm.idGrupo &&
        grupoHorarioBlocks.length > 0 && (
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

      {(horario != null || !isColectiva || appendMode) && hasEspecialidad && (
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
                    <SelectItem key={p.id} value={p.id}>
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
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {chivato && !appendMode && (
            <p className="text-xs text-muted-foreground">{chivato}</p>
          )}
          {appendMode && scheduleResourceConflict && (
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
        <Button type="button" size="sm" disabled={saveDisabled} onClick={() => void handleSave()}>
          {saving ? "Guardando…" : horario ? "Guardar horario" : "Crear horario"}
        </Button>
      </div>
    </Card>
  );
}

function MatriculaHorariosGroup({
  matricula,
  horarios,
  alumnoId,
  selectOptions,
  lookups,
  grupoSlots,
  maxHorarios,
  horarioSaving,
  studentConflictHorarios,
  onCreateHorario,
  onUpdateHorario,
  onRemoveHorario,
}: {
  matricula: Matricula;
  horarios: MatriculaTree["HORARIOS_MATRICULAS"];
  alumnoId: string;
  studentConflictHorarios: MatriculaTree["HORARIOS_MATRICULAS"];
  selectOptions: SelectOptions;
  lookups: LookupMaps;
  grupoSlots: GrupoHorarioSlot[];
  maxHorarios: number | null;
  horarioSaving: boolean;
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
  }, [
    matricula.ID_MATRICULA,
    matricula.ID_PROFESOR,
    matricula.ESPECIALIDAD,
    matriculaHorarioIds,
    matriculaHorarios,
  ]);

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

  const renderExistingHorarioSubForm = (horario: MatriculaHorario, blockIndex: number) => (
    <HorarioSubForm
      key={horario.ID_HORARIO}
      horario={horario}
      lookups={lookups}
      selectOptions={selectOptions}
      grupoSlots={grupoSlots}
      defaultProfesorId={matricula.ID_PROFESOR}
      defaultEspecialidadId={matricula.ESPECIALIDAD}
      sharedForm={sharedEnrollment}
      showEnrollmentFields={false}
      blockIndex={blockIndex}
      tariffSessionLimit={maxHorarios}
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
                  defaultEspecialidadId={matricula.ESPECIALIDAD}
                  showEnrollmentFields={!hasExistingHorarios}
                  blockIndex={matriculaHorarios.length + draftIndex}
                  tariffSessionLimit={maxHorarios}
                  appendMode={hasExistingHorarios}
                  conflictCheckHorarios={matriculaHorarios}
                  studentConflictHorarios={studentConflictHorarios}
                  saving={horarioSaving}
                  onCancel={() => removeDraftHorario(draftId)}
                  onSave={async (patchOrPatches) => {
                    const patch = Array.isArray(patchOrPatches) ? patchOrPatches[0] : patchOrPatches;
                    try {
                      const { ID_HORARIO: _omitHorario, ...createPayload } = {
                        ID_MATRICULA: matricula.ID_MATRICULA,
                        ID_ALUMNO: alumnoId,
                        ID_TARIFA: matricula.ID_TARIFA,
                        ...patch,
                      } as HorarioCreateInput & { ID_HORARIO?: string | null };
                      await onCreateHorario(createPayload as HorarioCreateInput);
                      toast.success("Horario creado");
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
            variant="outline"
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
  selectOptions,
  lookups,
  saving,
  onSave,
  onDelete,
}: {
  matricula: Matricula;
  selectOptions: SelectOptions;
  lookups: LookupMaps;
  saving: boolean;
  onSave: (patch: {
    ESPECIALIDAD: string | null;
    ID_PROFESOR: string | null;
    ESTADO: string | null;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [especialidad, setEspecialidad] = useState(matricula.ESPECIALIDAD ?? "");
  const [idProfesor, setIdProfesor] = useState(matricula.ID_PROFESOR ?? "");
  const [estado, setEstado] = useState(normalizeMatriculaEstado(matricula.ESTADO));

  useEffect(() => {
    setEspecialidad(matricula.ESPECIALIDAD ?? "");
    setIdProfesor(matricula.ID_PROFESOR ?? "");
    setEstado(normalizeMatriculaEstado(matricula.ESTADO));
  }, [
    matricula.ID_MATRICULA,
    matricula.ESPECIALIDAD,
    matricula.ID_PROFESOR,
    matricula.ESTADO,
  ]);

  const savedEstado = normalizeMatriculaEstado(matricula.ESTADO);
  const dirty =
    especialidad !== (matricula.ESPECIALIDAD ?? "") ||
    idProfesor !== (matricula.ID_PROFESOR ?? "") ||
    estado !== savedEstado;

  const tarifaLabel = matricula.ID_TARIFA
    ? lookups.tarifaById.get(matricula.ID_TARIFA) ?? "Sin tarifa"
    : "Sin tarifa";

  const profesorOptions = useMemo(
    () => profesorSelectOptions(selectOptions.profesores, idProfesor, lookups.profesorById),
    [selectOptions.profesores, idProfesor, lookups.profesorById],
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{tarifaLabel}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving || !dirty}
            onClick={() =>
              void onSave({
                ESPECIALIDAD: especialidad || null,
                ID_PROFESOR: idProfesor || null,
                ESTADO: estado || null,
              })
            }
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Especialidad</Label>
          <Select value={especialidad || undefined} onValueChange={setEspecialidad} disabled={saving}>
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

function MatriculaManagePanel({
  alumnoId,
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
  alumnoId: string | null;
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
  const { list, create, update, remove } = useAlumnoMatriculas(alumnoId);
  const [showAdd, setShowAdd] = useState(false);
  const [newEspecialidad, setNewEspecialidad] = useState("");
  const [newTarifa, setNewTarifa] = useState("");
  const [newProfesor, setNewProfesor] = useState("");

  const matriculaSaving = create.isPending || update.isPending || remove.isPending;
  const matriculas =
    list.data && list.data.length > 0 ? list.data : (treeMatriculas ?? []);

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
            ? tarifaSesionesById.get(mat.ID_TARIFA) ?? null
            : null;
          return (
            <div key={mat.ID_MATRICULA} className="space-y-3">
              <MatriculaRowEditor
                matricula={mat}
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
                selectOptions={selectOptions}
                lookups={lookups}
                grupoSlots={grupoSlots}
                maxHorarios={maxHorarios}
                horarioSaving={horarioSaving}
                studentConflictHorarios={studentConflictHorarios}
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
          <div className="grid gap-3 sm:grid-cols-3">
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
            <Button type="button" variant="ghost" size="sm" onClick={resetAddForm} disabled={matriculaSaving}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={matriculaSaving || !newEspecialidad}
              onClick={async () => {
                try {
                  await create.mutateAsync({
                    ESPECIALIDAD: newEspecialidad,
                    ID_TARIFA: newTarifa || null,
                    ID_PROFESOR: newProfesor || null,
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
        <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(true)}>
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
  centros?: Array<{ ID_CENTRO: string; NOMBRE_CENTRO: string }>;
  showCentroSelector?: boolean;
  assignedCenterId?: string | null;
  defaultCreateCenterId?: string | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onSubmit: (values: AlumnoFormValues) => void;
  onCreateHorario: (input: HorarioCreateInput) => Promise<void>;
  onUpdateHorario: (id: string, patch: HorarioUpdateInput) => Promise<void>;
  onRemoveHorario: (id: string) => Promise<void>;
  variant?: "dialog" | "embedded";
}) {
  const [internalActiveTab, setInternalActiveTab] = useState("resumen");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = onTabChange ?? setInternalActiveTab;
  const form = useForm<AlumnoFormInput, unknown, AlumnoFormValues>({
    resolver: zodResolver(alumnoFormSchema),
    defaultValues: emptyAlumnoFormValues(),
  });

  const nacimiento = form.watch("NACIMIENTO");
  const metodoPago = normalizeMetodoPago(form.watch("METODO_PAGO"));
  const tlfComunicacion = form.watch("TLF_COMUNICACION");
  const tlfMadre = form.watch("TLF_MADRE");
  const tlfPadre = form.watch("TLF_PADRE");
  const bizumPhones = useMemo(
    () =>
      collectBizumPhoneOptions({
        TLF_COMUNICACION: tlfComunicacion,
        TLF_MADRE: tlfMadre,
        TLF_PADRE: tlfPadre,
      }),
    [tlfComunicacion, tlfMadre, tlfPadre],
  );
  const edad = useMemo(() => calcEdad(nacimiento), [nacimiento]);

  const initialId = initial?.ID_ALUMNO ?? null;
  const isCreate = !initial;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      form.reset(alumnoToFormValues(initial));
      return;
    }
    form.reset({
      ...emptyAlumnoFormValues(),
      ID_CENTRO: showCentroSelector
        ? defaultCreateCenterId
        : assignedCenterId,
    });
  }, [open, initialId, form, showCentroSelector, assignedCenterId, defaultCreateCenterId]);

  const handleFormSubmit = (values: AlumnoFormValues) => {
    if (isCreate && showCentroSelector && !values.ID_CENTRO?.trim()) {
      form.setError("ID_CENTRO", { message: "Selecciona un centro" });
      return;
    }
    if (isCreate && !showCentroSelector && assignedCenterId) {
      onSubmit({ ...values, ID_CENTRO: assignedCenterId });
      return;
    }
    onSubmit(values);
  };

  const formBody = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-4 grid w-full grid-cols-4">
                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                <TabsTrigger value="personales">Datos personales</TabsTrigger>
                <TabsTrigger value="pago">Datos de pago</TabsTrigger>
                <TabsTrigger value="matricula">Matrículas</TabsTrigger>
              </TabsList>

              <TabsContent value="resumen" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {isCreate && showCentroSelector && (
                  <FormField
                    control={form.control as any}
                    name="ID_CENTRO"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Centro *</FormLabel>
                        <Select
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          disabled={submitting}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar centro" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {centros.map((centro) => (
                              <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
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
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} disabled={submitting} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control as any}
                  name="ESTADO_RESERVA"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado reserva</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} disabled={submitting} />
                      </FormControl>
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
                          onChange={(e) => field.onChange(e.target.value)}
                          disabled={submitting}
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
                          <Input type="date" {...field} value={field.value ?? ""} disabled={submitting} />
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
                        <FormLabel>Nombre madre</FormLabel>
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
                        <FormLabel>Tel. madre</FormLabel>
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
                        <FormLabel>Nombre padre</FormLabel>
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
                        <FormLabel>Tel. padre</FormLabel>
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

              <TabsContent value="pago" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control as any}
                  name="METODO_PAGO"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método de pago</FormLabel>
                      <Select
                        value={field.value ?? "__unset__"}
                        onValueChange={(v) => {
                          const next = v === "__unset__" ? null : v;
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

                {isBankRemittancePaymentMethod(metodoPago) && (
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
                    <FormField
                      control={form.control as any}
                      name="MANDATO"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mandato</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? ""} disabled={submitting} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {isBizumPaymentMethod(metodoPago) && (
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

                <FormField
                  control={form.control as any}
                  name="MOTIVO_AJUSTE"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motivo ajuste</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} disabled={submitting} />
                      </FormControl>
                    </FormItem>
                  )}
                />
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
              </TabsContent>

              <TabsContent value="matricula">
                <MatriculaManagePanel
                  alumnoId={initial?.ID_ALUMNO ?? null}
                  selectOptions={selectOptions}
                  lookups={lookups}
                  tarifaSesionesById={tarifaSesionesById}
                  grupoSlots={grupoSlots}
                  horarioSaving={horarioSaving}
                  treeMatriculas={
                    Array.isArray(initial?.MATRICULAS) ? initial.MATRICULAS : undefined
                  }
                  onCreateHorario={onCreateHorario}
                  onUpdateHorario={onUpdateHorario}
                  onRemoveHorario={onRemoveHorario}
                />
              </TabsContent>
            </Tabs>

        {variant === "dialog" ? (
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        ) : (
          <div className="mt-6 flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );

  if (variant === "embedded") {
    if (!open) return null;
    return formBody;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
