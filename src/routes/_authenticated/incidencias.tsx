import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search, Trash2, Pencil, Eye, Calendar, Clock } from "lucide-react";
import { useIncidencias } from "@/hooks/useIncidencias";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi } from "@/lib/rbac";
import {
  appendCenterFilter,
  appendIdInFilter,
  fetchAlumnoIdsForCenter,
} from "@/lib/centroFilter";
import { scopeTenantQuery } from "@/lib/tenantQuery";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/incidencias")({
  component: IncidenciasPage,
});

const PAGE_SIZE = 10;

function IncidenciasPage() {
  const { rol } = useActiveTenant();
  const canWrite = canWriteUi(rol, "incidencias:write");
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update, remove } = useIncidencias(filterCenterId);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const q = query.trim().toLowerCase();
    const filteredRows = !q
      ? rows
      : rows.filter((inc: any) =>
          inc.ALUMNOS?.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
          inc.PROFESOR?.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
          inc.TIPO_INCIDENCIA?.toLowerCase().includes(q) ||
          inc.TIPO_FALTA?.toLowerCase().includes(q) ||
          inc.ESTADO_CONSULTA?.toLowerCase().includes(q) ||
          inc.NOTAS?.toLowerCase().includes(q)
        );

    return filteredRows.sort((a: any, b: any) => {
      const order: Record<string, number> = { Consulta: 1, Falta: 2, Recuperación: 3 };
      const weightA = order[a.TIPO_INCIDENCIA] || 99;
      const weightB = order[b.TIPO_INCIDENCIA] || 99;
      if (weightA !== weightB) return weightA - weightB;
      const dateA = a.FECHA_EXACTA || "";
      const dateB = b.FECHA_EXACTA || "";
      return dateB.localeCompare(dateA);
    });
  }, [list.data, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incidencias Académicas</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} registros de asistencia e incidencias controlados
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva incidencia
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por alumno, profesor, tipo, estado o comentarios..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="incidencias-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={(v) => { setSelectedCenterId(v); setPage(1); }}
            />
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha / Horario</TableHead>
                <TableHead>Alumno</TableHead>
                <TableHead>Profesor</TableHead>
                <TableHead>Tipo Incidencia</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "No hay ninguna incidencia registrada."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((inc: any) => (
                  <TableRow key={inc.ID_INCIDENCIA}>
                    <TableCell className="text-sm">
                      <div className="font-medium flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground" /> {inc.FECHA_EXACTA ?? "—"}
                      </div>
                      {(inc.HORA_INICIO || inc.HORA_FIN) && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" /> {inc.HORA_INICIO ?? "—"} a {inc.HORA_FIN ?? "—"}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {inc.ALUMNOS?.NOMBRE_ALUMNO ?? <span className="text-muted-foreground text-xs">{inc.ID_ALUMNO || "—"}</span>}
                    </TableCell>
                    <TableCell>
                      {inc.PROFESOR?.NOMBRE_PROFESOR ?? <span className="text-muted-foreground text-xs">{inc.ID_PROFESOR || "—"}</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge
                        variant="outline"
                        className={
                          inc.TIPO_INCIDENCIA === "Consulta"
                            ? "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : inc.TIPO_INCIDENCIA === "Falta"
                              ? "border-transparent bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : inc.TIPO_INCIDENCIA === "Recuperación"
                                ? "border-transparent bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : undefined
                        }
                      >
                        {inc.TIPO_INCIDENCIA ?? "—"}
                      </Badge>
                      {inc.TIPO_FALTA && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Detalle: {inc.TIPO_FALTA}
                        </div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={inc.ESTADO_CONSULTA ?? "Pendiente"}
                        disabled={!canWrite}
                        onValueChange={(val) => {
                          update.mutate({
                            id: inc.ID_INCIDENCIA,
                            patch: { ESTADO_CONSULTA: val },
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[120px] border-0 bg-muted/50 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTADO_CONSULTA_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(inc)}>
                            <Eye className="mr-2 h-4 w-4" /> Ver detalle
                          </DropdownMenuItem>
                          {canWrite && (
                            <DropdownMenuItem onClick={() => setEditing(inc)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                          )}
                          {canWrite && (
                            <DropdownMenuItem onClick={() => setDeleting(inc)} className="text-destructive focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        {filtered.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm border-t pt-4">
            <div className="text-muted-foreground">
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* View Modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalle de la Incidencia</DialogTitle>
            <DialogDescription>Información del registro de asistencia</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Fecha exacta</dt><dd>{viewing.FECHA_EXACTA ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Estado de consulta</dt><dd>{viewing.ESTADO_CONSULTA ?? "Pendiente"}</dd></div>
              <div><dt className="text-muted-foreground">Horario del bloque</dt><dd>{viewing.HORA_INICIO ?? "—"} a {viewing.HORA_FIN ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Tipo de Incidencia</dt><dd>{viewing.TIPO_INCIDENCIA ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Tipo de Falta</dt><dd>{viewing.TIPO_FALTA ?? "—"}</dd></div>
              <div><dt className="text-muted-foreground">Especialidad (ID)</dt><dd>{viewing.ESPECIALIDADES?.ESPECIALIDAD ?? viewing.ID_ESPECIALIDAD ?? "—"}</dd></div>
              <div className="col-span-2 border-t pt-2 mt-1">
                <dt className="text-muted-foreground font-semibold mb-1">Personas implicadas</dt>
                <dd><b>Alumno:</b> {viewing.ALUMNOS?.NOMBRE_ALUMNO ?? viewing.ID_ALUMNO}</dd>
                <dd><b>Profesor:</b> {viewing.PROFESOR?.NOMBRE_PROFESOR ?? viewing.ID_PROFESOR}</dd>
              </div>
              <div className="col-span-2 border-t pt-2">
                <dt className="text-muted-foreground text-xs">IDs Técnicos Relacionales (Por mapear)</dt>
                <dd className="text-xs text-muted-foreground/80 font-mono">
                  Matrícula: {viewing.ID_MATRICULA || "—"} | Horario: {viewing.ID_HORARIO || "—"} | Sesión: {viewing.ID_SESION || "—"}
                </dd>
              </div>
              <div className="col-span-2 border-t pt-2">
                <dt className="text-muted-foreground font-semibold">Notas y Observaciones</dt>
                <dd className="mt-1 rounded-md bg-muted p-2 whitespace-pre-wrap text-xs">{viewing.NOTAS ?? "Sin anotaciones"}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <IncidenciaFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Registrar Nueva Incidencia"
        submitLabel="Registrar"
        submitting={create.isPending}
        filterCenterId={filterCenterId}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(values);
            toast.success("Incidencia registrada con éxito");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al registrar");
          }
        }}
      />

      {/* Edit Modal */}
      <IncidenciaFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Modificar Incidencia"
        submitLabel="Guardar Cambios"
        initial={editing}
        submitting={update.isPending}
        filterCenterId={filterCenterId}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.ID_INCIDENCIA, patch: values });
            toast.success("Incidencia actualizada correctamente");
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
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará de forma permanente la incidencia del alumno <b>{deleting?.ALUMNOS?.NOMBRE_ALUMNO || deleting?.ID_ALUMNO}</b>. Esta operación es irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_INCIDENCIA);
                  toast.success("Registro eliminado con éxito");
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
// FORMULARIO COMPLETO INTERACTIVO
// ---------------------------------------------------------------------------

const NONE_VALUE = "__none__";
const EMPTY_ALUMNOS = "__empty_alumnos__";
const EMPTY_PROFESORES = "__empty_profesores__";
const EMPTY_ESPECIALIDADES = "__empty_especialidades__";
const EMPTY_SESIONES = "__empty_sesiones__";
const LOADING_SESIONES = "__loading_sesiones__";
const EMPTY_REC_ESPECIALIDADES = "__empty_rec_especialidades__";
const EMPTY_REC_PROFESORES = "__empty_rec_profesores__";
const LOADING_REC_ESPECIALIDADES = "__loading_rec_especialidades__";
const EMPTY_REC_AULAS = "__empty_rec_aulas__";
const LOADING_REC_AULAS = "__loading_rec_aulas__";
const LOADING_REC_PROFESORES = "__loading_rec_profesores__";
const TIPO_INCIDENCIA_OPTIONS = ["Consulta", "Falta", "Recuperación"] as const;
const ESTADO_CONSULTA_OPTIONS = ["Pendiente", "Resuelto", "Justificada"] as const;

type TipoIncidencia = (typeof TIPO_INCIDENCIA_OPTIONS)[number];

type AlumnoLookup = { ID_ALUMNO: string; NOMBRE_ALUMNO: string };
type ProfesorLookup = { ID_PROFESOR: string; NOMBRE_PROFESOR: string };
type RecuperacionProfesorLookup = { ID_PROFESOR: string; NOMBRE: string };
type EspecialidadLookup = { ID_ESPECIALIDAD: string; ESPECIALIDAD: string };
type AulaLookup = { ID_AULA: string; NOMBRE_AULA: string };

type SesionRow = {
  ID_SESION: string;
  FECHA_EXACTA: string;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ID_PROFESOR: string | null;
  ESPECIALIDAD: string | null;
  ID_MATRICULA: string | null;
  ID_HORARIO: string | null;
  ID_AULA: string | null;
};

type IncidenciaFormValues = {
  ID_ALUMNO: string;
  ID_PROFESOR: string | null;
  ID_ESPECIALIDAD: string | null;
  TIPO_INCIDENCIA: string | null;
  FECHA_EXACTA: string | null;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ESTADO_CONSULTA: string | null;
  NOTAS: string | null;
  ID_MATRICULA: string | null;
  ID_HORARIO: string | null;
  ID_SESION: string | null;
  ID_AULA: string | null;
};

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

function resolveEspecialidadId(
  value: string | null | undefined,
  especialidades: EspecialidadLookup[] | null | undefined,
): string {
  if (!value) return "";
  const list = Array.isArray(especialidades) ? especialidades : [];
  if (list.some((e) => e?.ID_ESPECIALIDAD === value)) return value;
  const byName = list.find(
    (e) => e?.ESPECIALIDAD?.toLowerCase() === value.toLowerCase(),
  );
  return byName?.ID_ESPECIALIDAD ?? value;
}

function resolveEspecialidadLabel(
  value: string | null | undefined,
  especialidades: EspecialidadLookup[] | null | undefined,
): string {
  if (!value) return "—";
  const list = Array.isArray(especialidades) ? especialidades : [];
  const match = list.find((e) => e?.ID_ESPECIALIDAD === value);
  if (match?.ESPECIALIDAD) return match.ESPECIALIDAD;
  return value;
}

function normalizeTipoIncidencia(value: unknown): TipoIncidencia {
  if (value === "Consulta") return "Consulta";
  if (value === "Recuperación") return "Recuperación";
  return "Falta";
}

function dedupeSelectOptions<T>(
  items: T[] | null | undefined,
  idFn: (item: T) => string | null | undefined,
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items ?? []) {
    if (!item) continue;
    const id = idFn(item)?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(item);
  }
  return result;
}

function normalizeRpcEspecialidades(data: unknown): EspecialidadLookup[] {
  if (!Array.isArray(data)) return [];
  return dedupeSelectOptions(
    data.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ID_ESPECIALIDAD: String(record.ID_ESPECIALIDAD ?? record.id_especialidad ?? ""),
        ESPECIALIDAD: String(
          record.ESPECIALIDAD ?? record.especialidad ?? record.NOMBRE ?? "—",
        ),
      };
    }),
    (item) => item.ID_ESPECIALIDAD,
  );
}

function normalizeRpcProfesores(data: unknown): RecuperacionProfesorLookup[] {
  if (!Array.isArray(data)) return [];
  return dedupeSelectOptions(
    data.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ID_PROFESOR: String(record.ID_PROFESOR ?? record.id_profesor ?? ""),
        NOMBRE: String(record.NOMBRE ?? record.NOMBRE_PROFESOR ?? "—"),
      };
    }),
    (item) => item.ID_PROFESOR,
  );
}

function normalizeAulas(data: unknown): AulaLookup[] {
  if (!Array.isArray(data)) return [];
  return dedupeSelectOptions(
    data.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ID_AULA: String(record.ID_AULA ?? ""),
        NOMBRE_AULA: String(record.NOMBRE_AULA ?? record.NOMBRE ?? "—"),
      };
    }),
    (item) => item.ID_AULA,
  );
}

function safeSelectValue(value: string, options: { id: string }[]): string {
  if (!value) return NONE_VALUE;
  return options.some((opt) => opt.id === value) ? value : NONE_VALUE;
}

function IncidenciaFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  filterCenterId,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: Record<string, unknown> | null;
  submitting: boolean;
  filterCenterId?: string | null;
  onSubmit: (values: IncidenciaFormValues) => void;
}) {
  const { tenantId, rol } = useActiveTenant();

  const [idAlumno, setIdAlumno] = useState("");
  const [idProfesor, setIdProfesor] = useState("");
  const [idEspecialidad, setIdEspecialidad] = useState("");
  const [idAula, setIdAula] = useState("");
  const [tipoIncidencia, setTipoIncidencia] = useState<TipoIncidencia>("Falta");
  const [fechaExacta, setFechaExacta] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [estadoConsulta, setEstadoConsulta] = useState("Pendiente");
  const [notas, setNotas] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [idMatricula, setIdMatricula] = useState("");
  const [idHorario, setIdHorario] = useState("");
  const [idSesion, setIdSesion] = useState("");

  const formInitKeyRef = useRef<string | null>(null);
  const prevTipoRef = useRef<TipoIncidencia | null>(null);

  const editingKey = initial?.ID_INCIDENCIA
    ? String(initial.ID_INCIDENCIA)
    : "create";
  const selectedAlumnoId = idAlumno.trim();

  const isConsulta = tipoIncidencia === "Consulta";
  const isFalta = tipoIncidencia === "Falta";
  const isRecuperacion = tipoIncidencia === "Recuperación";
  const faltaFieldsLocked = isFalta && Boolean(selectedSessionId);
  const selectedEspecialidadId = idEspecialidad.trim();

  const sesionesQuery = useQuery({
    queryKey: ["incidencia-form-sesiones", selectedAlumnoId],
    enabled: open && isFalta && !!selectedAlumnoId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("SESIONES")
        .select(
          "ID_SESION, FECHA_EXACTA, HORA_INICIO, HORA_FIN, ID_PROFESOR, ESPECIALIDAD, ID_MATRICULA, ID_HORARIO, ID_AULA",
        )
        .eq("ID_ALUMNO", selectedAlumnoId)
        .order("FECHA_EXACTA", { ascending: true })
        .order("HORA_INICIO", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SesionRow[];
    },
  });

  const recuperacionEspQuery = useQuery({
    queryKey: ["rec-esp", selectedAlumnoId],
    enabled: open && isRecuperacion && !!selectedAlumnoId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_especialidades_alumno_recuperacion", {
        p_id_alumno: selectedAlumnoId,
      });
      if (error) throw error;
      return normalizeRpcEspecialidades(data);
    },
  });

  const recuperacionProfQuery = useQuery({
    queryKey: ["rec-prof", selectedAlumnoId, selectedEspecialidadId],
    enabled: open && isRecuperacion && !!selectedAlumnoId && !!selectedEspecialidadId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_profesores_filtrados_recuperacion", {
        p_id_alumno: selectedAlumnoId,
        p_id_especialidad: selectedEspecialidadId,
      });
      if (error) throw error;
      return normalizeRpcProfesores(data);
    },
  });

  const recuperacionAulasQuery = useQuery({
    queryKey: ["incidencia-form-recuperacion-aulas", tenantId ?? ""],
    enabled: open && isRecuperacion,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("AULA").select("*");
      if (error) throw error;
      return normalizeAulas(data);
    },
  });

  const recuperacionAulas = recuperacionAulasQuery.data ?? [];
  const recuperacionAulasLoading = recuperacionAulasQuery.isLoading;

  const lookupsQuery = useQuery({
    queryKey: ["incidencia-form-lookups", tenantId, filterCenterId ?? ""],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const alumnoIds = await fetchAlumnoIdsForCenter(tenantId, rol, filterCenterId);

      let alumnosQuery = supabase
        .from("ALUMNOS")
        .select("ID_ALUMNO, NOMBRE_ALUMNO")
        .order("NOMBRE_ALUMNO", { ascending: true });
      alumnosQuery = scopeTenantQuery(alumnosQuery, rol, tenantId);
      alumnosQuery = appendCenterFilter(alumnosQuery, filterCenterId);
      const scopedAlumnos = appendIdInFilter(alumnosQuery, "ID_ALUMNO", alumnoIds);
      if (scopedAlumnos === "empty") {
        return {
          alumnos: [] as AlumnoLookup[],
          profesores: [] as ProfesorLookup[],
          especialidades: [] as EspecialidadLookup[],
          aulas: [] as AulaLookup[],
        };
      }

      let profesoresQuery = supabase
        .from("PROFESOR")
        .select("ID_PROFESOR, NOMBRE_PROFESOR")
        .order("NOMBRE_PROFESOR", { ascending: true });
      profesoresQuery = scopeTenantQuery(profesoresQuery, rol, tenantId);

      let especialidadesQuery = supabase
        .from("ESPECIALIDADES")
        .select("ID_ESPECIALIDAD, ESPECIALIDAD")
        .order("ESPECIALIDAD", { ascending: true });
      especialidadesQuery = scopeTenantQuery(especialidadesQuery, rol, tenantId);

      let aulasQuery = supabase
        .from("AULA")
        .select("ID_AULA, NOMBRE_AULA")
        .order("NOMBRE_AULA", { ascending: true });
      if (tenantId) {
        aulasQuery = aulasQuery.eq("ID_CLIENTE", tenantId);
      }

      const [
        { data: alumnos, error: aluError },
        { data: profesores, error: profError },
        { data: especialidades, error: espError },
        { data: aulas, error: aulaError },
      ] = await Promise.all([scopedAlumnos, profesoresQuery, especialidadesQuery, aulasQuery]);

      if (aluError) throw aluError;
      if (profError) throw profError;
      if (espError) throw espError;
      if (aulaError) throw aulaError;

      return {
        alumnos: (alumnos ?? []) as AlumnoLookup[],
        profesores: (profesores ?? []) as ProfesorLookup[],
        especialidades: (especialidades ?? []) as EspecialidadLookup[],
        aulas: (aulas ?? []) as AulaLookup[],
      };
    },
  });

  const alumnos = Array.isArray(lookupsQuery.data?.alumnos) ? lookupsQuery.data.alumnos : [];
  const profesores = Array.isArray(lookupsQuery.data?.profesores) ? lookupsQuery.data.profesores : [];
  const especialidades = Array.isArray(lookupsQuery.data?.especialidades)
    ? lookupsQuery.data.especialidades
    : [];
  const aulas = Array.isArray(lookupsQuery.data?.aulas) ? lookupsQuery.data.aulas : [];
  const lookupsReady = open && !lookupsQuery.isLoading && !lookupsQuery.isError;

  const profesorById = useMemo(
    () =>
      new Map(
        profesores
          .filter((p): p is ProfesorLookup => Boolean(p?.ID_PROFESOR))
          .map((p) => [p.ID_PROFESOR, p.NOMBRE_PROFESOR ?? "—"]),
      ),
    [profesores],
  );
  const especialidadById = useMemo(
    () =>
      new Map(
        especialidades
          .filter((e): e is EspecialidadLookup => Boolean(e?.ID_ESPECIALIDAD))
          .map((e) => [e.ID_ESPECIALIDAD, e.ESPECIALIDAD ?? "—"]),
      ),
    [especialidades],
  );
  const alumnosOptions = useMemo(
    () => dedupeSelectOptions(alumnos, (a) => a.ID_ALUMNO),
    [alumnos],
  );
  const profesoresOptions = useMemo(
    () => dedupeSelectOptions(profesores, (p) => p.ID_PROFESOR),
    [profesores],
  );
  const especialidadesOptions = useMemo(
    () => dedupeSelectOptions(especialidades, (e) => e.ID_ESPECIALIDAD),
    [especialidades],
  );
  const sesionesOptions = useMemo(
    () => dedupeSelectOptions(sesionesQuery.data ?? [], (s) => s.ID_SESION),
    [sesionesQuery.data],
  );
  const recuperacionAulasOptions = useMemo(
    () => dedupeSelectOptions(recuperacionAulas, (a) => a.ID_AULA),
    [recuperacionAulas],
  );

  const aulaById = useMemo(
    () =>
      new Map(
        aulas
          .filter((a): a is AulaLookup => Boolean(a?.ID_AULA))
          .map((a) => [a.ID_AULA, a.NOMBRE_AULA ?? "—"]),
      ),
    [aulas],
  );

  const clearRecuperacionCascade = () => {
    setIdEspecialidad("");
    setIdProfesor("");
  };

  useEffect(() => {
    if (!open) {
      formInitKeyRef.current = null;
      prevTipoRef.current = null;
      return;
    }

    if (formInitKeyRef.current === editingKey) return;
    formInitKeyRef.current = editingKey;

    const initialTipo = normalizeTipoIncidencia(initial?.TIPO_INCIDENCIA);

    setIdAlumno(String(initial?.ID_ALUMNO ?? ""));
    setIdProfesor(String(initial?.ID_PROFESOR ?? ""));
    setIdEspecialidad(String(initial?.ID_ESPECIALIDAD ?? ""));
    setTipoIncidencia(initialTipo);
    setFechaExacta(toDateInputValue(String(initial?.FECHA_EXACTA ?? "")));
    setHoraInicio(toTimeInputValue(String(initial?.HORA_INICIO ?? "")));
    setHoraFin(toTimeInputValue(String(initial?.HORA_FIN ?? "")));
    setEstadoConsulta(String(initial?.ESTADO_CONSULTA ?? "Pendiente"));
    setNotas(String(initial?.NOTAS ?? ""));
    setSelectedSessionId(String(initial?.ID_SESION ?? ""));
    setIdMatricula(String(initial?.ID_MATRICULA ?? ""));
    setIdHorario(String(initial?.ID_HORARIO ?? ""));
    setIdSesion(String(initial?.ID_SESION ?? ""));
    setIdAula(String(initial?.ID_AULA ?? ""));
    prevTipoRef.current = initialTipo;
  }, [open, editingKey]);

  useEffect(() => {
    if (!open || editingKey !== "create") return;

    if (prevTipoRef.current === null) {
      prevTipoRef.current = tipoIncidencia;
      return;
    }
    if (prevTipoRef.current === tipoIncidencia) return;
    prevTipoRef.current = tipoIncidencia;

    setSelectedSessionId("");
    setIdMatricula("");
    setIdHorario("");
    setIdSesion("");
    setFechaExacta("");
    setHoraInicio("");
    setHoraFin("");
    setIdAula("");
    setIdProfesor("");
    setIdEspecialidad("");
    clearRecuperacionCascade();
    if (tipoIncidencia === "Consulta") {
      setEstadoConsulta("Pendiente");
    }
  }, [tipoIncidencia, open, editingKey]);

  const clearScheduleFields = () => {
    setFechaExacta("");
    setHoraInicio("");
    setHoraFin("");
    setIdProfesor("");
    setIdEspecialidad("");
    setIdAula("");
    setSelectedSessionId("");
    setIdMatricula("");
    setIdHorario("");
    setIdSesion("");
  };

  const handleAlumnoChange = (value: string) => {
    const nextAlumnoId = value.trim();
    if (nextAlumnoId === selectedAlumnoId) return;

    setIdAlumno(nextAlumnoId);
    setSelectedSessionId("");
    setIdMatricula("");
    setIdHorario("");
    setIdSesion("");
    setFechaExacta("");
    setHoraInicio("");
    setHoraFin("");
    setIdAula("");
    clearRecuperacionCascade();
  };

  const handleRecuperacionEspecialidadChange = (value: string) => {
    const nextEspecialidadId = value.trim();
    if (nextEspecialidadId === selectedEspecialidadId) return;

    setIdEspecialidad(nextEspecialidadId);
    setIdProfesor("");
  };

  const handleSessionChange = (sesionId: string) => {
    const sesion = (sesionesQuery.data ?? []).find((s) => s.ID_SESION === sesionId);
    if (!sesion) return;
    setSelectedSessionId(sesionId);
    setIdSesion(sesionId);
    setFechaExacta(toDateInputValue(sesion?.FECHA_EXACTA));
    setHoraInicio(toTimeInputValue(sesion?.HORA_INICIO));
    setHoraFin(toTimeInputValue(sesion?.HORA_FIN));
    setIdProfesor(sesion?.ID_PROFESOR ?? "");
    setIdEspecialidad(resolveEspecialidadId(sesion?.ESPECIALIDAD, especialidades));
    setIdMatricula(sesion?.ID_MATRICULA ?? "");
    setIdHorario(sesion?.ID_HORARIO ?? "");
    setIdAula(sesion?.ID_AULA ?? "");
  };

  const showScheduleFields =
    isRecuperacion || (!isConsulta && (!isFalta || Boolean(selectedSessionId)));
  const showPersonFields = isConsulta || (isFalta && Boolean(selectedSessionId));

  const alumnoSelectValue =
    alumnosOptions.length === 0
      ? EMPTY_ALUMNOS
      : safeSelectValue(idAlumno, alumnosOptions.map((a) => ({ id: a.ID_ALUMNO })));
  const sessionSelectValue = sesionesQuery.isLoading
    ? LOADING_SESIONES
    : sesionesOptions.length === 0
      ? EMPTY_SESIONES
      : safeSelectValue(
          selectedSessionId,
          sesionesOptions.map((s) => ({ id: s.ID_SESION })),
        );
  const profesorSelectValue =
    !isConsulta && profesoresOptions.length === 0
      ? EMPTY_PROFESORES
      : safeSelectValue(idProfesor, [
          ...(isConsulta ? [{ id: NONE_VALUE }] : []),
          ...profesoresOptions.map((p) => ({ id: p.ID_PROFESOR })),
        ]);
  const especialidadSelectValue =
    !isConsulta && especialidadesOptions.length === 0
      ? EMPTY_ESPECIALIDADES
      : safeSelectValue(idEspecialidad, [
          ...(isConsulta ? [{ id: NONE_VALUE }] : []),
          ...especialidadesOptions.map((e) => ({ id: e.ID_ESPECIALIDAD })),
        ]);
  const recuperacionEspecialidadSelectValue = recuperacionEspQuery.isLoading
    ? LOADING_REC_ESPECIALIDADES
    : (recuperacionEspQuery.data ?? []).length === 0
      ? EMPTY_REC_ESPECIALIDADES
      : safeSelectValue(
          idEspecialidad,
          (recuperacionEspQuery.data ?? []).map((e) => ({ id: e.ID_ESPECIALIDAD })),
        );
  const recuperacionProfesorSelectValue = recuperacionProfQuery.isLoading
    ? LOADING_REC_PROFESORES
    : (recuperacionProfQuery.data ?? []).length === 0
      ? EMPTY_REC_PROFESORES
      : safeSelectValue(
          idProfesor,
          (recuperacionProfQuery.data ?? []).map((p) => ({ id: p.ID_PROFESOR })),
        );
  const recuperacionAulaSelectValue = recuperacionAulasLoading
    ? LOADING_REC_AULAS
    : safeSelectValue(idAula || NONE_VALUE, [
        { id: NONE_VALUE },
        ...recuperacionAulasOptions.map((a) => ({ id: a.ID_AULA })),
      ]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario para registrar o editar una incidencia o recuperación.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!lookupsReady) return;
            if (!idAlumno.trim()) {
              toast.error("Selecciona un alumno.");
              return;
            }
            if (isFalta && !selectedSessionId) {
              toast.error("Selecciona la sesión a la que corresponde la falta.");
              return;
            }
            if (isRecuperacion && !idEspecialidad.trim()) {
              toast.error("Selecciona una especialidad.");
              return;
            }
            if (isRecuperacion && !idProfesor.trim()) {
              toast.error("Selecciona un profesor.");
              return;
            }

            const payload: IncidenciaFormValues = {
              ID_ALUMNO: idAlumno.trim(),
              TIPO_INCIDENCIA: tipoIncidencia,
              NOTAS: notas.trim() || null,
              ID_PROFESOR: idProfesor || null,
              ID_ESPECIALIDAD: idEspecialidad || null,
              FECHA_EXACTA: null,
              HORA_INICIO: null,
              HORA_FIN: null,
              ESTADO_CONSULTA: null,
              ID_MATRICULA: null,
              ID_HORARIO: null,
              ID_SESION: null,
              ID_AULA: null,
            };

            if (isConsulta) {
              payload.ESTADO_CONSULTA = estadoConsulta || null;
            } else if (isFalta) {
              payload.FECHA_EXACTA = fechaExacta || null;
              payload.HORA_INICIO = horaInicio || null;
              payload.HORA_FIN = horaFin || null;
              payload.ID_SESION = idSesion || null;
              payload.ID_MATRICULA = idMatricula || null;
              payload.ID_HORARIO = idHorario || null;
            } else if (isRecuperacion) {
              payload.FECHA_EXACTA = fechaExacta || null;
              payload.HORA_INICIO = horaInicio || null;
              payload.HORA_FIN = horaFin || null;
              payload.ID_AULA = idAula || null;
            }

            onSubmit(payload);
          }}
          className="space-y-4 pt-2"
        >
          {!lookupsReady ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {lookupsQuery.isError
                ? "No se pudieron cargar los datos del formulario."
                : "Cargando datos del formulario..."}
            </div>
          ) : (
            <>
          <div className="space-y-2">
            <Label>Tipo de Incidencia *</Label>
            <Select
              value={tipoIncidencia}
              onValueChange={(v) => setTipoIncidencia(v as TipoIncidencia)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                {TIPO_INCIDENCIA_OPTIONS?.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Alumno *</Label>
            <Select
              value={alumnoSelectValue}
              onValueChange={(v) => {
                if (v === EMPTY_ALUMNOS) return;
                handleAlumnoChange(v === NONE_VALUE ? "" : v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar alumno" />
              </SelectTrigger>
              <SelectContent>
                {alumnosOptions.length === 0 ? (
                  <SelectItem key={EMPTY_ALUMNOS} value={EMPTY_ALUMNOS} disabled>
                    No hay alumnos disponibles
                  </SelectItem>
                ) : (
                  alumnosOptions.map((a) => (
                    <SelectItem key={a.ID_ALUMNO} value={a.ID_ALUMNO}>
                      {a.NOMBRE_ALUMNO ?? "—"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {isFalta && selectedAlumnoId ? (
            <div className="space-y-2">
              <Label>Sesión programada *</Label>
              <Select
                value={sessionSelectValue}
                onValueChange={(v) => {
                  if (v === LOADING_SESIONES || v === EMPTY_SESIONES) return;
                  if (v === NONE_VALUE) {
                    clearScheduleFields();
                    return;
                  }
                  handleSessionChange(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      sesionesQuery.isLoading ? "Cargando sesiones..." : "Seleccionar sesión"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sesionesQuery.isLoading ? (
                    <SelectItem key={LOADING_SESIONES} value={LOADING_SESIONES} disabled>
                      Cargando sesiones...
                    </SelectItem>
                  ) : sesionesOptions.length === 0 ? (
                    <SelectItem key={EMPTY_SESIONES} value={EMPTY_SESIONES} disabled>
                      No hay sesiones para este alumno
                    </SelectItem>
                  ) : (
                    sesionesOptions.map((sesion) => (
                      <SelectItem key={sesion.ID_SESION} value={sesion.ID_SESION}>
                        {sesion.FECHA_EXACTA ?? "—"} -{" "}
                        {resolveEspecialidadLabel(sesion.ESPECIALIDAD, especialidades)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isRecuperacion && selectedAlumnoId ? (
            <>
              <div className="space-y-2">
                <Label>Especialidad *</Label>
                <Select
                  value={recuperacionEspecialidadSelectValue}
                  onValueChange={(v) => {
                    if (
                      v === LOADING_REC_ESPECIALIDADES ||
                      v === EMPTY_REC_ESPECIALIDADES
                    ) {
                      return;
                    }
                    handleRecuperacionEspecialidadChange(v);
                  }}
                  disabled={recuperacionEspQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        recuperacionEspQuery.isLoading
                          ? "Cargando especialidades..."
                          : "Seleccionar especialidad"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {recuperacionEspQuery.isLoading ? (
                      <SelectItem
                        key={LOADING_REC_ESPECIALIDADES}
                        value={LOADING_REC_ESPECIALIDADES}
                        disabled
                      >
                        Cargando especialidades...
                      </SelectItem>
                    ) : (recuperacionEspQuery.data ?? []).length === 0 ? (
                      <SelectItem
                        key={EMPTY_REC_ESPECIALIDADES}
                        value={EMPTY_REC_ESPECIALIDADES}
                        disabled
                      >
                        No hay especialidades disponibles
                      </SelectItem>
                    ) : (
                      (recuperacionEspQuery.data ?? []).map((e) => (
                        <SelectItem key={e.ID_ESPECIALIDAD} value={e.ID_ESPECIALIDAD}>
                          {e.ESPECIALIDAD ?? "—"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Profesor *</Label>
                <Select
                  value={recuperacionProfesorSelectValue}
                  onValueChange={(v) => {
                    if (v === LOADING_REC_PROFESORES || v === EMPTY_REC_PROFESORES) {
                      return;
                    }
                    setIdProfesor(v);
                  }}
                  disabled={!selectedEspecialidadId || recuperacionProfQuery.isLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !selectedEspecialidadId
                          ? "Selecciona una especialidad primero"
                          : recuperacionProfQuery.isLoading
                            ? "Cargando profesores..."
                            : "Seleccionar profesor"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {recuperacionProfQuery.isLoading ? (
                      <SelectItem
                        key={LOADING_REC_PROFESORES}
                        value={LOADING_REC_PROFESORES}
                        disabled
                      >
                        Cargando profesores...
                      </SelectItem>
                    ) : (recuperacionProfQuery.data ?? []).length === 0 ? (
                      <SelectItem
                        key={EMPTY_REC_PROFESORES}
                        value={EMPTY_REC_PROFESORES}
                        disabled
                      >
                        No hay profesores disponibles
                      </SelectItem>
                    ) : (
                      (recuperacionProfQuery.data ?? []).map((p) => (
                        <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                          {p.NOMBRE ?? "—"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Aula</Label>
                <Select
                  value={recuperacionAulaSelectValue}
                  onValueChange={(v) => {
                    if (v === LOADING_REC_AULAS || v === EMPTY_REC_AULAS) return;
                    setIdAula(v === NONE_VALUE ? "" : v);
                  }}
                  disabled={recuperacionAulasLoading}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        recuperacionAulasLoading
                          ? "Cargando aulas..."
                          : "Seleccionar aula"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem key={NONE_VALUE} value={NONE_VALUE}>
                      Sin aula
                    </SelectItem>
                    {recuperacionAulasLoading ? (
                      <SelectItem key={LOADING_REC_AULAS} value={LOADING_REC_AULAS} disabled>
                        Cargando aulas...
                      </SelectItem>
                    ) : recuperacionAulasOptions.length === 0 ? (
                      <SelectItem key={EMPTY_REC_AULAS} value={EMPTY_REC_AULAS} disabled>
                        No hay aulas disponibles
                      </SelectItem>
                    ) : (
                      recuperacionAulasOptions.map((a) => (
                        <SelectItem key={a.ID_AULA} value={a.ID_AULA}>
                          {a.NOMBRE_AULA ?? "—"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {showScheduleFields ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Fecha del suceso</Label>
                <Input
                  type="date"
                  value={fechaExacta}
                  onChange={(e) => setFechaExacta(e.target.value)}
                  disabled={faltaFieldsLocked}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora inicio</Label>
                <Input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  disabled={faltaFieldsLocked}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora fin</Label>
                <Input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  disabled={faltaFieldsLocked}
                />
              </div>
            </div>
          ) : null}

          {showPersonFields ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  Profesor
                  {isConsulta ? " (opcional)" : ""}
                </Label>
                <Select
                  value={profesorSelectValue}
                  onValueChange={(v) => {
                    if (v === EMPTY_PROFESORES) return;
                    setIdProfesor(v === NONE_VALUE ? "" : v);
                  }}
                  disabled={faltaFieldsLocked}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar profesor" />
                  </SelectTrigger>
                  <SelectContent>
                    {isConsulta && (
                      <SelectItem key={NONE_VALUE} value={NONE_VALUE}>
                        Sin profesor
                      </SelectItem>
                    )}
                    {!isConsulta && profesoresOptions.length === 0 ? (
                      <SelectItem key={EMPTY_PROFESORES} value={EMPTY_PROFESORES} disabled>
                        No hay profesores disponibles
                      </SelectItem>
                    ) : (
                      profesoresOptions.map((p) => (
                        <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                          {p.NOMBRE_PROFESOR ?? "—"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Especialidad
                  {isConsulta ? " (opcional)" : ""}
                </Label>
                <Select
                  value={especialidadSelectValue}
                  onValueChange={(v) => {
                    if (v === EMPTY_ESPECIALIDADES) return;
                    setIdEspecialidad(v === NONE_VALUE ? "" : v);
                  }}
                  disabled={faltaFieldsLocked}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar especialidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {isConsulta && (
                      <SelectItem key={NONE_VALUE} value={NONE_VALUE}>
                        Sin especialidad
                      </SelectItem>
                    )}
                    {!isConsulta && especialidadesOptions.length === 0 ? (
                      <SelectItem key={EMPTY_ESPECIALIDADES} value={EMPTY_ESPECIALIDADES} disabled>
                        No hay especialidades disponibles
                      </SelectItem>
                    ) : (
                      especialidadesOptions.map((e) => (
                        <SelectItem key={e.ID_ESPECIALIDAD} value={e.ID_ESPECIALIDAD}>
                          {e.ESPECIALIDAD ?? "—"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {isConsulta ? (
            <div className="space-y-2">
              <Label>Estado de la Consulta</Label>
              <Select value={estadoConsulta} onValueChange={setEstadoConsulta}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADO_CONSULTA_OPTIONS?.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Notas y detalles explicativos</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Añade aquí los comentarios del profesor o la justificación aportada por secretaría..."
              rows={3}
            />
          </div>

          {faltaFieldsLocked ? (
            <p className="text-xs text-muted-foreground">
              Los datos de la sesión seleccionada (
              {fechaExacta || "—"} · {horaInicio || "—"}–{horaFin || "—"} ·{" "}
              {profesorById.get(idProfesor) ?? "—"} ·{" "}
              {especialidadById.get(idEspecialidad) ??
                resolveEspecialidadLabel(idEspecialidad, especialidades)}
              {idAula ? ` · ${aulaById.get(idAula) ?? idAula}` : ""}
              ) provienen del calendario y no se pueden modificar.
            </p>
          ) : null}
            </>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !lookupsReady}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
