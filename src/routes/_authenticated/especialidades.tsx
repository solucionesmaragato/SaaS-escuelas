import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil } from "lucide-react";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/especialidades")({
  component: EspecialidadesPage,
});

function EspecialidadesPage() {
  const { rol } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const { list, create, update, remove } = useEspecialidades();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EspecialidadData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<EspecialidadData | null>(null);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (e) =>
        e.ESPECIALIDAD?.toLowerCase().includes(q) ||
        (isMaster && e.ID_CLIENTE?.toLowerCase().includes(q)) ||
        (isMaster && e.ID_ESPECIALIDAD?.toLowerCase().includes(q)),
    );
  }, [list.data, query, isMaster]);

  const colSpan = isMaster ? 4 : canMutate ? 2 : 1;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Especialidades</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} registradas en el sistema
          </p>
        </div>
        {canMutate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva especialidad
          </Button>
        )}
      </div>

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
                    className={
                      canMutate
                        ? "cursor-pointer hover:bg-muted/50 transition-colors"
                        : undefined
                    }
                    onClick={canMutate ? () => setEditing(e) : undefined}
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
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(e)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            {isMaster && (
                              <DropdownMenuItem
                                onClick={() => setDeleting(e)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                              </DropdownMenuItem>
                            )}
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
          onSubmit={async (values) => {
            try {
              await create.mutateAsync(values);
              toast.success("Especialidad creada");
              setCreating(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al crear");
            }
          }}
        />
      )}

      {editing && canMutate && (
        <EspecialidadFormDialog
          open
          onClose={() => setEditing(null)}
          title="Editar especialidad"
          submitLabel="Guardar"
          isMaster={isMaster}
          initial={editing}
          submitting={update.isPending}
          onSubmit={async (values) => {
            try {
              await update.mutateAsync({ id: editing.ID_ESPECIALIDAD, patch: values });
              toast.success("Especialidad actualizada");
              setEditing(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al actualizar");
            }
          }}
        />
      )}

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
  onSubmit: (values: EspecialidadUpdateInput) => void;
};

type EspecialidadFormDialogProps =
  | EspecialidadFormDialogCreateProps
  | EspecialidadFormDialogEditProps;

function EspecialidadFormDialog(props: EspecialidadFormDialogProps) {
  const { open, onClose, title, submitLabel, isMaster, submitting } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;

  const { list: clientesList } = useClientes();
  const clientes = clientesList.data ?? [];

  const [nombre, setNombre] = useState("");
  const [idCliente, setIdCliente] = useState("");

  useEffect(() => {
    if (open) {
      setNombre(initial?.ESPECIALIDAD ?? "");
      setIdCliente(initial?.ID_CLIENTE ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
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

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || (isMaster && !isEdit && !idCliente)}
            >
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
