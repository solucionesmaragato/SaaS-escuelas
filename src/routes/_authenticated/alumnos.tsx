import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useAlumnosTree, type AlumnoTree } from "@/hooks/useAlumnosTree";
import { useProfesores, type ProfesorData, type ProfesoresQueryData } from "@/hooks/useProfesores";
import { toProfesorEntityOptions, type ProfesorSelectable } from "@/lib/profesorSelector";
import { useAulas } from "@/hooks/useAulas";
import { useTarifas, type TarifaData } from "@/hooks/useTarifas";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useGruposHorarios, type GrupoHorarioSlot } from "@/hooks/useGruposHorarios";
import { useActiveTenant } from "@/context/AppContext";
import { canViewAlumnosModule } from "@/lib/tenantQuery";
import { formToAlumnoPayload, resolveAlumnoCreateCenterId, shouldShowAlumnoCentroSelector, type AlumnoFormValues } from "@/lib/alumnoSchema";
import { AlumnoDetailOverlay } from "@/components/alumnos/AlumnoDetailOverlay";
import { AlumnoEstadoToggle } from "@/components/alumnos/AlumnoEstadoToggle";
import { AlumnoFormDialog } from "@/components/alumnos/AlumnoFormDialog";
import { AlumnoQuickActions } from "@/components/alumnos/AlumnoQuickActions";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Button } from "@/components/ui/button";
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
import { calcAgeFromBirth } from "@/lib/alumnosMatriculasUtils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/alumnos")({
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

function AlumnosPage() {
  const { rol, centerId } = useActiveTenant();
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const {
    list,
    create,
    update,
    createHorario,
    updateHorario,
    removeHorario,
  } = useAlumnosTree(filterCenterId);
  const profesores = useProfesores();
  const aulas = useAulas();
  const tarifas = useTarifas();
  const especialidades = useEspecialidades();
  const gruposHorarios = useGruposHorarios();

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);

  const showCentroSelector = shouldShowAlumnoCentroSelector(rol, centrosOrdenados.length);
  const assignedCenterId = centerId ?? null;
  const defaultCreateCenterId = selectedCenterId ?? centrosOrdenados[0]?.ID_CENTRO ?? null;

  const alumnos = asArray<AlumnoTree>(list.data);

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
      profesorById: new Map(
        profesoresArray.map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR]),
      ),
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
    const rows = alumnos;
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (a) =>
        a.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
        a.MAIL?.toLowerCase().includes(q) ||
        a.TLF_COMUNICACION?.toLowerCase().includes(q) ||
        a.DNI?.toLowerCase().includes(q) ||
        a.ESTADO_MATRICULA?.toLowerCase().includes(q),
    );
  }, [alumnos, query]);

  const horarioSaving =
    createHorario.isPending || updateHorario.isPending || removeHorario.isPending;

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

  const handleToggleEstado = async (alumnoId: string, nextEstado: "Activo" | "Inactivo") => {
    try {
      await update.mutateAsync({ id: alumnoId, patch: { ESTADO_ALUMNO: nextEstado } });
      toast.success(`Estado actualizado a ${nextEstado}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el estado.");
    }
  };

  const handleAlumnoSubmit = async (
    values: AlumnoFormValues,
    mode: "create" | "edit",
    editAlumnoId?: string | null,
  ) => {
    const payload = formToAlumnoPayload(values);
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
        const created = await create.mutateAsync({ ...payload, ID_CENTRO: idCentro });
        toast.success("Alumno creado");
        setCreating(false);
        setOverlay({ id: created.ID_ALUMNO, mode: "detail" });
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

  const handleCloseOverlay = useCallback(() => setOverlay(null), []);
  const handleEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "detail" } : null));
  }, []);

  if (!canViewAlumnosModule(rol)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. Exclusivo para Admin y Secretaría.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alumnos</h1>
          <p className="text-sm text-muted-foreground">
            {isPageLoading ? "Cargando…" : `${filtered.length} en total · ordenados alfabéticamente`}
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={isPageLoading}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo alumno
        </Button>
      </div>

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
            <CentroTableFilter
              id="alumnos-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar alumnos: {(list.error as Error)?.message}
          </div>
        )}

        {gruposHorarios.list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar horarios de grupo:{" "}
            {(gruposHorarios.list.error as Error)?.message}
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
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: a.ID_ALUMNO, mode: "detail" })}
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
                    <TableCell className="text-sm text-muted-foreground">
                      {a.DNI ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">
                      {formatCurrency(a.TOTAL_MENSUAL)}
                    </TableCell>
                    <TableCell className="text-right">
                      <AlumnoQuickActions alumno={a} />
                    </TableCell>
                    <TableCell className="text-right">
                      <AlumnoEstadoToggle
                        alumno={a}
                        disabled={update.isPending}
                        onToggle={(next) => void handleToggleEstado(a.ID_ALUMNO, next)}
                      />
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
      />

      <AlumnoFormDialog
        open={creating}
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
        onSubmit={(values) => handleAlumnoSubmit(values, "create")}
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

    </div>
  );
}
