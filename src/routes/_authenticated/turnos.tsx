import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, MoreHorizontal, Plus, Search, Trash2, Pencil, X } from "lucide-react";
import {
  useTurnos,
  type TurnoData,
  type TurnoBulkCreateInput,
  type TurnoCreateInput,
  type TurnoUpdateInput,
  type ProfesorLookup,
  type EspecialidadLookup,
} from "@/hooks/useTurnos";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";
import { formatProfesorOptionLabel, profesorSelectorOptions } from "@/lib/profesorSelector";
import { isAdminRole, isDireccionRole, isMasterRole, isProfesorRole } from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntityLink } from "@/components/navigation/EntityLink";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/turnos")({
  component: TurnosPage,
});

const DIA_SEMANA_OPTIONS = [
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
  "Domingo",
] as const;

const dayOrder: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  Miercoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sabado: 6,
  Domingo: 7,
};

const sortLocale = { sensitivity: "base" } as const;

type DayScheduleFields = {
  abreManana: string;
  cierraManana: string;
  abreTarde: string;
  cierraTarde: string;
};

function emptyDaySchedule(): DayScheduleFields {
  return { abreManana: "", cierraManana: "", abreTarde: "", cierraTarde: "" };
}

function sortDias(dias: string[]): string[] {
  return [...dias].sort((a, b) => (dayOrder[a] ?? 99) - (dayOrder[b] ?? 99));
}

function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const match = value.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : value.slice(0, 5);
}

function formatTimeBlock(abre: string | null, cierra: string | null): string | null {
  if (!abre && !cierra) return null;
  const a = abre ? toTimeInputValue(abre) : "—";
  const c = cierra ? toTimeInputValue(cierra) : "—";
  return `${a}–${c}`;
}

function TagBadges({ text }: { text: string }) {
  if (!text || text === "—") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const items = text.split(", ").filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1 max-w-[200px]">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="text-xs font-normal px-1.5 py-0">
          {item}
        </Badge>
      ))}
    </div>
  );
}

function isTurnoOwner(row: TurnoData, perfilProfesorId: string | null | undefined): boolean {
  return !!perfilProfesorId && row.ID_PROFESOR === perfilProfesorId;
}

function canEditTurnoRecord(
  t: TurnoData,
  rol: string | null | undefined,
  perfilProfesorId: string | null | undefined,
): boolean {
  if (isMasterRole(rol) || isAdminRole(rol)) return true;
  if (isDireccionRole(rol) && !isTurnoOwner(t, perfilProfesorId)) return false;
  if (isDireccionRole(rol) || isProfesorRole(rol)) return true;
  return false;
}

function turnoReadOnly(
  t: TurnoData,
  rol: string | null | undefined,
  perfilProfesorId: string | null | undefined,
): boolean {
  return isDireccionRole(rol) && !isTurnoOwner(t, perfilProfesorId);
}

function turnoTimesOnlyEdit(
  t: TurnoData,
  rol: string | null | undefined,
  perfilProfesorId: string | null | undefined,
): boolean {
  return isProfesorRole(rol) || (isDireccionRole(rol) && isTurnoOwner(t, perfilProfesorId));
}

function TurnoDetailOverlay({
  open,
  mode,
  turno,
  rol,
  perfilProfesorId,
  profesores,
  especialidades,
  submitting,
  onClose,
  onEdit,
  onCancelEdit,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  turno: TurnoData | null;
  rol: string | null | undefined;
  perfilProfesorId: string | null | undefined;
  profesores: ProfesorLookup[];
  especialidades: EspecialidadLookup[];
  submitting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSubmit: (values: TurnoCreateInput | TurnoUpdateInput) => void;
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

  if (!turno) {
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

  const readOnly = turnoReadOnly(turno, rol, perfilProfesorId);
  const timesOnlyEdit = turnoTimesOnlyEdit(turno, rol, perfilProfesorId);
  const canEdit = canEditTurnoRecord(turno, rol, perfilProfesorId);
  const manana = formatTimeBlock(turno.ABRE_MAÑANA, turno.CIERRA_MAÑANA);
  const tarde = formatTimeBlock(turno.ABRE_TARDE, turno.CIERRA_TARDE);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle de disponibilidad"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="turno-overlay-title"
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
                <h2 id="turno-overlay-title" className="truncate text-xl font-semibold">
                  {readOnly ? "Ver disponibilidad" : "Editar disponibilidad"}
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
            <TurnoFormDialog
              open
              embedded
              title={readOnly ? "Ver disponibilidad" : "Editar disponibilidad"}
              submitLabel="Guardar"
              initial={turno}
              profesores={profesores}
              especialidades={especialidades}
              readOnly={readOnly}
              timesOnlyEdit={timesOnlyEdit}
              submitting={submitting}
              onClose={onCancelEdit}
              onSubmit={onSubmit}
            />
            {!readOnly && (
              <div className="mt-4 flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={onCancelEdit}>
                  Cancelar
                </Button>
                <Button type="submit" form="turno-form" disabled={submitting}>
                  {submitting ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="turno-overlay-title" className="truncate text-xl font-semibold">
                  Vista detalle
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEdit && (
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
                <dt className="text-muted-foreground">Profesor</dt>
                <dd className="font-semibold">
                  <EntityLink type="profesor" id={turno.ID_PROFESOR}>
                    {turno.NOMBRE_PROFESOR}
                  </EntityLink>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Día</dt>
                <dd>{turno.DIA_SEMANA}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mañana</dt>
                <dd className="font-mono tabular-nums">{manana ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tarde</dt>
                <dd className="font-mono tabular-nums">{tarde ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Especialidades</dt>
                <dd className="mt-1">
                  <TagBadges text={turno.TEXTO_ESPECIALIDADES} />
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

function TurnosPage() {
  const { rol, perfil } = useActiveTenant();
  const canAccess = hasPermission(rol, "turnos:read") || hasPermission(rol, "turnos:write");
  const canCreate = isMasterRole(rol) || isAdminRole(rol);
  const canDelete = isMasterRole(rol) || isAdminRole(rol);

  const { list, create, update, remove } = useTurnos();

  const turnos = useMemo(() => list.data?.turnos ?? [], [list.data?.turnos]);
  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);
  const especialidades = useMemo(
    () => list.data?.especialidades ?? [],
    [list.data?.especialidades],
  );

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<TurnoData | null>(null);

  const overlayTurno = useMemo(
    () => turnos.find((t) => t.ID_TURNO === overlay?.id) ?? null,
    [turnos, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => setOverlay(null), []);
  const handleEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
  }, []);

  const filtered = useMemo(() => {
    let rows = turnos;
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = turnos.filter(
        (t) =>
          t.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
          t.DIA_SEMANA?.toLowerCase().includes(q) ||
          t.TEXTO_ESPECIALIDADES.toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      const nameDiff = a.NOMBRE_PROFESOR.localeCompare(b.NOMBRE_PROFESOR, "es", sortLocale);
      if (nameDiff !== 0) return nameDiff;
      return (dayOrder[a.DIA_SEMANA] ?? 99) - (dayOrder[b.DIA_SEMANA] ?? 99);
    });
  }, [turnos, query]);

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          No tienes permiso para consultar la disponibilidad horaria.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Disponibilidad horaria"
        description={`${turnos.length} registros · ordenados por profesor y día`}
        actions={
          canCreate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Añadir disponibilidad
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por profesor, día o especialidad..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error al cargar disponibilidad horaria: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-xs font-semibold">Profesor</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Día</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Mañana</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Tarde</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Especialidades</TableHead>
                {canDelete && (
                  <TableHead className="h-9 text-xs font-semibold text-right w-12">
                    Acciones
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={canDelete ? 6 : 5} className="py-2">
                      <Skeleton className="h-7 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canDelete ? 6 : 5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {query ? "Sin resultados." : "Aún no hay disponibilidad registrada."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => {
                  const manana = formatTimeBlock(t.ABRE_MAÑANA, t.CIERRA_MAÑANA);
                  const tarde = formatTimeBlock(t.ABRE_TARDE, t.CIERRA_TARDE);
                  return (
                    <TableRow
                      key={t.ID_TURNO}
                      className="cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => setOverlay({ id: t.ID_TURNO, mode: "detail" })}
                    >
                      <TableCell
                        className="py-2 font-medium text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <EntityLink type="profesor" id={t.ID_PROFESOR}>
                          {t.NOMBRE_PROFESOR}
                        </EntityLink>
                      </TableCell>
                      <TableCell className="py-2 text-sm" onClick={(e) => e.stopPropagation()}>
                        {t.DIA_SEMANA}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground font-mono tabular-nums">
                        {manana ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground font-mono tabular-nums">
                        {tarde ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <TagBadges text={t.TEXTO_ESPECIALIDADES} />
                      </TableCell>
                      {canDelete && (
                        <TableCell className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
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
                                  setOverlay({ id: t.ID_TURNO, mode: "edit" });
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleting(t);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <TurnoFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Nueva disponibilidad"
        submitLabel="Crear"
        isCreate
        profesores={profesores}
        especialidades={especialidades}
        submitting={create.isPending}
        onSubmit={async (values) => {
          try {
            const result = await create.mutateAsync(values as TurnoBulkCreateInput);
            const count = Array.isArray(result) ? result.length : 1;
            toast.success(
              count === 1 ? "Disponibilidad añadida." : `${count} disponibilidades añadidas.`,
            );
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear.");
          }
        }}
      />

      <TurnoDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        turno={overlayTurno}
        rol={rol}
        perfilProfesorId={perfil.ID_PROFESOR}
        profesores={profesores}
        especialidades={especialidades}
        submitting={update.isPending}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onSubmit={async (values) => {
          if (!overlayTurno) return;
          const readOnly = turnoReadOnly(overlayTurno, rol, perfil.ID_PROFESOR);
          if (readOnly) return;
          try {
            await update.mutateAsync({
              id: overlayTurno.ID_TURNO,
              patch: values,
              turnoProfesorId: overlayTurno.ID_PROFESOR,
            });
            toast.success("Disponibilidad actualizada.");
            setOverlay({ id: overlayTurno.ID_TURNO, mode: "detail" });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar.");
          }
        }}
      />

      {canDelete && (
        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar disponibilidad</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará la disponibilidad de <b>{deleting?.NOMBRE_PROFESOR}</b> del{" "}
                <b>{deleting?.DIA_SEMANA}</b>. Esta acción no se puede deshacer.
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
                    await remove.mutateAsync(deleting.ID_TURNO);
                    toast.success("Disponibilidad eliminada.");
                    setDeleting(null);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Error al eliminar.");
                  }
                }}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function MultiSelectCheckboxes({
  label,
  options,
  selected,
  onToggle,
  disabled,
  selectedLabel = "seleccionadas",
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
  selectedLabel?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="border rounded-md max-h-[160px] overflow-y-auto divide-y">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay especialidades disponibles.
          </p>
        ) : (
          options.map((opt) => {
            const checked = selected.includes(opt.id);
            return (
              <label
                key={opt.id}
                className={`flex items-center gap-2 px-3 py-2 ${disabled ? "cursor-default opacity-60" : "cursor-pointer hover:bg-muted/50"} ${checked ? "bg-muted/20" : ""}`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(opt.id)}
                  disabled={disabled}
                />
                <span className="text-sm truncate">{opt.name}</span>
              </label>
            );
          })
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length} {selectedLabel}
      </p>
    </div>
  );
}

function TurnoFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  isCreate,
  profesores,
  especialidades,
  readOnly,
  timesOnlyEdit,
  submitting,
  embedded,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: TurnoData | null;
  isCreate?: boolean;
  profesores: ProfesorLookup[];
  especialidades: EspecialidadLookup[];
  readOnly?: boolean;
  timesOnlyEdit?: boolean;
  submitting: boolean;
  embedded?: boolean;
  onSubmit: (values: TurnoBulkCreateInput | TurnoCreateInput | TurnoUpdateInput) => void;
}) {
  const [idProfesor, setIdProfesor] = useState("");
  const [diaSemana, setDiaSemana] = useState<string>(DIA_SEMANA_OPTIONS[0]);
  const [diasSeleccionados, setDiasSeleccionados] = useState<string[]>([]);
  const [horariosPorDia, setHorariosPorDia] = useState<Record<string, DayScheduleFields>>({});
  const [abreManana, setAbreManana] = useState("");
  const [cierraManana, setCierraManana] = useState("");
  const [abreTarde, setAbreTarde] = useState("");
  const [cierraTarde, setCierraTarde] = useState("");
  const [especialidadIds, setEspecialidadIds] = useState<string[]>([]);

  const profesoresOrdenados = useMemo(
    () => profesorSelectorOptions(profesores, idProfesor),
    [profesores, idProfesor],
  );

  const especialidadesOrdenadas = useMemo(
    () =>
      [...especialidades].sort((a, b) =>
        a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", sortLocale),
      ),
    [especialidades],
  );

  useEffect(() => {
    if (!open) return;
    setIdProfesor(initial?.ID_PROFESOR || "");
    setDiaSemana(
      initial?.DIA_SEMANA && (DIA_SEMANA_OPTIONS as readonly string[]).includes(initial.DIA_SEMANA)
        ? initial.DIA_SEMANA
        : DIA_SEMANA_OPTIONS[0],
    );
    setDiasSeleccionados([]);
    setHorariosPorDia({});
    setAbreManana(toTimeInputValue(initial?.ABRE_MAÑANA));
    setCierraManana(toTimeInputValue(initial?.CIERRA_MAÑANA));
    setAbreTarde(toTimeInputValue(initial?.ABRE_TARDE));
    setCierraTarde(toTimeInputValue(initial?.CIERRA_TARDE));
    setEspecialidadIds(initial?.ESPECIALIDAD ?? []);
  }, [open, initial]);

  const formDisabled = !!readOnly;
  const assignmentFieldsLocked = !!readOnly || !!timesOnlyEdit;

  const toggleEspecialidad = (id: string) => {
    if (readOnly || timesOnlyEdit) return;
    setEspecialidadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const diasOrdenados = useMemo(() => sortDias(diasSeleccionados), [diasSeleccionados]);

  const toggleDia = (dia: string) => {
    if (assignmentFieldsLocked) return;
    const isSelected = diasSeleccionados.includes(dia);
    setDiasSeleccionados((prev) => (isSelected ? prev.filter((x) => x !== dia) : [...prev, dia]));
    setHorariosPorDia((prev) => {
      if (isSelected) {
        const next = { ...prev };
        delete next[dia];
        return next;
      }
      return { ...prev, [dia]: prev[dia] ?? emptyDaySchedule() };
    });
  };

  const updateHorarioDia = (dia: string, field: keyof DayScheduleFields, value: string) => {
    setHorariosPorDia((prev) => ({
      ...prev,
      [dia]: { ...(prev[dia] ?? emptyDaySchedule()), [field]: value },
    }));
  };

  const formBody = open ? (
    <form
      id="turno-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        if (timesOnlyEdit) {
          onSubmit({
            ABRE_MAÑANA: abreManana || null,
            CIERRA_MAÑANA: cierraManana || null,
            ABRE_TARDE: abreTarde || null,
            CIERRA_TARDE: cierraTarde || null,
          });
          return;
        }
        if (!idProfesor) return;

        const shared = {
          ID_PROFESOR: idProfesor,
          ABRE_MAÑANA: abreManana || null,
          CIERRA_MAÑANA: cierraManana || null,
          ABRE_TARDE: abreTarde || null,
          CIERRA_TARDE: cierraTarde || null,
          ESPECIALIDAD: especialidadIds,
        };

        if (isCreate) {
          if (diasOrdenados.length === 0) return;
          onSubmit({
            ID_PROFESOR: idProfesor,
            ESPECIALIDAD: especialidadIds,
            registros: diasOrdenados.map((dia) => {
              const h = horariosPorDia[dia] ?? emptyDaySchedule();
              return {
                DIA_SEMANA: dia,
                ABRE_MAÑANA: h.abreManana || null,
                CIERRA_MAÑANA: h.cierraManana || null,
                ABRE_TARDE: h.abreTarde || null,
                CIERRA_TARDE: h.cierraTarde || null,
              };
            }),
          });
          return;
        }

        if (!diaSemana) return;
        onSubmit({
          ...shared,
          DIA_SEMANA: diaSemana,
        });
      }}
      className="flex-1 overflow-y-auto space-y-4 py-2"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="turno-profesor">Profesor *</Label>
          <Select
            value={idProfesor || undefined}
            onValueChange={setIdProfesor}
            disabled={assignmentFieldsLocked}
          >
            <SelectTrigger id="turno-profesor">
              <SelectValue placeholder="Seleccionar profesor" />
            </SelectTrigger>
            <SelectContent>
              {profesoresOrdenados.map((p) => (
                <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                  {formatProfesorOptionLabel(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isCreate && (
          <div className="space-y-2">
            <Label htmlFor="turno-dia">Día de la semana *</Label>
            <Select
              value={diaSemana}
              onValueChange={setDiaSemana}
              disabled={assignmentFieldsLocked}
            >
              <SelectTrigger id="turno-dia">
                <SelectValue placeholder="Seleccionar día" />
              </SelectTrigger>
              <SelectContent>
                {DIA_SEMANA_OPTIONS.map((dia) => (
                  <SelectItem key={dia} value={dia}>
                    {dia}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isCreate && (
        <MultiSelectCheckboxes
          label="Días de la semana *"
          options={DIA_SEMANA_OPTIONS.map((dia) => ({ id: dia, name: dia }))}
          selected={diasSeleccionados}
          onToggle={toggleDia}
          disabled={assignmentFieldsLocked}
          selectedLabel="seleccionados"
        />
      )}

      {isCreate && diasOrdenados.length > 0 && (
        <div className="space-y-4">
          {diasOrdenados.map((dia) => {
            const horario = horariosPorDia[dia] ?? emptyDaySchedule();
            const slug = dia.toLowerCase();
            return (
              <div key={dia} className="rounded-md border bg-muted/20 p-3 space-y-3">
                <h3 className="text-sm font-semibold">{dia}</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`turno-${slug}-abre-manana`}>Abre mañana</Label>
                    <Input
                      id={`turno-${slug}-abre-manana`}
                      type="time"
                      value={horario.abreManana}
                      onChange={(e) => updateHorarioDia(dia, "abreManana", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`turno-${slug}-cierra-manana`}>Cierra mañana</Label>
                    <Input
                      id={`turno-${slug}-cierra-manana`}
                      type="time"
                      value={horario.cierraManana}
                      onChange={(e) => updateHorarioDia(dia, "cierraManana", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`turno-${slug}-abre-tarde`}>Abre tarde</Label>
                    <Input
                      id={`turno-${slug}-abre-tarde`}
                      type="time"
                      value={horario.abreTarde}
                      onChange={(e) => updateHorarioDia(dia, "abreTarde", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`turno-${slug}-cierra-tarde`}>Cierra tarde</Label>
                    <Input
                      id={`turno-${slug}-cierra-tarde`}
                      type="time"
                      value={horario.cierraTarde}
                      onChange={(e) => updateHorarioDia(dia, "cierraTarde", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isCreate && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="turno-abre-manana">Abre mañana</Label>
            <Input
              id="turno-abre-manana"
              type="time"
              value={abreManana}
              onChange={(e) => setAbreManana(e.target.value)}
              disabled={formDisabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="turno-cierra-manana">Cierra mañana</Label>
            <Input
              id="turno-cierra-manana"
              type="time"
              value={cierraManana}
              onChange={(e) => setCierraManana(e.target.value)}
              disabled={formDisabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="turno-abre-tarde">Abre tarde</Label>
            <Input
              id="turno-abre-tarde"
              type="time"
              value={abreTarde}
              onChange={(e) => setAbreTarde(e.target.value)}
              disabled={formDisabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="turno-cierra-tarde">Cierra tarde</Label>
            <Input
              id="turno-cierra-tarde"
              type="time"
              value={cierraTarde}
              onChange={(e) => setCierraTarde(e.target.value)}
              disabled={formDisabled}
            />
          </div>
        </div>
      )}

      <MultiSelectCheckboxes
        label="Especialidades"
        options={especialidadesOrdenadas.map((e) => ({
          id: e.ID_ESPECIALIDAD,
          name: e.ESPECIALIDAD,
        }))}
        selected={especialidadIds}
        onToggle={toggleEspecialidad}
        disabled={assignmentFieldsLocked}
      />
    </form>
  ) : null;

  if (embedded) {
    if (!open) return null;
    return formBody;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Formulario de disponibilidad horaria
          </DialogDescription>
        </DialogHeader>
        {formBody}
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            {readOnly ? "Cerrar" : "Cancelar"}
          </Button>
          {!readOnly && (
            <Button type="submit" form="turno-form" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
