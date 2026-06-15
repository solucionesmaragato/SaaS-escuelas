import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Pencil,
  Eye,
  Calendar,
} from "lucide-react";
import type { MatriculaRow } from "@/hooks/useMatriculas";
import type { HorarioMatricula } from "@/types/database";
import { cn } from "@/lib/utils";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useMatriculas } from "@/hooks/useMatriculas";
import { useAlumnos } from "@/hooks/useAlumnos";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useProfesores, type ProfesoresQueryData } from "@/hooks/useProfesores";
import { useTarifas, type TarifaData } from "@/hooks/useTarifas";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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

export const Route = createFileRoute("/_authenticated/matriculas")({
  component: MatriculasPage,
});

const NONE_VALUE = "__none__";
const MATRICULA_ESTADO_OPTIONS = ["Activo", "Inactivo"] as const;
type MatriculaEstado = (typeof MATRICULA_ESTADO_OPTIONS)[number];

function normalizeMatriculaEstado(estado: string | null | undefined): MatriculaEstado {
  return estado?.trim().toLowerCase() === "inactivo" ? "Inactivo" : "Activo";
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
    <Badge
      variant="secondary"
      className={cn(
        "font-medium",
        active
          ? "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-950 dark:text-green-300"
          : "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300",
      )}
    >
      <span
        className={cn(
          "mr-1.5 inline-block h-2 w-2 rounded-full md:hidden",
          active ? "bg-green-600" : "bg-red-500",
        )}
        aria-hidden
      />
      <span className="hidden md:inline">{label}</span>
    </Badge>
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

function MatriculasPage() {
  const { rol } = useActiveTenant();
  const canWrite = canWriteUi(rol, "matriculas:write");
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update, remove } = useMatriculas(filterCenterId);
  const { list: tarifasList } = useTarifas();

  const tarifaById = useMemo(
    () => new Map(asArray<TarifaData>(tarifasList.data).map((t) => [t.ID_TARIFA, t.SERVICIO])),
    [tarifasList.data],
  );

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const matriculas = list.data?.rows ?? [];
  const especialidadById = list.data?.especialidadById ?? new Map<string, string>();

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return matriculas;
    const q = query.toLowerCase();
    return matriculas.filter((m) =>
      m.ALUMNOS?.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
      m.ESPECIALIDADES?.ESPECIALIDAD?.toLowerCase().includes(q) ||
      m.PROFESOR?.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
      m.ESTADO?.toLowerCase().includes(q) ||
      m.ID_MATRICULA?.toLowerCase().includes(q)
    );
  }, [matriculas, query]);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Matrículas Académicas</h1>
          <p className="text-sm text-muted-foreground">
            {matriculas.length} matrículas registradas en el sistema
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva matrícula
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por alumno, especialidad, profesor o estado..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
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
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error al obtener matrículas: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Alumno</TableHead>
                <TableHead>Especialidad</TableHead>
                <TableHead>Profesor Asignado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha Alta</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados para tu búsqueda." : "No hay ninguna matrícula registrada."}
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
                        <TableCell className="font-medium">
                          {m.ALUMNOS?.NOMBRE_ALUMNO ?? (
                            <span className="text-muted-foreground text-xs font-mono">
                              {m.ID_ALUMNO || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {m.ESPECIALIDADES?.ESPECIALIDAD ?? (
                            <span className="text-muted-foreground text-xs font-mono">
                              {m.ESPECIALIDAD || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.PROFESOR?.NOMBRE_PROFESOR ?? (
                            <span className="text-muted-foreground">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <MatriculaEstadoBadge estado={m.ESTADO} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
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
                                      <TableRow key={horario.ID_HORARIO}>
                                        <TableCell>
                                          {resolveHorarioEspecialidad(horario, m, especialidadById)}
                                        </TableCell>
                                        <TableCell>
                                          {formatHorarioSchedule(
                                            horario.DIA,
                                            horario.HORA_INICIO,
                                            horario.HORA_FIN,
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          {horario.SALDO != null ? horario.SALDO : "—"}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
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

      {/* View Modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ficha de Matrícula</DialogTitle>
            <DialogDescription>Detalles técnicos del registro académico</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Alumno</dt>
                <dd className="font-semibold">
                  {viewing.ALUMNOS?.NOMBRE_ALUMNO ?? viewing.ID_ALUMNO ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Especialidad</dt>
                <dd>{viewing.ESPECIALIDADES?.ESPECIALIDAD ?? viewing.ESPECIALIDAD ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Profesor</dt>
                <dd>{viewing.PROFESOR?.NOMBRE_PROFESOR ?? "Sin asignar"}</dd>
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
              <div className="col-span-2 border-t pt-2">
                <dt className="text-muted-foreground">Tarifa</dt>
                <dd>
                  {viewing.ID_TARIFA
                    ? tarifaById.get(viewing.ID_TARIFA) ?? viewing.ID_TARIFA
                    : "—"}
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <MatriculaFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Nueva Matrícula Académica"
        submitLabel="Matricular"
        submitting={create.isPending}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(values);
            toast.success("Matrícula creada con éxito");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al guardar");
          }
        }}
      />

      {/* Edit Modal */}
      <MatriculaFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Modificar Matrícula"
        submitLabel="Guardar Cambios"
        initial={editing}
        submitting={update.isPending}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.ID_MATRICULA, patch: values });
            toast.success("Matrícula actualizada correctamente");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      {/* Delete Modal */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Matrícula?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará definitivamente el registro de matrícula del alumno. Esta operación es irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_MATRICULA);
                  toast.success("Matrícula eliminada permanentemente");
                  setDeleting(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al eliminar");
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
  open, onClose, title, submitLabel, initial, submitting, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: MatriculaRow | null;
  submitting: boolean;
  onSubmit: (values: {
    ID_ALUMNO: string;
    ID_TARIFA: string | null;
    ESPECIALIDAD: string | null;
    ESTADO: string | null;
    FECHA_ALTA: string | null;
    FECHA_BAJA: string | null;
    ID_PROFESOR: string | null;
  }) => void;
}) {
  const { list: alumnosList } = useAlumnos();
  const { list: especialidadesList } = useEspecialidades();
  const { list: profesoresList } = useProfesores();
  const { list: tarifasList } = useTarifas();

  const alumnos = asArray<Alumno>(alumnosList.data);
  const especialidades = asArray<EspecialidadData>(especialidadesList.data);
  const profesores = resolveProfesoresList(profesoresList.data);
  const tarifas = asArray<TarifaData>(tarifasList.data);

  const lookupsLoading =
    alumnosList.isLoading ||
    especialidadesList.isLoading ||
    profesoresList.isLoading ||
    tarifasList.isLoading;

  const [idAlumno, setIdAlumno] = useState(initial?.ID_ALUMNO ?? "");
  const [idTarifa, setIdTarifa] = useState(initial?.ID_TARIFA ?? "");
  const [especialidad, setEspecialidad] = useState(initial?.ESPECIALIDAD ?? "");
  const [estado, setEstado] = useState<MatriculaEstado>("Activo");
  const [fechaAlta, setFechaAlta] = useState(initial?.FECHA_ALTA ?? "");
  const [fechaBaja, setFechaBaja] = useState(initial?.FECHA_BAJA ?? "");
  const [idProfesor, setIdProfesor] = useState(initial?.ID_PROFESOR ?? "");

  useEffect(() => {
    if (open) {
      setIdAlumno(initial?.ID_ALUMNO ?? "");
      setIdTarifa(initial?.ID_TARIFA ?? "");
      setEspecialidad(initial?.ESPECIALIDAD ?? "");
      setEstado(normalizeMatriculaEstado(initial?.ESTADO));
      setFechaAlta(initial?.FECHA_ALTA ?? "");
      setFechaBaja(initial?.FECHA_BAJA ?? "");
      setIdProfesor(initial?.ID_PROFESOR ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!idAlumno.trim()) return;
            onSubmit({
              ID_ALUMNO: idAlumno.trim(),
              ID_TARIFA: idTarifa || null,
              ESPECIALIDAD: especialidad || null,
              ESTADO: estado || null,
              FECHA_ALTA: fechaAlta || null,
              FECHA_BAJA: fechaBaja || null,
              ID_PROFESOR: idProfesor || null,
            });
          }}
          className="space-y-4 pt-2"
        >
          {lookupsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Cargando opciones del formulario...
            </div>
          ) : (
            <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Alumno *</Label>
              <Select
                value={idAlumno || undefined}
                onValueChange={setIdAlumno}
              >
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
                      <SelectItem key={alumno.ID_ALUMNO} value={alumno.ID_ALUMNO}>
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
                    <SelectItem key={tarifa.ID_TARIFA} value={tarifa.ID_TARIFA}>
                      {tarifa.SERVICIO}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    <SelectItem key={esp.ID_ESPECIALIDAD} value={esp.ID_ESPECIALIDAD}>
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
              <Input type="date" value={fechaAlta} onChange={(e) => setFechaAlta(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fecha de Baja (Si aplica)</Label>
              <Input type="date" value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} />
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
                  <SelectItem key={profesor.ID_PROFESOR} value={profesor.ID_PROFESOR}>
                    {profesor.NOMBRE_PROFESOR}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting || lookupsLoading}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
