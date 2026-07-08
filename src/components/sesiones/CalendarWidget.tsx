import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar as CalendarIcon,
  User,
  Home,
  BookOpen,
  GraduationCap,
  Users,
  Building2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSesionesDateRange, useSesiones, type GroupedSession } from "@/hooks/useSesiones";
import { supabase } from "@/integrations/supabase/client";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { FilterMultiSelect } from "@/components/ui/FilterMultiSelect";
import { isGrupoEstadoActivo, useGrupos } from "@/hooks/useGrupos";
import { useActiveTenant } from "@/context/AppContext";
import { isDireccionRole, isProfesorRole, scopeTenantQuery } from "@/lib/tenantQuery";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EntityLink } from "@/components/navigation/EntityLink";
import { cn } from "@/lib/utils";

export type CalendarEventType = "matriculas" | "leads" | "incidencias";

export interface CalendarWidgetProps {
  hideFilters?: boolean;
  embedded?: boolean;
  defaultVisibleTypes?: CalendarEventType[];
  pageTitle?: string;
  pageDescription?: string;
  initialAlumnoId?: string;
  initialSesionId?: string;
  onSessionDetailClose?: () => void;
}

const ALL_VALUE = "__all__";

function findGroupedSessionBySesionId(
  sesiones: GroupedSession[],
  sesionId: string,
): GroupedSession | null {
  const normalized = sesionId.trim();
  if (!normalized) return null;
  return sesiones.find((block) => block.ID_SESIONES.includes(normalized)) ?? null;
}

function parseSesionDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function CalendarColorLegend() {
  const items = [
    { colorClass: "bg-amber-400", label: " Nuevos alumnos" },
    { colorClass: "bg-destructive/80", label: "Faltas de alumnos" },
    { colorClass: "bg-emerald-500", label: "Clases de Recuperación" },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span
            className={cn("size-2 shrink-0 rounded-full", item.colorClass)}
            aria-hidden="true"
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

const formatearFechaKey = (d: Date) => {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

function getEventColorClass(ev: GroupedSession): string {
  if (ev.COLOR_INCIDENCIA === "rojo") {
    return "bg-red-100 text-red-900 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900/50";
  }
  if (ev.ESTADO === "Lead") {
    return "bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50";
  }
  if (ev.ESTADO === "Matricula") {
    return "bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50";
  }
  if (ev.ESTADO === "Incidencia") {
    return ev.COLOR_INCIDENCIA === "verde"
      ? "bg-emerald-100 text-emerald-900 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/50"
      : "bg-red-100 text-red-900 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900/50";
  }
  return "bg-slate-100 text-slate-800 border border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700";
}

function getAlumnoBadgeLabel(alumno: GroupedSession["ALUMNOS_GRUPO"][number]): string {
  if (alumno.ESTADO === "Incidencia") {
    if (alumno.COLOR_INCIDENCIA === "rojo") return "Falta";
    if (alumno.COLOR_INCIDENCIA === "verde") return "Recuperación";
    return alumno.TITULO_CALENDARIO || "Incidencia";
  }
  return alumno.ESTADO || "—";
}

function getAlumnoBadgeClass(alumno: GroupedSession["ALUMNOS_GRUPO"][number]): string {
  if (alumno.ESTADO === "Matricula") {
    return "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900/50";
  }
  if (alumno.ESTADO === "Lead") {
    return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-900/50";
  }
  if (alumno.COLOR_INCIDENCIA === "rojo") {
    return "bg-red-100 text-red-900 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900/50";
  }
  if (alumno.COLOR_INCIDENCIA === "verde") {
    return "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-900/50";
  }
  return "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700";
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function compareHoraInicio(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

const SIN_HORA_SLOT_KEY = "sin-hora";

function parseTimeToMinutes(hora: string | null): number | null {
  if (!hora) return null;
  const [hStr, mStr] = hora.slice(0, 5).split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function get30MinSlotKey(horaInicio: string | null): string {
  const mins = parseTimeToMinutes(horaInicio);
  if (mins === null) return SIN_HORA_SLOT_KEY;
  const slotStart = Math.floor(mins / 30) * 30;
  const slotEnd = slotStart + 30;
  return `${formatMinutesToTime(slotStart)}-${formatMinutesToTime(slotEnd)}`;
}

function format30MinSlotLabel(slotKey: string): string {
  if (slotKey === SIN_HORA_SLOT_KEY) return "Sin hora";
  const [start, end] = slotKey.split("-");
  return `${start} – ${end}`;
}

type FilterExclude =
  | "alumno"
  | "profesor"
  | "aula"
  | "especialidad"
  | "lead"
  | "incidencia"
  | "dia"
  | "horaInicio"
  | "horaFin"
  | "matricula"
  | "grupo"
  | "centro";

type FilterState = {
  verClasesNormales: boolean;
  verLeads: boolean;
  verIncidencias: boolean;
  FILTRO_AULA: string;
  FILTRO_PROFESOR: string;
  FILTRO_ESPECIALIDAD: string;
  FILTRO_ALUMNO: string;
  FILTRO_CENTROS: string[];
  FILTRO_GRUPOS: string[];
  FILTRO_DIA: string;
  FILTRO_HORA_INICIO: string;
  FILTRO_HORA_FIN: string;
};

function passesFilters(
  block: GroupedSession,
  exclude: FilterExclude | null,
  f: FilterState,
): boolean {
  if (
    (exclude === null || exclude !== "matricula") &&
    !f.verClasesNormales &&
    block.ALUMNOS_GRUPO.every((a) => a.ESTADO === "Matricula")
  ) {
    return false;
  }
  if (
    (exclude === null || exclude !== "lead") &&
    !f.verLeads &&
    block.ALUMNOS_GRUPO.every((a) => a.ESTADO === "Lead")
  ) {
    return false;
  }
  if (
    (exclude === null || exclude !== "incidencia") &&
    !f.verIncidencias &&
    block.ALUMNOS_GRUPO.every((a) => a.ESTADO === "Incidencia")
  ) {
    return false;
  }

  if (
    (exclude === null || exclude !== "aula") &&
    f.FILTRO_AULA &&
    block.ID_AULA !== f.FILTRO_AULA
  ) {
    return false;
  }
  if (
    (exclude === null || exclude !== "profesor") &&
    f.FILTRO_PROFESOR &&
    block.ID_PROFESOR !== f.FILTRO_PROFESOR
  ) {
    return false;
  }
  if (
    (exclude === null || exclude !== "especialidad") &&
    f.FILTRO_ESPECIALIDAD &&
    block.ESPECIALIDAD !== f.FILTRO_ESPECIALIDAD
  ) {
    return false;
  }
  if (
    (exclude === null || exclude !== "alumno") &&
    f.FILTRO_ALUMNO &&
    !block.ALUMNOS_GRUPO.some((a) => a.ID_ALUMNO === f.FILTRO_ALUMNO)
  ) {
    return false;
  }
  if (exclude === null || exclude !== "grupo") {
    const matchesGrupo =
      f.FILTRO_GRUPOS.length === 0 ||
      block.ALUMNOS_GRUPO.some(
        (a) => a.ID_GRUPO != null && f.FILTRO_GRUPOS.includes(a.ID_GRUPO),
      );
    if (!matchesGrupo) return false;
  }
  if (exclude === null || exclude !== "centro") {
    const matchesCentro =
      f.FILTRO_CENTROS.length === 0 ||
      block.ALUMNOS_GRUPO.some(
        (a) => a.ID_CENTRO != null && f.FILTRO_CENTROS.includes(a.ID_CENTRO),
      );
    if (!matchesCentro) return false;
  }

  if (
    (exclude === null || exclude !== "dia") &&
    f.FILTRO_DIA &&
    block.FECHA_EXACTA?.split("T")[0] !== f.FILTRO_DIA
  ) {
    return false;
  }
  if (
    (exclude === null || exclude !== "horaInicio") &&
    f.FILTRO_HORA_INICIO &&
    block.HORA_INICIO &&
    !block.HORA_INICIO.includes(f.FILTRO_HORA_INICIO)
  ) {
    return false;
  }
  if (
    (exclude === null || exclude !== "horaFin") &&
    f.FILTRO_HORA_FIN &&
    block.HORA_FIN &&
    !block.HORA_FIN.includes(f.FILTRO_HORA_FIN)
  ) {
    return false;
  }

  return true;
}

function isMatriculaBlock(ev: GroupedSession): boolean {
  return ev.ESTADO === "Matricula" && !ev.COLOR_INCIDENCIA;
}

function isLeadBlock(ev: GroupedSession): boolean {
  return ev.ESTADO === "Lead";
}

function isIncidenciaBlock(ev: GroupedSession): boolean {
  return ev.ESTADO === "Incidencia" || Boolean(ev.COLOR_INCIDENCIA);
}

function isProminentBlock(ev: GroupedSession): boolean {
  return !isMatriculaBlock(ev);
}

function shouldAutoExpandSlot(
  bloques: GroupedSession[],
  verLeads: boolean,
  verIncidencias: boolean,
): boolean {
  if (verLeads && bloques.some(isLeadBlock)) return true;
  if (verIncidencias && bloques.some(isIncidenciaBlock)) return true;
  return false;
}

function sanitizeFilterOptions(
  options: { id: string; name: string }[],
): { id: string; name: string }[] {
  return options.filter(
    (o) =>
      Boolean(o.id) && Boolean(o.name) && o.name !== "—" && o.name.trim() !== "" && o.name !== o.id,
  );
}

function buildOptionsFromBlocks(
  blocks: GroupedSession[],
  extract: (block: GroupedSession) => { id: string; name: string }[],
): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const block of blocks) {
    for (const item of extract(block)) {
      if (item.id && item.name && item.name !== "—" && item.name !== item.id) {
        map.set(item.id, item.name);
      }
    }
  }
  return Array.from(map.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

function ensureSelectedInOptions(
  options: { id: string; name: string }[],
  selectedId: string,
  fallbackOptions: { id: string; name: string }[],
): { id: string; name: string }[] {
  if (!selectedId || options.some((o) => o.id === selectedId)) return options;
  const fallback = fallbackOptions.find((o) => o.id === selectedId);
  if (!fallback?.name || fallback.name === selectedId) return options;
  return [...options, { id: selectedId, name: fallback.name }].sort((a, b) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
  );
}

function groupEventsBy30MinSlot(eventos: GroupedSession[]): [string, GroupedSession[]][] {
  const map = new Map<string, GroupedSession[]>();
  for (const ev of eventos) {
    const slot = get30MinSlotKey(ev.HORA_INICIO);
    const list = map.get(slot) ?? [];
    list.push(ev);
    map.set(slot, list);
  }
  for (const [, bloques] of map) {
    bloques.sort((a, b) => compareHoraInicio(a.HORA_INICIO, b.HORA_INICIO));
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === SIN_HORA_SLOT_KEY) return 1;
    if (b === SIN_HORA_SLOT_KEY) return -1;
    return a.localeCompare(b);
  });
}

function getDefaultExpandedSlots(
  slots: [string, GroupedSession[]][],
  verLeads: boolean,
  verIncidencias: boolean,
): string[] {
  return slots
    .filter(([, bloques]) => shouldAutoExpandSlot(bloques, verLeads, verIncidencias))
    .map(([key]) => key);
}

function resolveInitialVisibleTypes(
  defaultVisibleTypes: CalendarEventType[] | undefined,
  rol: string,
): { verClasesNormales: boolean; verLeads: boolean; verIncidencias: boolean } {
  if (defaultVisibleTypes) {
    return {
      verClasesNormales: defaultVisibleTypes.includes("matriculas"),
      verLeads: defaultVisibleTypes.includes("leads"),
      verIncidencias: defaultVisibleTypes.includes("incidencias"),
    };
  }
  return {
    verClasesNormales: isProfesorRole(rol) || isDireccionRole(rol),
    verLeads: true,
    verIncidencias: true,
  };
}

function FilterSelect({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  placeholder,
  allLabel = "Todos",
}: {
  label: string;
  icon: typeof User;
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
  placeholder: string;
  allLabel?: string;
}) {
  const safeOptions = sanitizeFilterOptions(options);
  const selectedName = safeOptions.find((o) => o.id === value)?.name;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Label>
      <Select value={value || ALL_VALUE} onValueChange={(v) => onChange(v === ALL_VALUE ? "" : v)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder={placeholder}>
            {value ? (selectedName ?? placeholder) : placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
          {safeOptions.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CalendarWidget({
  hideFilters = false,
  embedded = false,
  defaultVisibleTypes,
  pageTitle,
  pageDescription,
  initialAlumnoId,
  initialSesionId,
  onSessionDetailClose,
}: CalendarWidgetProps) {
  const { rol, perfil, tenantId } = useActiveTenant();
  const lockVisibleTypes = hideFilters && defaultVisibleTypes !== undefined;

  const initialTypes = resolveInitialVisibleTypes(defaultVisibleTypes, rol);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("month");
  const [selectedEvent, setSelectedEvent] = useState<GroupedSession | null>(null);

  const sesionDeepLinkQuery = useQuery({
    queryKey: ["sesion-deep-link", tenantId, initialSesionId],
    enabled: Boolean(initialSesionId && tenantId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from("SESIONES")
        .select("ID_SESION, FECHA_EXACTA")
        .eq("ID_SESION", initialSesionId!);
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data as { ID_SESION: string; FECHA_EXACTA: string } | null;
    },
  });

  const handleEventDetailOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      setSelectedEvent(null);
      if (initialSesionId) {
        onSessionDetailClose?.();
      }
    },
    [initialSesionId, onSessionDetailClose],
  );

  const {
    centrosOrdenados,
    showCentroFilter,
  } = useAdminCentroFilter();

  const [selectedCenters, setSelectedCenters] = useState<string[]>([]);
  const [selectedGrupos, setSelectedGrupos] = useState<string[]>([]);

  const dateRange = useMemo(
    () => getSesionesDateRange(calendarView, currentDate),
    [calendarView, currentDate],
  );
  const { list } = useSesiones(dateRange);
  const { list: gruposList } = useGrupos(null);

  const centroOptions = useMemo(
    () =>
      centrosOrdenados.map((centro) => ({
        id: centro.ID_CENTRO,
        name: centro.NOMBRE_CENTRO,
      })),
    [centrosOrdenados],
  );

  const grupoOptions = useMemo(() => {
    let grupos = [...(gruposList.data?.grupos ?? [])];
    if (selectedCenters.length > 0) {
      const selected = new Set(selectedCenters);
      grupos = grupos.filter((grupo) => grupo.ID_CENTRO && selected.has(grupo.ID_CENTRO));
    }
    return grupos
      .filter((grupo) => isGrupoEstadoActivo(grupo.ESTADO))
      .sort((a, b) =>
        a.NOMBRE_GRUPO.localeCompare(b.NOMBRE_GRUPO, "es", { sensitivity: "base" }),
      )
      .map((grupo) => ({ id: grupo.ID_GRUPO, name: grupo.NOMBRE_GRUPO }));
  }, [gruposList.data?.grupos, selectedCenters]);

  const sesiones = useMemo(() => list.data?.sesiones ?? [], [list.data?.sesiones]);
  const tenantFilters = useMemo(
    () =>
      list.data?.filters ?? {
        uniqueAlumnos: [],
        uniqueProfesores: [],
        uniqueAulas: [],
        uniqueEspecialidades: [],
      },
    [list.data?.filters],
  );

  const [FILTRO_AULA, setFILTRO_AULA] = useState("");
  const [FILTRO_PROFESOR, setFILTRO_PROFESOR] = useState(() =>
    isDireccionRole(rol) && perfil?.ID_PROFESOR ? perfil.ID_PROFESOR : "",
  );
  const [FILTRO_ESPECIALIDAD, setFILTRO_ESPECIALIDAD] = useState("");
  const [FILTRO_ALUMNO, setFILTRO_ALUMNO] = useState(() => initialAlumnoId ?? "");
  const [verLeadsState, setVerLeads] = useState(initialTypes.verLeads);
  const [verIncidenciasState, setVerIncidencias] = useState(initialTypes.verIncidencias);
  const [FILTRO_DIA, setFILTRO_DIA] = useState("");
  const [FILTRO_HORA_INICIO, setFILTRO_HORA_INICIO] = useState("");
  const [FILTRO_HORA_FIN, setFILTRO_HORA_FIN] = useState("");
  const [verClasesNormalesState, setVerClasesNormales] = useState(initialTypes.verClasesNormales);

  const verLeads = lockVisibleTypes
    ? defaultVisibleTypes!.includes("leads")
    : verLeadsState;
  const verIncidencias = lockVisibleTypes
    ? defaultVisibleTypes!.includes("incidencias")
    : verIncidenciasState;
  const verClasesNormales = lockVisibleTypes
    ? defaultVisibleTypes!.includes("matriculas")
    : verClasesNormalesState;

  useEffect(() => {
    if (isDireccionRole(rol) && perfil?.ID_PROFESOR) {
      setFILTRO_PROFESOR(perfil.ID_PROFESOR);
    }
  }, [rol, perfil?.ID_PROFESOR]);

  useEffect(() => {
    if (initialAlumnoId) {
      setFILTRO_ALUMNO(initialAlumnoId);
    }
  }, [initialAlumnoId]);

  useEffect(() => {
    const sessionDate = parseSesionDate(sesionDeepLinkQuery.data?.FECHA_EXACTA);
    if (!sessionDate) return;
    setCurrentDate(sessionDate);
  }, [sesionDeepLinkQuery.data?.FECHA_EXACTA]);

  useEffect(() => {
    if (!initialSesionId) return;

    const match = findGroupedSessionBySesionId(sesiones, initialSesionId);
    if (!match) return;

    setSelectedEvent(match);
  }, [initialSesionId, sesiones]);

  useEffect(() => {
    if (selectedGrupos.length === 0) return;
    const validIds = new Set(grupoOptions.map((grupo) => grupo.id));
    setSelectedGrupos((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [grupoOptions, selectedGrupos.length]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const diasDelMes = useMemo(() => {
    const inicioMes = new Date(year, month, 1);
    const finMes = new Date(year, month + 1, 0);
    const dias = [];

    const diaInicioSemana = inicioMes.getDay() === 0 ? 7 : inicioMes.getDay();
    for (let i = diaInicioSemana - 1; i > 0; i--) {
      dias.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= finMes.getDate(); i++) {
      dias.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    return dias;
  }, [year, month]);

  const monthWeekRows = Math.ceil(diasDelMes.length / 7);

  const filterState: FilterState = useMemo(
    () => ({
      verClasesNormales,
      verLeads,
      verIncidencias,
      FILTRO_AULA,
      FILTRO_PROFESOR,
      FILTRO_ESPECIALIDAD,
      FILTRO_ALUMNO,
      FILTRO_CENTROS: selectedCenters,
      FILTRO_GRUPOS: selectedGrupos,
      FILTRO_DIA,
      FILTRO_HORA_INICIO,
      FILTRO_HORA_FIN,
    }),
    [
      verClasesNormales,
      verLeads,
      verIncidencias,
      FILTRO_AULA,
      FILTRO_PROFESOR,
      FILTRO_ESPECIALIDAD,
      FILTRO_ALUMNO,
      selectedCenters,
      selectedGrupos,
      FILTRO_DIA,
      FILTRO_HORA_INICIO,
      FILTRO_HORA_FIN,
    ],
  );

  const eventosFiltrados = useMemo(
    () => sesiones.filter((block) => passesFilters(block, null, filterState)),
    [sesiones, filterState],
  );

  const cascadingOptions = useMemo(() => {
    const poolAlumno = sesiones.filter((b) => passesFilters(b, "alumno", filterState));
    const poolProfesor = sesiones.filter((b) => passesFilters(b, "profesor", filterState));
    const poolAula = sesiones.filter((b) => passesFilters(b, "aula", filterState));
    const poolEspecialidad = sesiones.filter((b) => passesFilters(b, "especialidad", filterState));

    return {
      alumnos: sanitizeFilterOptions(
        ensureSelectedInOptions(
          buildOptionsFromBlocks(poolAlumno, (b) =>
            b.ALUMNOS_GRUPO.filter((a) => a.ID_ALUMNO).map((a) => ({
              id: a.ID_ALUMNO!,
              name: a.TEXTO_ALUMNO,
            })),
          ),
          FILTRO_ALUMNO,
          tenantFilters.uniqueAlumnos,
        ),
      ),
      profesores: sanitizeFilterOptions(
        ensureSelectedInOptions(
          buildOptionsFromBlocks(poolProfesor, (b) =>
            b.ID_PROFESOR ? [{ id: b.ID_PROFESOR, name: b.TEXTO_PROFESOR }] : [],
          ),
          FILTRO_PROFESOR,
          tenantFilters.uniqueProfesores,
        ),
      ),
      aulas: sanitizeFilterOptions(
        ensureSelectedInOptions(
          buildOptionsFromBlocks(poolAula, (b) =>
            b.ID_AULA ? [{ id: b.ID_AULA, name: b.TEXTO_AULA }] : [],
          ),
          FILTRO_AULA,
          tenantFilters.uniqueAulas,
        ),
      ),
      especialidades: sanitizeFilterOptions(
        ensureSelectedInOptions(
          buildOptionsFromBlocks(poolEspecialidad, (b) =>
            b.ESPECIALIDAD ? [{ id: b.ESPECIALIDAD, name: b.TEXTO_ESPECIALIDAD }] : [],
          ),
          FILTRO_ESPECIALIDAD,
          tenantFilters.uniqueEspecialidades,
        ),
      ),
    };
  }, [
    sesiones,
    filterState,
    FILTRO_ALUMNO,
    FILTRO_PROFESOR,
    FILTRO_AULA,
    FILTRO_ESPECIALIDAD,
    tenantFilters.uniqueAlumnos,
    tenantFilters.uniqueProfesores,
    tenantFilters.uniqueAulas,
    tenantFilters.uniqueEspecialidades,
  ]);

  const mapaEventosPorFecha = useMemo(() => {
    const mapa: Record<string, GroupedSession[]> = {};
    eventosFiltrados.forEach((ev) => {
      if (ev.FECHA_EXACTA) {
        const key = ev.FECHA_EXACTA.split("T")[0];
        if (!mapa[key]) mapa[key] = [];
        mapa[key].push(ev);
      }
    });
    for (const key of Object.keys(mapa)) {
      mapa[key].sort((a, b) => compareHoraInicio(a.HORA_INICIO, b.HORA_INICIO));
    }
    return mapa;
  }, [eventosFiltrados]);

  const diasDeLaSemana = useMemo(() => {
    const monday = getMondayOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return { date, isCurrentMonth: true };
    });
  }, [currentDate]);

  const nombreMes = currentDate.toLocaleString("es-ES", { month: "long", year: "numeric" });

  const tituloCalendario = useMemo(() => {
    if (calendarView === "month") return nombreMes;
    if (calendarView === "day") {
      return currentDate.toLocaleString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    const monday = getMondayOfWeek(currentDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleString("es-ES", { day: "numeric", month: "short" });
    return `Semana del ${fmt(monday)} al ${fmt(sunday)}`;
  }, [calendarView, currentDate, nombreMes]);

  const navigatePrev = () => {
    if (calendarView === "month") {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (calendarView === "week") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
    }
  };

  const navigateNext = () => {
    if (calendarView === "month") {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (calendarView === "week") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
    }
  };

  const navigateToDay = (date: Date) => {
    setCurrentDate(new Date(date));
    setCalendarView("day");
  };

  const renderEventButton = (ev: GroupedSession, compact = true) => (
    <button
      key={ev.GROUP_KEY}
      type="button"
      onClick={() => setSelectedEvent(ev)}
      className={`w-full text-left rounded-md cursor-pointer hover:opacity-90 transition-opacity font-medium ${getEventColorClass(ev)} ${
        compact ? "text-[10px] px-1.5 py-1 truncate" : "text-xs px-2 py-1.5"
      }`}
      title={`${ev.HORA_INICIO ?? ""} ${ev.TITULO_BLOQUE} — ${ev.TEXTO_PROFESOR}`}
    >
      {compact ? (
        <>
          {ev.HORA_INICIO?.slice(0, 5) ?? "—"} {ev.TITULO_BLOQUE}
        </>
      ) : (
        <div className="space-y-0.5">
          <div className="font-semibold truncate">
            {ev.HORA_INICIO?.slice(0, 5) ?? "—"}
            {ev.HORA_FIN ? ` – ${ev.HORA_FIN.slice(0, 5)}` : ""} {ev.TITULO_BLOQUE}
          </div>
          <div className="text-[10px] opacity-80 truncate">
            {ev.TEXTO_PROFESOR} · {ev.TEXTO_AULA}
          </div>
        </div>
      )}
    </button>
  );

  const renderCompactMatriculaBlock = (ev: GroupedSession) => (
    <button
      key={ev.GROUP_KEY}
      type="button"
      onClick={() => setSelectedEvent(ev)}
      className={`flex items-center justify-between gap-1 w-full min-w-0 text-[10px] leading-tight px-1 py-0.5 rounded cursor-pointer hover:opacity-90 transition-opacity ${getEventColorClass(ev)}`}
      title={`${ev.TITULO_BLOQUE} — ${ev.TEXTO_PROFESOR} · ${ev.TEXTO_AULA}`}
    >
      <span className="truncate min-w-0 font-medium">{ev.TITULO_BLOQUE}</span>
      <span className="shrink-0 text-[9px] opacity-70 max-w-[38%] truncate">{ev.TEXTO_AULA}</span>
    </button>
  );

  const renderProminentBlock = (ev: GroupedSession, dense = false) => {
    const nombresAlumnos = ev.ALUMNOS_GRUPO.map((a) => a.TEXTO_ALUMNO).join(", ");
    return (
      <button
        key={ev.GROUP_KEY}
        type="button"
        onClick={() => setSelectedEvent(ev)}
        className={`w-full text-left rounded-md cursor-pointer hover:opacity-95 transition-opacity font-medium ${getEventColorClass(ev)} ${
          dense ? "px-1.5 py-1" : "px-2 py-1.5"
        } ${ev.ESTADO === "Lead" ? "ring-1 ring-amber-300/70" : ""} ${
          ev.ESTADO === "Incidencia" || ev.COLOR_INCIDENCIA
            ? "ring-1 ring-red-300/70 shadow-sm"
            : ""
        }`}
        title={`${ev.TITULO_BLOQUE} — ${nombresAlumnos}`}
      >
        <div className={`font-semibold truncate ${dense ? "text-[10px]" : "text-xs"}`}>
          {ev.TITULO_BLOQUE}
        </div>
        <div className={`truncate opacity-90 ${dense ? "text-[9px] mt-px" : "text-[10px] mt-0.5"}`}>
          {nombresAlumnos}
        </div>
        <div className={`truncate opacity-70 ${dense ? "text-[9px]" : "text-[10px]"}`}>
          {ev.TEXTO_PROFESOR} · {ev.TEXTO_AULA}
        </div>
      </button>
    );
  };

  const renderTimeBlockTimeline = (
    eventos: GroupedSession[],
    dense = false,
    accordionKey?: string,
  ) => {
    const slots = groupEventsBy30MinSlot(eventos);
    if (slots.length === 0) {
      return (
        <p
          className={`text-muted-foreground text-center ${dense ? "text-[10px] pt-2" : "text-xs py-8"}`}
        >
          Sin sesiones
        </p>
      );
    }

    const defaultExpanded = getDefaultExpandedSlots(slots, verLeads, verIncidencias);

    return (
      <Accordion
        key={accordionKey}
        type="multiple"
        defaultValue={defaultExpanded}
        className="w-full space-y-1"
      >
        {slots.map(([slotKey, bloques]) => {
          const prominent = bloques.filter(isProminentBlock);
          const matriculas = bloques.filter(isMatriculaBlock);

          return (
            <AccordionItem
              key={slotKey}
              value={slotKey}
              className="border rounded-lg px-2 border-b-0"
            >
              <AccordionTrigger
                className={`font-semibold text-muted-foreground tabular-nums hover:no-underline ${
                  dense ? "text-[9px] py-2" : "text-[10px] py-3"
                }`}
              >
                {format30MinSlotLabel(slotKey)}
                <span className="font-normal ml-1 opacity-70">({bloques.length})</span>
              </AccordionTrigger>
              <AccordionContent className={dense ? "pb-1 pt-0" : "pb-2 pt-0"}>
                <div className="space-y-px pl-0.5">
                  {prominent.map((ev) => renderProminentBlock(ev, dense))}
                  {matriculas.map((ev) => renderCompactMatriculaBlock(ev))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    );
  };

  const alumnosOrdenados = useMemo(() => {
    if (!selectedEvent) return [];
    return [...selectedEvent.ALUMNOS_GRUPO].sort((a, b) =>
      a.TEXTO_ALUMNO.localeCompare(b.TEXTO_ALUMNO, "es", { sensitivity: "base" }),
    );
  }, [selectedEvent]);

  const hasActiveFilters =
    !hideFilters &&
    (FILTRO_ALUMNO ||
      selectedCenters.length > 0 ||
      selectedGrupos.length > 0 ||
      FILTRO_PROFESOR ||
      FILTRO_ESPECIALIDAD ||
      FILTRO_AULA ||
      (!lockVisibleTypes && !verLeads) ||
      (!lockVisibleTypes && !verIncidencias) ||
      FILTRO_DIA ||
      FILTRO_HORA_INICIO ||
      FILTRO_HORA_FIN);

  const clearAllFilters = () => {
    setFILTRO_ALUMNO("");
    setSelectedCenters([]);
    setSelectedGrupos([]);
    setFILTRO_PROFESOR(isDireccionRole(rol) && perfil?.ID_PROFESOR ? perfil.ID_PROFESOR : "");
    setFILTRO_ESPECIALIDAD("");
    setFILTRO_AULA("");
    if (!lockVisibleTypes) {
      setVerLeads(true);
      setVerIncidencias(true);
    }
    setFILTRO_DIA("");
    setFILTRO_HORA_INICIO("");
    setFILTRO_HORA_FIN("");
  };

  const viewControls = (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        value={calendarView}
        onValueChange={(v) => v && setCalendarView(v as "day" | "week" | "month")}
        className="border rounded-md p-0.5"
      >
        <ToggleGroupItem value="day" aria-label="Vista día" className="h-8 px-3 text-xs">
          Día
        </ToggleGroupItem>
        <ToggleGroupItem value="week" aria-label="Vista semana" className="h-8 px-3 text-xs">
          Semana
        </ToggleGroupItem>
        <ToggleGroupItem value="month" aria-label="Vista mes" className="h-8 px-3 text-xs">
          Mes
        </ToggleGroupItem>
      </ToggleGroup>
      <Button variant="outline" size="icon" onClick={navigatePrev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[180px] text-center font-medium capitalize text-sm">
        {tituloCalendario}
      </div>
      <Button variant="outline" size="icon" onClick={navigateNext}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
        Hoy
      </Button>
    </div>
  );

  return (
    <>
      <div className={cn(embedded && "flex h-full min-h-0 flex-col")}>
        {lockVisibleTypes ? (
          <div className="mb-4 flex shrink-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <CalendarColorLegend />
            {viewControls}
          </div>
        ) : (
          <div
            className={cn(
              pageTitle
                ? "flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                : "flex flex-col gap-4 md:flex-row md:items-center md:justify-end",
            )}
          >
            {pageTitle && <PageHeader title={pageTitle} description={pageDescription} />}
            {viewControls}
          </div>
        )}

        <div
          className={cn(
            "grid",
            !embedded && "gap-4",
            embedded && "min-h-0 flex-1",
            !hideFilters && "lg:grid-cols-4",
          )}
        >
        {!hideFilters && (
          <Card className="p-4 space-y-4 h-fit lg:col-span-1 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-sm border-b pb-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filtros
            </div>

            <div className="space-y-3">
              {showCentroFilter ? (
                <FilterMultiSelect
                  id="sesiones-centro-filter"
                  label="Centro"
                  icon={Building2}
                  options={centroOptions}
                  selected={selectedCenters}
                  onChange={setSelectedCenters}
                  allLabel="Todos los centros"
                  searchPlaceholder="Buscar centro..."
                />
              ) : null}
              <FilterMultiSelect
                label="Grupos"
                icon={Users}
                options={grupoOptions}
                selected={selectedGrupos}
                onChange={setSelectedGrupos}
                allLabel="Todos los grupos"
                searchPlaceholder="Buscar grupo..."
              />
              <FilterSelect
                label="Alumno"
                icon={User}
                value={FILTRO_ALUMNO}
                options={cascadingOptions.alumnos}
                onChange={setFILTRO_ALUMNO}
                placeholder="Todos los alumnos"
              />
              <FilterSelect
                label="Profesor"
                icon={GraduationCap}
                value={FILTRO_PROFESOR}
                options={cascadingOptions.profesores}
                onChange={setFILTRO_PROFESOR}
                placeholder="Todos los profesores"
              />
              <FilterSelect
                label="Especialidad"
                icon={BookOpen}
                value={FILTRO_ESPECIALIDAD}
                options={cascadingOptions.especialidades}
                onChange={setFILTRO_ESPECIALIDAD}
                placeholder="Todas las especialidades"
              />
              <FilterSelect
                label="Aula"
                icon={Home}
                value={FILTRO_AULA}
                options={cascadingOptions.aulas}
                onChange={setFILTRO_AULA}
                placeholder="Todas las aulas"
              />
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="temporal" className="border rounded-lg px-3">
                <AccordionTrigger className="text-xs font-semibold py-3 hover:no-underline">
                  Filtros Avanzados Temporales
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Día exacto</Label>
                    <Input
                      type="date"
                      className="h-9 text-sm"
                      value={FILTRO_DIA}
                      onChange={(e) => setFILTRO_DIA(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Hora inicio</Label>
                      <Input
                        className="h-9 text-sm text-center"
                        placeholder="16:00"
                        value={FILTRO_HORA_INICIO}
                        onChange={(e) => setFILTRO_HORA_INICIO(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Hora fin</Label>
                      <Input
                        className="h-9 text-sm text-center"
                        placeholder="17:00"
                        value={FILTRO_HORA_FIN}
                        onChange={(e) => setFILTRO_HORA_FIN(e.target.value)}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                className="w-full h-8 text-xs text-destructive hover:text-destructive"
                onClick={clearAllFilters}
              >
                Limpiar filtros
              </Button>
            )}
          </Card>
        )}

        <div
          className={cn(
            !hideFilters && "lg:col-span-3",
            embedded ? "flex min-h-0 flex-1 flex-col" : "space-y-3",
          )}
        >
          {!lockVisibleTypes && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={verClasesNormales}
                className={
                  verClasesNormales
                    ? "bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200 shadow-sm ring-1 ring-blue-300/60 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 dark:ring-blue-800/60 dark:hover:bg-blue-900/40"
                    : "border-blue-200 text-blue-800 hover:bg-blue-50 opacity-60 dark:border-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                }
                onClick={() => setVerClasesNormales((v) => !v)}
              >
                🟦 Ver Clases Matriculadas
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={verLeads}
                className={
                  verLeads
                    ? "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 shadow-sm ring-1 ring-amber-300/60 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 dark:ring-amber-800/60 dark:hover:bg-amber-900/40"
                    : "border-amber-200 text-amber-800 hover:bg-amber-50 opacity-60 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-900/20"
                }
                onClick={() => setVerLeads((v) => !v)}
              >
                🟨 Ver Leads
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={verIncidencias}
                className={
                  verIncidencias
                    ? "bg-red-100 text-red-900 border-red-300 hover:bg-red-200 shadow-sm ring-1 ring-red-300/60 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800 dark:ring-red-800/60 dark:hover:bg-red-900/40"
                    : "border-red-200 text-red-800 hover:bg-red-50 opacity-60 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-900/20"
                }
                onClick={() => setVerIncidencias((v) => !v)}
              >
                🟥/🟩 Ver Incidencias
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">
                {eventosFiltrados.length} bloques visibles
              </span>
            </div>
          )}

          <Card
            className={cn(
              "flex flex-col shadow-sm",
              embedded ? "min-h-0 flex-1 p-3" : "p-3",
            )}
          >
            {calendarView !== "day" && (
              <div className="mb-1 shrink-0 grid grid-cols-7 border-b pb-2 text-center text-xs font-medium text-muted-foreground">
                <div>Lun</div>
                <div>Mar</div>
                <div>Mié</div>
                <div>Jue</div>
                <div>Vie</div>
                <div>Sáb</div>
                <div>Dom</div>
              </div>
            )}

            {calendarView === "month" && (
              <div
                className={cn(
                  "grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border/60",
                  embedded ? "h-full min-h-0 flex-1" : "min-h-[560px]",
                )}
                style={
                  embedded
                    ? { gridTemplateRows: `repeat(${monthWeekRows}, minmax(0, 1fr))` }
                    : { gridTemplateRows: `repeat(${monthWeekRows}, minmax(95px, 1fr))` }
                }
              >
                {list.isLoading
                  ? Array.from({ length: 35 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className={cn(
                          "h-full w-full rounded-none",
                          !embedded && "min-h-[95px]",
                        )}
                      />
                    ))
                  : diasDelMes.map((dia, index) => {
                      const dateKey = formatearFechaKey(dia.date);
                      const eventosDelDia = mapaEventosPorFecha[dateKey] || [];
                      const isToday = dia.date.toDateString() === new Date().toDateString();

                      return (
                        <div
                          key={index}
                          className={cn(
                            "flex h-full w-full min-h-0 flex-col bg-background p-1.5",
                            !embedded && "min-h-[95px]",
                            !dia.isCurrentMonth && "bg-muted/30 opacity-40",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center self-end rounded-full text-[11px] font-semibold",
                              isToday
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {dia.date.getDate()}
                          </span>

                          <div className="custom-scrollbar flex-1 min-h-0 space-y-1 overflow-y-auto pr-0.5">
                            {eventosDelDia.map((ev) => renderEventButton(ev))}
                          </div>
                        </div>
                      );
                    })}
              </div>
            )}

            {calendarView === "week" && (
              <div
                className={cn(
                  "grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-border/60",
                  embedded ? "h-full min-h-0 flex-1" : "min-h-[360px]",
                )}
              >
                {list.isLoading
                  ? Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton
                        key={i}
                        className={cn(
                          "h-full w-full rounded-none",
                          !embedded && "min-h-[90px]",
                        )}
                      />
                    ))
                  : diasDeLaSemana.map((dia, index) => {
                      const dateKey = formatearFechaKey(dia.date);
                      const eventosDelDia = mapaEventosPorFecha[dateKey] || [];
                      const isToday = dia.date.toDateString() === new Date().toDateString();

                      return (
                        <div
                          key={index}
                          className={cn(
                            "flex flex-col bg-background p-1",
                            embedded ? "h-full min-h-0" : "min-h-[90px]",
                          )}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center self-end rounded-full text-[10px] font-semibold ${
                              isToday
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground"
                            }`}
                          >
                            {dia.date.getDate()}
                          </span>

                          <div className="mt-0.5 min-h-0 flex-1 overflow-y-auto">
                            {renderTimeBlockTimeline(
                              eventosDelDia,
                              true,
                              `${dateKey}-${verLeads}-${verIncidencias}`,
                            )}
                          </div>
                        </div>
                      );
                    })}
              </div>
            )}

            {calendarView === "day" && (
              <div
                className={cn(
                  "overflow-hidden rounded-lg border",
                  embedded ? "flex min-h-0 flex-1 flex-col" : "min-h-[360px]",
                )}
              >
                {list.isLoading ? (
                  <div className="space-y-1 p-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full rounded-md" />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 flex-col bg-background p-2">
                    <div className="mb-1 flex shrink-0 items-center justify-between gap-2 border-b pb-1">
                      <span className="truncate text-xs font-semibold capitalize">
                        {tituloCalendario}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {(mapaEventosPorFecha[formatearFechaKey(currentDate)] ?? []).length} bloques
                      </span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {renderTimeBlockTimeline(
                        mapaEventosPorFecha[formatearFechaKey(currentDate)] ?? [],
                        false,
                        `${formatearFechaKey(currentDate)}-${verLeads}-${verIncidencias}`,
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={handleEventDetailOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
              Detalle del bloque
            </DialogTitle>
            <DialogDescription>
              {selectedEvent?.FECHA_EXACTA?.split("T")[0]} · {selectedEvent?.HORA_INICIO ?? "—"} –{" "}
              {selectedEvent?.HORA_FIN ?? "—"}
            </DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-1">Bloque</p>
                <p className="font-medium">{selectedEvent.TITULO_BLOQUE}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground mb-0.5">Profesor</p>
                  <p className="font-semibold">
                    {selectedEvent.ID_PROFESOR ? (
                      <EntityLink type="profesor" id={selectedEvent.ID_PROFESOR}>
                        {selectedEvent.TEXTO_PROFESOR}
                      </EntityLink>
                    ) : (
                      selectedEvent.TEXTO_PROFESOR
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Aula</p>
                  <p className="font-semibold">
                    {selectedEvent.ID_AULA ? (
                      <EntityLink type="aula" id={selectedEvent.ID_AULA}>
                        {selectedEvent.TEXTO_AULA}
                      </EntityLink>
                    ) : (
                      selectedEvent.TEXTO_AULA
                    )}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground mb-0.5">Especialidad</p>
                  <p className="font-semibold">{selectedEvent.TEXTO_ESPECIALIDAD}</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  Alumnos en este bloque ({selectedEvent.ALUMNOS_GRUPO.length})
                </p>
                <ul className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                  {alumnosOrdenados.map((alumno, idx) => (
                    <li
                      key={`${alumno.TEXTO_ALUMNO}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2"
                    >
                      <span className="font-medium text-sm">
                        {alumno.ID_ALUMNO ? (
                          <EntityLink type="alumno" id={alumno.ID_ALUMNO}>
                            {alumno.TEXTO_ALUMNO}
                          </EntityLink>
                        ) : (
                          alumno.TEXTO_ALUMNO
                        )}
                      </span>
                      <Badge className={`text-[10px] shrink-0 ${getAlumnoBadgeClass(alumno)}`}>
                        {getAlumnoBadgeLabel(alumno)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>

              {selectedEvent.COLOR_INCIDENCIA === "rojo" && (
                <div className="p-3 rounded-md border text-xs bg-red-50 border-red-200 text-red-900 dark:bg-red-900/20 dark:border-red-900/40 dark:text-red-300">
                  <span className="font-semibold block mb-1">Incidencia detectada</span>
                  Al menos un alumno del bloque tiene una falta registrada.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
