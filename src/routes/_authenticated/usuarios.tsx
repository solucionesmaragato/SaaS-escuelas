import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, MoreVertical, Plus, Search, Pencil, X } from "lucide-react";
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
import { formatProfesorOptionLabel, profesorSelectorOptions } from "@/lib/profesorSelector";
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
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntityLink } from "@/components/navigation/EntityLink";
import { cn } from "@/lib/utils";
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

type PendingSave =
  | { kind: "create"; values: PerfilCreateInput }
  | { kind: "update"; id: string; values: PerfilUpdateInput };

type PerfilEditField = "NOMBRE" | "ROL" | "ESTADO" | "ID_PROFESOR" | "ID_CENTRO" | "ID_CLIENTE";

type PerfilFormRecord = {
  NOMBRE: string;
  EMAIL: string;
  ROL: Rol;
  ESTADO: string;
  ID_PROFESOR: string;
  ID_CENTRO: string;
  ID_CLIENTE: string;
};

type PerfilEditSnapshot = {
  NOMBRE: string;
  ROL: Rol;
  ESTADO: string;
  ID_PROFESOR: string;
  ID_CENTRO: string;
  ID_CLIENTE?: string;
};

const PERFIL_ROL_VALUES = [
  "MASTER",
  "ADMIN",
  "DIRECCION",
  "SECRETARIA",
  "PROFESOR",
] as const satisfies readonly Rol[];

function normalizePerfilEstado(estado: string | null | undefined): string {
  return estado?.toUpperCase() === "INACTIVO" ? "INACTIVO" : "ACTIVO";
}

function normalizePerfilRol(rol: string | null | undefined): Rol {
  const upper = (rol ?? "").trim().toUpperCase();
  if ((PERFIL_ROL_VALUES as readonly string[]).includes(upper)) {
    return upper as Rol;
  }
  return "ADMIN";
}

function buildPerfilFormRecord(
  perfil: PerfilData | undefined,
  isMaster: boolean,
  tenantId: string,
  profesoresRows: {
    ID_PROFESOR: string;
    NOMBRE_PROFESOR: string;
    EMAIL_PROFESORES?: string | null;
  }[],
): PerfilFormRecord {
  if (!perfil) {
    return {
      NOMBRE: "",
      EMAIL: "",
      ROL: "ADMIN",
      ESTADO: "ACTIVO",
      ID_PROFESOR: "",
      ID_CENTRO: "",
      ID_CLIENTE: isMaster ? "" : tenantId,
    };
  }

  const profId = perfil.ID_PROFESOR ?? "";
  const prof = profId
    ? profesoresRows.find((p) => p.ID_PROFESOR === profId)
    : undefined;

  return {
    NOMBRE: prof?.NOMBRE_PROFESOR ?? perfil.NOMBRE ?? "",
    EMAIL: prof?.EMAIL_PROFESORES ?? perfil.EMAIL ?? "",
    ROL: normalizePerfilRol(perfil.ROL),
    ESTADO: normalizePerfilEstado(perfil.ESTADO),
    ID_PROFESOR: profId,
    ID_CENTRO: perfil.ID_CENTRO ?? "",
    ID_CLIENTE: isMaster ? (perfil.ID_CLIENTE ?? "") : tenantId,
  };
}

function buildPerfilEditSnapshot(perfil: PerfilData, isMaster: boolean): PerfilEditSnapshot {
  return {
    NOMBRE: (perfil.NOMBRE ?? "").trim(),
    ROL: normalizePerfilRol(perfil.ROL),
    ESTADO: normalizePerfilEstado(perfil.ESTADO),
    ID_PROFESOR: perfil.ID_PROFESOR ?? "",
    ID_CENTRO: perfil.ID_CENTRO ?? "",
    ...(isMaster ? { ID_CLIENTE: perfil.ID_CLIENTE ?? "" } : {}),
  };
}

function buildPerfilUpdatePatch(
  original: PerfilEditSnapshot,
  current: PerfilEditSnapshot,
  dirty: ReadonlySet<PerfilEditField>,
): PerfilUpdateInput {
  const patch: PerfilUpdateInput = {};

  if (dirty.has("NOMBRE") && current.NOMBRE !== original.NOMBRE) {
    patch.NOMBRE = current.NOMBRE;
  }
  if (dirty.has("ROL") && current.ROL !== original.ROL) {
    patch.ROL = current.ROL;
  }
  if (dirty.has("ESTADO") && current.ESTADO !== original.ESTADO) {
    patch.ESTADO = current.ESTADO;
  }
  if (dirty.has("ID_PROFESOR") && current.ID_PROFESOR !== original.ID_PROFESOR) {
    patch.ID_PROFESOR = current.ID_PROFESOR || null;
  }
  if (dirty.has("ID_CENTRO") && current.ID_CENTRO !== original.ID_CENTRO) {
    patch.ID_CENTRO = current.ID_CENTRO || null;
  }
  if (
    dirty.has("ID_CLIENTE") &&
    original.ID_CLIENTE !== undefined &&
    current.ID_CLIENTE !== original.ID_CLIENTE
  ) {
    patch.ID_CLIENTE = current.ID_CLIENTE;
  }

  return patch;
}

function applyPerfilFormRecord(
  record: PerfilFormRecord,
  setters: {
    setNombre: (v: string) => void;
    setEmail: (v: string) => void;
    setRolValue: (v: Rol) => void;
    setEstado: (v: string) => void;
    setIdProfesor: (v: string) => void;
    setIdCentro: (v: string) => void;
    setIdCliente: (v: string) => void;
  },
) {
  setters.setNombre(record.NOMBRE);
  setters.setEmail(record.EMAIL);
  setters.setRolValue(record.ROL);
  setters.setEstado(record.ESTADO);
  setters.setIdProfesor(record.ID_PROFESOR);
  setters.setIdCentro(record.ID_CENTRO);
  setters.setIdCliente(record.ID_CLIENTE);
}

function PerfilDetailOverlay({
  open,
  mode,
  perfil,
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
  perfil: PerfilData | null;
  canMutate: boolean;
  isMaster: boolean;
  submitting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRequestSave: (values: PerfilUpdateInput) => void;
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

  if (!perfil) {
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
        aria-label="Cerrar detalle del usuario"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="perfil-overlay-title"
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
                <h2 id="perfil-overlay-title" className="truncate text-xl font-semibold">
                  Editar usuario
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
            <PerfilFormDialog
              key={perfil.ID_PERFIL}
              open
              embedded
              title="Editar usuario"
              submitLabel="Guardar"
              isMaster={isMaster}
              initial={perfil}
              submitting={submitting}
              onClose={onCancelEdit}
              onSubmit={onRequestSave}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="perfil-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="perfil-overlay-title" className="truncate text-xl font-semibold">
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
                <div>
                  <dt className="text-muted-foreground">ID_CLIENTE</dt>
                  <dd className="font-mono text-xs">{perfil.ID_CLIENTE}</dd>
                </div>
              )}
              {isMaster && (
                <div>
                  <dt className="text-muted-foreground">ID_PROFESOR</dt>
                  <dd className="font-mono text-xs">
                    {perfil.ID_PROFESOR ? (
                      <EntityLink type="profesor" id={perfil.ID_PROFESOR}>
                        {perfil.ID_PROFESOR}
                      </EntityLink>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Nombre</dt>
                <dd className="font-semibold">{perfil.NOMBRE}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{perfil.EMAIL}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Rol</dt>
                <dd>{formatRol(perfil.ROL)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado</dt>
                <dd>{formatEstado(perfil.ESTADO)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Fecha de alta</dt>
                <dd>{formatCreatedAt(perfil.created_at)}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function UsuariosPage() {
  const { rol } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const canView = canViewUsuariosYMensajes(rol);
  const { list, create, update, remove } = usePerfiles();

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PerfilData | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  const perfiles = useMemo(() => list.data ?? [], [list.data]);

  const overlayPerfil = useMemo(
    () => perfiles.find((p) => p.ID_PERFIL === overlay?.id) ?? null,
    [perfiles, overlay?.id],
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
        toast.success("Usuario creado");
        setCreating(false);
      } else {
        await update.mutateAsync({
          id: pendingSave.id,
          patch: pendingSave.values,
        });
        toast.success("Usuario actualizado");
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
    const rows = perfiles;
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
  }, [perfiles, query]);

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
      <PageHeader
        title="Usuarios"
        description={`${perfiles.length} perfiles registrados`}
        actions={
          canMutate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo usuario
            </Button>
          )
        }
      />

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
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: p.ID_PERFIL, mode: "detail" })}
                  >
                    {isMaster && (
                      <TableCell className="font-mono text-xs">{p.ID_CLIENTE}</TableCell>
                    )}
                    <TableCell className="font-medium">{p.NOMBRE}</TableCell>
                    <TableCell>{p.EMAIL}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>{formatRol(p.ROL)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {formatEstado(p.ESTADO)}
                    </TableCell>
                    {isMaster && (
                      <TableCell className="font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                        {p.ID_PROFESOR ? (
                          <EntityLink type="profesor" id={p.ID_PROFESOR}>
                            {p.ID_PROFESOR}
                          </EntityLink>
                        ) : (
                          "—"
                        )}
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
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setOverlay({ id: p.ID_PERFIL, mode: "edit" })}
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
        <PerfilFormDialog
          open={creating}
          onClose={() => setCreating(false)}
          title="Nuevo usuario"
          submitLabel="Crear"
          isMaster={isMaster}
          submitting={create.isPending}
          onSubmit={(values) => {
            setPendingSave({ kind: "create", values });
          }}
        />
      )}

      <PerfilDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        perfil={overlayPerfil}
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
                ? "Se creará un nuevo usuario en el sistema. ¿Deseas continuar?"
                : "Se actualizarán los datos de este usuario. ¿Deseas continuar?"}
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
  embedded?: boolean;
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
  const { open, onClose, title, submitLabel, isMaster, submitting, embedded } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const { tenantId } = useActiveTenant();
  const { list: clientesList } = useClientes();
  const { list: profesoresList } = useProfesores();
  const isEdit = initial != null;
  const dirtyFieldsRef = useRef<Set<PerfilEditField>>(new Set());

  const [nombre, setNombre] = useState(() =>
    buildPerfilFormRecord(initial, isMaster, tenantId, []).NOMBRE,
  );
  const [email, setEmail] = useState(() =>
    buildPerfilFormRecord(initial, isMaster, tenantId, []).EMAIL,
  );
  const [rolValue, setRolValue] = useState<Rol>(() =>
    buildPerfilFormRecord(initial, isMaster, tenantId, []).ROL,
  );
  const [estado, setEstado] = useState(() =>
    buildPerfilFormRecord(initial, isMaster, tenantId, []).ESTADO,
  );
  const [idCliente, setIdCliente] = useState(() =>
    buildPerfilFormRecord(initial, isMaster, tenantId, []).ID_CLIENTE,
  );
  const [idProfesor, setIdProfesor] = useState(() =>
    buildPerfilFormRecord(initial, isMaster, tenantId, []).ID_PROFESOR,
  );
  const [idCentro, setIdCentro] = useState(() =>
    buildPerfilFormRecord(initial, isMaster, tenantId, []).ID_CENTRO,
  );

  const effectiveIdCliente = isMaster ? idCliente : tenantId;
  const masterNeedsCliente = isMaster && !effectiveIdCliente;

  const profesoresRows = useMemo(
    () => profesoresList.data?.profesores ?? [],
    [profesoresList.data?.profesores],
  );

  const selectedProfesorId = idProfesor || (isEdit ? initial?.ID_PROFESOR ?? "" : "");

  const profesoresFiltrados = useMemo(() => {
    if (!effectiveIdCliente) return [];
    const scoped = profesoresRows.filter((p) => p.ID_CLIENTE === effectiveIdCliente);
    return profesorSelectorOptions(scoped, selectedProfesorId);
  }, [profesoresRows, effectiveIdCliente, selectedProfesorId]);

  const trabajadorOptions = useMemo(() => {
    if (!selectedProfesorId) return profesoresFiltrados;
    if (profesoresFiltrados.some((p) => p.ID_PROFESOR === selectedProfesorId)) {
      return profesoresFiltrados;
    }
    if (!isEdit || !initial) return profesoresFiltrados;

    return [
      {
        ID_PROFESOR: selectedProfesorId,
        NOMBRE_PROFESOR: initial.NOMBRE?.trim() || "Trabajador asignado",
        FECHA_BAJA: null,
      },
      ...profesoresFiltrados,
    ];
  }, [profesoresFiltrados, selectedProfesorId, isEdit, initial]);

  const rolOptions = useMemo(() => {
    const base = isMaster ? ROL_OPTIONS_MASTER : ROL_OPTIONS_BASE;
    if (!rolValue || base.some((opt) => opt.value === rolValue)) return base;
    return [
      { value: rolValue, label: ROLE_LABEL[rolValue as Rol] ?? rolValue },
      ...base,
    ];
  }, [isMaster, rolValue]);

  const resetFormFromPerfil = useCallback(
    (perfil: PerfilData | undefined) => {
      const record = buildPerfilFormRecord(perfil, isMaster, tenantId, profesoresRows);
      applyPerfilFormRecord(record, {
        setNombre,
        setEmail,
        setRolValue,
        setEstado,
        setIdProfesor,
        setIdCentro,
        setIdCliente,
      });
    },
    [isMaster, tenantId, profesoresRows],
  );

  const applyTrabajador = (profesorId: string) => {
    dirtyFieldsRef.current.add("ID_PROFESOR");
    dirtyFieldsRef.current.add("NOMBRE");
    setIdProfesor(profesorId);
    const prof =
      profesoresFiltrados.find((p) => p.ID_PROFESOR === profesorId) ??
      trabajadorOptions.find((p) => p.ID_PROFESOR === profesorId);
    if (prof) {
      setNombre(prof.NOMBRE_PROFESOR);
      setEmail(
        ("EMAIL_PROFESORES" in prof ? prof.EMAIL_PROFESORES : null) ??
          initial?.EMAIL ??
          "",
      );
    }
  };

  const clearTrabajador = () => {
    setIdProfesor("");
    setNombre("");
    setEmail("");
  };

  const handleClienteChange = (clienteId: string) => {
    dirtyFieldsRef.current.add("ID_CLIENTE");
    setIdCliente(clienteId);
    clearTrabajador();
  };

  useEffect(() => {
    if (!open) return;

    dirtyFieldsRef.current = new Set();

    if (isEdit && initial) {
      resetFormFromPerfil(initial);
      return;
    }

    applyPerfilFormRecord(buildPerfilFormRecord(undefined, isMaster, tenantId, profesoresRows), {
      setNombre,
      setEmail,
      setRolValue,
      setEstado,
      setIdProfesor,
      setIdCentro,
      setIdCliente,
    });
  }, [open, isEdit, initial, initial?.ID_PERFIL, resetFormFromPerfil, isMaster, tenantId, profesoresRows]);

  const clientes = useMemo(() => clientesList.data ?? [], [clientesList.data]);

  const formBody = (
    <form
      id={embedded ? "perfil-form" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (isMaster && !idCliente) {
          toast.error("Debes seleccionar un cliente primero");
          return;
        }
        if (!selectedProfesorId) {
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
          const baseline = buildPerfilEditSnapshot(initial, isMaster);
          const current: PerfilEditSnapshot = {
            NOMBRE: nombre.trim(),
            ROL: rolValue,
            ESTADO: estado,
            ID_PROFESOR: selectedProfesorId,
            ID_CENTRO: idCentro,
            ...(isMaster ? { ID_CLIENTE: idCliente } : {}),
          };

          const patch = buildPerfilUpdatePatch(
            baseline,
            current,
            dirtyFieldsRef.current,
          );

          if (Object.keys(patch).length === 0) {
            toast.info("No hay cambios que guardar");
            return;
          }

          (props as PerfilFormDialogEditProps).onSubmit(patch);
          return;
        }

        const payload: PerfilCreateInput = {
          NOMBRE: nombre.trim(),
          EMAIL: email.trim(),
          ROL: rolValue,
          ESTADO: estado,
          ID_PROFESOR: selectedProfesorId,
          ID_CLIENTE: isMaster ? idCliente : tenantId,
          ID_CENTRO: idCentro || null,
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
        {profesoresList.isLoading && !(isEdit && initial?.ID_PROFESOR) ? (
          <Skeleton className="h-9 w-full" />
        ) : masterNeedsCliente ? (
          <Select disabled>
            <SelectTrigger id="perfil-trabajador">
              <SelectValue placeholder="Selecciona un cliente primero..." />
            </SelectTrigger>
          </Select>
        ) : trabajadorOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay trabajadores disponibles para este cliente.
          </p>
        ) : (
          <Select
            key={`perfil-trabajador-${initial?.ID_PERFIL ?? "new"}-${selectedProfesorId}`}
            value={selectedProfesorId}
            onValueChange={applyTrabajador}
            required
          >
            <SelectTrigger id="perfil-trabajador" aria-required="true">
              <SelectValue placeholder="Seleccionar trabajador *" />
            </SelectTrigger>
            <SelectContent>
              {trabajadorOptions.map((p) => (
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
        <Select
          key={`perfil-rol-${initial?.ID_PERFIL ?? "new"}-${rolValue}`}
          value={rolValue}
          onValueChange={(v) => {
            dirtyFieldsRef.current.add("ROL");
            setRolValue(v as Rol);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rolOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>ESTADO</Label>
        <Select
          value={estado}
          onValueChange={(v) => {
            dirtyFieldsRef.current.add("ESTADO");
            setEstado(v);
          }}
        >
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

      {!embedded ? (
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
              !selectedProfesorId ||
              !nombre.trim() ||
              !email.trim() ||
              trabajadorOptions.length === 0
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
