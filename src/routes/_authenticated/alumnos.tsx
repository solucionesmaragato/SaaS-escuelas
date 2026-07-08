import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, MoreVertical, Plus, Search } from "lucide-react";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import type { CentroData } from "@/hooks/useCentros";
import { useAlumnosTree, type AlumnoCreateInput, type AlumnoTree } from "@/hooks/useAlumnosTree";
import { useProfesores, type ProfesorData, type ProfesoresQueryData } from "@/hooks/useProfesores";
import { toProfesorEntityOptions, type ProfesorSelectable } from "@/lib/profesorSelector";
import { useAulas } from "@/hooks/useAulas";
import { useTarifas, type TarifaData } from "@/hooks/useTarifas";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useGruposHorarios, type GrupoHorarioSlot } from "@/hooks/useGruposHorarios";
import { useActiveTenant } from "@/context/AppContext";
import { canViewAlumnosModule } from "@/lib/tenantQuery";
import type { OnNavigateToEntity } from "@/lib/entityNavigation";
import {
  formToAlumnoCreatePayload,
  formToAlumnoUpdatePayload,
  resolveAlumnoCreateCenterId,
  shouldShowAlumnoCentroSelector,
  type AlumnoFormValues,
} from "@/lib/alumnoSchema";
import { AlumnoDetailOverlay } from "@/components/alumnos/AlumnoDetailOverlay";
import { AlumnoFormDialog, type DraftMatriculaInput } from "@/components/alumnos/AlumnoFormDialog";
import { AlumnoQuickActions } from "@/components/alumnos/AlumnoQuickActions";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  AlumnoEstadoToggle,
  isAlumnoActivo,
  toggleEstadoAlumno,
} from "@/components/alumnos/AlumnoEstadoToggle";
import { calcAgeFromBirth } from "@/lib/alumnosMatriculasUtils";
import { toast } from "sonner";

type AlumnosSearch = {
  alumnoId?: string;
  studentId?: string;
};

export const Route = createFileRoute("/_authenticated/alumnos")({
  validateSearch: (search: Record<string, unknown>): AlumnosSearch => {
    const alumnoId =
      typeof search.alumnoId === "string" && search.alumnoId
        ? search.alumnoId
        : typeof search.studentId === "string" && search.studentId
          ? search.studentId
          : undefined;
    return alumnoId ? { alumnoId } : {};
  },
  component: AlumnosPage,
});

function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : [];
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatAge(nacimiento: string | null | undefined): string {
  const age = calcAgeFromBirth(nacimiento);
  return age != null ? `${age} años` : "—";
}

function resolveProfesoresList(listData: unknown): ProfesorSelectable[] {
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

const sortLocale = { sensitivity: "base" } as const;

function sortAlumnosByEstado(alumnos: AlumnoTree[]): AlumnoTree[] {
  return [...alumnos].sort((a, b) => {
    const aActive = isAlumnoActivo(a.ESTADO_ALUMNO);
    const bActive = isAlumnoActivo(b.ESTADO_ALUMNO);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (a.NOMBRE_ALUMNO ?? "").localeCompare(b.NOMBRE_ALUMNO ?? "", "es", sortLocale);
  });
}

function isCentroFilterChecked(
  centroId: string,
  selectedCentros: string[],
): boolean {
  if (selectedCentros.length === 0) return true;
  return selectedCentros.includes(centroId);
}

function toggleCentroFilterSelection(
  centroId: string,
  selectedCentros: string[],
  allCentroIds: string[],
): string[] {
  if (selectedCentros.length === 0) {
    return allCentroIds.filter((id) => id !== centroId);
  }
  if (selectedCentros.includes(centroId)) {
    const next = selectedCentros.filter((id) => id !== centroId);
    return next;
  }
  const next = [...selectedCentros, centroId];
  if (next.length >= allCentroIds.length) return [];
  return next;
}

function formatCentroFilterLabel(
  selectedCentros: string[],
  centros: CentroData[],
): string {
  if (selectedCentros.length === 0 || selectedCentros.length >= centros.length) {
    return "Todos los centros";
  }
  if (selectedCentros.length === 1) {
    return (
      centros.find((centro) => centro.ID_CENTRO === selectedCentros[0])?.NOMBRE_CENTRO ??
      "1 centro"
    );
  }
  if (selectedCentros.length === 2) {
    return selectedCentros
      .map((id) => centros.find((centro) => centro.ID_CENTRO === id)?.NOMBRE_CENTRO)
      .filter(Boolean)
      .join(", ");
  }
  return `${selectedCentros.length} centros`;
}

function CentroMultiFilter({
  id,
  centros,
  selectedCentros,
  onChange,
}: {
  id: string;
  centros: CentroData[];
  selectedCentros: string[];
  onChange: (next: string[]) => void;
}) {
  const allCentroIds = useMemo(
    () => centros.map((centro) => centro.ID_CENTRO),
    [centros],
  );
  const label = formatCentroFilterLabel(selectedCentros, centros);
  const showAllCentros = selectedCentros.length === 0;

  return (
    <div className="space-y-1.5 min-w-[200px] sm:max-w-xs">
      <Label htmlFor={id}>Centro</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className="h-10 w-full justify-between font-normal"
          >
            <span className="truncate">{label}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-muted/50 ${showAllCentros ? "bg-muted/20" : ""}`}
            onClick={() => onChange([])}
          >
            <Checkbox checked={showAllCentros} tabIndex={-1} aria-hidden />
            <span>Todos los centros</span>
          </button>
          <div className="my-1 border-t" />
          <div className="max-h-[240px] overflow-y-auto">
            {centros.map((centro) => {
              const checked = isCentroFilterChecked(centro.ID_CENTRO, selectedCentros);
              return (
                <label
                  key={centro.ID_CENTRO}
                  className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-muted/50 ${checked ? "bg-muted/20" : ""}`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      onChange(
                        toggleCentroFilterSelection(
                          centro.ID_CENTRO,
                          selectedCentros,
                          allCentroIds,
                        ),
                      )
                    }
                  />
                  <span className="truncate">{centro.NOMBRE_CENTRO}</span>
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AlumnosPage() {
  const { alumnoId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { rol, centerId } = useActiveTenant();
  const {
    centrosOrdenados,
    showCentroFilter,
  } = useAdminCentroFilter();
  const [selectedCentros, setSelectedCentros] = useState<string[]>([]);
  const selectedCentrosKey = [...selectedCentros].sort().join(",");
  const queryFilterCenterId = useMemo(() => {
    if (!showCentroFilter) return undefined;
    const ids = selectedCentrosKey ? selectedCentrosKey.split(",") : [];
    if (ids.length === 1) return ids[0];
    return null;
  }, [showCentroFilter, selectedCentrosKey]);
  const { list, create, update, createMatricula, createHorario, updateHorario, removeHorario } =
    useAlumnosTree(queryFilterCenterId);
  const profesores = useProfesores();
  const aulas = useAulas();
  const tarifas = useTarifas();
  const especialidades = useEspecialidades();
  const gruposHorarios = useGruposHorarios();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Todos" | "Activo" | "Inactivo">("Todos");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusConfirming, setStatusConfirming] = useState<AlumnoTree | null>(null);

  const showCentroSelector = shouldShowAlumnoCentroSelector(rol, centrosOrdenados.length);
  const assignedCenterId = centerId ?? null;
  const defaultCreateCenterId =
    selectedCentros[0] ?? centrosOrdenados[0]?.ID_CENTRO ?? null;

  const alumnos = asArray<AlumnoTree>(list.data);

  const alumnosByCentro = useMemo(() => {
    if (!showCentroFilter) return alumnos;
    const ids = selectedCentrosKey ? selectedCentrosKey.split(",") : [];
    if (ids.length === 0 || ids.length >= centrosOrdenados.length) {
      return alumnos;
    }
    const allowed = new Set(ids);
    return alumnos.filter(
      (alumno) => alumno.ID_CENTRO != null && allowed.has(alumno.ID_CENTRO),
    );
  }, [alumnos, showCentroFilter, selectedCentrosKey, centrosOrdenados.length]);

  const overlayAlumno = useMemo(
    () => alumnos.find((a) => a.ID_ALUMNO === overlay?.id) ?? null,
    [alumnos, overlay?.id],
  );

  const profesoresArray = resolveProfesoresList(profesores.list?.data);
  const aulasArray = asArray<{ ID_AULA: string; NOMBRE_AULA: string }>(aulas.list.data);
  const tarifasArray = asArray<TarifaData>(tarifas.list.data);
  const especialidadesArray = asArray<{ ID_ESPECIALIDAD: string; ESPECIALIDAD: string }>(
    especialidades.list.data,
  );

  const lookups = useMemo(
    () => ({
      profesorById: new Map(profesoresArray.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR])),
      aulaById: new Map(aulasArray.map((a) => [a.ID_AULA, a.NOMBRE_AULA])),
      tarifaById: new Map(tarifasArray.map((t) => [t.ID_TARIFA, t.SERVICIO])),
      especialidadById: new Map(
        especialidadesArray.map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD]),
      ),
    }),
    [profesoresArray, aulasArray, tarifasArray, especialidadesArray],
  );

  const selectOptions = useMemo(
    () => ({
      especialidades: especialidadesArray.map((e) => ({
        id: e.ID_ESPECIALIDAD,
        label: e.ESPECIALIDAD,
      })),
      tarifas: tarifasArray.map((t) => ({
        id: t.ID_TARIFA,
        label: t.SERVICIO,
      })),
      profesores: toProfesorEntityOptions(profesoresArray),
    }),
    [especialidadesArray, tarifasArray, profesoresArray],
  );

  const tarifaSesionesById = useMemo(
    () => new Map(tarifasArray.map((t) => [t.ID_TARIFA, t.SESIONES_SEMANALES])),
    [tarifasArray],
  );

  const grupoSlots = useMemo(
    () => asArray<GrupoHorarioSlot>(gruposHorarios.list.data),
    [gruposHorarios.list.data],
  );
  const isPageLoading = list.isLoading || gruposHorarios.list.isLoading;

  const filtered = useMemo(() => {
    let rows = alumnosByCentro;
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (a) =>
          a.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
          a.MAIL?.toLowerCase().includes(q) ||
          a.TLF_COMUNICACION?.toLowerCase().includes(q) ||
          a.DNI?.toLowerCase().includes(q) ||
          a.ESTADO_MATRICULA?.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "Todos") {
      rows = rows.filter((a) =>
        statusFilter === "Activo"
          ? isAlumnoActivo(a.ESTADO_ALUMNO)
          : !isAlumnoActivo(a.ESTADO_ALUMNO),
      );
    }
    return sortAlumnosByEstado(rows);
  }, [alumnosByCentro, query, statusFilter]);

  const horarioSaving =
    createHorario.isPending || updateHorario.isPending || removeHorario.isPending;

  const handleCloseOverlay = useCallback(() => {
    setOverlay(null);
    navigate({
      search: (prev) => ({ ...prev, alumnoId: undefined, studentId: undefined }),
      replace: true,
    });
  }, [navigate]);

  const handleOpenAlumnoOverlay = useCallback(
    (id: string, mode: "detail" | "edit" = "detail") => {
      setOverlay({ id, mode });
      navigate({
        search: (prev) => ({ ...prev, alumnoId: id, studentId: undefined }),
        replace: true,
      });
    },
    [navigate],
  );

  const handleEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "detail" } : null));
  }, []);

  const handleNavigateToEntity = useCallback<OnNavigateToEntity>(
    (target) => {
      setOverlay(null);
      void navigate({
        to: target.to,
        search: {
          ...target.search,
          alumnoId: undefined,
          studentId: undefined,
        },
      });
    },
    [navigate],
  );

  const handlePatchAlumno = async (
    alumnoId: string,
    patch: Parameters<typeof update.mutateAsync>[0]["patch"],
  ) => {
    try {
      await update.mutateAsync({ id: alumnoId, patch });
      toast.success("Alumno actualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el alumno.");
      throw err;
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!statusConfirming) return;
    const alumno = statusConfirming;
    const isDeactivating = isAlumnoActivo(alumno.ESTADO_ALUMNO);
    const nextEstado = toggleEstadoAlumno(alumno.ESTADO_ALUMNO);
    try {
      await update.mutateAsync({
        id: alumno.ID_ALUMNO,
        patch: { ESTADO_ALUMNO: nextEstado },
      });
      toast.success(
        isDeactivating
          ? `${alumno.NOMBRE_ALUMNO} dado de baja correctamente.`
          : `${alumno.NOMBRE_ALUMNO} reactivado.`,
      );
      setStatusConfirming(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cambiar el estado.");
    }
  };

  const handleAlumnoSubmit = async (
    values: AlumnoFormValues,
    mode: "create" | "edit",
    editAlumnoId?: string | null,
    draft?: { id: string; matriculas: DraftMatriculaInput[] },
  ) => {
    const payload =
      mode === "create"
        ? formToAlumnoCreatePayload(values)
        : formToAlumnoUpdatePayload(values);
    try {
      if (mode === "create") {
        const idCentro = resolveAlumnoCreateCenterId(values, {
          showCentroSelector,
          assignedCenterId,
        });
        if (!idCentro) {
          toast.error(
            showCentroSelector
              ? "Selecciona el centro al que pertenece el alumno."
              : "No se pudo determinar el centro asignado a tu perfil.",
          );
          return;
        }
        const created = await create.mutateAsync({
          ...payload,
          ID_CENTRO: idCentro,
          ...(draft?.id ? { ID_ALUMNO: draft.id } : {}),
        } as AlumnoCreateInput);
        if (draft?.matriculas.length) {
          await Promise.all(
            draft.matriculas.map((mat) =>
              createMatricula.mutateAsync({
                ...mat,
                ID_ALUMNO: created.ID_ALUMNO,
                ID_CENTRO: idCentro,
                ESTADO: "Activo",
                FECHA_ALTA: new Date().toISOString().slice(0, 10),
                FECHA_BAJA: null,
              }),
            ),
          );
        }
        toast.success("Alumno creado");
        setCreating(false);
        handleOpenAlumnoOverlay(created.ID_ALUMNO, "detail");
      } else {
        const alumnoId = editAlumnoId ?? overlay?.id;
        if (!alumnoId) return;
        await update.mutateAsync({ id: alumnoId, patch: payload });
        toast.success("Alumno actualizado");
        setOverlay({ id: alumnoId, mode: "detail" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  useEffect(() => {
    if (alumnoId) {
      setOverlay({ id: alumnoId, mode: "detail" });
    }
  }, [alumnoId]);

  if (!canViewAlumnosModule(rol)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. Exclusivo para Admin y Secretaría.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Alumnos"
        description={
          isPageLoading
            ? "Cargando…"
            : `${filtered.length} en total · activos primero, luego alfabético`
        }
        actions={
          <Button onClick={() => setCreating(true)} disabled={isPageLoading}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo alumno
          </Button>
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email, teléfono, DNI o estado..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroMultiFilter
              id="alumnos-centro-filter"
              centros={centrosOrdenados}
              selectedCentros={selectedCentros}
              onChange={setSelectedCentros}
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="alumnos-estado-filter" className="sr-only">
              Estado
            </Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as "Todos" | "Activo" | "Inactivo")}
            >
              <SelectTrigger id="alumnos-estado-filter" className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                <SelectItem value="Activo">Activos</SelectItem>
                <SelectItem value="Inactivo">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar alumnos: {(list.error as Error)?.message}
          </div>
        )}

        {gruposHorarios.list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar horarios de grupo: {(gruposHorarios.list.error as Error)?.message}
          </div>
        )}

        {isPageLoading && (
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Skeleton className="h-4 w-4 rounded-full" />
            Cargando alumnos y horarios de grupo…
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold">Nombre</TableHead>
                <TableHead className="font-semibold">Edad</TableHead>
                <TableHead className="font-semibold">DNI</TableHead>
                <TableHead className="font-semibold">Total Mensual</TableHead>
                <TableHead className="text-right font-semibold">Acciones</TableHead>
                <TableHead className="text-right font-semibold">Estado</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPageLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "Aún no hay alumnos."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow
                    key={a.ID_ALUMNO}
                    role="button"
                    tabIndex={0}
                    aria-label={`Ver detalle de ${a.NOMBRE_ALUMNO}`}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => handleOpenAlumnoOverlay(a.ID_ALUMNO, "detail")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleOpenAlumnoOverlay(a.ID_ALUMNO, "detail");
                      }
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <PersonAvatar
                          name={a.NOMBRE_ALUMNO}
                          photoUrl={a.FOTO}
                          className="h-10 w-10"
                        />
                        <span className="font-medium">{a.NOMBRE_ALUMNO}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatAge(a.NACIMIENTO)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.DNI ?? "—"}</TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatCurrency(a.TOTAL_MENSUAL)}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <AlumnoQuickActions alumno={a} />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <AlumnoEstadoToggle
                        alumno={a}
                        disabled={update.isPending}
                        onClick={() => setStatusConfirming(a)}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleOpenAlumnoOverlay(a.ID_ALUMNO, "edit")}
                          >
                            Editar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AlumnoDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        alumno={overlayAlumno}
        lookups={lookups}
        selectOptions={selectOptions}
        tarifaSesionesById={tarifaSesionesById}
        grupoSlots={grupoSlots}
        patching={update.isPending}
        editSubmitting={update.isPending}
        horarioSaving={horarioSaving}
        onPatch={async (patch) => {
          const alumnoId = overlay?.id;
          if (!alumnoId) return;
          await handlePatchAlumno(alumnoId, patch);
        }}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onEditSubmit={(values) => handleAlumnoSubmit(values, "edit", overlay?.id)}
        onCreateHorario={async (input) => {
          await createHorario.mutateAsync(input);
        }}
        onUpdateHorario={async (id, patch) => {
          await updateHorario.mutateAsync({ id, patch });
          toast.success("Horario actualizado");
        }}
        onRemoveHorario={async (id) => {
          await removeHorario.mutateAsync(id);
          toast.success("Horario eliminado");
        }}
        onNavigateToEntity={handleNavigateToEntity}
      />

      {creating ? (
        <AlumnoFormDialog
          key="create"
          open
          onClose={() => setCreating(false)}
        title="Nuevo alumno"
        submitLabel="Crear"
        submitting={create.isPending}
        lookups={lookups}
        selectOptions={selectOptions}
        tarifaSesionesById={tarifaSesionesById}
        grupoSlots={grupoSlots}
        horarioSaving={horarioSaving}
        centros={centrosOrdenados}
        showCentroSelector={showCentroSelector}
        assignedCenterId={assignedCenterId}
        defaultCreateCenterId={defaultCreateCenterId}
        onSubmit={(values, draft) => handleAlumnoSubmit(values, "create", undefined, draft)}
        onCreateHorario={async (input) => {
          await createHorario.mutateAsync(input);
        }}
        onUpdateHorario={async (id, patch) => {
          await updateHorario.mutateAsync({ id, patch });
          toast.success("Horario actualizado");
        }}
        onRemoveHorario={async (id) => {
          await removeHorario.mutateAsync(id);
          toast.success("Horario eliminado");
        }}
      />
      ) : null}

      <AlertDialog open={!!statusConfirming} onOpenChange={(o) => !o && setStatusConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusConfirming && isAlumnoActivo(statusConfirming.ESTADO_ALUMNO)
                ? "Dar de baja al alumno"
                : "Reactivar alumno"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusConfirming && isAlumnoActivo(statusConfirming.ESTADO_ALUMNO) ? (
                <>
                  ¿Seguro que quieres dar de baja a <b>{statusConfirming.NOMBRE_ALUMNO}</b>? El
                  alumno pasará a estado inactivo.
                </>
              ) : (
                <>
                  ¿Estás seguro de que quieres reactivar a <b>{statusConfirming?.NOMBRE_ALUMNO}</b>?
                  El alumno volverá a estar activo.
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
              {update.isPending ? "Guardando..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
