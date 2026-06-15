import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import {
  useGrupos,
  generateGrupoId,
  canViewGruposNav,
  isGrupoEstadoActivo,
  nextGrupoEstadoToggleValue,
  type GrupoData,
} from "@/hooks/useGrupos";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import {
  getActiveCursoEscolar,
  type CentroData,
  type CursoEscolarData,
} from "@/hooks/useCentros";
import { useTarifas } from "@/hooks/useTarifas";
import { useActiveTenant } from "@/context/AppContext";
import { isAdminRole, isMasterRole, isProfesorRole } from "@/lib/tenantQuery";
import { hasPermission } from "@/lib/rbac";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import {
  formatProfesorOptionLabel,
  profesorSelectorOptions,
} from "@/lib/profesorSelector";

export const Route = createFileRoute("/_authenticated/grupos")({
  component: GruposPage,
});

const NONE_VALUE = "__none__";

const DIAS_SEMANA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

const dayOrder: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  Miercoles: 3,
  Miércoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sabado: 6,
  Sábado: 6,
  Domingo: 7,
};

function normalizeDayKey(dia: string | null | undefined): string {
  if (!dia) return "";
  return dia.normalize("NFD").replace(/\p{M}/gu, "");
}

function getDaySortKey(dia: string | null | undefined): number {
  if (!dia) return 99;
  const normalized = normalizeDayKey(dia);
  return dayOrder[normalized] ?? dayOrder[dia] ?? 99;
}

function sortGrupos(rows: GrupoData[]): GrupoData[] {
  return [...rows].sort((a, b) => {
    const dayDiff = getDaySortKey(a.DIA_SEMANA) - getDaySortKey(b.DIA_SEMANA);
    if (dayDiff !== 0) return dayDiff;
    return (a.HORA_INICIO ?? "").localeCompare(b.HORA_INICIO ?? "");
  });
}

function formatHora(hora: string | null | undefined): string {
  return hora?.slice(0, 5) ?? "—";
}

function formatHorarioSlotCell(
  horario: GrupoData["GRUPOS_HORARIOS"][number],
): string {
  const dia = horario.DIA_SEMANA ?? "—";
  const inicio = formatHora(horario.HORA_INICIO);
  const fin = formatHora(horario.HORA_FIN);
  if (inicio === "—" && fin === "—") return dia;
  return `${dia} ${inicio} - ${fin}`;
}

function formatHorario(inicio: string | null, fin: string | null): string {
  if (!inicio && !fin) return "—";
  if (inicio?.includes(" | ")) {
    const starts = inicio.split(" | ");
    const ends = (fin ?? "").split(" | ");
    return starts
      .map((s, i) => {
        const a = formatHora(s === "—" ? null : s);
        const b = formatHora(ends[i] === "—" ? null : ends[i]);
        return `${a} – ${b}`;
      })
      .join(", ");
  }
  const a = formatHora(inicio);
  const b = formatHora(fin);
  if (a === "—" && b === "—") return "—";
  return `${a} – ${b}`;
}

function occupancyBadge(count: number, max: number | null) {
  if (max == null || max <= 0) {
    return (
      <Badge variant="secondary" className="text-xs font-normal">
        {count} alumnos
      </Badge>
    );
  }
  const ratio = count / max;
  const variant =
    ratio >= 1 ? "destructive" : ratio >= 0.8 ? "default" : "secondary";
  return (
    <Badge variant={variant} className="text-xs font-normal tabular-nums">
      {count} / {max}
    </Badge>
  );
}

type PendingAlumnoAction = { id: string; nombre: string };

type DayScheduleSlot = {
  dia: string;
  enabled: boolean;
  HORA_INICIO: string;
  HORA_FIN: string;
  ID_PROFESOR: string;
  ID_AULA: string;
};

type EditScheduleSlot = {
  ID_GRUPO_HORARIO: string;
  DIA_SEMANA: string;
  HORA_INICIO: string;
  HORA_FIN: string;
  ID_PROFESOR: string;
  ID_AULA: string;
};

type CreateFormState = {
  NOMBRE_GRUPO: string;
  ID_GRUPO: string;
  scheduleSlots: DayScheduleSlot[];
  ID_ALUMNOS: string[];
  ID_CENTRO: string;
  ID_CURSO: string;
  ID_TARIFA: string;
  ID_ESPECIALIDAD: string;
  PLAZAS_MAXIMAS: string;
  NIVEL_ETAPA: string;
};

type EditFormState = {
  NOMBRE_GRUPO: string;
  ID_CENTRO: string;
  ID_CURSO: string;
  ID_TARIFA: string;
  ID_ESPECIALIDAD: string;
  scheduleSlots: EditScheduleSlot[];
};

function emptyScheduleSlots(): DayScheduleSlot[] {
  return DIAS_SEMANA.map((dia) => ({
    dia,
    enabled: false,
    HORA_INICIO: "",
    HORA_FIN: "",
    ID_PROFESOR: "",
    ID_AULA: "",
  }));
}

type ScheduleRowPayload = {
  DIA_SEMANA: string;
  HORA_INICIO: string;
  HORA_FIN: string;
  ID_PROFESOR: string;
  ID_AULA: string;
};

function buildScheduleRows(slots: DayScheduleSlot[]): ScheduleRowPayload[] {
  const active = slots.filter((s) => s.enabled);
  const missingStart = active.some((s) => !s.HORA_INICIO);
  if (missingStart) {
    throw new Error("Cada día seleccionado debe tener hora de inicio.");
  }
  return active.map((s) => ({
    DIA_SEMANA: s.dia,
    HORA_INICIO: s.HORA_INICIO,
    HORA_FIN: s.HORA_FIN,
    ID_PROFESOR: s.ID_PROFESOR,
    ID_AULA: s.ID_AULA,
  }));
}

function nullIfEmptySelectId(value: string): string | null {
  return value === "" ? null : value.trim() || null;
}

function toDbTime(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function toTimeInputValue(hora: string | null | undefined): string {
  return hora?.slice(0, 5) ?? "";
}

function sortCursosEscolares(cursos: CursoEscolarData[]): CursoEscolarData[] {
  return [...cursos].sort((a, b) =>
    (b.NOMBRE_CURSO ?? "").localeCompare(a.NOMBRE_CURSO ?? "", "es", {
      sensitivity: "base",
    }),
  );
}

function cursosForCentro(centros: CentroData[], centroId: string): CursoEscolarData[] {
  const centro = centros.find((c) => c.ID_CENTRO === centroId);
  return sortCursosEscolares(centro?.CURSO_ESCOLAR ?? []);
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

function emptyEditForm(): EditFormState {
  return {
    NOMBRE_GRUPO: "",
    ID_CENTRO: "",
    ID_CURSO: "",
    ID_TARIFA: "",
    ID_ESPECIALIDAD: "",
    scheduleSlots: [],
  };
}

function emptyCreateForm(): CreateFormState {
  return {
    NOMBRE_GRUPO: "",
    ID_GRUPO: "",
    scheduleSlots: emptyScheduleSlots(),
    ID_ALUMNOS: [],
    ID_CENTRO: "",
    ID_CURSO: "",
    ID_TARIFA: "",
    ID_ESPECIALIDAD: "",
    PLAZAS_MAXIMAS: "",
    NIVEL_ETAPA: "",
  };
}

function GrupoEstadoToggle({
  estado,
  loading,
  disabled,
  onToggle,
}: {
  estado: string | null | undefined;
  loading?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const active = isGrupoEstadoActivo(estado);

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "inline-flex min-w-[2rem] items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-opacity",
        active
          ? "bg-green-100 text-green-800 hover:bg-green-200"
          : "bg-red-100 text-red-800 hover:bg-red-200",
        (disabled || loading) && "pointer-events-none opacity-60",
      )}
      aria-label={active ? "Grupo activo. Pulsa para desactivar." : "Grupo inactivo. Pulsa para activar."}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
      ) : (
        <>
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full md:hidden",
              active ? "bg-green-600" : "bg-red-500",
            )}
            aria-hidden
          />
          <span className="hidden md:inline">{active ? "Activo" : "Inactivo"}</span>
        </>
      )}
    </button>
  );
}

function GrupoEstadoBadge({ estado }: { estado: string | null | undefined }) {
  const active = isGrupoEstadoActivo(estado);
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-medium",
        active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800",
      )}
    >
      <span
        className={cn(
          "mr-1.5 inline-block h-2 w-2 rounded-full md:hidden",
          active ? "bg-green-600" : "bg-red-500",
        )}
        aria-hidden
      />
      <span className="hidden md:inline">{active ? "Activo" : "Inactivo"}</span>
    </Badge>
  );
}

function parsePlazasInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

function editFormFromGrupo(g: GrupoData): EditFormState {
  const scheduleSlots = [...(g.GRUPOS_HORARIOS ?? [])]
    .sort(
      (a, b) =>
        getDaySortKey(a.DIA_SEMANA) - getDaySortKey(b.DIA_SEMANA) ||
        (a.HORA_INICIO ?? "").localeCompare(b.HORA_INICIO ?? ""),
    )
    .map((horario) => ({
      ID_GRUPO_HORARIO: horario.ID_GRUPO_HORARIO,
      DIA_SEMANA: horario.DIA_SEMANA ?? "",
      HORA_INICIO: toTimeInputValue(horario.HORA_INICIO),
      HORA_FIN: toTimeInputValue(horario.HORA_FIN),
      ID_PROFESOR: horario.ID_PROFESOR ?? "",
      ID_AULA: horario.ID_AULA ?? "",
    }));

  return {
    NOMBRE_GRUPO: g.NOMBRE_GRUPO ?? "",
    ID_CENTRO: g.ID_CENTRO ?? "",
    ID_CURSO: g.ID_CURSO ?? "",
    ID_TARIFA: g.ID_TARIFA ?? "",
    ID_ESPECIALIDAD: g.ID_ESPECIALIDAD ?? "",
    scheduleSlots,
  };
}

function GruposPage() {
  const { rol, perfil, centerId } = useActiveTenant();
  const canWrite = hasPermission(rol, "grupos:write");
  const canDelete = isMasterRole(rol) || isAdminRole(rol);
  const isMaster = isMasterRole(rol);
  const isProfesor = isProfesorRole(rol);
  const canViewStudents = canWrite || isProfesor;

  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const tarifas = useTarifas();

  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState<GrupoData | null>(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm);
  const [editing, setEditing] = useState<GrupoData | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm);
  const [localAlumnoIds, setLocalAlumnoIds] = useState<string[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [deleting, setDeleting] = useState<GrupoData | null>(null);
  const [pendingAdd, setPendingAdd] = useState<PendingAlumnoAction | null>(null);
  const [pendingCreateAlumno, setPendingCreateAlumno] = useState<PendingAlumnoAction | null>(null);
  const skipCreateAlumnoCancelRef = useRef(false);
  const [pendingRemove, setPendingRemove] = useState<PendingAlumnoAction | null>(null);
  const [createAlumnoSearch, setCreateAlumnoSearch] = useState("");
  const [togglingEstadoGrupoId, setTogglingEstadoGrupoId] = useState<string | null>(null);
  const [isInactiveOpen, setIsInactiveOpen] = useState(false);

  const sortLocale = { sensitivity: "base" } as const;

  const { list, create, update, remove } = useGrupos(filterCenterId);

  const grupos = list.data?.grupos ?? [];
  const diccionarioAlumnos = list.data?.diccionarioAlumnos ?? [];
  const diccionarioProfesores = list.data?.diccionarioProfesores ?? [];
  const diccionarioAulas = list.data?.diccionarioAulas ?? [];
  const diccionarioEspecialidades = list.data?.diccionarioEspecialidades ?? [];

  const alumnosOrdenados = useMemo(
    () =>
      [...diccionarioAlumnos].sort((a, b) =>
        a.NOMBRE_ALUMNO.localeCompare(b.NOMBRE_ALUMNO, "es", sortLocale),
      ),
    [diccionarioAlumnos],
  );

  const aulasOrdenadas = useMemo(
    () =>
      [...diccionarioAulas].sort((a, b) =>
        a.NOMBRE_AULA.localeCompare(b.NOMBRE_AULA, "es", sortLocale),
      ),
    [diccionarioAulas],
  );

  const especialidadesOrdenadas = useMemo(
    () =>
      [...diccionarioEspecialidades].sort((a, b) =>
        a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", sortLocale),
      ),
    [diccionarioEspecialidades],
  );

  const tarifasOrdenadas = useMemo(
    () =>
      [...(tarifas.list.data ?? [])].sort((a, b) =>
        a.SERVICIO.localeCompare(b.SERVICIO, "es", sortLocale),
      ),
    [tarifas.list.data],
  );

  const alumnoNombreById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of diccionarioAlumnos) {
      map.set(a.ID_ALUMNO, a.NOMBRE_ALUMNO);
    }
    return map;
  }, [diccionarioAlumnos]);

  useEffect(() => {
    if (managing) {
      setLocalAlumnoIds([...managing.ID_ALUMNOS]);
      setAddSearch("");
    }
  }, [managing]);

  useEffect(() => {
    if (editing) {
      const form = editFormFromGrupo(editing);
      if (!form.ID_CURSO && form.ID_CENTRO) {
        form.ID_CURSO = defaultCursoIdForCentro(centrosOrdenados, form.ID_CENTRO);
      }
      setEditForm(form);
    }
  }, [editing, centrosOrdenados]);

  const filtered = useMemo(() => {
    if (!query.trim()) return grupos;
    const q = query.toLowerCase();
    return grupos.filter(
      (g) =>
        g.NOMBRE_GRUPO?.toLowerCase().includes(q) ||
        g.TEXTO_PROFESOR.toLowerCase().includes(q) ||
        g.TEXTO_AULA.toLowerCase().includes(q) ||
        g.TEXTO_ESPECIALIDAD.toLowerCase().includes(q) ||
        g.DIA_SEMANA?.toLowerCase().includes(q) ||
        g.NOMBRES_ALUMNOS.some((n) => n.toLowerCase().includes(q)) ||
        (isMaster && g.ID_CLIENTE?.toLowerCase().includes(q)),
    );
  }, [grupos, query, isMaster]);

  const activeFiltered = useMemo(
    () => filtered.filter((g) => isGrupoEstadoActivo(g.ESTADO)),
    [filtered],
  );

  const inactiveFiltered = useMemo(
    () => filtered.filter((g) => !isGrupoEstadoActivo(g.ESTADO)),
    [filtered],
  );

  const groupedByDay = useMemo(() => {
    const sorted = sortGrupos(activeFiltered);
    const map = new Map<string, GrupoData[]>();
    for (const g of sorted) {
      const key = g.DIA_SEMANA?.trim() || "Sin día asignado";
      const list = map.get(key) ?? [];
      list.push(g);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => getDaySortKey(a) - getDaySortKey(b),
    );
  }, [activeFiltered]);

  const inactiveGruposSorted = useMemo(
    () => sortGrupos(inactiveFiltered),
    [inactiveFiltered],
  );

  const enrolledAlumnos = useMemo(() => {
    return localAlumnoIds
      .map((id) => ({
        id,
        nombre: alumnoNombreById.get(id) ?? "—",
      }))
      .filter((a) => a.nombre !== "—")
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [localAlumnoIds, alumnoNombreById]);

  const availableAlumnos = useMemo(() => {
    const enrolled = new Set(localAlumnoIds);
    
    let pool = diccionarioAlumnos.filter((a) => {
      const notEnrolled = !enrolled.has(a.ID_ALUMNO);
      const hasCorrectTarifa = a.MATRICULAS?.some((m) => m.ID_TARIFA === managing?.ID_TARIFA);
      const matchesCentro = a.ID_CENTRO === managing?.ID_CENTRO;
      return notEnrolled && (!managing?.ID_TARIFA || hasCorrectTarifa) && matchesCentro;
    });
    
    if (addSearch.trim()) {
      const q = addSearch.toLowerCase();
      pool = pool.filter((a) => a.NOMBRE_ALUMNO?.toLowerCase().includes(q));
    }
    
    return pool;
  }, [diccionarioAlumnos, localAlumnoIds, addSearch, managing?.ID_TARIFA, managing?.ID_CENTRO]);

  const createAlumnosFiltered = useMemo(() => {
    if (!createForm.ID_CENTRO) return [];

    let pool = alumnosOrdenados.filter((a) => a.ID_CENTRO === createForm.ID_CENTRO);

    if (!createAlumnoSearch.trim()) return pool;
    const q = createAlumnoSearch.toLowerCase();
    return pool.filter((a) => a.NOMBRE_ALUMNO?.toLowerCase().includes(q));
  }, [alumnosOrdenados, createAlumnoSearch, createForm.ID_CENTRO]);

  const canViewPage = canViewGruposNav(rol, grupos, perfil.ID_PROFESOR);

  if (isProfesor && !list.isLoading && !canViewPage) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          No tienes grupos asignados. Consulta tu calendario de sesiones para ver tus clases.
        </p>
      </div>
    );
  }

  const persistAlumnoIds = async (nextIds: string[]) => {
    if (!managing) return;
    await update.mutateAsync({
      id: managing.ID_GRUPO,
      patch: { ID_ALUMNOS: nextIds },
    });
    setLocalAlumnoIds(nextIds);
    setManaging((prev) => (prev ? { ...prev, ID_ALUMNOS: nextIds } : null));
  };

  const handleConfirmAdd = async () => {
    if (!managing || !pendingAdd) return;
    try {
      const nextIds = [...localAlumnoIds, pendingAdd.id];
      await persistAlumnoIds(nextIds);
      toast.success(`${pendingAdd.nombre} añadido al grupo.`);
      setPendingAdd(null);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Error al añadir alumno.");
    }
  };

  const handleConfirmRemove = async () => {
    if (!managing || !pendingRemove) return;
    try {
      const nextIds = localAlumnoIds.filter((id) => id !== pendingRemove.id);
      await persistAlumnoIds(nextIds);
      toast.success(`${pendingRemove.nombre} eliminado del grupo.`);
      setPendingRemove(null);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Error al quitar alumno.");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.ID_GRUPO);
      toast.success("Grupo eliminado.");
      setDeleting(null);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Error al eliminar.");
    }
  };

  const openCreateModal = () => {
    const initialCentro =
      selectedCenterId ??
      centrosOrdenados[0]?.ID_CENTRO ??
      centerId ??
      "";
    setCreateForm({
      ...emptyCreateForm(),
      ID_CENTRO: initialCentro,
      ID_CURSO: defaultCursoIdForCentro(centrosOrdenados, initialCentro),
    });
    setCreateAlumnoSearch("");
    setCreating(true);
  };

  const createCursosOptions = useMemo(
    () => cursosForCentro(centrosOrdenados, createForm.ID_CENTRO),
    [centrosOrdenados, createForm.ID_CENTRO],
  );

  const editCursosOptions = useMemo(
    () => cursosForCentro(centrosOrdenados, editForm.ID_CENTRO),
    [centrosOrdenados, editForm.ID_CENTRO],
  );

  const toggleCreateAlumno = (id: string) => {
    setCreateForm((f) => ({
      ...f,
      ID_ALUMNOS: f.ID_ALUMNOS.filter((x) => x !== id),
    }));
  };

  const handleCancelCreateAlumnoAdd = () => {
    if (!pendingCreateAlumno) return;
    setCreateForm((f) => ({
      ...f,
      ID_ALUMNOS: f.ID_ALUMNOS.filter((id) => id !== pendingCreateAlumno.id),
    }));
    setPendingCreateAlumno(null);
  };

  const handleConfirmCreateAlumnoAdd = () => {
    skipCreateAlumnoCancelRef.current = true;
    setPendingCreateAlumno(null);
  };

  const handleCreate = async () => {
    if (!createForm.NOMBRE_GRUPO.trim()) {
      toast.error("El nombre del grupo es obligatorio.");
      return;
    }
    const plazas = parsePlazasInput(createForm.PLAZAS_MAXIMAS);
    if (createForm.PLAZAS_MAXIMAS.trim() && plazas === null) {
      toast.error("Plazas máximas debe ser un número válido.");
      return;
    }
    if (!createForm.ID_CENTRO) {
      toast.error("El centro es obligatorio.");
      return;
    }
    if (!createForm.ID_CURSO) {
      toast.error("El curso escolar es obligatorio.");
      return;
    }
    if (!createForm.scheduleSlots.some((s) => s.enabled)) {
      toast.error("Selecciona al menos un día con su horario.");
      return;
    }
    let scheduleRows: ScheduleRowPayload[];
    try {
      scheduleRows = buildScheduleRows(createForm.scheduleSlots);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Revisa los horarios seleccionados.");
      return;
    }

    const selectedAlumnoIds = [...createForm.ID_ALUMNOS];
    if (
      pendingCreateAlumno &&
      !selectedAlumnoIds.includes(pendingCreateAlumno.id)
    ) {
      selectedAlumnoIds.push(pendingCreateAlumno.id);
    }

    try {
      const customId = isMaster ? createForm.ID_GRUPO.trim() || undefined : undefined;
      await create.mutateAsync({
        ID_GRUPO: customId,
        NOMBRE_GRUPO: createForm.NOMBRE_GRUPO.trim(),
        ID_CENTRO: createForm.ID_CENTRO,
        ID_CURSO: createForm.ID_CURSO,
        ID_TARIFA: createForm.ID_TARIFA || null,
        PLAZAS_MAXIMAS: plazas,
        NIVEL_ETAPA: createForm.NIVEL_ETAPA.trim() || null,
        ID_ESPECIALIDAD: createForm.ID_ESPECIALIDAD || null,
        ID_ALUMNOS: selectedAlumnoIds,
        horarios: scheduleRows.map((row) => ({
          DIA_SEMANA: row.DIA_SEMANA,
          HORA_INICIO: toDbTime(row.HORA_INICIO),
          HORA_FIN: toDbTime(row.HORA_FIN),
          ID_PROFESOR: nullIfEmptySelectId(row.ID_PROFESOR),
          ID_AULA: nullIfEmptySelectId(row.ID_AULA),
        })),
      });
      toast.success("Grupo creado correctamente.");
      setCreating(false);
      setCreateForm(emptyCreateForm());
      setPendingCreateAlumno(null);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Error al crear el grupo.");
    }
  };

  const updateScheduleSlot = (dia: string, patch: Partial<DayScheduleSlot>) => {
    setCreateForm((f) => ({
      ...f,
      scheduleSlots: f.scheduleSlots.map((slot) =>
        slot.dia === dia ? { ...slot, ...patch } : slot,
      ),
    }));
  };

  const updateEditScheduleSlot = (
    idGrupoHorario: string,
    patch: Partial<EditScheduleSlot>,
  ) => {
    setEditForm((f) => ({
      ...f,
      scheduleSlots: f.scheduleSlots.map((slot) =>
        slot.ID_GRUPO_HORARIO === idGrupoHorario ? { ...slot, ...patch } : slot,
      ),
    }));
  };

  const handleToggleGrupoEstado = async (grupo: GrupoData) => {
    if (togglingEstadoGrupoId) return;
    const nextEstado = nextGrupoEstadoToggleValue(grupo.ESTADO);
    setTogglingEstadoGrupoId(grupo.ID_GRUPO);
    try {
      await update.mutateAsync({
        id: grupo.ID_GRUPO,
        patch: { ESTADO: nextEstado },
      });
      toast.success(nextEstado === "ACTIVO" ? "Grupo activado." : "Grupo desactivado.");
    } catch (e) {
      toast.error((e as Error)?.message ?? "No se pudo actualizar el estado del grupo.");
    } finally {
      setTogglingEstadoGrupoId(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (!editForm.NOMBRE_GRUPO.trim()) {
      toast.error("El nombre del grupo es obligatorio.");
      return;
    }
    if (!editForm.ID_CENTRO) {
      toast.error("El centro es obligatorio.");
      return;
    }
    if (!editForm.ID_CURSO) {
      toast.error("El curso escolar es obligatorio.");
      return;
    }
    try {
      await update.mutateAsync({
        id: editing.ID_GRUPO,
        patch: {
          NOMBRE_GRUPO: editForm.NOMBRE_GRUPO.trim(),
          ID_CENTRO: editForm.ID_CENTRO,
          ID_CURSO: editForm.ID_CURSO,
          ID_TARIFA: editForm.ID_TARIFA || null,
          ID_ESPECIALIDAD: editForm.ID_ESPECIALIDAD || null,
        },
        horarios:
          editForm.scheduleSlots.length > 0
            ? editForm.scheduleSlots.map((slot) => ({
                ID_GRUPO_HORARIO: slot.ID_GRUPO_HORARIO,
                ID_CENTRO: editForm.ID_CENTRO,
                ID_CURSO: editForm.ID_CURSO,
                DIA_SEMANA: slot.DIA_SEMANA || null,
                HORA_INICIO: toDbTime(slot.HORA_INICIO),
                HORA_FIN: toDbTime(slot.HORA_FIN),
                ID_PROFESOR: nullIfEmptySelectId(slot.ID_PROFESOR),
                ID_AULA: nullIfEmptySelectId(slot.ID_AULA),
              }))
            : undefined,
      });
      toast.success("Grupo actualizado.");
      setEditing(null);
    } catch (e) {
      toast.error((e as Error)?.message ?? "Error al guardar cambios.");
    }
  };

  const renderGroupRow = (g: GrupoData) => (
    <TableRow
      key={g.ID_GRUPO}
      className={
        canViewStudents
          ? "cursor-pointer hover:bg-muted/50 transition-colors"
          : undefined
      }
      onClick={canViewStudents ? () => setManaging(g) : undefined}
    >
      {isMaster && (
        <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">
          {g.ID_CLIENTE}
        </TableCell>
      )}
      <TableCell className="font-medium truncate">{g.NOMBRE_GRUPO}</TableCell>
      <TableCell className="text-sm align-top">
        {g.GRUPOS_HORARIOS.length > 0 ? (
          <div className="flex flex-col gap-1">
            {g.GRUPOS_HORARIOS.map((horario) => (
              <span
                key={horario.ID_GRUPO_HORARIO}
                className="tabular-nums leading-snug"
              >
                {formatHorarioSlotCell(horario)}
              </span>
            ))}
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm align-top">
        {g.GRUPOS_HORARIOS.length > 0 ? (
          <div className="flex flex-col gap-1">
            {g.GRUPOS_HORARIOS.map((horario) => (
              <span key={`${horario.ID_GRUPO_HORARIO}-prof`} className="leading-snug">
                {horario.PROFESOR?.NOMBRE_PROFESOR ?? "—"}
              </span>
            ))}
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm align-top">
        {g.GRUPOS_HORARIOS.length > 0 ? (
          <div className="flex flex-col gap-1">
            {g.GRUPOS_HORARIOS.map((horario) => (
              <span key={`${horario.ID_GRUPO_HORARIO}-aula`} className="leading-snug">
                {horario.AULA?.NOMBRE_AULA ?? "—"}
              </span>
            ))}
          </div>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-sm break-words">{g.TEXTO_ESPECIALIDAD}</TableCell>
      <TableCell className="whitespace-nowrap">
        {occupancyBadge(g.ID_ALUMNOS.length, g.PLAZAS_MAXIMAS)}
      </TableCell>
      <TableCell
        className="w-[88px]"
        onClick={(e) => e.stopPropagation()}
      >
        {canWrite ? (
          <GrupoEstadoToggle
            estado={g.ESTADO}
            loading={togglingEstadoGrupoId === g.ID_GRUPO}
            disabled={!!togglingEstadoGrupoId && togglingEstadoGrupoId !== g.ID_GRUPO}
            onToggle={() => void handleToggleGrupoEstado(g)}
          />
        ) : (
          <GrupoEstadoBadge estado={g.ESTADO} />
        )}
      </TableCell>
      {canWrite && (
        <TableCell onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(g);
                }}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Editar Grupo
              </DropdownMenuItem>
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleting(g);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar grupo
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestión de Grupos</h1>
          <p className="text-sm text-muted-foreground">
            {grupos.length} grupos activos en el tenant
          </p>
        </div>
        {canWrite && (
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Grupo
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, profesor, aula, especialidad..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="grupos-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar grupos: {(list.error as Error)?.message}
          </div>
        )}

        {list.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : groupedByDay.length === 0 && inactiveGruposSorted.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            {query ? "Sin resultados." : "Aún no hay grupos registrados."}
          </p>
        ) : (
          <div className="space-y-8">
            {groupedByDay.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {query ? "Sin grupos activos para esta búsqueda." : "No hay grupos activos."}
              </p>
            ) : (
              groupedByDay.map(([dia, dayGrupos]) => (
                <section key={dia}>
                  <h2 className="text-lg font-bold capitalize mb-3 border-b pb-2">{dia}</h2>
                  <div className="w-full overflow-x-auto">
                    <Table className="w-full min-w-[800px] md:min-w-full table-fixed">
                      <TableHeader>
                        <TableRow>
                          {isMaster && <TableHead className="w-[100px]">Cliente</TableHead>}
                          <TableHead className="w-[18%]">Grupo</TableHead>
                          <TableHead className="w-[12%]">Horario</TableHead>
                          <TableHead className="w-[16%]">Profesor</TableHead>
                          <TableHead className="w-[12%]">Aula</TableHead>
                          <TableHead className="w-[16%]">Especialidad</TableHead>
                          <TableHead className="w-[14%]">Ocupación</TableHead>
                          <TableHead className="w-[88px]">
                            <span className="hidden md:inline">Estado</span>
                            <span className="md:sr-only">Estado</span>
                          </TableHead>
                          {canWrite && <TableHead className="w-12" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>{dayGrupos.map(renderGroupRow)}</TableBody>
                    </Table>
                  </div>
                </section>
              ))
            )}

            {inactiveGruposSorted.length > 0 && (
              <section className="border-t pt-6">
                <button
                  type="button"
                  onClick={() => setIsInactiveOpen((open) => !open)}
                  className="flex w-full items-center justify-between rounded-md border bg-muted/30 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50"
                >
                  <span>Ver grupos inactivos ({inactiveGruposSorted.length})</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      isInactiveOpen && "rotate-180",
                    )}
                  />
                </button>

                {isInactiveOpen && (
                  <div className="mt-4 w-full overflow-x-auto rounded-md border">
                    <Table className="w-full min-w-[800px] md:min-w-full table-fixed">
                      <TableHeader>
                        <TableRow>
                          {isMaster && <TableHead className="w-[100px]">Cliente</TableHead>}
                          <TableHead className="w-[18%]">Grupo</TableHead>
                          <TableHead className="w-[12%]">Horario</TableHead>
                          <TableHead className="w-[16%]">Profesor</TableHead>
                          <TableHead className="w-[12%]">Aula</TableHead>
                          <TableHead className="w-[16%]">Especialidad</TableHead>
                          <TableHead className="w-[14%]">Ocupación</TableHead>
                          <TableHead className="w-[88px]">
                            <span className="hidden md:inline">Estado</span>
                            <span className="md:sr-only">Estado</span>
                          </TableHead>
                          {canWrite && <TableHead className="w-12" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>{inactiveGruposSorted.map(renderGroupRow)}</TableBody>
                    </Table>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </Card>

      <Dialog open={!!managing} onOpenChange={(o) => !o && setManaging(null)}>
        <DialogContent
          className={`${isProfesor ? "max-w-lg" : "max-w-4xl"} max-h-[90vh] flex flex-col`}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              {isProfesor ? "Alumnos del grupo" : "Gestionar alumnos del grupo"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-left text-sm">
                <p className="font-medium text-foreground">{managing?.NOMBRE_GRUPO}</p>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {managing?.GRUPOS_HORARIOS.length ? (
                    managing.GRUPOS_HORARIOS.map((horario) => (
                      <span key={horario.ID_GRUPO_HORARIO} className="leading-snug">
                        {formatHorarioSlotCell(horario)} |{" "}
                        {horario.PROFESOR?.NOMBRE_PROFESOR ?? "—"} |{" "}
                        {horario.AULA?.NOMBRE_AULA ?? "—"}
                      </span>
                    ))
                  ) : (
                    <span>—</span>
                  )}
                  <span>
                    <span className="font-medium">Especialidad:</span>{" "}
                    {managing?.TEXTO_ESPECIALIDAD}
                  </span>
                </div>
                {managing && (
                  <div className="pt-1">
                    {occupancyBadge(localAlumnoIds.length, managing.PLAZAS_MAXIMAS)}
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          {isProfesor ? (
            <div className="flex flex-col min-h-0 border rounded-md flex-1">
              <div className="px-3 py-2 border-b bg-muted/30">
                <h3 className="text-sm font-semibold">Alumnos inscritos</h3>
                <p className="text-xs text-muted-foreground">
                  {enrolledAlumnos.length} alumno{enrolledAlumnos.length === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="flex-1 overflow-y-auto max-h-[50vh] p-2 space-y-0.5">
                {enrolledAlumnos.length === 0 ? (
                  <li className="text-sm text-muted-foreground text-center py-8">
                    No hay alumnos en este grupo.
                  </li>
                ) : (
                  enrolledAlumnos.map((alumno) => (
                    <li
                      key={alumno.id}
                      className="flex items-center gap-3 rounded-md px-2 py-2"
                    >
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {alumno.nombre
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{alumno.nombre}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 min-h-0">
              <div className="flex flex-col min-h-0 border rounded-md">
                <div className="px-3 py-2 border-b bg-muted/30">
                  <h3 className="text-sm font-semibold">Alumnos en el Grupo</h3>
                  <p className="text-xs text-muted-foreground">
                    {enrolledAlumnos.length} matriculados
                  </p>
                </div>
                <ul className="flex-1 overflow-y-auto max-h-[50vh] p-2 space-y-1">
                  {enrolledAlumnos.length === 0 ? (
                    <li className="text-sm text-muted-foreground text-center py-8">
                      No hay alumnos en este grupo.
                    </li>
                  ) : (
                    enrolledAlumnos.map((alumno) => (
                      <li
                        key={alumno.id}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className="text-sm truncate">{alumno.nombre}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                          onClick={() =>
                            setPendingRemove({ id: alumno.id, nombre: alumno.nombre })
                          }
                          disabled={update.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="flex flex-col min-h-0 border rounded-md">
                <div className="px-3 py-2 border-b bg-muted/30 space-y-2">
                  <h3 className="text-sm font-semibold">Añadir Alumnos</h3>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar alumno..."
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                </div>
                <ul className="flex-1 overflow-y-auto max-h-[50vh] p-2 space-y-1">
                  {availableAlumnos.length === 0 ? (
                    <li className="text-sm text-muted-foreground text-center py-8">
                      {addSearch.trim()
                        ? "Sin coincidencias."
                        : "Todos los alumnos del tenant ya están en el grupo."}
                    </li>
                  ) : (
                    availableAlumnos.map((alumno) => (
                      <li
                        key={alumno.ID_ALUMNO}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className="text-sm truncate">{alumno.NOMBRE_ALUMNO}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-primary"
                          onClick={() =>
                            setPendingAdd({
                              id: alumno.ID_ALUMNO,
                              nombre: alumno.NOMBRE_ALUMNO,
                            })
                          }
                          disabled={update.isPending}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setManaging(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={creating}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            setCreateForm(emptyCreateForm());
            setCreateAlumnoSearch("");
            setPendingCreateAlumno(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-muted-foreground" />
              Crear Nuevo Grupo
            </DialogTitle>
            <DialogDescription>
              Define los datos del grupo y selecciona los alumnos que formarán parte de él.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {isMaster && (
              <div className="space-y-1.5">
                <Label htmlFor="create-id-grupo">ID del grupo (opcional)</Label>
                <Input
                  id="create-id-grupo"
                  value={createForm.ID_GRUPO}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, ID_GRUPO: e.target.value }))
                  }
                  placeholder={`Auto: ${generateGrupoId()}`}
                />
                <p className="text-xs text-muted-foreground">
                  Déjalo vacío para generar automáticamente un ID único.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="create-nombre-grupo">Nombre del grupo</Label>
              <Input
                id="create-nombre-grupo"
                value={createForm.NOMBRE_GRUPO}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, NOMBRE_GRUPO: e.target.value }))
                }
                placeholder="Ej. Piano nivel 1"
              />
            </div>

            <div className="space-y-2">
              <Label>Días y horarios</Label>
              <p className="text-xs text-muted-foreground">
                Selecciona uno o más días y asigna un horario a cada uno.
              </p>
              <div className="border rounded-md divide-y max-h-[360px] overflow-y-auto">
                {createForm.scheduleSlots.map((slot) => {
                  const slotProfesorOptions = profesorSelectorOptions(
                    diccionarioProfesores,
                    slot.ID_PROFESOR,
                  );
                  return (
                    <div
                      key={slot.dia}
                      className={`px-3 py-2 space-y-2 ${slot.enabled ? "bg-muted/20" : ""}`}
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={slot.enabled}
                          onCheckedChange={(v) =>
                            updateScheduleSlot(slot.dia, { enabled: v === true })
                          }
                        />
                        <span className="text-sm font-medium">{slot.dia}</span>
                      </label>
                      {slot.enabled && (
                        <div className="space-y-2 pl-6">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Inicio</Label>
                              <Input
                                type="time"
                                className="h-8 text-sm"
                                value={slot.HORA_INICIO}
                                onChange={(e) =>
                                  updateScheduleSlot(slot.dia, {
                                    HORA_INICIO: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Fin</Label>
                              <Input
                                type="time"
                                className="h-8 text-sm"
                                value={slot.HORA_FIN}
                                onChange={(e) =>
                                  updateScheduleSlot(slot.dia, { HORA_FIN: e.target.value })
                                }
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Profesor</Label>
                              <Select
                                value={slot.ID_PROFESOR || NONE_VALUE}
                                onValueChange={(v) =>
                                  updateScheduleSlot(slot.dia, {
                                    ID_PROFESOR: v === NONE_VALUE ? "" : v,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Profesor" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE_VALUE}>Sin profesor</SelectItem>
                                  {slotProfesorOptions.map((p) => (
                                    <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                                      {formatProfesorOptionLabel(p)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Aula</Label>
                              <Select
                                value={slot.ID_AULA || NONE_VALUE}
                                onValueChange={(v) =>
                                  updateScheduleSlot(slot.dia, {
                                    ID_AULA: v === NONE_VALUE ? "" : v,
                                  })
                                }
                              >
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue placeholder="Aula" />
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
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-plazas">Plazas máximas</Label>
                <Input
                  id="create-plazas"
                  type="number"
                  min={1}
                  value={createForm.PLAZAS_MAXIMAS}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, PLAZAS_MAXIMAS: e.target.value }))
                  }
                  placeholder="Ej. 8"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-nivel">Nivel / Etapa</Label>
                <Input
                  id="create-nivel"
                  value={createForm.NIVEL_ETAPA}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, NIVEL_ETAPA: e.target.value }))
                  }
                  placeholder="Ej. Iniciación"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Centro</Label>
              <Select
                value={createForm.ID_CENTRO}
                onValueChange={(v) =>
                  setCreateForm((f) => ({
                    ...f,
                    ID_CENTRO: v,
                    ID_CURSO: resolveCursoIdForCentro(centrosOrdenados, v, f.ID_CURSO),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar centro" />
                </SelectTrigger>
                <SelectContent>
                  {centrosOrdenados.map((c) => (
                    <SelectItem key={c.ID_CENTRO} value={c.ID_CENTRO}>
                      {c.NOMBRE_CENTRO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Curso escolar</Label>
              <Select
                value={createForm.ID_CURSO}
                onValueChange={(v) =>
                  setCreateForm((f) => ({
                    ...f,
                    ID_CURSO: v,
                  }))
                }
                disabled={!createForm.ID_CENTRO || createCursosOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar curso escolar" />
                </SelectTrigger>
                <SelectContent>
                  {createCursosOptions.map((curso) => (
                    <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                      {curso.NOMBRE_CURSO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createForm.ID_CENTRO && createCursosOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay cursos escolares configurados para este centro.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Tarifa</Label>
              <Select
                value={createForm.ID_TARIFA || NONE_VALUE}
                onValueChange={(v) =>
                  setCreateForm((f) => ({
                    ...f,
                    ID_TARIFA: v === NONE_VALUE ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tarifa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sin tarifa</SelectItem>
                  {tarifasOrdenadas.map((t) => (
                    <SelectItem key={t.ID_TARIFA} value={t.ID_TARIFA}>
                      {t.SERVICIO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Especialidad</Label>
              <Select
                value={createForm.ID_ESPECIALIDAD || NONE_VALUE}
                onValueChange={(v) =>
                  setCreateForm((f) => ({
                    ...f,
                    ID_ESPECIALIDAD: v === NONE_VALUE ? "" : v,
                  }))
                }
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
              <div className="flex items-center justify-between gap-2">
                <Label>Alumnos</Label>
                <span className="text-xs text-muted-foreground">
                  {createForm.ID_ALUMNOS.length} seleccionados
                </span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar alumno..."
                  value={createAlumnoSearch}
                  onChange={(e) => setCreateAlumnoSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <div className="border rounded-md max-h-[200px] overflow-y-auto divide-y">
                {createAlumnosFiltered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {!createForm.ID_CENTRO
                      ? "Selecciona un centro para ver alumnos."
                      : createAlumnoSearch.trim()
                        ? "Sin coincidencias."
                        : "No hay alumnos en este centro."}
                  </p>
                ) : (
                  createAlumnosFiltered.map((alumno) => {
                    const checked = createForm.ID_ALUMNOS.includes(alumno.ID_ALUMNO);
                    return (
                      <label
                        key={alumno.ID_ALUMNO}
                        className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 ${checked ? "bg-muted/20" : ""}`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            if (value) {
                              setCreateForm((f) => ({
                                ...f,
                                ID_ALUMNOS: f.ID_ALUMNOS.includes(alumno.ID_ALUMNO)
                                  ? f.ID_ALUMNOS
                                  : [...f.ID_ALUMNOS, alumno.ID_ALUMNO],
                              }));
                              setPendingCreateAlumno({
                                id: alumno.ID_ALUMNO,
                                nombre: alumno.NOMBRE_ALUMNO,
                              });
                              return;
                            }
                            toggleCreateAlumno(alumno.ID_ALUMNO);
                          }}
                        />
                        <span className="text-sm truncate">{alumno.NOMBRE_ALUMNO}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setCreateForm(emptyCreateForm());
                setCreateAlumnoSearch("");
                setPendingCreateAlumno(null);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending ? "Creando…" : "Crear grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-muted-foreground" />
              Editar grupo
            </DialogTitle>
            <DialogDescription>
              Actualiza los datos del grupo. Los alumnos se gestionan desde la vista principal.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nombre-grupo">Nombre del grupo</Label>
              <Input
                id="nombre-grupo"
                value={editForm.NOMBRE_GRUPO}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, NOMBRE_GRUPO: e.target.value }))
                }
                placeholder="Ej. Piano nivel 1"
              />
            </div>

            <div className="space-y-2">
              <Label>Horarios del grupo</Label>
              <p className="text-xs text-muted-foreground">
                Cada franja horaria puede tener su propio profesor y aula.
              </p>
              {editForm.scheduleSlots.length === 0 ? (
                <p className="rounded-md border px-3 py-4 text-center text-sm text-muted-foreground">
                  Este grupo no tiene horarios registrados.
                </p>
              ) : (
                <div className="border rounded-md divide-y max-h-[360px] overflow-y-auto">
                  {editForm.scheduleSlots.map((slot) => {
                    const slotProfesorOptions = profesorSelectorOptions(
                      diccionarioProfesores,
                      slot.ID_PROFESOR,
                    );
                    return (
                      <div key={slot.ID_GRUPO_HORARIO} className="space-y-2 px-3 py-3 bg-muted/20">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Día</Label>
                          <Select
                            value={slot.DIA_SEMANA || NONE_VALUE}
                            onValueChange={(v) =>
                              updateEditScheduleSlot(slot.ID_GRUPO_HORARIO, {
                                DIA_SEMANA: v === NONE_VALUE ? "" : v,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Día" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE_VALUE}>Sin día</SelectItem>
                              {DIAS_SEMANA.map((dia) => (
                                <SelectItem key={dia} value={dia}>
                                  {dia}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Inicio</Label>
                            <Input
                              type="time"
                              className="h-8 text-sm"
                              value={slot.HORA_INICIO}
                              onChange={(e) =>
                                updateEditScheduleSlot(slot.ID_GRUPO_HORARIO, {
                                  HORA_INICIO: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Fin</Label>
                            <Input
                              type="time"
                              className="h-8 text-sm"
                              value={slot.HORA_FIN}
                              onChange={(e) =>
                                updateEditScheduleSlot(slot.ID_GRUPO_HORARIO, {
                                  HORA_FIN: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Profesor</Label>
                            <Select
                              value={slot.ID_PROFESOR || NONE_VALUE}
                              onValueChange={(v) =>
                                updateEditScheduleSlot(slot.ID_GRUPO_HORARIO, {
                                  ID_PROFESOR: v === NONE_VALUE ? "" : v,
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Profesor" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE_VALUE}>Sin profesor</SelectItem>
                                {slotProfesorOptions.map((p) => (
                                  <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                                    {formatProfesorOptionLabel(p)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Aula</Label>
                            <Select
                              value={slot.ID_AULA || NONE_VALUE}
                              onValueChange={(v) =>
                                updateEditScheduleSlot(slot.ID_GRUPO_HORARIO, {
                                  ID_AULA: v === NONE_VALUE ? "" : v,
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Aula" />
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Centro</Label>
              <Select
                value={editForm.ID_CENTRO}
                onValueChange={(v) =>
                  setEditForm((f) => ({
                    ...f,
                    ID_CENTRO: v,
                    ID_CURSO: resolveCursoIdForCentro(centrosOrdenados, v, f.ID_CURSO),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar centro" />
                </SelectTrigger>
                <SelectContent>
                  {centrosOrdenados.map((c) => (
                    <SelectItem key={c.ID_CENTRO} value={c.ID_CENTRO}>
                      {c.NOMBRE_CENTRO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Curso escolar</Label>
              <Select
                value={editForm.ID_CURSO}
                onValueChange={(v) =>
                  setEditForm((f) => ({
                    ...f,
                    ID_CURSO: v,
                  }))
                }
                disabled={!editForm.ID_CENTRO || editCursosOptions.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar curso escolar" />
                </SelectTrigger>
                <SelectContent>
                  {editCursosOptions.map((curso) => (
                    <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                      {curso.NOMBRE_CURSO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editForm.ID_CENTRO && editCursosOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay cursos escolares configurados para este centro.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Tarifa</Label>
              <Select
                value={editForm.ID_TARIFA || NONE_VALUE}
                onValueChange={(v) =>
                  setEditForm((f) => ({
                    ...f,
                    ID_TARIFA: v === NONE_VALUE ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tarifa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sin tarifa</SelectItem>
                  {tarifasOrdenadas.map((t) => (
                    <SelectItem key={t.ID_TARIFA} value={t.ID_TARIFA}>
                      {t.SERVICIO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Especialidad</Label>
              <Select
                value={editForm.ID_ESPECIALIDAD || NONE_VALUE}
                onValueChange={(v) =>
                  setEditForm((f) => ({
                    ...f,
                    ID_ESPECIALIDAD: v === NONE_VALUE ? "" : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar especialidad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>Sin especialidad</SelectItem>
                  {diccionarioEspecialidades.map((e) => (
                    <SelectItem key={e.ID_ESPECIALIDAD} value={e.ID_ESPECIALIDAD}>
                      {e.ESPECIALIDAD}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={update.isPending}>
              {update.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canWrite && (
      <AlertDialog
        open={!!pendingCreateAlumno}
        onOpenChange={(o) => {
          if (!o) {
            if (skipCreateAlumnoCancelRef.current) {
              skipCreateAlumnoCancelRef.current = false;
              return;
            }
            handleCancelCreateAlumnoAdd();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Al añadir a {pendingCreateAlumno?.nombre} se generará automáticamente una
              matrícula incompleta que deberás rellenar más adelante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelCreateAlumnoAdd}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreateAlumnoAdd}>
              Añadir alumno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {canWrite && (
      <AlertDialog open={!!pendingRemove} onOpenChange={(o) => !o && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar alumno?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Quitar a {pendingRemove?.nombre} de este grupo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmRemove}
              disabled={update.isPending}
            >
              {update.isPending ? "Quitando…" : "Quitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      {canWrite && (
      <AlertDialog open={!!pendingAdd} onOpenChange={(o) => !o && setPendingAdd(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Añadir alumno?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Añadir a {pendingAdd?.nombre} a este grupo?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAdd} disabled={update.isPending}>
              {update.isPending ? "Añadiendo…" : "Añadir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar el grupo «{deleting?.NOMBRE_GRUPO}»? Esta
              acción es irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={remove.isPending}
            >
              {remove.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
