import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, MoreVertical, Plus, Search, Pencil, X } from "lucide-react";
import {
  useAulas,
  type AulaCreateInput,
  type AulaData,
  type AulaUpdateInput,
} from "@/hooks/useAulas";
import { useClientes } from "@/hooks/useClientes";
import { useEspecialidades } from "@/hooks/useEspecialidades";
import { useActiveTenant } from "@/context/AppContext";
import { canManageUsuarios, isMasterRole, isProfesorRole } from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type AulasSearch = {
  aulaId?: string;
};

export const Route = createFileRoute("/_authenticated/aulas")({
  validateSearch: (search: Record<string, unknown>): AulasSearch => {
    const aulaId = search.aulaId;
    return typeof aulaId === "string" && aulaId ? { aulaId } : {};
  },
  component: AulasPage,
});

function formatEspecialidadNombres(
  ids: string[],
  especialidadNombreById: Map<string, string>,
): string {
  if (!ids.length) return "—";
  return ids.map((id) => especialidadNombreById.get(id) ?? id).join(", ");
}

function formatCapacidad(value: number | null | undefined): string {
  if (value == null || value === 0) return "N/D";
  return String(value);
}

function parseCapacidadInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

type PendingSave =
  | { kind: "create"; values: AulaCreateInput }
  | { kind: "update"; id: string; values: AulaUpdateInput };

function AulaDetailOverlay({
  open,
  mode,
  aula,
  canMutate,
  isMaster,
  submitting,
  especialidadNombreById,
  onClose,
  onEdit,
  onCancelEdit,
  onRequestSave,
}: {
  open: boolean;
  mode: "detail" | "edit";
  aula: AulaData | null;
  canMutate: boolean;
  isMaster: boolean;
  submitting: boolean;
  especialidadNombreById: Map<string, string>;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRequestSave: (values: AulaUpdateInput) => void;
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

  if (!aula) {
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
            "max-w-md flex items-center justify-center p-6",
          )}
        >
          <Skeleton className="h-8 w-48" />
        </div>
      </>,
      document.body,
    );
  }

  const especialidadesLabel =
    aula.TEXTO_ESPECIALIDADES ||
    formatEspecialidadNombres(aula.ESPECIALIDAD, especialidadNombreById);

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle del aula"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="aula-overlay-title"
        className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "max-w-md p-6")}
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
                <h2 id="aula-overlay-title" className="truncate text-xl font-semibold">
                  Editar aula
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
            <AulaFormDialog
              open
              embedded
              title="Editar aula"
              submitLabel="Guardar"
              isMaster={isMaster}
              initial={aula}
              submitting={submitting}
              onClose={onCancelEdit}
              onSubmit={onRequestSave}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="aula-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="aula-overlay-title" className="truncate text-xl font-semibold">
                  Vista detalle
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
              {isMaster && (
                <>
                  <div>
                    <dt className="text-muted-foreground">ID_AULA</dt>
                    <dd className="font-mono text-xs">{aula.ID_AULA}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ID_CLIENTE</dt>
                    <dd className="font-mono text-xs">{aula.ID_CLIENTE}</dd>
                  </div>
                </>
              )}
              <div>
                <dt className="text-muted-foreground">Nombre aula</dt>
                <dd className="font-semibold">{aula.NOMBRE_AULA}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Capacidad</dt>
                <dd className="tabular-nums">{formatCapacidad(aula.CAPACIDAD)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Especialidad</dt>
                <dd>{especialidadesLabel}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function AulasPage() {
  const { rol } = useActiveTenant();
  const { aulaId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const { list, create, update, remove } = useAulas();
  const { list: especialidadesList } = useEspecialidades();

  const especialidadNombreById = useMemo(() => {
    const map = new Map<string, string>();
    for (const esp of especialidadesList.data ?? []) {
      map.set(esp.ID_ESPECIALIDAD, esp.ESPECIALIDAD);
    }
    return map;
  }, [especialidadesList.data]);

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AulaData | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  const aulas = useMemo(() => list.data ?? [], [list.data]);

  const overlayAula = useMemo(
    () => aulas.find((a) => a.ID_AULA === overlay?.id) ?? null,
    [aulas, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => {
    setOverlay(null);
    navigate({ search: (prev) => ({ ...prev, aulaId: undefined }), replace: true });
  }, [navigate]);
  const handleEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
  }, []);

  useEffect(() => {
    if (aulaId) {
      setOverlay({ id: aulaId, mode: "detail" });
    }
  }, [aulaId]);

  const executePendingSave = async () => {
    if (!pendingSave) return;
    try {
      if (pendingSave.kind === "create") {
        await create.mutateAsync(pendingSave.values);
        toast.success("Aula creada");
        setCreating(false);
      } else {
        await update.mutateAsync({
          id: pendingSave.id,
          patch: pendingSave.values,
        });
        toast.success("Aula actualizada");
        setOverlay((prev) =>
          prev?.id === pendingSave.id ? { id: pendingSave.id, mode: "detail" } : prev,
        );
      }
      setPendingSave(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    }
  };

  const filtered = useMemo(() => {
    const rows = aulas;
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((a) => {
      const espNombres = formatEspecialidadNombres(a.ESPECIALIDAD, especialidadNombreById);
      return (
        a.NOMBRE_AULA?.toLowerCase().includes(q) ||
        espNombres.toLowerCase().includes(q) ||
        (isMaster && a.ID_CLIENTE?.toLowerCase().includes(q)) ||
        (isMaster && a.ID_AULA?.toLowerCase().includes(q))
      );
    });
  }, [aulas, query, isMaster, especialidadNombreById]);

  if (isProfesorRole(rol)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const colSpan = isMaster ? 6 : canMutate ? 4 : 3;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title="Aulas"
        description={`${aulas.length} registradas en el sistema`}
        actions={
          canMutate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva aula
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por aula o especialidad..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar aulas: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isMaster && <TableHead>ID_AULA</TableHead>}
                {isMaster && <TableHead>ID_CLIENTE</TableHead>}
                <TableHead>Nombre aula</TableHead>
                <TableHead>Capacidad</TableHead>
                <TableHead>Especialidad</TableHead>
                {canMutate && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={colSpan}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "Aún no hay aulas registradas."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow
                    key={a.ID_AULA}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: a.ID_AULA, mode: "detail" })}
                  >
                    {isMaster && <TableCell className="font-mono text-xs">{a.ID_AULA}</TableCell>}
                    {isMaster && (
                      <TableCell className="font-mono text-xs">{a.ID_CLIENTE}</TableCell>
                    )}
                    <TableCell className="font-medium">{a.NOMBRE_AULA}</TableCell>
                    <TableCell className="tabular-nums">{formatCapacidad(a.CAPACIDAD)}</TableCell>
                    <TableCell>
                      {formatEspecialidadNombres(a.ESPECIALIDAD, especialidadNombreById)}
                    </TableCell>
                    {canMutate && (
                      <TableCell onClick={(ev) => ev.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setOverlay({ id: a.ID_AULA, mode: "edit" })}
                            >
                              <Pencil className="mr-2 h-4 w-4" /> Editar
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

      {canMutate && (
        <AulaFormDialog
          open={creating}
          onClose={() => setCreating(false)}
          title="Nueva aula"
          submitLabel="Crear"
          isMaster={isMaster}
          submitting={create.isPending}
          onSubmit={(values) => {
            setPendingSave({ kind: "create", values });
          }}
        />
      )}

      <AulaDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        aula={overlayAula}
        canMutate={canMutate}
        isMaster={isMaster}
        submitting={update.isPending}
        especialidadNombreById={especialidadNombreById}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onRequestSave={(values) => {
          if (!overlay?.id) return;
          setPendingSave({ kind: "update", id: overlay.id, values });
        }}
      />

      <AlertDialog open={!!pendingSave} onOpenChange={(o) => !o && setPendingSave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar guardado?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSave?.kind === "create"
                ? "Se creará una nueva aula en el sistema. ¿Deseas continuar?"
                : "Se actualizarán los datos de esta aula. ¿Deseas continuar?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={create.isPending || update.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={create.isPending || update.isPending}
              onClick={(e) => {
                e.preventDefault();
                void executePendingSave();
              }}
            >
              {create.isPending || update.isPending ? "Guardando..." : "Confirmar y guardar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isMaster && (
        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar aula</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará el aula <b>{deleting?.NOMBRE_AULA}</b>. Esta acción no se puede
                deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!deleting) return;
                  try {
                    await remove.mutateAsync(deleting.ID_AULA);
                    toast.success("Aula eliminada");
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
      )}
    </div>
  );
}

type AulaFormDialogCreateProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  isMaster: boolean;
  initial?: undefined;
  submitting: boolean;
  embedded?: boolean;
  onSubmit: (values: AulaCreateInput) => void;
};

type AulaFormDialogEditProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  isMaster: boolean;
  initial: AulaData;
  submitting: boolean;
  embedded?: boolean;
  onSubmit: (values: AulaUpdateInput) => void;
};

type AulaFormDialogProps = AulaFormDialogCreateProps | AulaFormDialogEditProps;

function AulaFormDialog(props: AulaFormDialogProps) {
  const { open, onClose, title, submitLabel, isMaster, submitting, embedded } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;

  const { tenantId } = useActiveTenant();
  const { list: clientesList } = useClientes();
  const { list: especialidadesList } = useEspecialidades();
  const clientes = useMemo(() => clientesList.data ?? [], [clientesList.data]);

  const [nombre, setNombre] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [idCliente, setIdCliente] = useState("");
  const [especialidadIds, setEspecialidadIds] = useState<string[]>([]);

  const effectiveIdCliente = isMaster ? idCliente : tenantId;

  const especialidadesFiltradas = useMemo(() => {
    const rows = especialidadesList.data ?? [];
    if (!effectiveIdCliente) return [];
    return rows
      .filter((e) => e.ID_CLIENTE === effectiveIdCliente)
      .sort((a, b) => a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", { sensitivity: "base" }));
  }, [especialidadesList.data, effectiveIdCliente]);

  useEffect(() => {
    if (open) {
      setNombre(initial?.NOMBRE_AULA ?? "");
      setCapacidad(
        initial?.CAPACIDAD != null && initial.CAPACIDAD !== 0 ? String(initial.CAPACIDAD) : "",
      );
      setIdCliente(initial?.ID_CLIENTE ?? "");
      setEspecialidadIds(initial?.ESPECIALIDAD ?? []);
    }
  }, [open, initial]);

  const handleClienteChange = (clienteId: string) => {
    setIdCliente(clienteId);
    setEspecialidadIds([]);
  };

  const toggleEspecialidad = (id: string) => {
    setEspecialidadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const masterNeedsCliente = isMaster && !isEdit && !idCliente;

  const formBody = (
    <form
      id={embedded ? "aula-form" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        if (!especialidadIds.length) {
          toast.error("Debes seleccionar al menos una especialidad");
          return;
        }

        const capacidadParsed = parseCapacidadInput(capacidad);

        if (isEdit && initial) {
          const patch: AulaUpdateInput = {
            NOMBRE_AULA: nombre.trim(),
            ESPECIALIDAD: especialidadIds,
            CAPACIDAD: capacidadParsed,
          };
          (props as AulaFormDialogEditProps).onSubmit(patch);
          return;
        }

        const payload: AulaCreateInput = {
          NOMBRE_AULA: nombre.trim(),
          ESPECIALIDAD: especialidadIds,
          CAPACIDAD: capacidadParsed,
          ...(isMaster ? { ID_CLIENTE: idCliente } : {}),
        };
        (props as AulaFormDialogCreateProps).onSubmit(payload);
      }}
      className="space-y-4"
    >
      {isMaster && isEdit && initial && (
        <div className="space-y-2">
          <Label>ID_AULA</Label>
          <Input value={initial.ID_AULA} disabled readOnly className="font-mono text-sm" />
        </div>
      )}

      {isMaster && (
        <div className="space-y-2">
          <Label>ID_CLIENTE{!isEdit ? " *" : ""}</Label>
          {isEdit ? (
            <Input value={idCliente} disabled readOnly className="font-mono text-sm" />
          ) : clientes.length > 0 ? (
            <Select value={idCliente} onValueChange={handleClienteChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.ID_CLIENTE} value={c.ID_CLIENTE}>
                    {c.NOMBRE_ESCUELA} ({c.ID_CLIENTE})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={idCliente} onChange={(e) => handleClienteChange(e.target.value)} />
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Nombre aula *</Label>
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Aula 1, Sala de ensayo..."
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Capacidad (Nº de alumnos)</Label>
        <Input
          type="number"
          min={0}
          value={capacidad}
          onChange={(e) => setCapacidad(e.target.value)}
          placeholder="Ej. 12"
        />
      </div>

      <div className="space-y-2">
        <Label>Especialidad *</Label>
        {especialidadesList.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : masterNeedsCliente ? (
          <p className="text-sm text-muted-foreground">Selecciona un cliente primero...</p>
        ) : especialidadesFiltradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay especialidades disponibles para este cliente.
          </p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
            {especialidadesFiltradas.map((esp) => (
              <label
                key={esp.ID_ESPECIALIDAD}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={especialidadIds.includes(esp.ID_ESPECIALIDAD)}
                  onCheckedChange={() => toggleEspecialidad(esp.ID_ESPECIALIDAD)}
                />
                <span>{esp.ESPECIALIDAD}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {!embedded ? (
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              submitting ||
              masterNeedsCliente ||
              especialidadIds.length === 0 ||
              especialidadesFiltradas.length === 0
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
    return formBody;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
