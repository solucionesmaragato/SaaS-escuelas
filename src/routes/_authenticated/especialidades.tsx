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
import { useCentros } from "@/hooks/useCentros";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { useActiveTenant } from "@/context/AppContext";
import { hasPermission } from "@/lib/rbac";
import { canManageUsuarios, isAdminRole, isMasterRole } from "@/lib/tenantQuery";
import {
  CATALOG_ALL_CENTROS_LABEL,
  filterCatalogByCenter,
  formatCatalogCentroLabel,
} from "@/lib/catalogCenterFilter";
import { ALL_CENTROS_FILTER_VALUE } from "@/lib/centroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
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
import { ModalBackdrop } from "@/components/ui/modal-overlay";
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
  centroNombreById,
  canChooseCentro,
  centrosOrdenados,
  profileCenterId,
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
  centroNombreById: Map<string, string>;
  canChooseCentro: boolean;
  centrosOrdenados: { ID_CENTRO: string; NOMBRE_CENTRO: string }[];
  profileCenterId: string | null;
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
        <ModalBackdrop ariaLabel="Cerrar" onClose={onClose} />
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
      <ModalBackdrop ariaLabel="Cerrar detalle de la especialidad" onClose={onClose} />
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
              canChooseCentro={canChooseCentro}
              centrosOrdenados={centrosOrdenados}
              profileCenterId={profileCenterId}
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
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 [&>*]:min-w-0">
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
              <div className={isMaster ? "" : "col-span-2"}>
                <dt className="text-muted-foreground">Centro</dt>
                <dd>{formatCatalogCentroLabel(especialidad.ID_CENTRO, centroNombreById)}</dd>
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
  const { rol, centerId: profileCenterId } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const isAdminOrMaster = isMaster || isAdminRole(rol);
  const canMutate = canManageUsuarios(rol);
  const canChooseCentro = isMaster || (isAdminRole(rol) && !profileCenterId);
  const { list, create, update, remove } = useEspecialidades();
  const { list: centrosList } = useCentros();
  const { centrosOrdenados, showCentroFilter, selectedCenterId, setSelectedCenterId } =
    useAdminCentroFilter();
  const showAdminCentroFilter = isAdminOrMaster && showCentroFilter;

  const centroNombreById = useMemo(() => {
    const map = new Map<string, string>();
    for (const centro of centrosList.data ?? []) {
      map.set(centro.ID_CENTRO, centro.NOMBRE_CENTRO);
    }
    return map;
  }, [centrosList.data]);

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
    let rows = especialidades;
    if (showAdminCentroFilter && selectedCenterId) {
      rows = filterCatalogByCenter(rows, selectedCenterId);
    }
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (e) =>
        e.ESPECIALIDAD?.toLowerCase().includes(q) ||
        formatCatalogCentroLabel(e.ID_CENTRO, centroNombreById).toLowerCase().includes(q) ||
        (isMaster && e.ID_CLIENTE?.toLowerCase().includes(q)) ||
        (isMaster && e.ID_ESPECIALIDAD?.toLowerCase().includes(q)),
    );
  }, [especialidades, query, isMaster, showAdminCentroFilter, selectedCenterId, centroNombreById]);

  const colSpan = isMaster ? 5 : canMutate ? 3 : 2;

  if (!hasPermission(rol, "especialidades:write")) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Especialidades"
        description={`${filtered.length} registradas en el sistema`}
        actions={
          canMutate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nueva especialidad
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar especialidad..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {showAdminCentroFilter && (
            <CentroTableFilter
              id="especialidades-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
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
                <TableHead>Centro</TableHead>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCatalogCentroLabel(e.ID_CENTRO, centroNombreById)}
                    </TableCell>
                    {canMutate && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => e.stopPropagation()}
                            >
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
          canChooseCentro={canChooseCentro}
          centrosOrdenados={centrosOrdenados}
          profileCenterId={profileCenterId}
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
        centroNombreById={centroNombreById}
        canChooseCentro={canChooseCentro}
        centrosOrdenados={centrosOrdenados}
        profileCenterId={profileCenterId}
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
  canChooseCentro: boolean;
  centrosOrdenados: { ID_CENTRO: string; NOMBRE_CENTRO: string }[];
  profileCenterId: string | null;
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
  canChooseCentro: boolean;
  centrosOrdenados: { ID_CENTRO: string; NOMBRE_CENTRO: string }[];
  profileCenterId: string | null;
  onSubmit: (values: EspecialidadUpdateInput) => void;
};

type EspecialidadFormDialogProps =
  | EspecialidadFormDialogCreateProps
  | EspecialidadFormDialogEditProps;

function EspecialidadFormDialog(props: EspecialidadFormDialogProps) {
  const {
    open,
    onClose,
    title,
    submitLabel,
    isMaster,
    submitting,
    embedded,
    canChooseCentro,
    centrosOrdenados,
    profileCenterId,
  } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;

  const { list: clientesList } = useClientes();
  const clientes = useMemo(() => clientesList.data ?? [], [clientesList.data]);

  const [nombre, setNombre] = useState("");
  const [idCliente, setIdCliente] = useState("");
  const [idCentro, setIdCentro] = useState(ALL_CENTROS_FILTER_VALUE);

  useEffect(() => {
    if (open) {
      setNombre(initial?.ESPECIALIDAD ?? "");
      setIdCliente(initial?.ID_CLIENTE ?? "");
      if (canChooseCentro) {
        setIdCentro(initial?.ID_CENTRO ?? ALL_CENTROS_FILTER_VALUE);
      } else {
        setIdCentro(profileCenterId ?? ALL_CENTROS_FILTER_VALUE);
      }
    }
  }, [open, initial, canChooseCentro, profileCenterId]);

  const formBody = (
    <form
      id={embedded ? "especialidad-form" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!nombre.trim()) return;

        if (isEdit && initial) {
          const patch: EspecialidadUpdateInput = {
            ESPECIALIDAD: nombre.trim(),
            ...(canChooseCentro
              ? {
                  ID_CENTRO: idCentro === ALL_CENTROS_FILTER_VALUE ? null : idCentro,
                }
              : {}),
          };
          (props as EspecialidadFormDialogEditProps).onSubmit(patch);
          return;
        }

        const payload: EspecialidadCreateInput = {
          ESPECIALIDAD: nombre.trim(),
          ...(isMaster ? { ID_CLIENTE: idCliente } : {}),
          ...(canChooseCentro
            ? {
                ID_CENTRO: idCentro === ALL_CENTROS_FILTER_VALUE ? null : idCentro,
              }
            : {}),
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

      {canChooseCentro ? (
        <div className="space-y-2">
          <Label htmlFor="especialidad-centro">Centro</Label>
          <Select value={idCentro} onValueChange={setIdCentro}>
            <SelectTrigger id="especialidad-centro">
              <SelectValue placeholder="Seleccionar centro" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CENTROS_FILTER_VALUE}>{CATALOG_ALL_CENTROS_LABEL}</SelectItem>
              {centrosOrdenados.map((centro) => (
                <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                  {centro.NOMBRE_CENTRO}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : profileCenterId ? (
        <div className="space-y-2">
          <Label>Centro</Label>
          <Input
            value={
              centrosOrdenados.find((c) => c.ID_CENTRO === profileCenterId)?.NOMBRE_CENTRO ??
              profileCenterId
            }
            readOnly
            disabled
          />
        </div>
      ) : null}

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
