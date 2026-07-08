import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, MoreVertical, Plus, Search, Pencil, X } from "lucide-react";
import {
  useEspecialidades,
  type EspecialidadCreateInput,
  type EspecialidadData,
  type EspecialidadUpdateInput,
} from "@/hooks/useEspecialidades";
import { useClientes } from "@/hooks/useClientes";
import { useActiveTenant } from "@/context/AppContext";
import { canManageUsuarios, isMasterRole } from "@/lib/tenantQuery";
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

export const Route = createFileRoute("/_authenticated/especialidades")({
  component: EspecialidadesPage,
});

type PendingSave =
  | { kind: "create"; values: EspecialidadCreateInput }
  | { kind: "update"; id: string; values: EspecialidadUpdateInput };

function EspecialidadDetailOverlay({
  open,
  mode,
  especialidad,
  canMutate,
  isMaster,
  submitting,
  onClose,
  onEdit,
  onCancelEdit,
  onRequestSave,
}: {
  open: boolean;
  mode: "detail" | "edit";
  especialidad: EspecialidadData | null;
  canMutate: boolean;
  isMaster: boolean;
  submitting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRequestSave: (values: EspecialidadUpdateInput) => void;
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

  if (!especialidad) {
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

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle de la especialidad"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="especialidad-overlay-title"
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
                <h2 id="especialidad-overlay-title" className="truncate text-xl font-semibold">
                  Editar especialidad
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
            <EspecialidadFormDialog
              open
              embedded
              title="Editar especialidad"
              submitLabel="Guardar"
              isMaster={isMaster}
              initial={especialidad}
              submitting={submitting}
              onClose={onCancelEdit}
              onSubmit={onRequestSave}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="especialidad-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="especialidad-overlay-title" className="truncate text-xl font-semibold">
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
                    <dt className="text-muted-foreground">ID_ESPECIALIDAD</dt>
                    <dd className="font-mono text-xs">{especialidad.ID_ESPECIALIDAD}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ID_CLIENTE</dt>
                    <dd className="font-mono text-xs">{especialidad.ID_CLIENTE}</dd>
                  </div>
                </>
              )}
              <div className={isMaster ? "" : "col-span-2"}>
                <dt className="text-muted-foreground">Especialidad</dt>
                <dd className="font-semibold">{especialidad.ESPECIALIDAD}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function EspecialidadesPage() {
  const { rol } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const { list, create, update, remove } = useEspecialidades();

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<EspecialidadData | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  const especialidades = useMemo(() => list.data ?? [], [list.data]);

  const overlayEspecialidad = useMemo(
    () => especialidades.find((e) => e.ID_ESPECIALIDAD === overlay?.id) ?? null,
    [especialidades, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => setOverlay(null), []);
  const handleEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
  }, []);

  const executePendingSave = async () => {
    if (!pendingSave) return;
    try {
      if (pendingSave.kind === "create") {
        await create.mutateAsync(pendingSave.values);
        toast.success("Especialidad creada");
        setCreating(false);
      } else {
        await update.mutateAsync({
          id: pendingSave.id,
          patch: pendingSave.values,
        });
        toast.success("Especialidad actualizada");
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
    const rows = especialidades;
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (e) =>
        e.ESPECIALIDAD?.toLowerCase().includes(q) ||
        (isMaster && e.ID_CLIENTE?.toLowerCase().includes(q)) ||
        (isMaster && e.ID_ESPECIALIDAD?.toLowerCase().includes(q)),
    );
  }, [especialidades, query, isMaster]);

  const colSpan = isMaster ? 4 : canMutate ? 2 : 1;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Especialidades"
        description={`${especialidades.length} registradas en el sistema`}
        actions={
          canMutate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva especialidad
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar especialidad..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar especialidades: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isMaster && <TableHead>ID_ESPECIALIDAD</TableHead>}
                {isMaster && <TableHead>ID_CLIENTE</TableHead>}
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
                    {query ? "Sin resultados." : "Aún no hay especialidades registradas."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow
                    key={e.ID_ESPECIALIDAD}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: e.ID_ESPECIALIDAD, mode: "detail" })}
                  >
                    {isMaster && (
                      <TableCell className="font-mono text-xs">{e.ID_ESPECIALIDAD}</TableCell>
                    )}
                    {isMaster && (
                      <TableCell className="font-mono text-xs">{e.ID_CLIENTE}</TableCell>
                    )}
                    <TableCell className="font-medium">{e.ESPECIALIDAD}</TableCell>
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
                              onClick={() => setOverlay({ id: e.ID_ESPECIALIDAD, mode: "edit" })}
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
        <EspecialidadFormDialog
          open={creating}
          onClose={() => setCreating(false)}
          title="Nueva especialidad"
          submitLabel="Crear"
          isMaster={isMaster}
          submitting={create.isPending}
          onSubmit={(values) => {
            setPendingSave({ kind: "create", values });
          }}
        />
      )}

      <EspecialidadDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        especialidad={overlayEspecialidad}
        canMutate={canMutate}
        isMaster={isMaster}
        submitting={update.isPending}
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
                ? "Se creará una nueva especialidad en el sistema. ¿Deseas continuar?"
                : "Se actualizarán los datos de esta especialidad. ¿Deseas continuar?"}
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
              <AlertDialogTitle>Eliminar especialidad</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará la especialidad <b>{deleting?.ESPECIALIDAD}</b>. Esta acción no se
                puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!deleting) return;
                  try {
                    await remove.mutateAsync(deleting.ID_ESPECIALIDAD);
                    toast.success("Especialidad eliminada");
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

type EspecialidadFormDialogCreateProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  isMaster: boolean;
  initial?: undefined;
  submitting: boolean;
  embedded?: boolean;
  onSubmit: (values: EspecialidadCreateInput) => void;
};

type EspecialidadFormDialogEditProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  isMaster: boolean;
  initial: EspecialidadData;
  submitting: boolean;
  embedded?: boolean;
  onSubmit: (values: EspecialidadUpdateInput) => void;
};

type EspecialidadFormDialogProps =
  | EspecialidadFormDialogCreateProps
  | EspecialidadFormDialogEditProps;

function EspecialidadFormDialog(props: EspecialidadFormDialogProps) {
  const { open, onClose, title, submitLabel, isMaster, submitting, embedded } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;

  const { list: clientesList } = useClientes();
  const clientes = useMemo(() => clientesList.data ?? [], [clientesList.data]);

  const [nombre, setNombre] = useState("");
  const [idCliente, setIdCliente] = useState("");

  useEffect(() => {
    if (open) {
      setNombre(initial?.ESPECIALIDAD ?? "");
      setIdCliente(initial?.ID_CLIENTE ?? "");
    }
  }, [open, initial]);

  const formBody = (
    <form
      id={embedded ? "especialidad-form" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!nombre.trim()) return;

        if (isEdit && initial) {
          const patch: EspecialidadUpdateInput = { ESPECIALIDAD: nombre.trim() };
          (props as EspecialidadFormDialogEditProps).onSubmit(patch);
          return;
        }

        const payload: EspecialidadCreateInput = {
          ESPECIALIDAD: nombre.trim(),
          ...(isMaster ? { ID_CLIENTE: idCliente } : {}),
        };
        (props as EspecialidadFormDialogCreateProps).onSubmit(payload);
      }}
      className="space-y-4"
    >
      {isMaster && isEdit && initial && (
        <div className="space-y-2">
          <Label>ID_ESPECIALIDAD</Label>
          <Input value={initial.ID_ESPECIALIDAD} disabled readOnly className="font-mono text-sm" />
        </div>
      )}

      {isMaster && (
        <div className="space-y-2">
          <Label>ID_CLIENTE{!isEdit ? " *" : ""}</Label>
          {isEdit ? (
            <Input value={idCliente} disabled readOnly className="font-mono text-sm" />
          ) : clientes.length > 0 ? (
            <Select value={idCliente} onValueChange={setIdCliente}>
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
            <Input value={idCliente} onChange={(e) => setIdCliente(e.target.value)} />
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Especialidad *</Label>
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej. Guitarra, Piano, Lenguaje Musical..."
          required
        />
      </div>

      {!embedded ? (
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || (isMaster && !isEdit && !idCliente)}>
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
