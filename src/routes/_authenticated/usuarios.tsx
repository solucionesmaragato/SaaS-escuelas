import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil } from "lucide-react";
import {
  usePerfiles,
  type PerfilCreateInput,
  type PerfilData,
  type PerfilUpdateInput,
} from "@/hooks/usePerfiles";
import { useClientes } from "@/hooks/useClientes";
import { useProfesores } from "@/hooks/useProfesores";
import { useActiveTenant } from "@/context/AppContext";
import { ROLE_LABEL } from "@/lib/rbac";
import {
  formatProfesorOptionLabel,
  profesorSelectorOptions,
} from "@/lib/profesorSelector";
import {
  canManageUsuarios,
  canViewUsuariosYMensajes,
  isMasterRole,
  isProfesorRole,
} from "@/lib/tenantQuery";
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
import type { Rol } from "@/types/database";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
});

const ROL_OPTIONS_BASE: { value: Rol; label: string }[] = [
  { value: "ADMIN", label: "Administrador" },
  { value: "DIRECCION", label: "Dirección" },
  { value: "SECRETARIA", label: "Secretaría" },
  { value: "PROFESOR", label: "Profesor" },
];

const ROL_OPTIONS_MASTER: { value: Rol; label: string }[] = [
  { value: "MASTER", label: "Master" },
  ...ROL_OPTIONS_BASE,
];

const ESTADO_OPTIONS = [
  { value: "ACTIVO", label: "Activo" },
  { value: "INACTIVO", label: "Inactivo" },
] as const;

function formatCreatedAt(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRol(rol: string | null | undefined): string {
  if (!rol) return "—";
  return ROLE_LABEL[rol as Rol] ?? rol;
}

function formatEstado(estado: string | null | undefined): string {
  if (!estado) return "—";
  const upper = estado.toUpperCase();
  if (upper === "ACTIVO") return "Activo";
  if (upper === "INACTIVO") return "Inactivo";
  return estado;
}

function UsuariosPage() {
  const { rol } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const canView = canViewUsuariosYMensajes(rol);
  const { list, create, update, remove } = usePerfiles();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PerfilData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PerfilData | null>(null);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (p) =>
        p.NOMBRE?.toLowerCase().includes(q) ||
        p.EMAIL?.toLowerCase().includes(q) ||
        p.ROL?.toLowerCase().includes(q) ||
        p.ESTADO?.toLowerCase().includes(q) ||
        p.ID_CLIENTE?.toLowerCase().includes(q),
    );
  }, [list.data, query]);

  if (isProfesorRole(rol) || !canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const colSpan = isMaster ? 8 : canMutate ? 6 : 5;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} perfiles registrados
          </p>
        </div>
        {canMutate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo usuario
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email, rol o estado..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar usuarios: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isMaster && <TableHead>ID_CLIENTE</TableHead>}
                <TableHead>NOMBRE</TableHead>
                <TableHead>EMAIL</TableHead>
                <TableHead>ROL</TableHead>
                <TableHead>ESTADO</TableHead>
                {isMaster && <TableHead>ID_PROFESOR</TableHead>}
                <TableHead>Fecha de alta</TableHead>
                {canMutate && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={colSpan}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "Aún no hay usuarios registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow
                    key={p.ID_PERFIL}
                    className={
                      canMutate
                        ? "cursor-pointer hover:bg-muted/50 transition-colors"
                        : undefined
                    }
                    onClick={canMutate ? () => setEditing(p) : undefined}
                  >
                    {isMaster && (
                      <TableCell className="font-mono text-xs">{p.ID_CLIENTE}</TableCell>
                    )}
                    <TableCell className="font-medium">{p.NOMBRE}</TableCell>
                    <TableCell>{p.EMAIL}</TableCell>
                    <TableCell>{formatRol(p.ROL)}</TableCell>
                    <TableCell>{formatEstado(p.ESTADO)}</TableCell>
                    {isMaster && (
                      <TableCell className="font-mono text-xs">
                        {p.ID_PROFESOR ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-muted-foreground">
                      {formatCreatedAt(p.created_at)}
                    </TableCell>
                    {canMutate && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(p)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleting(p)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
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
        <PerfilFormDialog
          open={creating}
          onClose={() => setCreating(false)}
          title="Nuevo usuario"
          submitLabel="Crear"
          isMaster={isMaster}
          submitting={create.isPending}
          onSubmit={async (values) => {
            try {
              await create.mutateAsync(values);
              toast.success("Usuario creado");
              setCreating(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al crear");
            }
          }}
        />
      )}

      {canMutate && editing && (
      <PerfilFormDialog
        open
        onClose={() => setEditing(null)}
        title="Editar usuario"
        submitLabel="Guardar"
        isMaster={isMaster}
        initial={editing}
        submitting={update.isPending}
        onSubmit={async (values) => {
          try {
            await update.mutateAsync({ id: editing.ID_PERFIL, patch: values });
            toast.success("Usuario actualizado");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />
      )}

      {canMutate && (
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el perfil de <b>{deleting?.NOMBRE}</b> ({deleting?.EMAIL}). Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_PERFIL);
                  toast.success("Usuario eliminado");
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

type PerfilFormDialogBaseProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  isMaster: boolean;
  submitting: boolean;
};

type PerfilFormDialogCreateProps = PerfilFormDialogBaseProps & {
  initial?: undefined;
  onSubmit: (values: PerfilCreateInput) => void;
};

type PerfilFormDialogEditProps = PerfilFormDialogBaseProps & {
  initial: PerfilData;
  onSubmit: (values: PerfilUpdateInput) => void;
};

type PerfilFormDialogProps = PerfilFormDialogCreateProps | PerfilFormDialogEditProps;

function PerfilFormDialog(props: PerfilFormDialogProps) {
  const { open, onClose, title, submitLabel, isMaster, submitting } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const { tenantId } = useActiveTenant();
  const { list: clientesList } = useClientes();
  const { list: profesoresList } = useProfesores();
  const isEdit = initial != null;

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rolValue, setRolValue] = useState<Rol>("ADMIN");
  const [estado, setEstado] = useState<string>("ACTIVO");
  const [idCliente, setIdCliente] = useState("");
  const [idProfesor, setIdProfesor] = useState("");

  const effectiveIdCliente = isMaster ? idCliente : tenantId;
  const masterNeedsCliente = isMaster && !effectiveIdCliente;

  const profesoresRows = profesoresList.data?.profesores ?? [];

  const profesoresFiltrados = useMemo(() => {
    if (!effectiveIdCliente) return [];
    const scoped = profesoresRows.filter((p) => p.ID_CLIENTE === effectiveIdCliente);
    return profesorSelectorOptions(scoped, idProfesor);
  }, [profesoresRows, effectiveIdCliente, idProfesor]);

  const applyTrabajador = (profesorId: string) => {
    setIdProfesor(profesorId);
    const prof = profesoresFiltrados.find((p) => p.ID_PROFESOR === profesorId);
    if (prof) {
      setNombre(prof.NOMBRE_PROFESOR);
      setEmail(prof.EMAIL_PROFESORES ?? "");
    }
  };

  const clearTrabajador = () => {
    setIdProfesor("");
    setNombre("");
    setEmail("");
  };

  const handleClienteChange = (clienteId: string) => {
    setIdCliente(clienteId);
    clearTrabajador();
  };

  useEffect(() => {
    if (open) {
      setRolValue((initial?.ROL as Rol) ?? "ADMIN");
      setEstado(initial?.ESTADO?.toUpperCase() === "INACTIVO" ? "INACTIVO" : "ACTIVO");
      setIdCliente(isMaster ? (initial?.ID_CLIENTE ?? "") : tenantId);

      const profId = initial?.ID_PROFESOR ?? "";
      if (profId) {
        setIdProfesor(profId);
        const prof = profesoresRows.find((p) => p.ID_PROFESOR === profId);
        setNombre(prof?.NOMBRE_PROFESOR ?? initial?.NOMBRE ?? "");
        setEmail(prof?.EMAIL_PROFESORES ?? initial?.EMAIL ?? "");
      } else {
        clearTrabajador();
      }
    }
  }, [open, initial, tenantId, isMaster, profesoresRows]);

  useEffect(() => {
    if (
      idProfesor &&
      !profesoresFiltrados.some((p) => p.ID_PROFESOR === idProfesor)
    ) {
      clearTrabajador();
    }
  }, [profesoresFiltrados, idProfesor]);

  const clientes = clientesList.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isMaster && !idCliente) {
              toast.error("Debes seleccionar un cliente primero");
              return;
            }
            if (!idProfesor) {
              toast.error("Debes seleccionar un trabajador");
              return;
            }
            if (!nombre.trim()) {
              toast.error("El trabajador seleccionado no tiene nombre registrado");
              return;
            }
            if (!email.trim()) {
              toast.error("El trabajador seleccionado no tiene email registrado");
              return;
            }

            if (isEdit && initial) {
              const patch: PerfilUpdateInput = {
                NOMBRE: nombre.trim(),
                ROL: rolValue,
                ESTADO: estado,
                ID_PROFESOR: idProfesor,
                ...(isMaster ? { ID_CLIENTE: idCliente } : {}),
              };
              (props as PerfilFormDialogEditProps).onSubmit(patch);
              return;
            }

            const payload: PerfilCreateInput = {
              NOMBRE: nombre.trim(),
              EMAIL: email.trim(),
              ROL: rolValue,
              ESTADO: estado,
              ID_PROFESOR: idProfesor,
              ID_CLIENTE: isMaster ? idCliente : tenantId,
            };
            (props as PerfilFormDialogCreateProps).onSubmit(payload);
          }}
          className="space-y-4"
        >
          {isMaster && (
            <div className="space-y-2">
              <Label>ID_CLIENTE *</Label>
              {clientes.length > 0 ? (
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
            <Label htmlFor="perfil-trabajador">Trabajador *</Label>
            {profesoresList.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : masterNeedsCliente ? (
              <Select disabled>
                <SelectTrigger id="perfil-trabajador">
                  <SelectValue placeholder="Selecciona un cliente primero..." />
                </SelectTrigger>
              </Select>
            ) : profesoresFiltrados.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay trabajadores disponibles para este cliente.
              </p>
            ) : (
              <Select
                value={idProfesor}
                onValueChange={applyTrabajador}
                required
              >
                <SelectTrigger id="perfil-trabajador" aria-required="true">
                  <SelectValue placeholder="Seleccionar trabajador *" />
                </SelectTrigger>
                <SelectContent>
                  {profesoresFiltrados.map((p) => (
                    <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                      {formatProfesorOptionLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>EMAIL</Label>
            <Input
              type="email"
              value={email}
              readOnly
              disabled
              placeholder="Se rellena al seleccionar un trabajador"
              className="bg-muted"
            />
          </div>

          <div className="space-y-2">
            <Label>ROL</Label>
            <Select value={rolValue} onValueChange={(v) => setRolValue(v as Rol)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(isMaster ? ROL_OPTIONS_MASTER : ROL_OPTIONS_BASE).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>ESTADO</Label>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADO_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isEdit && initial?.created_at && (
            <p className="text-sm text-muted-foreground">
              Fecha de alta: {formatCreatedAt(initial.created_at)}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                submitting ||
                (isMaster && !idCliente) ||
                masterNeedsCliente ||
                !idProfesor ||
                !nombre.trim() ||
                !email.trim() ||
                profesoresFiltrados.length === 0
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
