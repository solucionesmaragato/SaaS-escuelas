import { createFileRoute } from "@tanstack/react-router";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  ListChecks,
  Loader2,
  Minus,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  useEvaluaciones,
  isTrimestreValue,
  showEvaluacionSaveError,
  TRIMESTRE_VALUES,
  type EvaluacionBatchUpsertInput,
  type EvaluacionData,
} from "@/hooks/useEvaluaciones";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { ALL_CENTROS_FILTER_VALUE } from "@/lib/centroFilter";
import { TeacherEvaluationsDashboard } from "@/components/evaluaciones/TeacherEvaluationsDashboard";
import {
  useRubricas,
  filterActiveRubricas,
  formatSupabaseError as formatRubricaError,
  isRubricaEstadoValue,
  RUBRICA_ESTADO_VALUES,
  type RubricaData,
  type RubricaUpsertInput,
} from "@/hooks/useRubricas";
import {
  useAlumnoHorariosEvaluacion,
  type AlumnoEspecialidadEvaluacion,
} from "@/hooks/useAlumnoHorariosEvaluacion";
import {
  buildResultadosRubricaByLabel,
  computeAutoNotaMediaFromCriteria,
  criterionNamesFromEstructura,
  initCriterioGradeValues,
  parseResultadosRubrica,
  parseRubricCriteria,
  type RubricCriterion,
} from "@/lib/rubricStructure";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntityLink } from "@/components/navigation/EntityLink";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useCentros, getActiveCursoEscolar, type CursoEscolarData } from "@/hooks/useCentros";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useProfesores } from "@/hooks/useProfesores";
import { useActiveTenant } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { canWriteUi, hasPermission } from "@/lib/rbac";
import type { Rol } from "@/types/database";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  scopeTenantQuery,
  tenantListKey,
} from "@/lib/tenantQuery";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type EvaluacionesSearch = {
  profesorId?: string;
  alumnoId?: string;
};

export const Route = createFileRoute("/_authenticated/evaluaciones")({
  validateSearch: (search: Record<string, unknown>): EvaluacionesSearch => {
    const result: EvaluacionesSearch = {};
    if (typeof search.profesorId === "string" && search.profesorId) {
      result.profesorId = search.profesorId;
    }
    if (typeof search.alumnoId === "string" && search.alumnoId) {
      result.alumnoId = search.alumnoId;
    }
    return result;
  },
  component: EvaluacionesPage,
});

type EntityOption = { id: string; label: string };

const RUBRICA_NONE_VALUE = "__none__";

const EMPTY_ESPECIALIDADES: AlumnoEspecialidadEvaluacion[] = [];

type EvaluacionesUiFilterGrupoRow = {
  ID_GRUPO: string;
  NOMBRE_GRUPO: string;
  ID_ALUMNOS: unknown;
  GRUPOS_HORARIOS: Array<{ ID_AULA: string | null }> | null;
};

type EvaluacionesUiFilterAulaRow = {
  ID_AULA: string;
  NOMBRE_AULA: string;
};

type EvaluacionesUiFiltersData = {
  grupos: EvaluacionesUiFilterGrupoRow[];
  aulas: EvaluacionesUiFilterAulaRow[];
};

const EMPTY_EVALUACIONES_UI_GRUPOS: EvaluacionesUiFilterGrupoRow[] = [];
const EMPTY_EVALUACIONES_UI_AULAS: EvaluacionesUiFilterAulaRow[] = [];

function parseGrupoAlumnoIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function buildEvaluacionesGrupoMaps(grupos: EvaluacionesUiFilterGrupoRow[]) {
  const gruposByAlumno = new Map<string, Set<string>>();
  const aulasByAlumno = new Map<string, Set<string>>();

  for (const grupo of grupos) {
    const aulaIds = new Set<string>();
    for (const horario of grupo.GRUPOS_HORARIOS ?? []) {
      if (horario.ID_AULA) aulaIds.add(horario.ID_AULA);
    }

    for (const alumnoId of parseGrupoAlumnoIds(grupo.ID_ALUMNOS)) {
      if (!gruposByAlumno.has(alumnoId)) gruposByAlumno.set(alumnoId, new Set());
      gruposByAlumno.get(alumnoId)!.add(grupo.ID_GRUPO);

      if (!aulasByAlumno.has(alumnoId)) aulasByAlumno.set(alumnoId, new Set());
      for (const aulaId of aulaIds) aulasByAlumno.get(alumnoId)!.add(aulaId);
    }
  }

  return { gruposByAlumno, aulasByAlumno };
}

function sortCursosEscolares(cursos: CursoEscolarData[]): CursoEscolarData[] {
  return [...cursos].sort((a, b) =>
    (b.NOMBRE_CURSO ?? "").localeCompare(a.NOMBRE_CURSO ?? "", "es", { sensitivity: "base" }),
  );
}

function formatNotaMedia(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : String(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readBulletinField(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function readBulletinSpecialties(bulletin: Record<string, unknown>): Record<string, unknown>[] {
  const raw =
    bulletin.especialidades ??
    bulletin.ESPECIALIDADES ??
    bulletin.specialties ??
    bulletin.evaluaciones;
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

function readBulletinCriteria(
  specialty: Record<string, unknown>,
): Array<{ label: string; value: string }> {
  const raw =
    specialty.resultados_rubrica ??
    specialty.RESULTADOS_RUBRICA ??
    specialty.criterios ??
    specialty.CRITERIOS ??
    specialty.rubric_data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).map(([label, value]) => ({
    label,
    value: formatNotaMedia(value),
  }));
}

function buildGroupedBulletinsPrintHtml(bulletins: Record<string, unknown>[]): string {
  const pages = bulletins
    .map((student) => {
      const studentName = escapeHtml(readBulletinField(student, ["nombre_alumno"]) || "Desconocido");
      const trimestre = escapeHtml(readBulletinField(student, ["trimestre", "TRIMESTRE"]) || "—");
      const evaluaciones = readBulletinSpecialties(student);

      const evaluacionesHtml =
        evaluaciones.length === 0
          ? `<p class="text-sm text-slate-500">Sin evaluaciones registradas.</p>`
          : evaluaciones
              .map((evaluacion) => {
                const espName = escapeHtml(
                  readBulletinField(evaluacion, ["nombre_especialidad"]) || "Desconocido",
                );
                const profesorName = escapeHtml(
                  readBulletinField(evaluacion, ["nombre_profesor"]) || "—",
                );
                const nota = escapeHtml(
                  formatNotaMedia(
                    evaluacion.nota_media ??
                      evaluacion.NOTA_MEDIA ??
                      evaluacion.nota ??
                      evaluacion.NOTA,
                  ),
                );
                const criteria = readBulletinCriteria(evaluacion);
                const criteriaHtml =
                  criteria.length === 0
                    ? `<p class="text-sm text-slate-500">Sin criterios de rúbrica.</p>`
                    : `<div class="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">${criteria
                        .map(
                          (criterion) => `
                    <div class="flex justify-between border-b border-slate-100 py-1">
                      <span class="text-slate-600">${escapeHtml(criterion.label)}</span>
                      <span class="font-semibold">${escapeHtml(criterion.value)}</span>
                    </div>`,
                        )
                        .join("")}</div>`;

                return `
             <div class="border rounded-lg border-slate-200 p-6 bg-slate-50/50">
               <div class="flex justify-between items-center mb-4">
                 <div>
                   <h3 class="text-xl font-bold text-indigo-900">${espName}</h3>
                   <p class="text-sm text-slate-600">Profesor/a: ${profesorName}</p>
                 </div>
                 <div class="text-right">
                   <span class="text-xs uppercase font-bold text-slate-400 block mb-1">Nota Final</span>
                   <span class="text-2xl font-black text-slate-800">${nota}</span>
                 </div>
               </div>
               
               <div class="mt-4 border-t border-slate-200 pt-4">
                 <h4 class="text-xs font-bold uppercase text-slate-400 mb-3">Desglose de Rúbrica</h4>
                 ${criteriaHtml}
               </div>
             </div>`;
              })
              .join("");

      return `
         <div class="page-break p-8 max-w-4xl mx-auto">
           
           <div class="border-b-2 border-slate-800 pb-6 mb-8 flex justify-between items-end">
             <div>
               <h1 class="text-3xl font-bold uppercase tracking-wide">Boletín de Calificaciones</h1>
               <p class="text-slate-500 mt-1">Trimestre: <span class="font-semibold text-slate-700">${trimestre}</span></p>
             </div>
             <div class="text-right">
               <h2 class="text-2xl font-semibold">${studentName}</h2>
             </div>
           </div>

           <div class="space-y-8">
             ${evaluacionesHtml}
           </div>
           
           <div class="mt-20 pt-8 flex justify-around text-center text-sm text-slate-500">
             <div>
               <div class="w-48 border-b border-slate-400 mb-2 mx-auto"></div>
               <p>Firma Dirección</p>
             </div>
             <div>
               <div class="w-48 border-b border-slate-400 mb-2 mx-auto"></div>
               <p>Firma Familia / Tutor</p>
             </div>
           </div>
           
         </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
  <head>
    <title>Boletines de Evaluación</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @media print {
        @page { margin: 20mm; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page-break { page-break-after: always; }
      }
    </style>
  </head>
  <body class="bg-white text-slate-800 font-sans">
    ${pages}
  </body>
</html>`;
}

function openGroupedBulletinsPrint(bulletins: Record<string, unknown>[]) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    toast.error("No se pudo abrir la ventana de impresión. Comprueba el bloqueador de ventanas.");
    return;
  }
  const html = buildGroupedBulletinsPrintHtml(bulletins);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 500);
}

function canAccessEvaluacionesPage(rol: Rol | null | undefined): boolean {
  return hasPermission(rol, "evaluaciones:read");
}

function canViewRubricasTab(rol: Rol | null | undefined): boolean {
  return isMasterRole(rol) || isAdminRole(rol) || isDireccionRole(rol);
}

function SearchableEntitySelect({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
  loading,
}: {
  label: string;
  placeholder: string;
  options: EntityOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((opt) => opt.id === value);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled || loading}
          >
            {loading ? "Cargando..." : selected ? selected.label : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          portalled={false}
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
          side="bottom"
        >
          <Command shouldFilter className="flex max-h-[min(280px,50vh)] flex-col overflow-hidden">
            <CommandInput placeholder="Buscar..." />
            <CommandList className="min-h-0 max-h-none flex-1 overflow-y-auto overscroll-contain">
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.label} ${opt.id}`}
                    onSelect={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn("mr-2 h-4 w-4", value === opt.id ? "opacity-100" : "opacity-0")}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={mono ? "font-mono text-xs break-all" : "break-words"}>{value || "—"}</p>
    </div>
  );
}

function EvaluacionesPage() {
  const { rol: tenantRol, perfil } = useActiveTenant();
  const rol = tenantRol as Rol | null | undefined;
  const showRubricasTab = canViewRubricasTab(rol);
  const isTeacherView = isProfesorRole(rol);

  if (!canAccessEvaluacionesPage(rol)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  if (isTeacherView) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader
          title="Mis evaluaciones"
          description="Evalúa a tus alumnos de clases individuales y grupos"
        />
        <TeacherEvaluationsDashboard profesorId={perfil.ID_PROFESOR} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Evaluaciones"
        description="Seguimiento académico por trimestre — Fase 1: nota media y comentarios"
      />

      <Tabs defaultValue="evaluaciones">
        <TabsList>
          <TabsTrigger value="evaluaciones">Evaluaciones</TabsTrigger>
          {showRubricasTab && <TabsTrigger value="rubricas">Criterios de evaluación</TabsTrigger>}
        </TabsList>

        <TabsContent value="evaluaciones" className="mt-4">
          <EvaluacionesTab />
        </TabsContent>

        {showRubricasTab && (
          <TabsContent value="rubricas" className="mt-4">
            <RubricasTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function EvaluacionesTab() {
  const { rol: tenantRol, tenantId } = useActiveTenant();
  const rol = tenantRol as Rol | null | undefined;
  const isMaster = isMasterRole(rol);
  const canMutate = canWriteUi(rol, "evaluaciones:write");

  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, upsertEvaluaciones } = useEvaluaciones(filterCenterId);
  const { list: alumnosList } = useAlumnos();
  const { list: centrosList } = useCentros();
  const { list: especialidadesList } = useEspecialidades();
  const { list: profesoresList } = useProfesores();
  const { list: rubricasList } = useRubricas();

  const evaluacionesUiFiltersQuery = useQuery({
    queryKey: [...tenantListKey("evaluacionesUiFilters", rol, tenantId)] as const,
    enabled: Boolean(tenantId),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    queryFn: async (): Promise<EvaluacionesUiFiltersData> => {
      let gruposQuery = supabase
        .from("GRUPOS")
        .select("ID_GRUPO, NOMBRE_GRUPO, ID_ALUMNOS, GRUPOS_HORARIOS(ID_AULA)");
      gruposQuery = scopeTenantQuery(gruposQuery, rol, tenantId);

      let aulasQuery = supabase.from("AULA").select("ID_AULA, NOMBRE_AULA");
      aulasQuery = scopeTenantQuery(aulasQuery, rol, tenantId);

      const [{ data: grupos, error: gruposError }, { data: aulas, error: aulasError }] =
        await Promise.all([
          gruposQuery,
          aulasQuery.order("NOMBRE_AULA", { ascending: true }),
        ]);

      if (gruposError) throw gruposError;
      if (aulasError) throw aulasError;

      return {
        grupos: (grupos ?? []) as EvaluacionesUiFilterGrupoRow[],
        aulas: (aulas ?? []) as EvaluacionesUiFilterAulaRow[],
      };
    },
  });

  const alumnos = useMemo(() => alumnosList.data ?? [], [alumnosList.data]);
  const especialidades = useMemo(() => especialidadesList.data ?? [], [especialidadesList.data]);
  const profesores = useMemo(
    () => profesoresList.data?.profesores ?? [],
    [profesoresList.data?.profesores],
  );
  const grupos = evaluacionesUiFiltersQuery.data?.grupos ?? EMPTY_EVALUACIONES_UI_GRUPOS;
  const aulas = evaluacionesUiFiltersQuery.data?.aulas ?? EMPTY_EVALUACIONES_UI_AULAS;
  const activeRubricas = useMemo(
    () => filterActiveRubricas(rubricasList.data ?? []),
    [rubricasList.data],
  );

  const alumnoById = useMemo(
    () => new Map(alumnos.map((a) => [a.ID_ALUMNO, a.NOMBRE_ALUMNO])),
    [alumnos],
  );
  const especialidadById = useMemo(
    () => new Map(especialidades.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD])),
    [especialidades],
  );
  const profesorById = useMemo(
    () => new Map(profesores.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR])),
    [profesores],
  );
  const rubricaById = useMemo(
    () => new Map((rubricasList.data ?? []).map((r) => [r.ID_RUBRICA, r])),
    [rubricasList.data],
  );

  const cursoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const centro of centrosList.data ?? []) {
      for (const curso of centro.CURSO_ESCOLAR ?? []) {
        map.set(curso.ID_CURSO, curso.NOMBRE_CURSO);
      }
    }
    return map;
  }, [centrosList.data]);

  const cursosEscolares = useMemo(() => {
    const seen = new Set<string>();
    const all: CursoEscolarData[] = [];
    for (const centro of centrosList.data ?? []) {
      for (const curso of centro.CURSO_ESCOLAR ?? []) {
        if (seen.has(curso.ID_CURSO)) continue;
        seen.add(curso.ID_CURSO);
        all.push(curso);
      }
    }
    return sortCursosEscolares(all);
  }, [centrosList.data]);

  const { profesorId: deepLinkProfesorId, alumnoId: deepLinkAlumnoId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [query, setQuery] = useState("");
  const [filtroCurso, setFiltroCurso] = useState("");
  const [filtroTrimestre, setFiltroTrimestre] = useState("");
  const [selectedProfesor, setSelectedProfesor] = useState("");
  const [selectedEspecialidad, setSelectedEspecialidad] = useState("");
  const [selectedGrupo, setSelectedGrupo] = useState("");
  const [selectedAula, setSelectedAula] = useState("");
  const [selectedAlumno, setSelectedAlumno] = useState("");
  const [generatingBulletins, setGeneratingBulletins] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EvaluacionData | null>(null);
  const [detail, setDetail] = useState<EvaluacionData | null>(null);

  useEffect(() => {
    if (deepLinkProfesorId) setSelectedProfesor(deepLinkProfesorId);
  }, [deepLinkProfesorId]);

  useEffect(() => {
    if (!deepLinkAlumnoId || alumnos.length === 0) return;
    const nombreAlumno = alumnoById.get(deepLinkAlumnoId);
    if (nombreAlumno) {
      setQuery(nombreAlumno);
      navigate({ search: (prev) => ({ ...prev, alumnoId: undefined }), replace: true });
    }
  }, [deepLinkAlumnoId, alumnos.length, alumnoById, navigate]);

  const { gruposByAlumno, aulasByAlumno } = useMemo(
    () => buildEvaluacionesGrupoMaps(grupos),
    [grupos],
  );

  const profesorFilterOptions = useMemo(
    () =>
      [...profesores].sort((a, b) =>
        a.NOMBRE_PROFESOR.localeCompare(b.NOMBRE_PROFESOR, "es", { sensitivity: "base" }),
      ),
    [profesores],
  );

  const especialidadFilterOptions = useMemo(
    () =>
      [...especialidades].sort((a, b) =>
        a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", { sensitivity: "base" }),
      ),
    [especialidades],
  );

  const grupoFilterOptions = useMemo(
    () =>
      [...grupos].sort((a, b) =>
        a.NOMBRE_GRUPO.localeCompare(b.NOMBRE_GRUPO, "es", { sensitivity: "base" }),
      ),
    [grupos],
  );

  const aulaFilterOptions = useMemo(
    () =>
      [...aulas].sort((a, b) =>
        a.NOMBRE_AULA.localeCompare(b.NOMBRE_AULA, "es", { sensitivity: "base" }),
      ),
    [aulas],
  );

  const alumnoFilterOptions = useMemo(
    () =>
      [...alumnos].sort((a, b) =>
        a.NOMBRE_ALUMNO.localeCompare(b.NOMBRE_ALUMNO, "es", { sensitivity: "base" }),
      ),
    [alumnos],
  );

  const filtered = useMemo(() => {
    let rows = list.data ?? [];

    if (filtroCurso) {
      rows = rows.filter((r) => r.ID_CURSO === filtroCurso);
    }
    if (filtroTrimestre) {
      rows = rows.filter((r) => r.TRIMESTRE === filtroTrimestre);
    }
    if (selectedProfesor) {
      rows = rows.filter((r) => r.ID_PROFESOR === selectedProfesor);
    }
    if (selectedEspecialidad) {
      rows = rows.filter((r) => r.ID_ESPECIALIDAD === selectedEspecialidad);
    }
    if (selectedGrupo) {
      rows = rows.filter((r) => gruposByAlumno.get(r.ID_ALUMNO)?.has(selectedGrupo));
    }
    if (selectedAula) {
      rows = rows.filter((r) => aulasByAlumno.get(r.ID_ALUMNO)?.has(selectedAula));
    }
    if (selectedAlumno) {
      rows = rows.filter((r) => r.ID_ALUMNO === selectedAlumno);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => {
        const alumno = alumnoById.get(r.ID_ALUMNO) ?? "";
        const especialidad = especialidadById.get(r.ID_ESPECIALIDAD) ?? "";
        const profesor = r.ID_PROFESOR ? (profesorById.get(r.ID_PROFESOR) ?? "") : "";
        return (
          (r.ID_CURSO ? (cursoById.get(r.ID_CURSO) ?? "") : "").toLowerCase().includes(q) ||
          r.TRIMESTRE?.toLowerCase().includes(q) ||
          alumno.toLowerCase().includes(q) ||
          especialidad.toLowerCase().includes(q) ||
          profesor.toLowerCase().includes(q) ||
          formatNotaMedia(r.NOTA_MEDIA).includes(q) ||
          r.COMENTARIOS?.toLowerCase().includes(q)
        );
      });
    }

    return rows;
  }, [
    list.data,
    query,
    filtroCurso,
    filtroTrimestre,
    selectedProfesor,
    selectedEspecialidad,
    selectedGrupo,
    selectedAula,
    selectedAlumno,
    gruposByAlumno,
    aulasByAlumno,
    alumnoById,
    especialidadById,
    profesorById,
    cursoById,
  ]);

  const cursoFilterOptions = useMemo(() => {
    const ids = new Set(
      (list.data ?? []).map((r) => r.ID_CURSO).filter((id): id is string => Boolean(id?.trim())),
    );
    for (const curso of cursosEscolares) ids.add(curso.ID_CURSO);
    return sortCursosEscolares(
      [...ids].map(
        (id) =>
          cursosEscolares.find((c) => c.ID_CURSO === id) ?? {
            ID_CURSO: id,
            ID_CLIENTE: null,
            ID_CENTRO: "",
            NOMBRE_CURSO: cursoById.get(id) ?? id,
            FECHA_INICIO: "",
            FECHA_FIN: "",
            FESTIVOS: null,
            ESTADO: null,
          },
      ),
    );
  }, [list.data, cursosEscolares, cursoById]);

  const handleGenerateBulletins = useCallback(async () => {
    if (!filtered || filtered.length === 0) {
      toast.info("No hay evaluaciones en la tabla para los filtros seleccionados.");
      return;
    }

    setGeneratingBulletins(true);
    try {
      // Agrupa las filas ya filtradas (visibles en la tabla) por alumno y trimestre.
      const groupedMap = new Map<string, Record<string, unknown>>();

      for (const row of filtered) {
        const key = `${row.ID_ALUMNO}_${row.TRIMESTRE}`;

        if (!groupedMap.has(key)) {
          groupedMap.set(key, {
            nombre_alumno: alumnoById.get(row.ID_ALUMNO) || "Desconocido",
            trimestre: row.TRIMESTRE === "FINAL" ? "Final" : row.TRIMESTRE || "—",
            evaluaciones: [],
          });
        }

        (groupedMap.get(key)!.evaluaciones as Record<string, unknown>[]).push({
          nombre_especialidad: especialidadById.get(row.ID_ESPECIALIDAD) || "Desconocido",
          nombre_profesor: row.ID_PROFESOR ? (profesorById.get(row.ID_PROFESOR) || "—") : "—",
          nota_media: row.NOTA_MEDIA,
          resultados_rubrica: row.RESULTADOS_RUBRICA,
        });
      }

      const bulletins = Array.from(groupedMap.values());

      openGroupedBulletinsPrint(bulletins);
    } catch (err) {
      console.error("CLIENT_PDF_GENERATION_ERROR:", err);
      toast.error("Error al generar los boletines locales.");
    } finally {
      setGeneratingBulletins(false);
    }
  }, [filtered, alumnoById, especialidadById, profesorById]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {list.data?.length ?? 0} evaluaciones registradas
      </p>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid w-full flex-1 grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <div className="relative sm:col-span-2 lg:col-span-2 xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar alumno..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {showCentroFilter && (
              <Select
                value={selectedCenterId ?? ALL_CENTROS_FILTER_VALUE}
                onValueChange={(next) =>
                  setSelectedCenterId(next === ALL_CENTROS_FILTER_VALUE ? null : next)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Centros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CENTROS_FILTER_VALUE}>Centros</SelectItem>
                  {centrosOrdenados.map((centro) => (
                    <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                      {centro.NOMBRE_CENTRO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select
              value={filtroCurso || "__all__"}
              onValueChange={(v) => setFiltroCurso(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Cursos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Cursos</SelectItem>
                {cursoFilterOptions.map((curso) => (
                  <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                    {curso.NOMBRE_CURSO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filtroTrimestre || "__all__"}
              onValueChange={(v) => setFiltroTrimestre(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Trimestres" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Trimestres</SelectItem>
                {TRIMESTRE_VALUES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === "FINAL" ? "Final" : `Trimestre ${t}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedProfesor || "__all__"}
              onValueChange={(v) => setSelectedProfesor(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Profesores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Profesores</SelectItem>
                {profesorFilterOptions.map((profesor) => (
                  <SelectItem key={profesor.ID_PROFESOR} value={profesor.ID_PROFESOR}>
                    {profesor.NOMBRE_PROFESOR}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedEspecialidad || "__all__"}
              onValueChange={(v) => setSelectedEspecialidad(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Especialidades" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Especialidades</SelectItem>
                {especialidadFilterOptions.map((esp) => (
                  <SelectItem key={esp.ID_ESPECIALIDAD} value={esp.ID_ESPECIALIDAD}>
                    {esp.ESPECIALIDAD}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedGrupo || "__all__"}
              onValueChange={(v) => setSelectedGrupo(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Grupos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Grupos</SelectItem>
                {grupoFilterOptions.map((grupo) => (
                  <SelectItem key={grupo.ID_GRUPO} value={grupo.ID_GRUPO}>
                    {grupo.NOMBRE_GRUPO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedAula || "__all__"}
              onValueChange={(v) => setSelectedAula(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Aulas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Aulas</SelectItem>
                {aulaFilterOptions.map((aula) => (
                  <SelectItem key={aula.ID_AULA} value={aula.ID_AULA}>
                    {aula.NOMBRE_AULA}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedAlumno || "__all__"}
              onValueChange={(v) => setSelectedAlumno(v === "__all__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Alumnos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Alumnos</SelectItem>
                {alumnoFilterOptions.map((alumno) => (
                  <SelectItem key={alumno.ID_ALUMNO} value={alumno.ID_ALUMNO}>
                    {alumno.NOMBRE_ALUMNO}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row xl:min-w-[280px] xl:flex-col 2xl:flex-row xl:items-stretch 2xl:items-center xl:justify-end">
            <Button
              onClick={handleGenerateBulletins}
              disabled={generatingBulletins}
              className="w-full sm:w-auto"
            >
              {generatingBulletins ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Generar Boletines PDF
            </Button>
            {canMutate && (
              <Button onClick={() => setCreating(true)} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Nueva evaluación
              </Button>
            )}
          </div>
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar evaluaciones: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Año académico</TableHead>
                <TableHead>Trimestre</TableHead>
                <TableHead>Alumno</TableHead>
                <TableHead>Especialidad</TableHead>
                <TableHead className="text-right">Nota final</TableHead>
                <TableHead>Profesor</TableHead>
                {canMutate && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canMutate ? 7 : 6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canMutate ? 8 : 7}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {query ||
                    filtroCurso ||
                    filtroTrimestre ||
                    selectedProfesor ||
                    selectedEspecialidad ||
                    selectedGrupo ||
                    selectedAula
                      ? "Sin resultados."
                      : "Aún no hay evaluaciones registradas."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow
                    key={row.ID_EVALUACION}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDetail(row)}
                  >
                    <TableCell className="font-medium">
                      {row.ID_CURSO ? (cursoById.get(row.ID_CURSO) ?? "—") : "—"}
                    </TableCell>
                    <TableCell>{row.TRIMESTRE === "FINAL" ? "Final" : row.TRIMESTRE}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {alumnoById.get(row.ID_ALUMNO) ? (
                        <EntityLink type="alumno" id={row.ID_ALUMNO}>
                          {alumnoById.get(row.ID_ALUMNO)}
                        </EntityLink>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{especialidadById.get(row.ID_ESPECIALIDAD) || "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatNotaMedia(row.NOTA_MEDIA)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {row.ID_PROFESOR && profesorById.get(row.ID_PROFESOR) ? (
                        <EntityLink type="profesor" id={row.ID_PROFESOR}>
                          {profesorById.get(row.ID_PROFESOR)}
                        </EntityLink>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {canMutate && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(row)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canMutate && creating && (
        <EvaluacionFormDialog
          open
          onClose={() => setCreating(false)}
          title="Nueva evaluación"
          submitLabel="Guardar evaluaciones"
          submitting={upsertEvaluaciones.isPending}
          alumnos={alumnos}
          cursosEscolares={cursosEscolares}
          activeRubricas={activeRubricas}
          alumnosLoading={alumnosList.isLoading}
          cursosLoading={centrosList.isLoading}
          rubricasLoading={rubricasList.isLoading}
          onSubmit={async (items) => {
            try {
              await upsertEvaluaciones.mutateAsync(items);
              toast.success(
                items.length === 1
                  ? "Evaluación guardada correctamente"
                  : `${items.length} evaluaciones guardadas correctamente`,
              );
              setCreating(false);
            } catch (err) {
              console.error("UPSERT EVALUACIONES ERROR:", err);
              showEvaluacionSaveError(err);
            }
          }}
        />
      )}

      {editing && (
        <EvaluacionFormDialog
          open
          onClose={() => setEditing(null)}
          title="Editar evaluación"
          submitLabel="Guardar cambios"
          initial={editing}
          submitting={upsertEvaluaciones.isPending}
          alumnos={alumnos}
          cursosEscolares={cursosEscolares}
          activeRubricas={activeRubricas}
          alumnosLoading={alumnosList.isLoading}
          cursosLoading={centrosList.isLoading}
          rubricasLoading={rubricasList.isLoading}
          onSubmit={async (items) => {
            try {
              await upsertEvaluaciones.mutateAsync(items);
              toast.success("Evaluación actualizada");
              setEditing(null);
            } catch (err) {
              console.error("UPSERT EVALUACION ERROR:", err);
              showEvaluacionSaveError(err);
            }
          }}
        />
      )}

      {detail && (
        <EvaluacionDetailDialog
          row={detail}
          isMaster={isMaster}
          alumnoById={alumnoById}
          especialidadById={especialidadById}
          profesorById={profesorById}
          cursoById={cursoById}
          rubricaById={rubricaById}
          canMutate={canMutate}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            setEditing(detail);
          }}
        />
      )}
    </div>
  );
}

function EvaluacionDetailDialog({
  row,
  isMaster,
  alumnoById,
  especialidadById,
  profesorById,
  cursoById,
  rubricaById,
  canMutate,
  onClose,
  onEdit,
}: {
  row: EvaluacionData;
  isMaster: boolean;
  alumnoById: Map<string, string>;
  especialidadById: Map<string, string>;
  profesorById: Map<string, string>;
  cursoById: Map<string, string>;
  rubricaById: Map<string, RubricaData>;
  canMutate: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const rubrica = row.ID_RUBRICA ? (rubricaById.get(row.ID_RUBRICA) ?? null) : null;
  const rubricCriterios = useMemo(() => parseRubricCriteria(rubrica?.ESTRUCTURA), [rubrica]);
  const rubricResultados = useMemo(
    () => parseResultadosRubrica(row.RESULTADOS_RUBRICA),
    [row.RESULTADOS_RUBRICA],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto [&>button:last-child]:hidden">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <DialogTitle className="flex min-w-0 items-center gap-2 text-xl font-semibold">
            <ClipboardCheck className="h-5 w-5 shrink-0" />
            Detalle de evaluación
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            {canMutate && (
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
            <Button type="button" variant="ghost" size="icon" aria-label="Cerrar" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        </header>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField
              label="Alumno"
              value={
                alumnoById.get(row.ID_ALUMNO) ? (
                  <EntityLink type="alumno" id={row.ID_ALUMNO}>
                    {alumnoById.get(row.ID_ALUMNO)}
                  </EntityLink>
                ) : (
                  "—"
                )
              }
            />
            <DetailField
              label="Año académico"
              value={row.ID_CURSO ? (cursoById.get(row.ID_CURSO) ?? "—") : "—"}
            />
            <DetailField
              label="Trimestre"
              value={row.TRIMESTRE === "FINAL" ? "Final" : row.TRIMESTRE}
            />
            <DetailField
              label="Especialidad"
              value={especialidadById.get(row.ID_ESPECIALIDAD) ?? "—"}
            />
            <DetailField
              label="Profesor"
              value={
                row.ID_PROFESOR && profesorById.get(row.ID_PROFESOR) ? (
                  <EntityLink type="profesor" id={row.ID_PROFESOR}>
                    {profesorById.get(row.ID_PROFESOR)}
                  </EntityLink>
                ) : (
                  "—"
                )
              }
            />
            <DetailField label="Nota final" value={formatNotaMedia(row.NOTA_MEDIA)} />
            <DetailField label="Estado" value={row.ESTADO ?? "—"} />
          </div>

          <DetailField label="Observaciones" value={row.COMENTARIOS ?? "—"} />

          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">Criterios de la rúbrica</p>
            {rubricCriterios.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {rubrica
                  ? "Esta rúbrica no tiene criterios definidos."
                  : "No hay una rúbrica asociada a esta evaluación."}
              </p>
            ) : (
              <ul className="divide-y rounded-md border text-sm">
                {rubricCriterios.map((criterio) => (
                  <li
                    key={criterio.key}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <span className="text-muted-foreground">{criterio.label}</span>
                    <span className="font-medium">
                      {rubricResultados[criterio.key] ?? rubricResultados[criterio.label] ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isMaster && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Información del sistema
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="ID_EVALUACION" value={row.ID_EVALUACION} mono />
                <DetailField label="ID_CLIENTE" value={row.ID_CLIENTE} mono />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SpecialtyEvalDraft = {
  idEspecialidad: string;
  nombreEspecialidad: string;
  idProfesor: string | null;
  idRubrica: string;
  notaFinal: string;
  observaciones: string;
};

type SpecialtyCardEdits = {
  idRubrica?: string;
  notaFinal?: string;
  observaciones?: string;
  criterioGrades?: Record<string, string>;
};

type EvaluacionFormDialogBaseProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  submitting: boolean;
  alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string }[];
  cursosEscolares: CursoEscolarData[];
  activeRubricas: RubricaData[];
  alumnosLoading: boolean;
  cursosLoading: boolean;
  rubricasLoading: boolean;
  onSubmit: (values: EvaluacionBatchUpsertInput[]) => void;
};

type EvaluacionFormDialogCreateProps = EvaluacionFormDialogBaseProps & {
  initial?: undefined;
};

type EvaluacionFormDialogEditProps = EvaluacionFormDialogBaseProps & {
  initial: EvaluacionData;
};

type EvaluacionFormDialogProps = EvaluacionFormDialogCreateProps | EvaluacionFormDialogEditProps;

function buildDefaultCursoId(cursos: CursoEscolarData[], initialCursoId?: string | null): string {
  if (initialCursoId && cursos.some((c) => c.ID_CURSO === initialCursoId)) {
    return initialCursoId;
  }
  return getActiveCursoEscolar(cursos)?.ID_CURSO ?? cursos[0]?.ID_CURSO ?? "";
}

function SpecialtyRubricCriteriaFields({
  criteria,
  values,
  disabled,
  onChange,
}: {
  criteria: RubricCriterion[];
  values: Record<string, string>;
  disabled?: boolean;
  onChange: (criterionKey: string, value: string) => void;
}) {
  if (criteria.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-background/80 p-3">
      <p className="text-xs font-medium text-muted-foreground">Criterios de la rúbrica</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {criteria.map((criterion) => (
          <div key={criterion.key} className="space-y-1.5">
            <Label htmlFor={`criterio-${criterion.key}`} className="text-sm font-normal">
              {criterion.label}
            </Label>
            <Input
              id={`criterio-${criterion.key}`}
              type="text"
              value={values[criterion.key] ?? ""}
              onChange={(e) => onChange(criterion.key, e.target.value)}
              placeholder="Nota, letra o texto"
              disabled={disabled}
              className="h-9"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EvaluacionFormDialog(props: EvaluacionFormDialogProps) {
  const {
    open,
    onClose,
    title,
    submitLabel,
    submitting,
    alumnos,
    cursosEscolares,
    activeRubricas,
    alumnosLoading,
    cursosLoading,
    rubricasLoading,
  } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;
  const dialogResetKey = initial?.ID_EVALUACION ?? "create";

  const [idAlumno, setIdAlumno] = useState("");
  const [idCurso, setIdCurso] = useState("");
  const [trimestre, setTrimestre] = useState<string>("1");
  const [cardEdits, setCardEdits] = useState<Record<string, SpecialtyCardEdits>>({});

  const {
    data: especialidadesData,
    isLoading: especialidadesLoading,
    isError: especialidadesError,
    error: especialidadesErrorObj,
  } = useAlumnoHorariosEvaluacion(idAlumno, idCurso);
  const especialidades = especialidadesData ?? EMPTY_ESPECIALIDADES;

  const alumnoOptions = useMemo<EntityOption[]>(
    () =>
      [...alumnos]
        .sort((a, b) =>
          a.NOMBRE_ALUMNO.localeCompare(b.NOMBRE_ALUMNO, "es", { sensitivity: "base" }),
        )
        .map((a) => ({ id: a.ID_ALUMNO, label: a.NOMBRE_ALUMNO })),
    [alumnos],
  );

  const rubricaById = useMemo(
    () => new Map(activeRubricas.map((rubrica) => [rubrica.ID_RUBRICA, rubrica])),
    [activeRubricas],
  );

  useEffect(() => {
    if (!open) return;

    setIdAlumno(initial?.ID_ALUMNO ?? "");
    setIdCurso(buildDefaultCursoId(cursosEscolares, initial?.ID_CURSO));
    setTrimestre(
      initial?.TRIMESTRE && isTrimestreValue(initial.TRIMESTRE) ? initial.TRIMESTRE : "1",
    );
    setCardEdits(
      initial
        ? {
            [initial.ID_ESPECIALIDAD]: {
              idRubrica: initial.ID_RUBRICA ?? RUBRICA_NONE_VALUE,
              criterioGrades: (() => {
                if (!initial.ID_RUBRICA) return {};
                const rubrica = rubricaById.get(initial.ID_RUBRICA);
                const criteria = parseRubricCriteria(rubrica?.ESTRUCTURA ?? null);
                return initCriterioGradeValues(criteria, initial.RESULTADOS_RUBRICA);
              })(),
              notaFinal:
                initial.NOTA_MEDIA != null && String(initial.NOTA_MEDIA).trim() !== ""
                  ? String(initial.NOTA_MEDIA)
                  : "",
              observaciones: initial.COMENTARIOS ?? "",
            },
          }
        : {},
    );
    // Reset form only when the dialog opens or a different evaluation is edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid reset on cursosEscolares reference changes
  }, [open, dialogResetKey]);

  useEffect(() => {
    if (!open || isEdit || idCurso) return;
    const defaultCursoId = buildDefaultCursoId(cursosEscolares, null);
    if (defaultCursoId) setIdCurso(defaultCursoId);
  }, [open, isEdit, idCurso, cursosEscolares]);

  const visibleCards = useMemo((): SpecialtyEvalDraft[] => {
    if (isEdit && initial) {
      const esp = especialidades.find((e) => e.ID_ESPECIALIDAD === initial.ID_ESPECIALIDAD);
      const edits = cardEdits[initial.ID_ESPECIALIDAD] ?? {};
      return [
        {
          idEspecialidad: initial.ID_ESPECIALIDAD,
          nombreEspecialidad: esp?.nombreEspecialidad ?? "Especialidad",
          idProfesor: esp?.ID_PROFESOR ?? initial.ID_PROFESOR,
          idRubrica: edits.idRubrica ?? initial.ID_RUBRICA ?? RUBRICA_NONE_VALUE,
          notaFinal:
            edits.notaFinal ??
            (initial.NOTA_MEDIA != null && String(initial.NOTA_MEDIA).trim() !== ""
              ? String(initial.NOTA_MEDIA)
              : ""),
          observaciones: edits.observaciones ?? initial.COMENTARIOS ?? "",
        },
      ];
    }

    return especialidades.map((esp) => {
      const edits = cardEdits[esp.ID_ESPECIALIDAD] ?? {};
      return {
        idEspecialidad: esp.ID_ESPECIALIDAD,
        nombreEspecialidad: esp.nombreEspecialidad,
        idProfesor: esp.ID_PROFESOR,
        idRubrica: edits.idRubrica ?? RUBRICA_NONE_VALUE,
        notaFinal: edits.notaFinal ?? "",
        observaciones: edits.observaciones ?? "",
      };
    });
  }, [isEdit, initial, especialidades, cardEdits]);

  const criterioAutoCalcKey = JSON.stringify(
    visibleCards.map((card) => ({
      idEspecialidad: card.idEspecialidad,
      idRubrica: card.idRubrica,
      criterioGrades: cardEdits[card.idEspecialidad]?.criterioGrades ?? {},
    })),
  );

  useEffect(() => {
    if (!open) return;

    const snapshot = JSON.parse(criterioAutoCalcKey) as Array<{
      idEspecialidad: string;
      idRubrica: string;
      criterioGrades: Record<string, string>;
    }>;

    setCardEdits((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const { idEspecialidad, idRubrica, criterioGrades } of snapshot) {
        if (idRubrica === RUBRICA_NONE_VALUE) continue;

        const rubrica = rubricaById.get(idRubrica);
        const criteria = parseRubricCriteria(rubrica?.ESTRUCTURA ?? null);
        if (criteria.length === 0) continue;

        const autoNota = computeAutoNotaMediaFromCriteria(criterioGrades);
        if (autoNota == null) continue;

        if ((prev[idEspecialidad]?.notaFinal ?? "") !== autoNota) {
          next[idEspecialidad] = {
            ...prev[idEspecialidad],
            notaFinal: autoNota,
          };
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [open, criterioAutoCalcKey, rubricaById]);

  const handleAlumnoChange = (nextAlumnoId: string) => {
    setIdAlumno(nextAlumnoId);
    if (!isEdit) setCardEdits({});
  };

  const handleCursoChange = (nextCursoId: string) => {
    setIdCurso(nextCursoId);
    if (!isEdit) setCardEdits({});
  };

  const updateCardDraft = (
    idEspecialidad: string,
    patch: Partial<Pick<SpecialtyEvalDraft, "idRubrica" | "notaFinal" | "observaciones">>,
  ) => {
    setCardEdits((prev) => ({
      ...prev,
      [idEspecialidad]: { ...prev[idEspecialidad], ...patch },
    }));
  };

  const handleRubricaChange = (idEspecialidad: string, idRubrica: string) => {
    setCardEdits((prev) => ({
      ...prev,
      [idEspecialidad]: {
        ...prev[idEspecialidad],
        idRubrica,
        criterioGrades: {},
      },
    }));
  };

  const updateCriterioGrade = (idEspecialidad: string, criterionKey: string, value: string) => {
    setCardEdits((prev) => ({
      ...prev,
      [idEspecialidad]: {
        ...prev[idEspecialidad],
        criterioGrades: {
          ...(prev[idEspecialidad]?.criterioGrades ?? {}),
          [criterionKey]: value,
        },
      },
    }));
  };

  const fieldsDisabled = submitting;
  const canFetchSpecialties = Boolean(idAlumno.trim() && idCurso.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isTrimestreValue(trimestre)) {
              toast.error("Selecciona un trimestre válido");
              return;
            }
            if (!idAlumno.trim()) {
              toast.error("Debes seleccionar un alumno");
              return;
            }
            if (!idCurso.trim()) {
              toast.error("Debes seleccionar el año académico");
              return;
            }

            const payloads: EvaluacionBatchUpsertInput[] = [];

            for (const card of visibleCards) {
              const notaRaw = card.notaFinal.trim();
              const hasObservaciones = card.observaciones.trim() !== "";
              const hasRubrica = card.idRubrica !== RUBRICA_NONE_VALUE;
              const criterioGrades = cardEdits[card.idEspecialidad]?.criterioGrades ?? {};

              if (!notaRaw && !hasObservaciones && !hasRubrica) continue;
              if (!notaRaw) {
                toast.error(
                  `Introduce la nota final para ${card.nombreEspecialidad || "la especialidad seleccionada"}`,
                );
                return;
              }

              const notaNum = Number(notaRaw);
              let notaMedia: number | string;
              if (Number.isFinite(notaNum)) {
                if (notaNum < 0 || notaNum > 10) {
                  toast.error(
                    `La nota final de ${card.nombreEspecialidad} debe estar entre 0 y 10`,
                  );
                  return;
                }
                notaMedia = Math.round(notaNum * 100) / 100;
              } else {
                notaMedia = notaRaw;
              }

              let resultadosRubrica: Record<string, string | number> | null = null;
              if (hasRubrica) {
                const rubrica = rubricaById.get(card.idRubrica);
                const criteria = parseRubricCriteria(rubrica?.ESTRUCTURA ?? null);
                if (criteria.length > 0) {
                  resultadosRubrica = buildResultadosRubricaByLabel(criteria, criterioGrades);
                }
              }

              payloads.push({
                ...(isEdit && initial ? { ID_EVALUACION: initial.ID_EVALUACION } : {}),
                ID_ALUMNO: idAlumno.trim(),
                ID_CURSO: idCurso.trim(),
                TRIMESTRE: trimestre,
                ID_ESPECIALIDAD: card.idEspecialidad,
                ID_PROFESOR: card.idProfesor,
                NOTA_MEDIA: notaMedia,
                ID_RUBRICA:
                  card.idRubrica === RUBRICA_NONE_VALUE ? null : card.idRubrica.trim() || null,
                COMENTARIOS: card.observaciones.trim() || null,
                RESULTADOS_RUBRICA: resultadosRubrica,
              });
            }

            if (payloads.length === 0) {
              toast.error("Introduce al menos una nota final para guardar");
              return;
            }

            props.onSubmit(payloads);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 space-y-5">
          <SearchableEntitySelect
            label="Alumno"
            placeholder="Buscar alumno..."
            options={alumnoOptions}
            value={idAlumno}
            onChange={handleAlumnoChange}
            disabled={fieldsDisabled || isEdit}
            loading={alumnosLoading}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Año académico</Label>
              <Select
                value={idCurso || undefined}
                onValueChange={handleCursoChange}
                disabled={fieldsDisabled || cursosLoading || isEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar año académico" />
                </SelectTrigger>
                <SelectContent className="max-h-[280px] overflow-y-auto">
                  {cursosEscolares.map((curso) => (
                    <SelectItem key={curso.ID_CURSO} value={curso.ID_CURSO}>
                      {curso.NOMBRE_CURSO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Trimestre</Label>
              <Select value={trimestre} onValueChange={setTrimestre} disabled={fieldsDisabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIMESTRE_VALUES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "FINAL" ? "Final" : `Trimestre ${t}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-5">
          {canFetchSpecialties && especialidadesLoading && (
            <div className="space-y-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}

          {canFetchSpecialties && especialidadesError && (
            <p className="text-sm text-destructive">
              Error al cargar especialidades: {(especialidadesErrorObj as Error)?.message}
            </p>
          )}

          {canFetchSpecialties && !especialidadesLoading && visibleCards.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No hay especialidades activas para este alumno en el año académico seleccionado.
            </p>
          )}

          <div className="space-y-3">
            {visibleCards.map((card) => {
              const selectedRubrica =
                card.idRubrica !== RUBRICA_NONE_VALUE ? rubricaById.get(card.idRubrica) : null;
              const criteria = parseRubricCriteria(selectedRubrica?.ESTRUCTURA ?? null);
              const criterioGrades = cardEdits[card.idEspecialidad]?.criterioGrades ?? {};

              return (
                <Card key={card.idEspecialidad} className="border bg-muted/10 p-4 shadow-sm">
                  <div className="mb-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Especialidad
                    </p>
                    <p className="text-base font-semibold">{card.nombreEspecialidad || "—"}</p>
                  </div>

                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Rúbrica de evaluación</Label>
                      <Select
                        value={card.idRubrica}
                        onValueChange={(value) => handleRubricaChange(card.idEspecialidad, value)}
                        disabled={fieldsDisabled || rubricasLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sin rúbrica" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={RUBRICA_NONE_VALUE}>
                            Sin rúbrica (nota manual)
                          </SelectItem>
                          {activeRubricas.map((rubrica) => (
                            <SelectItem key={rubrica.ID_RUBRICA} value={rubrica.ID_RUBRICA}>
                              {rubrica.NOMBRE}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedRubrica && criteria.length > 0 && (
                      <SpecialtyRubricCriteriaFields
                        criteria={criteria}
                        values={criterioGrades}
                        disabled={fieldsDisabled}
                        onChange={(criterionKey, value) =>
                          updateCriterioGrade(card.idEspecialidad, criterionKey, value)
                        }
                      />
                    )}

                    <div className="space-y-2">
                      <Label>Nota final</Label>
                      <Input
                        type="text"
                        value={card.notaFinal}
                        onChange={(e) =>
                          updateCardDraft(card.idEspecialidad, { notaFinal: e.target.value })
                        }
                        placeholder="Ej. 8.50, A, Aprobado"
                        disabled={fieldsDisabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Observaciones</Label>
                      <Textarea
                        value={card.observaciones}
                        onChange={(e) =>
                          updateCardDraft(card.idEspecialidad, { observaciones: e.target.value })
                        }
                        placeholder="Comentarios sobre el progreso del alumno..."
                        rows={3}
                        disabled={fieldsDisabled}
                      />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                !trimestre ||
                !idAlumno.trim() ||
                !idCurso.trim() ||
                visibleCards.length === 0
              }
            >
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RubricaDetailOverlay({
  open,
  mode,
  rubrica,
  canMutate,
  submitting,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  rubrica: RubricaData | null;
  canMutate: boolean;
  submitting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: RubricaUpsertInput) => void;
}) {
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

  if (!rubrica) {
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

  const criterios = criterionNamesFromEstructura(rubrica.ESTRUCTURA);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle de la rúbrica"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rubrica-overlay-title"
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
                <h2 id="rubrica-overlay-title" className="truncate text-xl font-semibold">
                  Editar rúbrica
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
            <RubricaFormDialog
              open
              embedded
              rubrica={rubrica}
              submitting={submitting}
              onClose={onCancelEdit}
              onSubmit={onSubmit}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="rubrica-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="rubrica-overlay-title" className="truncate text-xl font-semibold">
                  {rubrica.NOMBRE}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canMutate && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="gap-2 bg-black text-white hover:bg-black/90"
                    onClick={onEdit}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar Rúbrica
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
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Nombre" value={rubrica.NOMBRE} />
                <DetailField label="Estado" value={rubrica.ESTADO ?? "—"} />
              </div>
              <DetailField label="Descripción" value={rubrica.DESCRIPCION ?? "—"} />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Criterios de evaluación</p>
                {criterios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin criterios definidos.</p>
                ) : (
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {criterios.map((criterio) => (
                      <li key={criterio}>{criterio}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function RubricasTab() {
  const { rol: tenantRol } = useActiveTenant();
  const rol = tenantRol as Rol | null | undefined;
  const canMutate = canWriteUi(rol, "rubricas:write");
  const { list, upsert } = useRubricas();

  const [rubricaQuery, setRubricaQuery] = useState("");
  const [rubricaCreating, setRubricaCreating] = useState(false);
  const [rubricaOverlay, setRubricaOverlay] = useState<{
    id: string;
    mode: "detail" | "edit";
  } | null>(null);

  const overlayRubrica = useMemo(
    () => (list.data ?? []).find((r) => r.ID_RUBRICA === rubricaOverlay?.id) ?? null,
    [list.data, rubricaOverlay?.id],
  );

  const handleCloseRubricaOverlay = useCallback(() => setRubricaOverlay(null), []);
  const handleEditRubricaOverlay = useCallback(() => {
    setRubricaOverlay((current) => (current ? { id: current.id, mode: "edit" } : null));
  }, []);
  const handleCancelEditRubricaOverlay = useCallback(() => {
    setRubricaOverlay((current) => (current ? { id: current.id, mode: "detail" } : null));
  }, []);

  const rubricasFiltered = useMemo(() => {
    const rows = list.data ?? [];
    if (!rubricaQuery.trim()) return rows;
    const q = rubricaQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.NOMBRE?.toLowerCase().includes(q) ||
        r.DESCRIPCION?.toLowerCase().includes(q) ||
        r.ESTADO?.toLowerCase().includes(q),
    );
  }, [list.data, rubricaQuery]);

  const handleRubricaSubmit = async (values: RubricaUpsertInput) => {
    try {
      await upsert.mutateAsync(values);
      toast.success(values.ID_RUBRICA ? "Rúbrica actualizada" : "Rúbrica creada");
      setRubricaCreating(false);
      if (values.ID_RUBRICA) {
        setRubricaOverlay({ id: values.ID_RUBRICA, mode: "detail" });
      }
    } catch (err) {
      console.error("RUBRICA UPSERT ERROR:", err);
      toast.error(formatRubricaError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {canMutate && (
          <Button onClick={() => setRubricaCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo criterio
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, descripción o estado..."
            value={rubricaQuery}
            onChange={(e) => setRubricaQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar rúbricas: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Estado</TableHead>
                {canMutate && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canMutate ? 4 : 3}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : rubricasFiltered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canMutate ? 4 : 3}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {rubricaQuery ? "Sin resultados." : "Aún no hay rúbricas configuradas."}
                  </TableCell>
                </TableRow>
              ) : (
                rubricasFiltered.map((row) => (
                  <TableRow
                    key={row.ID_RUBRICA}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setRubricaOverlay({ id: row.ID_RUBRICA, mode: "detail" })}
                  >
                    <TableCell className="font-medium">{row.NOMBRE}</TableCell>
                    <TableCell className="max-w-md truncate">{row.DESCRIPCION || "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Badge
                        variant={row.ESTADO?.toLowerCase() === "activa" ? "default" : "secondary"}
                      >
                        {row.ESTADO || "—"}
                      </Badge>
                    </TableCell>
                    {canMutate && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                setRubricaOverlay({ id: row.ID_RUBRICA, mode: "edit" })
                              }
                            >
                              Editar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <RubricaDetailOverlay
        open={!!rubricaOverlay}
        mode={rubricaOverlay?.mode ?? "detail"}
        rubrica={overlayRubrica}
        canMutate={canMutate}
        submitting={upsert.isPending}
        onClose={handleCloseRubricaOverlay}
        onEdit={handleEditRubricaOverlay}
        onCancelEdit={handleCancelEditRubricaOverlay}
        onSubmit={handleRubricaSubmit}
      />

      {canMutate && rubricaCreating && (
        <RubricaFormDialog
          open
          rubrica={null}
          submitting={upsert.isPending}
          onClose={() => setRubricaCreating(false)}
          onSubmit={async (values) => {
            await handleRubricaSubmit(values);
          }}
        />
      )}
    </div>
  );
}

function RubricaFormDialog({
  open,
  rubrica,
  submitting,
  embedded,
  onClose,
  onSubmit,
}: {
  open: boolean;
  rubrica: RubricaData | null;
  submitting: boolean;
  embedded?: boolean;
  onClose: () => void;
  onSubmit: (values: RubricaUpsertInput) => void;
}) {
  const isEdit = Boolean(rubrica);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState<string>("Activa");
  const [criterios, setCriterios] = useState<string[]>([""]);

  useEffect(() => {
    if (!open) return;
    setNombre(rubrica?.NOMBRE ?? "");
    setDescripcion(rubrica?.DESCRIPCION ?? "");
    setEstado(rubrica?.ESTADO ?? "Activa");
    const names = rubrica ? criterionNamesFromEstructura(rubrica.ESTRUCTURA) : [];
    setCriterios(names.length > 0 ? names : [""]);
  }, [open, rubrica]);

  const updateCriterio = (index: number, value: string) => {
    setCriterios((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const addCriterio = () => {
    setCriterios((prev) => [...prev, ""]);
  };

  const removeCriterio = (index: number) => {
    setCriterios((prev) => {
      if (prev.length <= 1) return [""];
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!isRubricaEstadoValue(estado)) {
      toast.error("Selecciona un estado válido");
      return;
    }

    const trimmedCriterios = criterios.map((c) => c.trim()).filter(Boolean);
    if (trimmedCriterios.length === 0) {
      toast.error("Añade al menos un criterio de evaluación");
      return;
    }

    onSubmit({
      ...(rubrica ? { ID_RUBRICA: rubrica.ID_RUBRICA } : {}),
      NOMBRE: nombre.trim(),
      DESCRIPCION: descripcion.trim() || null,
      ESTADO: estado,
      criterios: trimmedCriterios,
    });
  };

  const formBody = (
    <form id="rubrica-form" onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rubrica-nombre">Nombre *</Label>
        <Input
          id="rubrica-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Evaluación piano — nivel inicial"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rubrica-descripcion">Descripción</Label>
        <Textarea
          id="rubrica-descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder="Descripción breve de la rúbrica..."
          rows={3}
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label>Estado *</Label>
        <Select value={estado} onValueChange={setEstado} disabled={submitting}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RUBRICA_ESTADO_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Criterios de evaluación *</Label>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCriterio}
            disabled={submitting}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Añadir
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Define los criterios que se evaluarán (p. ej. Ritmo, Técnica, Interpretación).
        </p>

        <div className="space-y-2">
          {criterios.map((criterio, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={criterio}
                onChange={(e) => updateCriterio(index, e.target.value)}
                placeholder={`Criterio ${index + 1}`}
                disabled={submitting}
                aria-label={`Criterio ${index + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeCriterio(index)}
                disabled={submitting || criterios.length <= 1}
                aria-label="Eliminar criterio"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {!embedded ? (
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !nombre.trim()}>
            {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear rúbrica"}
          </Button>
        </DialogFooter>
      ) : null}
    </form>
  );

  if (embedded) {
    if (!open) return null;
    return formBody;
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar rúbrica" : "Nueva rúbrica"}</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
