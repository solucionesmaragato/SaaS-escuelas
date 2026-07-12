import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Calendar, Clock, MoreVertical, Pencil, Plus, Search, X } from "lucide-react";
import { useIncidencias, type IncidenciaData } from "@/hooks/useIncidencias";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi } from "@/lib/rbac";
import { appendCenterFilter, appendIdInFilter, fetchAlumnoIdsForCenter } from "@/lib/centroFilter";
import { scopeTenantQuery } from "@/lib/tenantQuery";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EntityLink } from "@/components/navigation/EntityLink";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/incidencias")({
  component: IncidenciasPage,
});

const PAGE_SIZE = 10;
const ESTADO_CONSULTA_OPTIONS = ["Pendiente", "Resuelto", "Justificada"] as const;
type IncidenciaTab = "faltas" | "recuperaciones" | "consultas";

function formatFechaCreacion(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value;
}

function incidenciaTipoBadgeStatus(
  tipo: string | null | undefined,
): "destructive" | "success" | "info" | "neutral" {
  if (tipo === "Falta") return "destructive";
  if (tipo === "Recuperación") return "success";
  if (tipo === "Consulta") return "info";
  return "neutral";
}

type IncidenciaFormValues = {
  ID_ALUMNO: string;
  ID_PROFESOR: string | null;
  ID_ESPECIALIDAD: string | null;
  TIPO_INCIDENCIA: string | null;
  TIPO_FALTA: string | null;
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

function IncidenciaDetailOverlay({
  open,
  mode,
  incidencia,
  canWrite,
  submitting,
  filterCenterId,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  incidencia: IncidenciaData | null;
  canWrite: boolean;
  submitting: boolean;
  filterCenterId?: string | null;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: IncidenciaFormValues) => void;
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

  if (!incidencia) {
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

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle de la incidencia"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="incidencia-overlay-title"
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
                <h2 id="incidencia-overlay-title" className="truncate text-xl font-semibold">
                  Modificar incidencia
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
            <IncidenciaFormDialog
              open
              embedded
              title="Modificar Incidencia"
              submitLabel="Guardar Cambios"
              initial={incidencia}
              submitting={submitting}
              filterCenterId={filterCenterId}
              onClose={onCancelEdit}
              onSubmit={onSubmit}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="incidencia-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="incidencia-overlay-title" className="truncate text-xl font-semibold">
                  Detalle de la incidencia
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canWrite && (
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
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Fecha exacta</dt>
                <dd>{incidencia.FECHA_EXACTA ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado de consulta</dt>
                <dd>{incidencia.ESTADO_CONSULTA ?? "Pendiente"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Horario del bloque</dt>
                <dd>
                  {incidencia.HORA_INICIO ?? "—"} a {incidencia.HORA_FIN ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tipo de Incidencia</dt>
                <dd>{incidencia.TIPO_INCIDENCIA ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tipo de Falta</dt>
                <dd>{incidencia.TIPO_FALTA ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Especialidad</dt>
                <dd>
                  {incidencia.ESPECIALIDADES?.ESPECIALIDAD ?? "—"}
                </dd>
              </div>
              <div className="col-span-2 border-t pt-2 mt-1">
                <dt className="text-muted-foreground font-semibold mb-1">Personas implicadas</dt>
                <dd>
                  <b>Alumno:</b>{" "}
                  {incidencia.ALUMNOS?.NOMBRE_ALUMNO ? (
                    <EntityLink type="alumno" id={incidencia.ID_ALUMNO}>
                      {incidencia.ALUMNOS.NOMBRE_ALUMNO}
                    </EntityLink>
                  ) : (
                    "—"
                  )}
                </dd>
                <dd>
                  <b>Profesor:</b>{" "}
                  {incidencia.PROFESOR?.NOMBRE_PROFESOR ? (
                    <EntityLink type="profesor" id={incidencia.ID_PROFESOR}>
                      {incidencia.PROFESOR.NOMBRE_PROFESOR}
                    </EntityLink>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="col-span-2 border-t pt-2">
                <dt className="text-muted-foreground font-semibold">Notas y Observaciones</dt>
                <dd className="mt-1 rounded-md bg-muted p-2 whitespace-pre-wrap text-xs">
                  {incidencia.NOTAS ?? "Sin anotaciones"}
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

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
  const [activeTab, setActiveTab] = useState<IncidenciaTab>("faltas");
  const [page, setPage] = useState(1);
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<IncidenciaData | null>(null);
  const [updatingEstadoId, setUpdatingEstadoId] = useState<string | null>(null);

  const overlayIncidencia = useMemo(
    () => (list.data ?? []).find((inc) => inc.ID_INCIDENCIA === overlay?.id) ?? null,
    [list.data, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => setOverlay(null), []);
  const handleEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "detail" } : null));
  }, []);

  const handleEstadoConsultaChange = async (incidenciaId: string, nextEstado: string) => {
    setUpdatingEstadoId(incidenciaId);
    try {
      await update.mutateAsync({
        id: incidenciaId,
        patch: { ESTADO_CONSULTA: nextEstado },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el estado.");
    } finally {
      setUpdatingEstadoId(null);
    }
  };

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const q = query.trim().toLowerCase();
    const filteredRows = !q
      ? rows
      : rows.filter(
          (inc) =>
            inc.ALUMNOS?.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
            inc.PROFESOR?.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
            inc.TIPO_INCIDENCIA?.toLowerCase().includes(q) ||
            inc.TIPO_FALTA?.toLowerCase().includes(q) ||
            inc.ESTADO_CONSULTA?.toLowerCase().includes(q) ||
            inc.NOTAS?.toLowerCase().includes(q),
        );

    return filteredRows;
  }, [list.data, query]);

  const { faltasRows, recuperacionesRows, consultasRows } = useMemo(() => {
    const sortByFechaExacta = (a: IncidenciaData, b: IncidenciaData) =>
      (b.FECHA_EXACTA || "").localeCompare(a.FECHA_EXACTA || "");
    const sortByFechaCreacion = (a: IncidenciaData, b: IncidenciaData) =>
      (b.FECHA_CREACION || "").localeCompare(a.FECHA_CREACION || "");

    return {
      faltasRows: filtered
        .filter((inc) => inc.TIPO_INCIDENCIA === "Falta")
        .sort(sortByFechaExacta),
      recuperacionesRows: filtered
        .filter((inc) => inc.TIPO_INCIDENCIA === "Recuperación")
        .sort(sortByFechaExacta),
      consultasRows: filtered
        .filter((inc) => inc.TIPO_INCIDENCIA === "Consulta")
        .sort(sortByFechaCreacion),
    };
  }, [filtered]);

  const activeTabRows =
    activeTab === "faltas"
      ? faltasRows
      : activeTab === "recuperaciones"
        ? recuperacionesRows
        : consultasRows;
  const totalPages = Math.max(1, Math.ceil(activeTabRows.length / PAGE_SIZE));
  const paginate = (rows: IncidenciaData[]) =>
    rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const faltasPageRows = paginate(faltasRows);
  const recuperacionesPageRows = paginate(recuperacionesRows);
  const consultasPageRows = paginate(consultasRows);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Incidencias Académicas"
        description={`${list.data?.length ?? 0} registros de asistencia e incidencias controlados`}
        actions={
          canWrite && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva incidencia
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por alumno, profesor, tipo, estado o comentarios..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="incidencias-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={(v) => {
                setSelectedCenterId(v);
                setPage(1);
              }}
            />
          )}
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as IncidenciaTab);
            setPage(1);
          }}
        >
          <TabsList className="mb-4 grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="faltas">Faltas</TabsTrigger>
            <TabsTrigger value="recuperaciones">Recuperaciones</TabsTrigger>
            <TabsTrigger value="consultas">Consultas</TabsTrigger>
          </TabsList>

          <TabsContent value="faltas" className="mt-0">
            <IncidenciaScheduleTable
              rows={faltasPageRows}
              isLoading={list.isLoading}
              emptyMessage={query ? "Sin resultados." : "No hay faltas registradas."}
              canWrite={canWrite}
              onOpenDetail={(id) => setOverlay({ id, mode: "detail" })}
              onOpenEdit={(id) => setOverlay({ id, mode: "edit" })}
            />
          </TabsContent>

          <TabsContent value="recuperaciones" className="mt-0">
            <IncidenciaScheduleTable
              rows={recuperacionesPageRows}
              isLoading={list.isLoading}
              emptyMessage={
                query ? "Sin resultados." : "No hay recuperaciones registradas."
              }
              canWrite={canWrite}
              onOpenDetail={(id) => setOverlay({ id, mode: "detail" })}
              onOpenEdit={(id) => setOverlay({ id, mode: "edit" })}
            />
          </TabsContent>

          <TabsContent value="consultas" className="mt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha Registro</TableHead>
                    <TableHead>Alumno</TableHead>
                    <TableHead>Profesor</TableHead>
                    <TableHead>Especialidad</TableHead>
                    <TableHead>Notas / Detalle</TableHead>
                    <TableHead>Estado Consulta</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={7}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : consultasPageRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        {query ? "Sin resultados." : "No hay consultas registradas."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    consultasPageRows.map((inc) => (
                      <TableRow
                        key={inc.ID_INCIDENCIA}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
                        onClick={() => setOverlay({ id: inc.ID_INCIDENCIA, mode: "detail" })}
                      >
                        <TableCell className="text-sm">
                          {formatFechaCreacion(inc.FECHA_CREACION)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {inc.ALUMNOS?.NOMBRE_ALUMNO ? (
                            <EntityLink type="alumno" id={inc.ID_ALUMNO}>
                              {inc.ALUMNOS.NOMBRE_ALUMNO}
                            </EntityLink>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {inc.ID_ALUMNO || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {inc.PROFESOR?.NOMBRE_PROFESOR ? (
                            <EntityLink type="profesor" id={inc.ID_PROFESOR}>
                              {inc.PROFESOR.NOMBRE_PROFESOR}
                            </EntityLink>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              {inc.ID_PROFESOR || "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inc.ESPECIALIDADES?.ESPECIALIDAD ?? (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs text-sm text-muted-foreground">
                          <span className="line-clamp-2">{inc.NOTAS?.trim() || "—"}</span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={inc.ESTADO_CONSULTA ?? "Pendiente"}
                            disabled={!canWrite || updatingEstadoId === inc.ID_INCIDENCIA}
                            onValueChange={(val) => {
                              if (val === (inc.ESTADO_CONSULTA ?? "Pendiente")) return;
                              void handleEstadoConsultaChange(inc.ID_INCIDENCIA, val);
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {canWrite ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    setOverlay({ id: inc.ID_INCIDENCIA, mode: "edit" })
                                  }
                                >
                                  Editar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        {/* Paginación */}
        {activeTabRows.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm border-t pt-4">
            <div className="text-muted-foreground">
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      <IncidenciaDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        incidencia={overlayIncidencia}
        canWrite={canWrite}
        submitting={update.isPending}
        filterCenterId={filterCenterId}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onSubmit={async (values) => {
          if (!overlay?.id) return;
          try {
            await update.mutateAsync({ id: overlay.id, patch: values });
            toast.success("Incidencia actualizada correctamente");
            setOverlay({ id: overlay.id, mode: "detail" });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

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

      {/* Delete Modal */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará de forma permanente la incidencia del alumno{" "}
              <b>{deleting?.ALUMNOS?.NOMBRE_ALUMNO || deleting?.ID_ALUMNO}</b>. Esta operación es
              irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
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
const LOADING_ALUMNO_HORARIOS = "__loading_alumno_horarios__";
const EMPTY_ALUMNO_HORARIOS = "__empty_alumno_horarios__";
const SELECT_ALUMNO_FIRST = "__select_alumno_first__";
const LOADING_REC_ALUMNOS = "__loading_rec_alumnos__";
const EMPTY_REC_ALUMNOS = "__empty_rec_alumnos__";
const TIPO_INCIDENCIA_OPTIONS = ["Consulta", "Falta", "Recuperación"] as const;
const TIPO_FALTA_OPTIONS = ["Recuperable", "No recuperable"] as const;

type TipoIncidencia = (typeof TIPO_INCIDENCIA_OPTIONS)[number];

type AlumnoLookup = { ID_ALUMNO: string; NOMBRE_ALUMNO: string };
type ProfesorLookup = { ID_PROFESOR: string; NOMBRE_PROFESOR: string };
type RecuperacionProfesorLookup = { ID_PROFESOR: string; NOMBRE: string };
type EspecialidadLookup = { ID_ESPECIALIDAD: string; ESPECIALIDAD: string };
type AulaLookup = { ID_AULA: string; NOMBRE_AULA: string };
type AlumnoHorarioActivoRow = {
  ID_ESPECIALIDAD: string | null;
  ID_PROFESOR: string | null;
};

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

// --- Recuperación: additive types (only used when TIPO_INCIDENCIA === "Recuperación") ---
type AlumnoHorarioSaldoRow = {
  ID_ESPECIALIDAD: string | null;
  SALDO: number | null;
};

type ProfesorSesionRow = {
  ID_SESION: string;
  HORA_INICIO: string | null;
  HORA_FIN: string | null;
  ESPECIALIDAD: string | null;
  ESTADO: string | null;
};

type AlumnoSaldoEligibleRow = {
  ID_ALUMNO: string | null;
  SALDO: number | null;
};

const SESIONES_TIMELINE_EXCLUDED_ESTADOS = ["Cancelada", "Incidencia"] as const;

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
  const byName = list.find((e) => e?.ESPECIALIDAD?.toLowerCase() === value.toLowerCase());
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

function normalizeTipoFalta(value: string | null | undefined): string {
  const v = value?.trim() ?? "";
  return TIPO_FALTA_OPTIONS.includes(v as (typeof TIPO_FALTA_OPTIONS)[number]) ? v : "";
}

function incidenciaSchedulePlaceholder(tipo: string | null | undefined): string {
  return tipo === "Consulta" ? "Pendiente de programar" : "N/A";
}

function formatHorarioRange(
  horaInicio: string | null | undefined,
  horaFin: string | null | undefined,
): string | null {
  const inicio = horaInicio?.trim().slice(0, 5);
  const fin = horaFin?.trim().slice(0, 5);
  if (inicio && fin) return `${inicio} a ${fin}`;
  if (inicio) return inicio;
  if (fin) return fin;
  return null;
}

function SchedulePlaceholderBadge({
  tipo,
  className,
}: {
  tipo: string | null | undefined;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent bg-muted/80 text-muted-foreground font-normal",
        className,
      )}
    >
      {incidenciaSchedulePlaceholder(tipo)}
    </Badge>
  );
}

function IncidenciaFechaHorarioCell({ inc }: { inc: IncidenciaData }) {
  const hasFecha = Boolean(inc.FECHA_EXACTA?.trim());
  const horario = formatHorarioRange(inc.HORA_INICIO, inc.HORA_FIN);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 font-medium">
        <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
        {hasFecha ? inc.FECHA_EXACTA : <SchedulePlaceholderBadge tipo={inc.TIPO_INCIDENCIA} />}
      </div>
      <div className="flex items-center gap-1 text-xs">
        <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
        {horario ? (
          <span className="text-muted-foreground">{horario}</span>
        ) : (
          <SchedulePlaceholderBadge
            tipo={inc.TIPO_INCIDENCIA}
            className="px-1.5 py-0 text-[10px]"
          />
        )}
      </div>
    </div>
  );
}

function IncidenciaScheduleTable({
  rows,
  isLoading,
  emptyMessage,
  canWrite,
  onOpenDetail,
  onOpenEdit,
}: {
  rows: IncidenciaData[];
  isLoading: boolean;
  emptyMessage: string;
  canWrite: boolean;
  onOpenDetail: (id: string) => void;
  onOpenEdit: (id: string) => void;
}) {
  const colCount = 6;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha / Horario</TableHead>
            <TableHead>Alumno</TableHead>
            <TableHead>Profesor</TableHead>
            <TableHead>Especialidad</TableHead>
            <TableHead>Tipo Incidencia</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={colCount}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="py-10 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((inc) => (
              <TableRow
                key={inc.ID_INCIDENCIA}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => onOpenDetail(inc.ID_INCIDENCIA)}
              >
                <TableCell className="text-sm">
                  <IncidenciaFechaHorarioCell inc={inc} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {inc.ALUMNOS?.NOMBRE_ALUMNO ? (
                    <EntityLink type="alumno" id={inc.ID_ALUMNO}>
                      {inc.ALUMNOS.NOMBRE_ALUMNO}
                    </EntityLink>
                  ) : (
                    <span className="text-muted-foreground text-xs">{inc.ID_ALUMNO || "—"}</span>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {inc.PROFESOR?.NOMBRE_PROFESOR ? (
                    <EntityLink type="profesor" id={inc.ID_PROFESOR}>
                      {inc.PROFESOR.NOMBRE_PROFESOR}
                    </EntityLink>
                  ) : (
                    <span className="text-muted-foreground text-xs">{inc.ID_PROFESOR || "—"}</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {inc.ESPECIALIDADES?.ESPECIALIDAD ?? (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  <StatusBadge status={incidenciaTipoBadgeStatus(inc.TIPO_INCIDENCIA)}>
                    {inc.TIPO_INCIDENCIA ?? "—"}
                  </StatusBadge>
                  {inc.TIPO_FALTA && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Detalle: {inc.TIPO_FALTA}
                    </div>
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {canWrite ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpenEdit(inc.ID_INCIDENCIA)}>
                          Editar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ReadOnlyFormField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex min-h-10 w-full items-center rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
        {value}
      </div>
    </div>
  );
}

function formatIncidenciaSessionSummary(inc: IncidenciaData): string {
  const fecha = inc.FECHA_EXACTA?.trim();
  const horario = formatHorarioRange(inc.HORA_INICIO, inc.HORA_FIN);
  const esp = inc.ESPECIALIDADES?.ESPECIALIDAD?.trim();
  const prof = inc.PROFESOR?.NOMBRE_PROFESOR?.trim();
  const parts = [fecha, horario, prof, esp].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : incidenciaSchedulePlaceholder(inc.TIPO_INCIDENCIA);
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

function buildAlumnoScopedEspecialidades(
  horarios: AlumnoHorarioActivoRow[],
  especialidades: EspecialidadLookup[],
): EspecialidadLookup[] {
  const espIds = new Set(
    horarios.map((h) => h.ID_ESPECIALIDAD?.trim()).filter(Boolean) as string[],
  );
  return dedupeSelectOptions(
    especialidades.filter((e) => espIds.has(e.ID_ESPECIALIDAD)),
    (e) => e.ID_ESPECIALIDAD,
  );
}

function buildAlumnoScopedProfesores(
  horarios: AlumnoHorarioActivoRow[],
  profesores: ProfesorLookup[],
  especialidadId?: string,
): ProfesorLookup[] {
  const selectedEspecialidadId = especialidadId?.trim() ?? "";
  const filteredHorarios = selectedEspecialidadId
    ? horarios.filter((h) => h.ID_ESPECIALIDAD?.trim() === selectedEspecialidadId)
    : horarios;
  const profIds = new Set(
    filteredHorarios.map((h) => h.ID_PROFESOR?.trim()).filter(Boolean) as string[],
  );
  return dedupeSelectOptions(
    profesores.filter((p) => profIds.has(p.ID_PROFESOR)),
    (p) => p.ID_PROFESOR,
  );
}

function normalizeRpcEspecialidades(data: unknown): EspecialidadLookup[] {
  if (!Array.isArray(data)) return [];
  return dedupeSelectOptions(
    data.map((row) => {
      const record = row as Record<string, unknown>;
      return {
        ID_ESPECIALIDAD: String(record.ID_ESPECIALIDAD ?? record.id_especialidad ?? ""),
        ESPECIALIDAD: String(record.ESPECIALIDAD ?? record.especialidad ?? record.NOMBRE ?? "—"),
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
  embedded,
  filterCenterId,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: IncidenciaData | null;
  submitting: boolean;
  embedded?: boolean;
  filterCenterId?: string | null;
  onSubmit: (values: IncidenciaFormValues) => void;
}) {
  const { tenantId, rol } = useActiveTenant();

  const [idAlumno, setIdAlumno] = useState(() => String(initial?.ID_ALUMNO ?? ""));
  const [idProfesor, setIdProfesor] = useState(() => String(initial?.ID_PROFESOR ?? ""));
  const [idEspecialidad, setIdEspecialidad] = useState(() =>
    String(initial?.ID_ESPECIALIDAD ?? ""),
  );
  const [idAula, setIdAula] = useState(() => String(initial?.ID_AULA ?? ""));
  const [tipoIncidencia, setTipoIncidencia] = useState<TipoIncidencia>(() =>
    normalizeTipoIncidencia(initial?.TIPO_INCIDENCIA),
  );
  const [tipoFalta, setTipoFalta] = useState(() => normalizeTipoFalta(initial?.TIPO_FALTA));
  const [fechaExacta, setFechaExacta] = useState(() =>
    toDateInputValue(initial?.FECHA_EXACTA ?? ""),
  );
  const [horaInicio, setHoraInicio] = useState(() =>
    toTimeInputValue(initial?.HORA_INICIO ?? ""),
  );
  const [horaFin, setHoraFin] = useState(() => toTimeInputValue(initial?.HORA_FIN ?? ""));
  const [estadoConsulta, setEstadoConsulta] = useState(() =>
    String(initial?.ESTADO_CONSULTA ?? "Pendiente"),
  );
  const [notas, setNotas] = useState(() => String(initial?.NOTAS ?? ""));
  const [selectedSessionId, setSelectedSessionId] = useState(() =>
    String(initial?.ID_SESION ?? ""),
  );
  const [idMatricula, setIdMatricula] = useState(() => String(initial?.ID_MATRICULA ?? ""));
  const [idHorario, setIdHorario] = useState(() => String(initial?.ID_HORARIO ?? ""));
  const [idSesion, setIdSesion] = useState(() => String(initial?.ID_SESION ?? ""));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<IncidenciaFormValues | null>(null);

  const formInitKeyRef = useRef<string | null>(null);
  const prevTipoRef = useRef<TipoIncidencia | null>(null);

  const editingKey = initial?.ID_INCIDENCIA ? String(initial.ID_INCIDENCIA) : "create";
  const isEditing = Boolean(initial?.ID_INCIDENCIA);
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

  const alumnoHorariosActivosQuery = useQuery({
    queryKey: ["incidencia-form-horarios-activos", tenantId ?? "", selectedAlumnoId],
    enabled: open && isConsulta && !!selectedAlumnoId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      let query = supabase
        .from("HORARIOS_MATRICULAS")
        .select("ID_ESPECIALIDAD, ID_PROFESOR")
        .eq("ID_ALUMNO", selectedAlumnoId)
        .eq("ESTADO", "Activo");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AlumnoHorarioActivoRow[];
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

  const recuperacionAulas = useMemo(
    () => recuperacionAulasQuery.data ?? [],
    [recuperacionAulasQuery.data],
  );
  const recuperacionAulasLoading = recuperacionAulasQuery.isLoading;

  // Additive: recovery balance check — ONLY runs when TIPO_INCIDENCIA === "Recuperación".
  // Falta/Consulta never trigger this fetch (enabled flag below).
  const recuperacionSaldoQuery = useQuery({
    queryKey: ["incidencia-form-recuperacion-saldo", tenantId ?? "", selectedAlumnoId],
    enabled: open && isRecuperacion && !!selectedAlumnoId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      let query = supabase
        .from("HORARIOS_MATRICULAS")
        .select("ID_ESPECIALIDAD, SALDO")
        .eq("ID_ALUMNO", selectedAlumnoId)
        .eq("ESTADO", "Activo");
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AlumnoHorarioSaldoRow[];
    },
  });

  // Additive: teacher schedule timeline preview — ONLY runs when TIPO_INCIDENCIA === "Recuperación"
  // AND both Profesor and Fecha del suceso are selected.
  const recuperacionProfesorSesionesQuery = useQuery({
    queryKey: ["incidencia-form-recuperacion-timeline", idProfesor, fechaExacta],
    enabled: open && isRecuperacion && !!idProfesor.trim() && !!fechaExacta,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("SESIONES")
        .select("ID_SESION, HORA_INICIO, HORA_FIN, ESPECIALIDAD, ESTADO")
        .eq("ID_PROFESOR", idProfesor.trim())
        .eq("FECHA_EXACTA", fechaExacta)
        .order("HORA_INICIO", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfesorSesionRow[];
    },
  });

  // Additive: eligible-students-for-recovery lookup — ONLY runs when TIPO_INCIDENCIA ===
  // "Recuperación". Falta/Consulta never trigger this fetch and keep seeing the full
  // alumnosOptions list (see activeAlumnosOptions below).
  const recuperacionAlumnosElegiblesQuery = useQuery({
    queryKey: ["incidencia-form-recuperacion-alumnos-elegibles", tenantId ?? ""],
    enabled: open && isRecuperacion,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      let query = supabase
        .from("HORARIOS_MATRICULAS")
        .select("ID_ALUMNO, SALDO")
        .eq("ESTADO", "Activo")
        .gt("SALDO", 0);
      query = scopeTenantQuery(query, rol, tenantId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AlumnoSaldoEligibleRow[];
    },
  });

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
  const profesores = Array.isArray(lookupsQuery.data?.profesores)
    ? lookupsQuery.data.profesores
    : [];
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
  const alumnosOptions = useMemo(() => dedupeSelectOptions(alumnos, (a) => a.ID_ALUMNO), [alumnos]);

  // Additive: restrict the Alumno dropdown to students with at least one active
  // enrollment with SALDO > 0, but ONLY while isRecuperacion is true. Any other tipo
  // (or while this query hasn't run yet) falls straight back to the full alumnosOptions
  // list — zero regression for Falta/Consulta.
  const recuperacionAlumnosEligiblesIds = useMemo(() => {
    const set = new Set<string>();
    for (const row of recuperacionAlumnosElegiblesQuery.data ?? []) {
      const id = row.ID_ALUMNO?.trim();
      if (id) set.add(id);
    }
    return set;
  }, [recuperacionAlumnosElegiblesQuery.data]);
  const recuperacionAlumnosOptions = useMemo(
    () => alumnosOptions.filter((a) => recuperacionAlumnosEligiblesIds.has(a.ID_ALUMNO)),
    [alumnosOptions, recuperacionAlumnosEligiblesIds],
  );
  const recuperacionAlumnosLoading = isRecuperacion && recuperacionAlumnosElegiblesQuery.isLoading;
  const activeAlumnosOptions = isRecuperacion ? recuperacionAlumnosOptions : alumnosOptions;

  const profesoresOptions = useMemo(
    () => dedupeSelectOptions(profesores, (p) => p.ID_PROFESOR),
    [profesores],
  );
  const especialidadesOptions = useMemo(
    () => dedupeSelectOptions(especialidades, (e) => e.ID_ESPECIALIDAD),
    [especialidades],
  );
  const alumnoHorariosActivos = useMemo(
    () => alumnoHorariosActivosQuery.data ?? [],
    [alumnoHorariosActivosQuery.data],
  );
  const alumnoHorariosLoading = isConsulta && !!selectedAlumnoId && alumnoHorariosActivosQuery.isLoading;
  const consultaEspecialidadesOptions = useMemo(
    () => buildAlumnoScopedEspecialidades(alumnoHorariosActivos, especialidades),
    [alumnoHorariosActivos, especialidades],
  );
  const consultaProfesoresOptions = useMemo(
    () =>
      buildAlumnoScopedProfesores(alumnoHorariosActivos, profesores, selectedEspecialidadId),
    [alumnoHorariosActivos, profesores, selectedEspecialidadId],
  );
  const activeProfesoresOptions = isConsulta ? consultaProfesoresOptions : profesoresOptions;
  const activeEspecialidadesOptions = isConsulta ? consultaEspecialidadesOptions : especialidadesOptions;
  const sesionesOptions = useMemo(
    () => dedupeSelectOptions(sesionesQuery.data ?? [], (s) => s.ID_SESION),
    [sesionesQuery.data],
  );
  const recuperacionAulasOptions = useMemo(
    () => dedupeSelectOptions(recuperacionAulas, (a) => a.ID_AULA),
    [recuperacionAulas],
  );

  // Additive: total recovery balance across the student's active enrollments.
  // Only meaningful/used when isRecuperacion is true.
  const totalSaldoRecuperaciones = useMemo(
    () =>
      (recuperacionSaldoQuery.data ?? []).reduce(
        (sum, row) => sum + (typeof row.SALDO === "number" ? row.SALDO : 0),
        0,
      ),
    [recuperacionSaldoQuery.data],
  );
  const recuperacionSaldoReady =
    isRecuperacion && !!selectedAlumnoId && !recuperacionSaldoQuery.isLoading;
  const hasZeroSaldoRecuperaciones = recuperacionSaldoReady && totalSaldoRecuperaciones <= 0;

  // Additive: booked slots for the selected Profesor on the selected Fecha, for the
  // read-only availability preview. Excludes cancelled/incident sessions per spec.
  const recuperacionProfesorSesiones = useMemo(() => {
    const activas = (recuperacionProfesorSesionesQuery.data ?? []).filter(
      (s) =>
        !SESIONES_TIMELINE_EXCLUDED_ESTADOS.includes(
          (s.ESTADO ?? "") as (typeof SESIONES_TIMELINE_EXCLUDED_ESTADOS)[number],
        ),
    );
    // Additive UI-only dedup: group classes insert one SESIONES row per enrolled
    // student, so the same time slot/specialty can repeat several times. Collapse
    // those into a single displayed row per unique HORA_INICIO+HORA_FIN+ESPECIALIDAD.
    // Purely a rendering concern — the underlying query/data is untouched.
    return dedupeSelectOptions(
      activas,
      (s) => `${s.HORA_INICIO ?? ""}|${s.HORA_FIN ?? ""}|${s.ESPECIALIDAD ?? ""}`,
    );
  }, [recuperacionProfesorSesionesQuery.data]);

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
    setTipoFalta(normalizeTipoFalta(initial?.TIPO_FALTA));
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
    if (tipoIncidencia !== "Falta") {
      setTipoFalta("");
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
    setIdProfesor("");
    setIdEspecialidad("");
    clearRecuperacionCascade();
  };

  const handleConsultaEspecialidadChange = (value: string) => {
    const nextEspecialidadId = value === NONE_VALUE ? "" : value.trim();
    if (nextEspecialidadId === selectedEspecialidadId) return;
    setIdEspecialidad(nextEspecialidadId);
    setIdProfesor("");
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
    !isEditing &&
    (isRecuperacion || (!isConsulta && (!isFalta || Boolean(selectedSessionId))));
  const showPersonFields =
    !isEditing && (isConsulta || (isFalta && Boolean(selectedSessionId)));

  const alumnoSelectValue = recuperacionAlumnosLoading
    ? LOADING_REC_ALUMNOS
    : activeAlumnosOptions.length === 0
      ? isRecuperacion
        ? EMPTY_REC_ALUMNOS
        : EMPTY_ALUMNOS
      : safeSelectValue(
          idAlumno,
          activeAlumnosOptions.map((a) => ({ id: a.ID_ALUMNO })),
        );
  const sessionSelectValue = sesionesQuery.isLoading
    ? LOADING_SESIONES
    : sesionesOptions.length === 0
      ? EMPTY_SESIONES
      : safeSelectValue(
          selectedSessionId,
          sesionesOptions.map((s) => ({ id: s.ID_SESION })),
        );
  const profesorSelectValue = isConsulta
    ? !selectedAlumnoId
      ? SELECT_ALUMNO_FIRST
      : alumnoHorariosLoading
        ? LOADING_ALUMNO_HORARIOS
        : activeProfesoresOptions.length === 0
          ? EMPTY_ALUMNO_HORARIOS
          : safeSelectValue(idProfesor, [
              { id: NONE_VALUE },
              ...activeProfesoresOptions.map((p) => ({ id: p.ID_PROFESOR })),
            ])
    : activeProfesoresOptions.length === 0
      ? EMPTY_PROFESORES
      : safeSelectValue(idProfesor, activeProfesoresOptions.map((p) => ({ id: p.ID_PROFESOR })));
  const especialidadSelectValue = isConsulta
    ? !selectedAlumnoId
      ? SELECT_ALUMNO_FIRST
      : alumnoHorariosLoading
        ? LOADING_ALUMNO_HORARIOS
        : activeEspecialidadesOptions.length === 0
          ? EMPTY_ALUMNO_HORARIOS
          : safeSelectValue(idEspecialidad, [
              { id: NONE_VALUE },
              ...activeEspecialidadesOptions.map((e) => ({ id: e.ID_ESPECIALIDAD })),
            ])
    : activeEspecialidadesOptions.length === 0
      ? EMPTY_ESPECIALIDADES
      : safeSelectValue(idEspecialidad, activeEspecialidadesOptions.map((e) => ({ id: e.ID_ESPECIALIDAD })));
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

  const confirmSaveDialog = (
    <AlertDialog
      open={confirmOpen}
      onOpenChange={(open) => {
        setConfirmOpen(open);
        if (!open) setPendingPayload(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Confirmar modificaciones?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de guardar los cambios en esta incidencia.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting || !pendingPayload}
            onClick={() => {
              if (!pendingPayload) return;
              onSubmit(pendingPayload);
              setConfirmOpen(false);
              setPendingPayload(null);
            }}
          >
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const formBody = (
    <form
      id="incidencia-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!lookupsReady && !isEditing) return;
        if (!idAlumno.trim()) {
          toast.error("Selecciona un alumno.");
          return;
        }
        if (isFalta && !selectedSessionId) {
          toast.error("Selecciona la sesión a la que corresponde la falta.");
          return;
        }
        if (isFalta && !tipoFalta.trim()) {
          toast.error("Selecciona el tipo de falta.");
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
        if (isRecuperacion && !fechaExacta.trim()) {
          toast.error("Selecciona la fecha del suceso.");
          return;
        }
        if (isRecuperacion && !horaInicio.trim()) {
          toast.error("Selecciona la hora de inicio.");
          return;
        }
        if (isRecuperacion && !horaFin.trim()) {
          toast.error("Selecciona la hora de fin.");
          return;
        }
        if (isRecuperacion && hasZeroSaldoRecuperaciones) {
          toast.error("Este alumno no tiene recuperaciones pendientes.");
          return;
        }

        const payload: IncidenciaFormValues = {
          ID_ALUMNO: idAlumno.trim(),
          TIPO_INCIDENCIA: tipoIncidencia,
          TIPO_FALTA: null,
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
          payload.TIPO_FALTA = null;
          payload.ID_SESION = null;
        } else if (isFalta) {
          payload.FECHA_EXACTA = fechaExacta || null;
          payload.HORA_INICIO = horaInicio || null;
          payload.HORA_FIN = horaFin || null;
          payload.ID_SESION = idSesion || null;
          payload.ID_MATRICULA = idMatricula || null;
          payload.ID_HORARIO = idHorario || null;
          payload.TIPO_FALTA = tipoFalta || null;
        } else if (isRecuperacion) {
          payload.FECHA_EXACTA = fechaExacta || null;
          payload.HORA_INICIO = horaInicio || null;
          payload.HORA_FIN = horaFin || null;
          payload.ID_AULA = idAula || null;
        }

        setPendingPayload(payload);
        setConfirmOpen(true);
      }}
      className="space-y-4 pt-2"
    >
      {!lookupsReady && !isEditing ? (
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

          {isRecuperacion && selectedAlumnoId && hasZeroSaldoRecuperaciones ? (
            <div
              role="alert"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              Este alumno no tiene recuperaciones pendientes.
            </div>
          ) : null}

          {isFalta ? (
            <div className="space-y-2">
              <Label>Tipo de Falta *</Label>
              <Select value={tipoFalta || undefined} onValueChange={setTipoFalta}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo de falta" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_FALTA_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isEditing && initial ? (
            <ReadOnlyFormField
              label="Alumno *"
              value={initial.ALUMNOS?.NOMBRE_ALUMNO?.trim() || "Sin alumno asignado"}
            />
          ) : (
            <div className="space-y-2">
              <Label>Alumno *</Label>
              <Select
                value={alumnoSelectValue}
                onValueChange={(v) => {
                  if (
                    v === EMPTY_ALUMNOS ||
                    v === LOADING_REC_ALUMNOS ||
                    v === EMPTY_REC_ALUMNOS
                  ) {
                    return;
                  }
                  handleAlumnoChange(v === NONE_VALUE ? "" : v);
                }}
                disabled={recuperacionAlumnosLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      recuperacionAlumnosLoading
                        ? "Cargando alumnos elegibles..."
                        : "Seleccionar alumno"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {recuperacionAlumnosLoading ? (
                    <SelectItem key={LOADING_REC_ALUMNOS} value={LOADING_REC_ALUMNOS} disabled>
                      Cargando alumnos elegibles...
                    </SelectItem>
                  ) : activeAlumnosOptions.length === 0 ? (
                    <SelectItem
                      key={isRecuperacion ? EMPTY_REC_ALUMNOS : EMPTY_ALUMNOS}
                      value={isRecuperacion ? EMPTY_REC_ALUMNOS : EMPTY_ALUMNOS}
                      disabled
                    >
                      {isRecuperacion
                        ? "No hay alumnos con recuperaciones pendientes"
                        : "No hay alumnos disponibles"}
                    </SelectItem>
                  ) : (
                    activeAlumnosOptions.map((a) => (
                      <SelectItem key={a.ID_ALUMNO} value={a.ID_ALUMNO}>
                        {a.NOMBRE_ALUMNO ?? "—"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {isEditing && isFalta && initial ? (
            <ReadOnlyFormField
              label="Sesión programada"
              value={formatIncidenciaSessionSummary(initial)}
            />
          ) : !isEditing && isFalta && selectedAlumnoId ? (
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

          {isEditing && isRecuperacion && initial ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyFormField
                label="Fecha"
                value={
                  initial.FECHA_EXACTA?.trim() ||
                  incidenciaSchedulePlaceholder(initial.TIPO_INCIDENCIA)
                }
              />
              <ReadOnlyFormField
                label="Horario"
                value={
                  formatHorarioRange(initial.HORA_INICIO, initial.HORA_FIN) ||
                  incidenciaSchedulePlaceholder(initial.TIPO_INCIDENCIA)
                }
              />
              <ReadOnlyFormField
                label="Profesor"
                value={initial.PROFESOR?.NOMBRE_PROFESOR?.trim() || "N/A"}
              />
              <ReadOnlyFormField
                label="Especialidad"
                value={initial.ESPECIALIDADES?.ESPECIALIDAD?.trim() || "N/A"}
              />
            </div>
          ) : null}

          {!isEditing && isRecuperacion && selectedAlumnoId ? (
            <>
              <div className="space-y-2">
                <Label>Especialidad *</Label>
                <Select
                  value={recuperacionEspecialidadSelectValue}
                  onValueChange={(v) => {
                    if (v === LOADING_REC_ESPECIALIDADES || v === EMPTY_REC_ESPECIALIDADES) {
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
                      <SelectItem key={EMPTY_REC_PROFESORES} value={EMPTY_REC_PROFESORES} disabled>
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
                        recuperacionAulasLoading ? "Cargando aulas..." : "Seleccionar aula"
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
                  required={isRecuperacion}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora inicio</Label>
                <Input
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  disabled={faltaFieldsLocked}
                  required={isRecuperacion}
                />
              </div>
              <div className="space-y-2">
                <Label>Hora fin</Label>
                <Input
                  type="time"
                  value={horaFin}
                  onChange={(e) => setHoraFin(e.target.value)}
                  disabled={faltaFieldsLocked}
                  required={isRecuperacion}
                />
              </div>
            </div>
          ) : null}

          {isRecuperacion && idProfesor.trim() && fechaExacta ? (
            <div className="space-y-2">
              <Label>Disponibilidad del profesor ({fechaExacta})</Label>
              <div className="rounded-md border border-input bg-muted/40 p-3 text-sm">
                {recuperacionProfesorSesionesQuery.isLoading ? (
                  <p className="text-xs text-muted-foreground">Cargando agenda del profesor...</p>
                ) : recuperacionProfesorSesiones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Sin sesiones registradas para este profesor en la fecha seleccionada.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {recuperacionProfesorSesiones.map((s) => (
                      <li key={s.ID_SESION} className="flex items-center gap-2 text-xs">
                        <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="font-medium">
                          {formatHorarioRange(s.HORA_INICIO, s.HORA_FIN) ?? "—"}
                        </span>
                        <span className="text-muted-foreground">
                          {resolveEspecialidadLabel(s.ESPECIALIDAD, especialidades)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
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
                    if (
                      v === EMPTY_PROFESORES ||
                      v === EMPTY_ALUMNO_HORARIOS ||
                      v === LOADING_ALUMNO_HORARIOS ||
                      v === SELECT_ALUMNO_FIRST
                    ) {
                      return;
                    }
                    setIdProfesor(v === NONE_VALUE ? "" : v);
                  }}
                  disabled={
                    faltaFieldsLocked ||
                    (isConsulta && (!selectedAlumnoId || alumnoHorariosLoading))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        isConsulta && !selectedAlumnoId
                          ? "Selecciona un alumno primero"
                          : isConsulta && alumnoHorariosLoading
                            ? "Cargando profesores..."
                            : "Seleccionar profesor"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {isConsulta && !selectedAlumnoId ? (
                      <SelectItem key={SELECT_ALUMNO_FIRST} value={SELECT_ALUMNO_FIRST} disabled>
                        Selecciona un alumno primero
                      </SelectItem>
                    ) : isConsulta && alumnoHorariosLoading ? (
                      <SelectItem
                        key={LOADING_ALUMNO_HORARIOS}
                        value={LOADING_ALUMNO_HORARIOS}
                        disabled
                      >
                        Cargando profesores...
                      </SelectItem>
                    ) : isConsulta && activeProfesoresOptions.length === 0 ? (
                      <SelectItem key={EMPTY_ALUMNO_HORARIOS} value={EMPTY_ALUMNO_HORARIOS} disabled>
                        No hay profesores activos para este alumno
                      </SelectItem>
                    ) : (
                      <>
                        {isConsulta && (
                          <SelectItem key={NONE_VALUE} value={NONE_VALUE}>
                            Sin profesor
                          </SelectItem>
                        )}
                        {!isConsulta && activeProfesoresOptions.length === 0 ? (
                          <SelectItem key={EMPTY_PROFESORES} value={EMPTY_PROFESORES} disabled>
                            No hay profesores disponibles
                          </SelectItem>
                        ) : (
                          activeProfesoresOptions.map((p) => (
                            <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                              {p.NOMBRE_PROFESOR ?? "—"}
                            </SelectItem>
                          ))
                        )}
                      </>
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
                    if (
                      v === EMPTY_ESPECIALIDADES ||
                      v === EMPTY_ALUMNO_HORARIOS ||
                      v === LOADING_ALUMNO_HORARIOS ||
                      v === SELECT_ALUMNO_FIRST
                    ) {
                      return;
                    }
                    if (isConsulta) {
                      handleConsultaEspecialidadChange(v);
                      return;
                    }
                    setIdEspecialidad(v === NONE_VALUE ? "" : v);
                  }}
                  disabled={
                    faltaFieldsLocked ||
                    (isConsulta && (!selectedAlumnoId || alumnoHorariosLoading))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        isConsulta && !selectedAlumnoId
                          ? "Selecciona un alumno primero"
                          : isConsulta && alumnoHorariosLoading
                            ? "Cargando especialidades..."
                            : "Seleccionar especialidad"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {isConsulta && !selectedAlumnoId ? (
                      <SelectItem key={SELECT_ALUMNO_FIRST} value={SELECT_ALUMNO_FIRST} disabled>
                        Selecciona un alumno primero
                      </SelectItem>
                    ) : isConsulta && alumnoHorariosLoading ? (
                      <SelectItem
                        key={LOADING_ALUMNO_HORARIOS}
                        value={LOADING_ALUMNO_HORARIOS}
                        disabled
                      >
                        Cargando especialidades...
                      </SelectItem>
                    ) : isConsulta && activeEspecialidadesOptions.length === 0 ? (
                      <SelectItem key={EMPTY_ALUMNO_HORARIOS} value={EMPTY_ALUMNO_HORARIOS} disabled>
                        No hay especialidades activas para este alumno
                      </SelectItem>
                    ) : (
                      <>
                        {isConsulta && (
                          <SelectItem key={NONE_VALUE} value={NONE_VALUE}>
                            Sin especialidad
                          </SelectItem>
                        )}
                        {!isConsulta && activeEspecialidadesOptions.length === 0 ? (
                          <SelectItem key={EMPTY_ESPECIALIDADES} value={EMPTY_ESPECIALIDADES} disabled>
                            No hay especialidades disponibles
                          </SelectItem>
                        ) : (
                          activeEspecialidadesOptions.map((e) => (
                            <SelectItem key={e.ID_ESPECIALIDAD} value={e.ID_ESPECIALIDAD}>
                              {e.ESPECIALIDAD ?? "—"}
                            </SelectItem>
                          ))
                        )}
                      </>
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

          {faltaFieldsLocked && !isEditing ? (
            <p className="text-xs text-muted-foreground">
              Los datos de la sesión seleccionada ({fechaExacta || "—"} · {horaInicio || "—"}–
              {horaFin || "—"} · {profesorById.get(idProfesor) ?? "—"} ·{" "}
              {especialidadById.get(idEspecialidad) ??
                resolveEspecialidadLabel(idEspecialidad, especialidades)}
              {idAula ? ` · ${aulaById.get(idAula) ?? idAula}` : ""}) provienen del calendario y no
              se pueden modificar.
            </p>
          ) : null}
        </>
      )}

      {!embedded ? (
        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              submitting ||
              (!lookupsReady && !isEditing) ||
              (!isEditing && isRecuperacion && hasZeroSaldoRecuperaciones)
            }
          >
            {submitting ? "Guardando..." : submitLabel}
          </Button>
        </DialogFooter>
      ) : null}
    </form>
  );

  if (embedded) {
    if (!open) return null;
    return (
      <>
        {formBody}
        {confirmSaveDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para registrar o editar una incidencia o recuperación.
            </DialogDescription>
          </DialogHeader>
          {formBody}
        </DialogContent>
      </Dialog>
      {confirmSaveDialog}
    </>
  );
}
