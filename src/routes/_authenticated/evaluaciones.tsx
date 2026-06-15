import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import {
  useEvaluaciones,
  formatSupabaseError,
  isTrimestreValue,
  TRIMESTRE_VALUES,
  currentAcademicYear,
  type EvaluacionCreateInput,
  type EvaluacionData,
  type EvaluacionUpdateInput,
} from "@/hooks/useEvaluaciones";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { TeacherEvaluationsDashboard } from "@/components/evaluaciones/TeacherEvaluationsDashboard";
import {
  useRubricas,
  formatSupabaseError as formatRubricaError,
  isRubricaEstadoValue,
  RUBRICA_ESTADO_VALUES,
  type RubricaCreateInput,
  type RubricaData,
} from "@/hooks/useRubricas";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useProfesores } from "@/hooks/useProfesores";
import { usePerfiles, type PerfilData } from "@/hooks/usePerfiles";
import { useActiveTenant } from "@/context/AppContext";
import { cn } from "@/lib/utils";
import { toProfesorEntityOptions } from "@/lib/profesorSelector";
import { canWriteUi, hasPermission } from "@/lib/rbac";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export const Route = createFileRoute("/_authenticated/evaluaciones")({
  component: EvaluacionesPage,
});

type EntityOption = { id: string; label: string };

const CURSO_SUGGESTIONS = [
  "1º EP",
  "2º EP",
  "3º EP",
  "4º EP",
  "5º EP",
  "6º EP",
  "1º EE",
  "2º EE",
  "3º EE",
  "4º EE",
  "1º ESO",
  "2º ESO",
  "3º ESO",
  "4º ESO",
  "1º Bachillerato",
  "2º Bachillerato",
] as const;

function academicYearOptions(): string[] {
  const current = currentAcademicYear();
  const startYear = parseInt(current.split("-")[0] ?? String(new Date().getFullYear()), 10);
  const options: string[] = [];
  for (let offset = -2; offset <= 2; offset++) {
    const y = startYear + offset;
    options.push(`${y}-${y + 1}`);
  }
  if (!options.includes(current)) {
    options.push(current);
  }
  return [...new Set(options)].sort((a, b) => b.localeCompare(a));
}

type ActorLookups = {
  byEmail: Map<string, string>;
  byPerfilId: Map<string, string>;
  byAuthId: Map<string, string>;
  byProfesorId: Map<string, string>;
};

function buildActorLookups(perfiles: PerfilData[]): ActorLookups {
  const byEmail = new Map<string, string>();
  const byPerfilId = new Map<string, string>();
  const byAuthId = new Map<string, string>();
  const byProfesorId = new Map<string, string>();

  for (const perfil of perfiles) {
    const nombre = perfil.NOMBRE?.trim();
    if (!nombre) continue;
    if (perfil.EMAIL) byEmail.set(perfil.EMAIL.trim().toLowerCase(), nombre);
    if (perfil.ID_PERFIL) byPerfilId.set(perfil.ID_PERFIL, nombre);
    if (perfil.ID) byAuthId.set(perfil.ID, nombre);
    if (perfil.ID_PROFESOR) byProfesorId.set(perfil.ID_PROFESOR, nombre);
  }

  return { byEmail, byPerfilId, byAuthId, byProfesorId };
}

function resolveActorNombre(
  value: string | null | undefined,
  actorLookups: ActorLookups,
  profesorById: Map<string, string>,
): string {
  const raw = value?.trim();
  if (!raw) return "";

  if (actorLookups.byProfesorId.has(raw)) return actorLookups.byProfesorId.get(raw)!;
  if (profesorById.has(raw)) return profesorById.get(raw)!;
  if (actorLookups.byPerfilId.has(raw)) return actorLookups.byPerfilId.get(raw)!;
  if (actorLookups.byAuthId.has(raw)) return actorLookups.byAuthId.get(raw)!;
  if (actorLookups.byEmail.has(raw.toLowerCase())) {
    return actorLookups.byEmail.get(raw.toLowerCase())!;
  }

  return "";
}

function formatNotaMedia(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-ES");
}

function canAccessEvaluacionesPage(rol: string | null | undefined): boolean {
  return hasPermission(rol, "evaluaciones:read");
}

function canViewRubricasTab(rol: string | null | undefined): boolean {
  return (
    isMasterRole(rol) ||
    isAdminRole(rol) ||
    isDireccionRole(rol)
  );
}

function canSelectProfesorField(rol: string | null | undefined): boolean {
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
            {loading
              ? "Cargando..."
              : selected
                ? selected.label
                : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command shouldFilter>
            <CommandInput placeholder="Buscar..." />
            <CommandList className="max-h-[300px] overflow-y-auto">
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup className="max-h-[300px] overflow-y-auto">
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
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === opt.id ? "opacity-100" : "opacity-0",
                      )}
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
  value: string;
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
  const { rol, perfil } = useActiveTenant();
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
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mis evaluaciones</h1>
          <p className="text-sm text-muted-foreground">
            Evalúa a tus alumnos de clases individuales y grupos
          </p>
        </div>
        <TeacherEvaluationsDashboard profesorId={perfil.ID_PROFESOR} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Evaluaciones</h1>
        <p className="text-sm text-muted-foreground">
          Seguimiento académico por trimestre — Fase 1: nota media y comentarios
        </p>
      </div>

      <Tabs defaultValue="evaluaciones">
        <TabsList>
          <TabsTrigger value="evaluaciones">Evaluaciones</TabsTrigger>
          {showRubricasTab && (
            <TabsTrigger value="rubricas">Rúbricas (Configuración)</TabsTrigger>
          )}
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
  const { rol } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canWriteUi(rol, "evaluaciones:write");
  const canSelectProfesor = canSelectProfesorField(rol);

  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update } = useEvaluaciones(filterCenterId);
  const { list: alumnosList } = useAlumnos();
  const { list: especialidadesList } = useEspecialidades();
  const { list: profesoresList } = useProfesores();
  const { list: perfilesList } = usePerfiles();

  const alumnos = alumnosList.data ?? [];
  const especialidades = especialidadesList.data ?? [];
  const profesores = profesoresList.data?.profesores ?? [];
  const perfiles = perfilesList.data ?? [];

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
  const actorLookups = useMemo(() => buildActorLookups(perfiles), [perfiles]);

  const [query, setQuery] = useState("");
  const [filtroAno, setFiltroAno] = useState("");
  const [filtroTrimestre, setFiltroTrimestre] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EvaluacionData | null>(null);
  const [detail, setDetail] = useState<EvaluacionData | null>(null);

  const filtered = useMemo(() => {
    let rows = list.data ?? [];

    if (filtroAno) {
      rows = rows.filter((r) => r.ANO === filtroAno);
    }
    if (filtroTrimestre) {
      rows = rows.filter((r) => r.TRIMESTRE === filtroTrimestre);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => {
        const alumno = alumnoById.get(r.ID_ALUMNO) ?? "";
        const especialidad = especialidadById.get(r.ID_ESPECIALIDAD) ?? "";
        const profesor = r.ID_PROFESOR ? profesorById.get(r.ID_PROFESOR) ?? "" : "";
        return (
          r.ANO?.toLowerCase().includes(q) ||
          r.TRIMESTRE?.toLowerCase().includes(q) ||
          r.CURSO?.toLowerCase().includes(q) ||
          alumno.toLowerCase().includes(q) ||
          especialidad.toLowerCase().includes(q) ||
          profesor.toLowerCase().includes(q) ||
          formatNotaMedia(r.NOTA_MEDIA).includes(q) ||
          r.COMENTARIOS?.toLowerCase().includes(q)
        );
      });
    }

    return rows;
  }, [list.data, query, filtroAno, filtroTrimestre, alumnoById, especialidadById, profesorById]);

  const anoOptions = useMemo(() => {
    const years = new Set((list.data ?? []).map((r) => r.ANO).filter(Boolean));
    for (const y of academicYearOptions()) years.add(y);
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [list.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {list.data?.length ?? 0} evaluaciones registradas
        </p>
        {canMutate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva evaluación
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar alumno, especialidad, curso..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="evaluaciones-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
          <Select value={filtroAno || "__all__"} onValueChange={(v) => setFiltroAno(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los años</SelectItem>
              {anoOptions.map((ano) => (
                <SelectItem key={ano} value={ano}>
                  {ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filtroTrimestre || "__all__"}
            onValueChange={(v) => setFiltroTrimestre(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Trimestre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {TRIMESTRE_VALUES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "FINAL" ? "Final" : `Trimestre ${t}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <TableHead>Año</TableHead>
                <TableHead>Trimestre</TableHead>
                <TableHead>Curso</TableHead>
                <TableHead>Alumno</TableHead>
                <TableHead>Especialidad</TableHead>
                <TableHead className="text-right">Nota media</TableHead>
                <TableHead>Profesor</TableHead>
                {canMutate && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canMutate ? 8 : 7}>
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
                    {query || filtroAno || filtroTrimestre
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
                    <TableCell className="font-medium">{row.ANO}</TableCell>
                    <TableCell>
                      {row.TRIMESTRE === "FINAL" ? "Final" : row.TRIMESTRE}
                    </TableCell>
                    <TableCell>{row.CURSO}</TableCell>
                    <TableCell>
                      {alumnoById.get(row.ID_ALUMNO) || "—"}
                    </TableCell>
                    <TableCell>
                      {especialidadById.get(row.ID_ESPECIALIDAD) || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatNotaMedia(row.NOTA_MEDIA)}
                    </TableCell>
                    <TableCell>
                      {row.ID_PROFESOR
                        ? profesorById.get(row.ID_PROFESOR) || "—"
                        : "—"}
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
          submitLabel="Registrar evaluación"
          submitting={create.isPending}
          canSelectProfesor={canSelectProfesor}
          alumnos={alumnos}
          especialidades={especialidades}
          profesores={profesores}
          alumnosLoading={alumnosList.isLoading}
          especialidadesLoading={especialidadesList.isLoading}
          profesoresLoading={profesoresList.isLoading}
          onSubmit={async (values) => {
            try {
              await create.mutateAsync(values);
              toast.success("Evaluación registrada correctamente");
              setCreating(false);
            } catch (err) {
              console.error("CREATE EVALUACION ERROR:", err);
              toast.error(formatSupabaseError(err));
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
          submitting={update.isPending}
          canSelectProfesor={canSelectProfesor}
          alumnos={alumnos}
          especialidades={especialidades}
          profesores={profesores}
          alumnosLoading={alumnosList.isLoading}
          especialidadesLoading={especialidadesList.isLoading}
          profesoresLoading={profesoresList.isLoading}
          onSubmit={async (patch) => {
            try {
              await update.mutateAsync({ id: editing.ID_EVALUACION, patch });
              toast.success("Evaluación actualizada");
              setEditing(null);
            } catch (err) {
              console.error("UPDATE EVALUACION ERROR:", err);
              toast.error(formatSupabaseError(err));
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
          actorLookups={actorLookups}
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
  actorLookups,
  canMutate,
  onClose,
  onEdit,
}: {
  row: EvaluacionData;
  isMaster: boolean;
  alumnoById: Map<string, string>;
  especialidadById: Map<string, string>;
  profesorById: Map<string, string>;
  actorLookups: ActorLookups;
  canMutate: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Detalle de evaluación
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Año" value={row.ANO} />
            <DetailField
              label="Trimestre"
              value={row.TRIMESTRE === "FINAL" ? "Final" : row.TRIMESTRE}
            />
            <DetailField label="Curso" value={row.CURSO} />
            <DetailField
              label="Nota media"
              value={formatNotaMedia(row.NOTA_MEDIA)}
            />
            <DetailField
              label="Alumno"
              value={alumnoById.get(row.ID_ALUMNO) ?? "—"}
            />
            <DetailField
              label="Especialidad"
              value={especialidadById.get(row.ID_ESPECIALIDAD) ?? "—"}
            />
            <DetailField
              label="Profesor"
              value={
                row.ID_PROFESOR
                  ? profesorById.get(row.ID_PROFESOR) ?? "—"
                  : "—"
              }
            />
          </div>

          <DetailField label="Comentarios" value={row.COMENTARIOS ?? "—"} />

          <div className="rounded-md border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Información del sistema
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="ID_EVALUACION" value={row.ID_EVALUACION} mono />
              {isMaster && (
                <DetailField label="ID_CLIENTE" value={row.ID_CLIENTE} mono />
              )}
              <DetailField
                label="Creado por"
                value={
                  resolveActorNombre(row.CREADO_POR, actorLookups, profesorById) ||
                  row.CREADO_POR ||
                  "—"
                }
              />
              <DetailField
                label="Modificado por"
                value={
                  resolveActorNombre(row.MODIFICADO_POR, actorLookups, profesorById) ||
                  row.MODIFICADO_POR ||
                  "—"
                }
              />
              <DetailField label="Creado" value={formatDateTime(row.CREATED_AT)} />
              <DetailField label="Actualizado" value={formatDateTime(row.UPDATED_AT)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          {canMutate && (
            <Button type="button" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EvaluacionFormDialogCreateProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: undefined;
  submitting: boolean;
  canSelectProfesor: boolean;
  alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string }[];
  especialidades: { ID_ESPECIALIDAD: string; ESPECIALIDAD: string }[];
  profesores: { ID_PROFESOR: string; NOMBRE_PROFESOR: string }[];
  alumnosLoading: boolean;
  especialidadesLoading: boolean;
  profesoresLoading: boolean;
  onSubmit: (values: EvaluacionCreateInput) => void;
};

type EvaluacionFormDialogEditProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial: EvaluacionData;
  submitting: boolean;
  canSelectProfesor: boolean;
  alumnos: { ID_ALUMNO: string; NOMBRE_ALUMNO: string }[];
  especialidades: { ID_ESPECIALIDAD: string; ESPECIALIDAD: string }[];
  profesores: { ID_PROFESOR: string; NOMBRE_PROFESOR: string }[];
  alumnosLoading: boolean;
  especialidadesLoading: boolean;
  profesoresLoading: boolean;
  onSubmit: (values: EvaluacionUpdateInput) => void;
};

type EvaluacionFormDialogProps =
  | EvaluacionFormDialogCreateProps
  | EvaluacionFormDialogEditProps;

function EvaluacionFormDialog(props: EvaluacionFormDialogProps) {
  const {
    open,
    onClose,
    title,
    submitLabel,
    submitting,
    canSelectProfesor,
    alumnos,
    especialidades,
    profesores,
    alumnosLoading,
    especialidadesLoading,
    profesoresLoading,
  } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;

  const [ano, setAno] = useState(currentAcademicYear());
  const [trimestre, setTrimestre] = useState<string>("1");
  const [curso, setCurso] = useState("");
  const [idAlumno, setIdAlumno] = useState("");
  const [idEspecialidad, setIdEspecialidad] = useState("");
  const [idProfesor, setIdProfesor] = useState("");
  const [notaMedia, setNotaMedia] = useState("");
  const [comentarios, setComentarios] = useState("");

  const alumnoOptions = useMemo<EntityOption[]>(
    () =>
      [...alumnos]
        .sort((a, b) =>
          a.NOMBRE_ALUMNO.localeCompare(b.NOMBRE_ALUMNO, "es", { sensitivity: "base" }),
        )
        .map((a) => ({ id: a.ID_ALUMNO, label: a.NOMBRE_ALUMNO })),
    [alumnos],
  );

  const especialidadOptions = useMemo<EntityOption[]>(
    () =>
      [...especialidades]
        .sort((a, b) =>
          a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", { sensitivity: "base" }),
        )
        .map((e) => ({ id: e.ID_ESPECIALIDAD, label: e.ESPECIALIDAD })),
    [especialidades],
  );

  const profesorOptions = useMemo<EntityOption[]>(
    () => toProfesorEntityOptions(profesores, idProfesor),
    [profesores, idProfesor],
  );

  useEffect(() => {
    if (!open) return;

    setAno(initial?.ANO ?? currentAcademicYear());
    setTrimestre(
      initial?.TRIMESTRE && isTrimestreValue(initial.TRIMESTRE)
        ? initial.TRIMESTRE
        : "1",
    );
    setCurso(initial?.CURSO ?? "");
    setIdAlumno(initial?.ID_ALUMNO ?? "");
    setIdEspecialidad(initial?.ID_ESPECIALIDAD ?? "");
    setIdProfesor(initial?.ID_PROFESOR ?? "");
    setNotaMedia(
      initial?.NOTA_MEDIA != null && !Number.isNaN(initial.NOTA_MEDIA)
        ? String(initial.NOTA_MEDIA)
        : "",
    );
    setComentarios(initial?.COMENTARIOS ?? "");
  }, [open, initial]);

  const fieldsDisabled = submitting;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
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
            if (!idEspecialidad.trim()) {
              toast.error("Debes seleccionar una especialidad");
              return;
            }
            if (!curso.trim()) {
              toast.error("Debes indicar el curso");
              return;
            }
            if (!ano.trim()) {
              toast.error("Debes indicar el año académico");
              return;
            }

            const nota = parseFloat(notaMedia);
            if (!Number.isFinite(nota)) {
              toast.error("La nota media debe ser un número válido");
              return;
            }
            if (nota < 0 || nota > 10) {
              toast.error("La nota media debe estar entre 0 y 10");
              return;
            }

            const payload: EvaluacionCreateInput = {
              ANO: ano.trim(),
              TRIMESTRE: trimestre,
              CURSO: curso.trim(),
              ID_ALUMNO: idAlumno.trim(),
              ID_ESPECIALIDAD: idEspecialidad.trim(),
              NOTA_MEDIA: nota,
              COMENTARIOS: comentarios.trim() || null,
            };

            if (canSelectProfesor) {
              payload.ID_PROFESOR = idProfesor.trim() || null;
            }

            if (isEdit) {
              (props as EvaluacionFormDialogEditProps).onSubmit(payload);
            } else {
              (props as EvaluacionFormDialogCreateProps).onSubmit(payload);
            }
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Año académico *</Label>
              <Select value={ano} onValueChange={setAno} disabled={fieldsDisabled}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar año" />
                </SelectTrigger>
                <SelectContent>
                  {academicYearOptions().map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Trimestre *</Label>
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

          <div className="space-y-2">
            <Label>Curso *</Label>
            <Select value={curso || undefined} onValueChange={setCurso} disabled={fieldsDisabled}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar o escribir curso" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px] overflow-y-auto">
                {CURSO_SUGGESTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={curso}
              onChange={(e) => setCurso(e.target.value)}
              placeholder="Ej. 1º EP, 2º EE..."
              disabled={fieldsDisabled}
            />
          </div>

          <SearchableEntitySelect
            label="Alumno *"
            placeholder="Seleccionar alumno"
            options={alumnoOptions}
            value={idAlumno}
            onChange={setIdAlumno}
            disabled={fieldsDisabled}
            loading={alumnosLoading}
          />

          <SearchableEntitySelect
            label="Especialidad *"
            placeholder="Seleccionar especialidad"
            options={especialidadOptions}
            value={idEspecialidad}
            onChange={setIdEspecialidad}
            disabled={fieldsDisabled}
            loading={especialidadesLoading}
          />

          {canSelectProfesor && (
            <SearchableEntitySelect
              label="Profesor"
              placeholder="Seleccionar profesor"
              options={profesorOptions}
              value={idProfesor}
              onChange={setIdProfesor}
              disabled={fieldsDisabled}
              loading={profesoresLoading}
            />
          )}

          <div className="space-y-2">
            <Label>Nota media *</Label>
            <Input
              type="number"
              min={0}
              max={10}
              step={0.01}
              value={notaMedia}
              onChange={(e) => setNotaMedia(e.target.value)}
              placeholder="0.00 – 10.00"
              required
              disabled={fieldsDisabled}
            />
          </div>

          <div className="space-y-2">
            <Label>Comentarios</Label>
            <Textarea
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              placeholder="Observaciones sobre el progreso del alumno..."
              rows={4}
              disabled={fieldsDisabled}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                !ano.trim() ||
                !trimestre ||
                !curso.trim() ||
                !idAlumno.trim() ||
                !idEspecialidad.trim() ||
                !notaMedia.trim()
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

function RubricasTab() {
  const { rol } = useActiveTenant();
  const canMutate = canWriteUi(rol, "rubricas:write");
  const { list, create } = useRubricas();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.NOMBRE?.toLowerCase().includes(q) ||
        r.DESCRIPCION?.toLowerCase().includes(q) ||
        r.ESTADO?.toLowerCase().includes(q),
    );
  }, [list.data, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {list.data?.length ?? 0} rúbricas configuradas
        </p>
        {canMutate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva rúbrica
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar rúbrica..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={3}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "Aún no hay rúbricas configuradas."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => (
                  <TableRow key={row.ID_RUBRICA}>
                    <TableCell className="font-medium">{row.NOMBRE}</TableCell>
                    <TableCell className="max-w-md truncate">
                      {row.DESCRIPCION || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.ESTADO?.toLowerCase() === "activa" ? "default" : "secondary"
                        }
                      >
                        {row.ESTADO || "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {canMutate && creating && (
        <RubricaFormDialog
          open
          onClose={() => setCreating(false)}
          submitting={create.isPending}
          onSubmit={async (values) => {
            try {
              await create.mutateAsync(values);
              toast.success("Rúbrica creada correctamente");
              setCreating(false);
            } catch (err) {
              console.error("CREATE RUBRICA ERROR:", err);
              toast.error(formatRubricaError(err));
            }
          }}
        />
      )}
    </div>
  );
}

function RubricaFormDialog({
  open,
  onClose,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (values: RubricaCreateInput) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [estado, setEstado] = useState<string>("Activa");

  useEffect(() => {
    if (!open) return;
    setNombre("");
    setDescripcion("");
    setEstado("Activa");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva rúbrica</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nombre.trim()) {
              toast.error("El nombre es obligatorio");
              return;
            }
            if (!isRubricaEstadoValue(estado)) {
              toast.error("Selecciona un estado válido");
              return;
            }
            onSubmit({
              NOMBRE: nombre.trim(),
              DESCRIPCION: descripcion.trim() || null,
              ESTADO: estado,
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Evaluación piano — nivel inicial"
              required
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea
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
                {RUBRICA_ESTADO_VALUES.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !nombre.trim()}>
              {submitting ? "Guardando..." : "Crear rúbrica"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
