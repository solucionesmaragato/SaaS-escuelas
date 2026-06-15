import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, UserCircle } from "lucide-react";
import {
  findProfesorByPerfilId,
  ProfesorPerfilAssignError,
  ProfesorPerfilRolUpdateError,
  useProfesorRol,
  useProfesores,
  type ProfesorData,
  type ProfesorCreateInput,
  type ProfesorUpdateInput,
  type AulaLookup,
  type EspecialidadLookup,
} from "@/hooks/useProfesores";
import type { Rol } from "@/types/database";
import { useActiveTenant } from "@/context/AppContext";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
} from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const PROFESOR_ROL_OPTIONS: { value: Rol; label: string }[] = [
  { value: "PROFESOR", label: "Profesor" },
  { value: "ADMIN", label: "Administrador" },
  { value: "SECRETARIA", label: "Secretaría" },
  { value: "DIRECCION", label: "Dirección" },
];

type ProfesoresSearch = {
  tab?: "personal" | "profesores";
};

export const Route = createFileRoute("/_authenticated/profesores")({
  validateSearch: (search: Record<string, unknown>): ProfesoresSearch => {
    const tab = search.tab;
    if (tab === "personal" || tab === "profesores") return { tab };
    return {};
  },
  component: ProfesoresPage,
});

const sortLocale = { sensitivity: "base" } as const;

function formatFechaDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

function formatSaldoDisplay(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

function sortProfesoresByEstado(profesores: ProfesorData[]): ProfesorData[] {
  return [...profesores].sort((a, b) => {
    const aActive = !a.FECHA_BAJA;
    const bActive = !b.FECHA_BAJA;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (a.NOMBRE_PROFESOR ?? "").localeCompare(b.NOMBRE_PROFESOR ?? "", "es", sortLocale);
  });
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

function TagBadges({ text }: { text: string }) {
  if (!text || text === "—") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const items = text.split(", ").filter(Boolean);
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-[220px]">
      {items.map((item) => (
        <Badge
          key={item}
          variant="secondary"
          className="text-xs font-normal px-1.5 py-0"
        >
          {item}
        </Badge>
      ))}
    </div>
  );
}

function EstadoProfesorBadge({ fechaBaja }: { fechaBaja: string | null }) {
  const isActive = !fechaBaja;
  return (
    <Badge
      variant="outline"
      className={
        isActive
          ? "text-xs font-normal border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "text-xs font-normal border-destructive/30 bg-destructive/10 text-destructive"
      }
    >
      {isActive ? "Activo" : `Inactivo${fechaBaja ? ` · ${fechaBaja.slice(0, 10)}` : ""}`}
    </Badge>
  );
}

function EstadoProfesorToggle({
  fechaBaja,
  onClick,
  disabled,
}: {
  fechaBaja: string | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  const isActive = !fechaBaja;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={
        isActive
          ? "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-destructive/30 bg-destructive/10 text-destructive"
      }
    >
      {isActive ? "Activo" : `Inactivo${fechaBaja ? ` · ${fechaBaja.slice(0, 10)}` : ""}`}
    </button>
  );
}

function ProfesorPersonalDataView({
  list,
  update,
  perfilProfesorId,
  aulas,
  especialidades,
  embedded,
}: {
  list: ReturnType<typeof useProfesores>["list"];
  update: ReturnType<typeof useProfesores>["update"];
  perfilProfesorId: string | null;
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
  embedded?: boolean;
}) {
  const profesores = list.data?.profesores ?? [];
  const miProfesor = useMemo(
    () => findProfesorByPerfilId(profesores, perfilProfesorId),
    [profesores, perfilProfesorId],
  );

  const handleSave = async (values: ProfesorUpdateInput) => {
    if (!miProfesor) return;
    try {
      await update.mutateAsync({
        id: miProfesor.ID_PROFESOR,
        patch: values,
        selfProfile: true,
      });
      toast.success("Datos personales actualizados.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar.");
    }
  };

  return (
    <div className={embedded ? "space-y-4" : "mx-auto max-w-2xl space-y-4"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-muted-foreground" />
            Mis datos personales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Actualiza tu información de contacto. Los datos de contrato y saldos son de solo lectura.
          </p>
        </div>
      )}

      <Card className="p-4 sm:p-6">
        {list.isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : list.isError ? (
          <p className="py-10 text-center text-sm text-destructive">
            Error al cargar tu perfil: {(list.error as Error)?.message}
          </p>
        ) : !perfilProfesorId || !miProfesor ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No se encontró tu ficha de profesor en esta escuela.
          </p>
        ) : (
          <div className="space-y-6">
            {embedded && (
              <p className="text-sm text-muted-foreground">
                Actualiza tu información de contacto. Los datos de contrato y saldos son de solo lectura.
              </p>
            )}
            <div>
              <h2 className="text-lg font-semibold">{miProfesor.NOMBRE_PROFESOR}</h2>
              {miProfesor.EMAIL_PROFESORES && (
                <p className="text-xs text-muted-foreground">{miProfesor.EMAIL_PROFESORES}</p>
              )}
            </div>

            <ProfesorForm
              key={miProfesor.ID_PROFESOR}
              initial={miProfesor}
              selfProfile
              aulas={aulas}
              especialidades={especialidades}
              submitting={update.isPending}
              onSubmit={handleSave}
            />

            <div className="flex justify-end border-t pt-4">
              <Button type="submit" form="profesor-form" disabled={update.isPending}>
                {update.isPending ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function DireccionProfesoresTable({
  list,
  profesores,
}: {
  list: ReturnType<typeof useProfesores>["list"];
  profesores: ProfesorData[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const base = !query.trim()
      ? profesores
      : profesores.filter((p) => {
          const q = query.toLowerCase();
          return (
            p.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
            p.EMAIL_PROFESORES?.toLowerCase().includes(q) ||
            p.TELEFONO?.toLowerCase().includes(q) ||
            p.TEXTO_ESPECIALIDADES.toLowerCase().includes(q) ||
            p.TEXTO_AULAS.toLowerCase().includes(q)
          );
        });
    return sortProfesoresByEstado(base);
  }, [profesores, query]);

  return (
    <Card className="p-4">
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, email, teléfono, especialidad o aula..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {list.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
          Error al cargar profesores: {(list.error as Error)?.message}
        </div>
      )}

      <div className="w-full overflow-x-auto">
        <Table className="w-full min-w-[960px] md:min-w-full table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 text-xs font-semibold w-[14%]">Nombre</TableHead>
              <TableHead className="h-9 text-xs font-semibold w-[14%]">Mail</TableHead>
              <TableHead className="h-9 text-xs font-semibold w-[10%]">Tlf</TableHead>
              <TableHead className="h-9 text-xs font-semibold w-[9%]">Saldo AP</TableHead>
              <TableHead className="h-9 text-xs font-semibold w-[10%]">Saldo vacaciones</TableHead>
              <TableHead className="h-9 text-xs font-semibold w-[11%]">Fecha nacimiento</TableHead>
              <TableHead className="h-9 text-xs font-semibold w-[16%]">Especialidades</TableHead>
              <TableHead className="h-9 text-xs font-semibold w-[16%]">Aulas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8} className="py-2">
                    <Skeleton className="h-7 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {query ? "Sin resultados." : "Aún no hay profesores."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.ID_PROFESOR}>
                  <TableCell className="py-2 font-medium text-sm truncate">
                    {p.NOMBRE_PROFESOR}
                  </TableCell>
                  <TableCell className="py-2 text-sm truncate">
                    {p.EMAIL_PROFESORES ?? "—"}
                  </TableCell>
                  <TableCell className="py-2 text-sm whitespace-nowrap">
                    {p.TELEFONO ?? "—"}
                  </TableCell>
                  <TableCell className="py-2 text-sm tabular-nums whitespace-nowrap">
                    {formatSaldoDisplay(p.SALDO_AP)}
                  </TableCell>
                  <TableCell className="py-2 text-sm tabular-nums whitespace-nowrap">
                    {formatSaldoDisplay(p.SALDO_VACACIONES)}
                  </TableCell>
                  <TableCell className="py-2 text-sm whitespace-nowrap">
                    {formatFechaDisplay(p.NACIMIENTO)}
                  </TableCell>
                  <TableCell className="py-2 align-top">
                    <TagBadges text={p.TEXTO_ESPECIALIDADES} />
                  </TableCell>
                  <TableCell className="py-2 align-top">
                    <TagBadges text={p.TEXTO_AULAS} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function DireccionProfesoresPage({
  list,
  update,
  perfilProfesorId,
  aulas,
  especialidades,
  profesores,
  initialTab,
}: {
  list: ReturnType<typeof useProfesores>["list"];
  update: ReturnType<typeof useProfesores>["update"];
  perfilProfesorId: string | null;
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
  profesores: ProfesorData[];
  initialTab?: "personal" | "profesores";
}) {
  const [activeTab, setActiveTab] = useState(initialTab ?? "profesores");

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profesores</h1>
        <p className="text-sm text-muted-foreground">
          {profesores.length} en total · consulta el equipo o actualiza tus datos personales
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "personal" | "profesores")}>
        <TabsList className="mb-4 grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="personal">Mis datos personales</TabsTrigger>
          <TabsTrigger value="profesores">Profesores</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <ProfesorPersonalDataView
            list={list}
            update={update}
            perfilProfesorId={perfilProfesorId}
            aulas={aulas}
            especialidades={especialidades}
            embedded
          />
        </TabsContent>

        <TabsContent value="profesores">
          <DireccionProfesoresTable list={list} profesores={profesores} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfesoresPage() {
  const { tab: searchTab } = Route.useSearch();
  const { rol, perfil } = useActiveTenant();
  const { list, create, update } = useProfesores();

  const profesores = list.data?.profesores ?? [];
  const aulas = list.data?.aulas ?? [];
  const especialidades = list.data?.especialidades ?? [];

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ProfesorData | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusConfirming, setStatusConfirming] = useState<ProfesorData | null>(null);

  const isPersonalDataView = isProfesorRole(rol);
  const isDireccionView = isDireccionRole(rol);
  const isTableView =
    isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol);
  const canManage = isMasterRole(rol) || isAdminRole(rol);

  const filtered = useMemo(() => {
    const base = !query.trim()
      ? profesores
      : profesores.filter((p) => {
          const q = query.toLowerCase();
          return (
            p.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
            p.EMAIL_PROFESORES?.toLowerCase().includes(q) ||
            p.TEXTO_ESPECIALIDADES.toLowerCase().includes(q) ||
            p.DNI?.toLowerCase().includes(q)
          );
        });
    return sortProfesoresByEstado(base);
  }, [profesores, query]);

  const handleUpdate = async (id: string, values: ProfesorUpdateInput) => {
    await update.mutateAsync({ id, patch: values });
    toast.success("Profesor actualizado.");
    setEditing(null);
  };

  const handleConfirmStatusChange = async () => {
    if (!statusConfirming) return;
    const profesor = statusConfirming;
    const isDeactivating = !profesor.FECHA_BAJA;
    try {
      await update.mutateAsync({
        id: profesor.ID_PROFESOR,
        patch: {
          FECHA_BAJA: isDeactivating ? new Date().toISOString() : null,
        },
      });
      toast.success(
        isDeactivating
          ? `${profesor.NOMBRE_PROFESOR} dado de baja correctamente.`
          : `${profesor.NOMBRE_PROFESOR} reactivado.`,
      );
      setStatusConfirming(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cambiar el estado.");
    }
  };

  const tableColCount = canManage ? 8 : 7;

  if (isPersonalDataView) {
    return (
      <ProfesorPersonalDataView
        list={list}
        update={update}
        perfilProfesorId={perfil.ID_PROFESOR}
        aulas={aulas}
        especialidades={especialidades}
      />
    );
  }

  if (isDireccionView) {
    return (
      <DireccionProfesoresPage
        list={list}
        update={update}
        perfilProfesorId={perfil.ID_PROFESOR}
        aulas={aulas}
        especialidades={especialidades}
        profesores={profesores}
        initialTab={searchTab}
      />
    );
  }

  if (!isTableView) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
        <p className="text-sm text-muted-foreground">
          No tienes permiso para consultar el listado de profesores.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Profesores</h1>
              <p className="text-sm text-muted-foreground">
                {profesores.length} en total · activos primero, luego alfabético
              </p>
            </div>
            {canManage && (
              <Button onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Nuevo profesor
              </Button>
            )}
      </div>

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email, especialidad o DNI..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

            {list.isError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
                Error al cargar profesores: {(list.error as Error)?.message}
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs font-semibold">Nombre</TableHead>
                    <TableHead className="h-9 text-xs font-semibold">Contacto</TableHead>
                    <TableHead className="h-9 text-xs font-semibold">Estado</TableHead>
                    <TableHead className="h-9 text-xs font-semibold">Vacaciones</TableHead>
                    <TableHead className="h-9 text-xs font-semibold">Asuntos Propios</TableHead>
                    <TableHead className="h-9 text-xs font-semibold">Especialidades</TableHead>
                    <TableHead className="h-9 text-xs font-semibold">Aulas</TableHead>
                    {canManage && (
                      <TableHead className="h-9 text-xs font-semibold text-right">Acciones</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={tableColCount} className="py-2">
                          <Skeleton className="h-7 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={tableColCount}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        {query ? "Sin resultados." : "Aún no hay profesores."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((p) => (
                      <TableRow
                        key={p.ID_PROFESOR}
                        className={
                          canManage
                            ? "cursor-pointer hover:bg-muted/50 transition-colors"
                            : undefined
                        }
                        onClick={canManage ? () => setEditing(p) : undefined}
                      >
                        <TableCell className="py-2 font-medium text-sm">
                          {p.NOMBRE_PROFESOR}
                        </TableCell>
                        <TableCell className="py-2 text-sm">
                          <div className="leading-tight">{p.EMAIL_PROFESORES ?? "—"}</div>
                          {p.TELEFONO && (
                            <div className="text-xs text-muted-foreground mt-0.5">{p.TELEFONO}</div>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          {canManage ? (
                            <EstadoProfesorToggle
                              fechaBaja={p.FECHA_BAJA}
                              onClick={() => setStatusConfirming(p)}
                              disabled={update.isPending}
                            />
                          ) : (
                            <EstadoProfesorBadge fechaBaja={p.FECHA_BAJA} />
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-sm tabular-nums">
                          {formatSaldoDisplay(p.SALDO_VACACIONES)}
                        </TableCell>
                        <TableCell className="py-2 text-sm tabular-nums">
                          {formatSaldoDisplay(p.SALDO_AP)}
                        </TableCell>
                        <TableCell className="py-2 align-top">
                          <TagBadges text={p.TEXTO_ESPECIALIDADES} />
                        </TableCell>
                        <TableCell className="py-2 align-top">
                          <TagBadges text={p.TEXTO_AULAS} />
                        </TableCell>
                        {canManage && (
                          <TableCell
                            className="py-2 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(p);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Editar</span>
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

      <ProfesorFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Nuevo profesor"
        submitLabel="Crear"
        isCreate
        submitting={create.isPending}
        aulas={aulas}
        especialidades={especialidades}
        onSubmit={async (values: ProfesorCreateInput | ProfesorUpdateInput) => {
          try {
            await create.mutateAsync(values as ProfesorCreateInput);
            toast.success("Profesor creado.");
            setCreating(false);
          } catch (err) {
            if (err instanceof ProfesorPerfilAssignError) {
              toast.error(err.message);
              setCreating(false);
              return;
            }
            toast.error(err instanceof Error ? err.message : "Error al crear.");
          }
        }}
      />

      <ProfesorFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar profesor"
        submitLabel="Guardar"
        initial={editing}
        submitting={update.isPending}
        aulas={aulas}
        especialidades={especialidades}
        onSubmit={async (values: ProfesorCreateInput | ProfesorUpdateInput) => {
          if (!editing) return;
          try {
            await handleUpdate(editing.ID_PROFESOR, values);
          } catch (err) {
            if (err instanceof ProfesorPerfilRolUpdateError) {
              toast.error(err.message);
              setEditing(null);
              return;
            }
            toast.error(err instanceof Error ? err.message : "Error al actualizar.");
          }
        }}
      />

      {canManage && (
        <AlertDialog
          open={!!statusConfirming}
          onOpenChange={(o) => !o && setStatusConfirming(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {statusConfirming && !statusConfirming.FECHA_BAJA
                  ? "Dar de baja al profesor"
                  : "Reactivar profesor"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {statusConfirming && !statusConfirming.FECHA_BAJA ? (
                  <>
                    ¿Seguro que quieres dar de baja a <b>{statusConfirming.NOMBRE_PROFESOR}</b>?
                    Se liberarán sus horarios futuros y se revocará su acceso.
                  </>
                ) : (
                  <>
                    ¿Estás seguro de que quieres reactivar a{" "}
                    <b>{statusConfirming?.NOMBRE_PROFESOR}</b>? El profesor volverá a estar activo.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={update.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleConfirmStatusChange();
                }}
                disabled={update.isPending}
              >
                {update.isPending ? "Guardando..." : "Confirmar"}
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
}: {
  label: string;
  options: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="border rounded-md max-h-[160px] overflow-y-auto divide-y">
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No hay opciones disponibles.</p>
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
      <p className="text-xs text-muted-foreground">{selected.length} seleccionados</p>
    </div>
  );
}

export function ProfesorForm({
  initial,
  isCreate,
  selfProfile,
  aulas,
  especialidades,
  submitting,
  onSubmit,
}: {
  initial?: ProfesorData | null;
  isCreate?: boolean;
  selfProfile?: boolean;
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
  submitting: boolean;
  onSubmit: (values: ProfesorCreateInput | ProfesorUpdateInput) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [tlf, setTlf] = useState("");
  const [dni, setDni] = useState("");
  const [nSegSocial, setNSegSocial] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [nacimiento, setNacimiento] = useState("");
  const [fechaAlta, setFechaAlta] = useState("");
  const [fechaBaja, setFechaBaja] = useState("");
  const [saldoVacaciones, setSaldoVacaciones] = useState("");
  const [saldoAp, setSaldoAp] = useState("");
  const [especialidadIds, setEspecialidadIds] = useState<string[]>([]);
  const [aulaIds, setAulaIds] = useState<string[]>([]);
  const [rol, setRol] = useState<Rol>("PROFESOR");
  const showRolField = isCreate || (!selfProfile && !!initial);
  const rolQuery = useProfesorRol(
    showRolField && !isCreate ? initial?.ID_PROFESOR : null,
  );
  const rolLoading = showRolField && !isCreate && rolQuery.isLoading;

  const especialidadesOrdenadas = useMemo(
    () =>
      [...especialidades].sort((a, b) =>
        a.ESPECIALIDAD.localeCompare(b.ESPECIALIDAD, "es", sortLocale),
      ),
    [especialidades],
  );

  const aulasOrdenadas = useMemo(
    () =>
      [...aulas].sort((a, b) =>
        a.NOMBRE_AULA.localeCompare(b.NOMBRE_AULA, "es", sortLocale),
      ),
    [aulas],
  );

  useEffect(() => {
    setNombre(initial?.NOMBRE_PROFESOR ?? "");
    setEmail(initial?.EMAIL_PROFESORES ?? "");
    setTlf(initial?.TELEFONO ?? "");
    setDni(initial?.DNI ?? "");
    setNSegSocial(initial?.N_SEG_SOCIAL ?? "");
    setDomicilio(initial?.DOMICILIO ?? "");
    setNacimiento(toDateInputValue(initial?.NACIMIENTO));
    setFechaAlta(toDateInputValue(initial?.FECHA_ALTA));
    setFechaBaja(toDateInputValue(initial?.FECHA_BAJA));
    setSaldoVacaciones(
      initial?.SALDO_VACACIONES != null ? String(initial.SALDO_VACACIONES) : "",
    );
    setSaldoAp(initial?.SALDO_AP != null ? String(initial.SALDO_AP) : "");
    setEspecialidadIds(
      Array.isArray(initial?.ESPECIALIDAD) ? initial.ESPECIALIDAD : [],
    );
    setAulaIds(Array.isArray(initial?.AULA) ? initial.AULA : []);
    if (isCreate) {
      setRol("PROFESOR");
    }
  }, [initial, isCreate]);

  useEffect(() => {
    if (!showRolField || isCreate) return;
    if (rolQuery.data) {
      setRol(rolQuery.data);
    } else if (!rolQuery.isLoading) {
      setRol("PROFESOR");
    }
  }, [showRolField, isCreate, rolQuery.data, rolQuery.isLoading]);

  const toggleEspecialidad = (id: string) => {
    setEspecialidadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAula = (id: string) => {
    setAulaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const parseOptionalNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = parseFloat(trimmed);
    return Number.isNaN(n) ? null : n;
  };

  const readOnly = selfProfile;

  return (
    <form
      id="profesor-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!selfProfile && !nombre.trim()) return;

        if (selfProfile) {
          onSubmit({
            EMAIL_PROFESORES: email.trim() || null,
            TELEFONO: tlf.trim() || null,
            DOMICILIO: domicilio.trim() || null,
            NACIMIENTO: nacimiento || null,
          });
          return;
        }

        const values: ProfesorCreateInput & { FECHA_ALTA?: string | null } = {
          NOMBRE_PROFESOR: nombre.trim(),
          EMAIL_PROFESORES: email.trim() || null,
          TELEFONO: tlf.trim() || null,
          DNI: dni.trim() || null,
          N_SEG_SOCIAL: nSegSocial.trim() || null,
          DOMICILIO: domicilio.trim() || null,
          NACIMIENTO: nacimiento || null,
          FECHA_BAJA: fechaBaja || null,
          SALDO_VACACIONES: parseOptionalNumber(saldoVacaciones),
          SALDO_AP: parseOptionalNumber(saldoAp),
          ESPECIALIDAD: Array.isArray(especialidadIds) ? especialidadIds : [],
          AULA: Array.isArray(aulaIds) ? aulaIds : [],
        };
        if (isCreate) {
          values.ROL = rol;
          onSubmit(values);
          return;
        }
        values.FECHA_ALTA = fechaAlta || null;
        if (showRolField) {
          values.ROL = rol;
        }
        onSubmit(values);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="prof-nombre">Nombre completo *</Label>
        <Input
          id="prof-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required={!selfProfile}
          disabled={readOnly}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {showRolField && (
          <div className="space-y-2">
            <Label htmlFor="prof-rol">Rol</Label>
            <Select
              value={rol}
              onValueChange={(v) => setRol(v as Rol)}
              disabled={rolLoading || submitting}
            >
              <SelectTrigger id="prof-rol">
                <SelectValue placeholder={rolLoading ? "Cargando rol..." : undefined} />
              </SelectTrigger>
              <SelectContent>
                {PROFESOR_ROL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="prof-email">Email</Label>
          <Input
            id="prof-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-tlf">Teléfono</Label>
          <Input id="prof-tlf" value={tlf} onChange={(e) => setTlf(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-dni">DNI</Label>
          <Input
            id="prof-dni"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-nss">Nº Seg. Social</Label>
          <Input
            id="prof-nss"
            value={nSegSocial}
            onChange={(e) => setNSegSocial(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-nacimiento">Fecha de nacimiento</Label>
          <Input
            id="prof-nacimiento"
            type="date"
            value={nacimiento}
            onChange={(e) => setNacimiento(e.target.value)}
          />
        </div>
        {!isCreate && (
          <div className="space-y-2">
            <Label htmlFor="prof-alta">Fecha de alta</Label>
            <Input
              id="prof-alta"
              type="date"
              value={fechaAlta}
              onChange={(e) => setFechaAlta(e.target.value)}
              disabled={readOnly}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="prof-baja">Fecha de baja</Label>
          <Input
            id="prof-baja"
            type="date"
            value={fechaBaja}
            onChange={(e) => setFechaBaja(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="prof-domicilio">Domicilio</Label>
          <Input id="prof-domicilio" value={domicilio} onChange={(e) => setDomicilio(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-saldo-vac">Saldo vacaciones</Label>
          <Input
            id="prof-saldo-vac"
            type="number"
            step="any"
            value={saldoVacaciones}
            onChange={(e) => setSaldoVacaciones(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prof-saldo-ap">Saldo AP</Label>
          <Input
            id="prof-saldo-ap"
            type="number"
            step="any"
            value={saldoAp}
            onChange={(e) => setSaldoAp(e.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <MultiSelectCheckboxes
          label="Especialidades"
          options={especialidadesOrdenadas.map((e) => ({
            id: e.ID_ESPECIALIDAD,
            name: e.ESPECIALIDAD,
          }))}
          selected={especialidadIds}
          onToggle={toggleEspecialidad}
          disabled={readOnly}
        />
        <MultiSelectCheckboxes
          label="Aulas"
          options={aulasOrdenadas.map((a) => ({
            id: a.ID_AULA,
            name: a.NOMBRE_AULA,
          }))}
          selected={aulaIds}
          onToggle={toggleAula}
          disabled={readOnly}
        />
      </div>
    </form>
  );
}

function ProfesorFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  isCreate,
  submitting,
  aulas,
  especialidades,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: ProfesorData | null;
  isCreate?: boolean;
  submitting: boolean;
  aulas: AulaLookup[];
  especialidades: EspecialidadLookup[];
  onSubmit: (values: ProfesorCreateInput | ProfesorUpdateInput) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Details</DialogDescription>
        </DialogHeader>
        {open && (
          <div className="flex-1 overflow-y-auto py-2">
            <ProfesorForm
              key={isCreate ? "create" : initial?.ID_PROFESOR ?? "edit"}
              initial={initial}
              isCreate={isCreate}
              aulas={aulas}
              especialidades={especialidades}
              submitting={submitting}
              onSubmit={onSubmit}
            />
          </div>
        )}
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="profesor-form" disabled={submitting}>
            {submitting ? "Guardando..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
