import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil } from "lucide-react";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/aulas")({
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

function AulasPage() {
  const { rol } = useActiveTenant();
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
  const [editing, setEditing] = useState<AulaData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AulaData | null>(null);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
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
  }, [list.data, query, isMaster, especialidadNombreById]);

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aulas</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} registradas en el sistema
          </p>
        </div>
        {canMutate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nueva aula
          </Button>
        )}
      </div>

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
                    className={
                      canMutate
                        ? "cursor-pointer hover:bg-muted/50 transition-colors"
                        : undefined
                    }
                    onClick={canMutate ? () => setEditing(a) : undefined}
                  >
                    {isMaster && (
                      <TableCell className="font-mono text-xs">{a.ID_AULA}</TableCell>
                    )}
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
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(a)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            {isMaster && (
                              <DropdownMenuItem
                                onClick={() => setDeleting(a)}
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
        <AulaFormDialog
          open={creating}
          onClose={() => setCreating(false)}
          title="Nueva aula"
          submitLabel="Crear"
          isMaster={isMaster}
          submitting={create.isPending}
          onSubmit={async (values) => {
            try {
              await create.mutateAsync(values);
              toast.success("Aula creada");
              setCreating(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al crear");
            }
          }}
        />
      )}

      {editing && canMutate && (
        <AulaFormDialog
          open
          onClose={() => setEditing(null)}
          title="Editar aula"
          submitLabel="Guardar"
          isMaster={isMaster}
          initial={editing}
          submitting={update.isPending}
          onSubmit={async (values) => {
            try {
              await update.mutateAsync({ id: editing.ID_AULA, patch: values });
              toast.success("Aula actualizada");
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
  onSubmit: (values: AulaUpdateInput) => void;
};

type AulaFormDialogProps = AulaFormDialogCreateProps | AulaFormDialogEditProps;

function AulaFormDialog(props: AulaFormDialogProps) {
  const { open, onClose, title, submitLabel, isMaster, submitting } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;

  const { tenantId } = useActiveTenant();
  const { list: clientesList } = useClientes();
  const { list: especialidadesList } = useEspecialidades();
  const clientes = clientesList.data ?? [];

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
        initial?.CAPACIDAD != null && initial.CAPACIDAD !== 0
          ? String(initial.CAPACIDAD)
          : "",
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
        </form>
      </DialogContent>
    </Dialog>
  );
}
