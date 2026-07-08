import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreVertical, Plus, Search, UserCircle } from "lucide-react";
import {
  findProfesorByPerfilId,
  ProfesorPerfilAssignError,
  ProfesorPerfilRolUpdateError,
  useProfesores,
  type ProfesorData,
  type ProfesorCreateInput,
  type ProfesorUpdateInput,
  type AulaLookup,
  type EspecialidadLookup,
} from "@/hooks/useProfesores";
import { useActiveTenant } from "@/context/AppContext";
import {
  isAdminRole,
  isDireccionRole,
  isMasterRole,
  isProfesorRole,
  isSecretariaRole,
} from "@/lib/tenantQuery";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ContactCompactCell,
  EmailQuickAction,
  PhoneQuickActions,
} from "@/components/ui/ContactQuickActions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ProfesorDetailOverlay } from "@/components/profesores/ProfesorDetailOverlay";
import { ProfesorForm } from "@/components/profesores/ProfesorForm";
import {
  EstadoProfesorBadge,
  EstadoProfesorToggle,
  TagBadges,
  formatFechaDisplay,
  formatSaldoDisplay,
  sortProfesoresByEstado,
} from "@/components/profesores/profesoresShared";

type ProfesoresSearch = {
  tab?: "personal" | "profesores";
  profesorId?: string;
};

export const Route = createFileRoute("/_authenticated/profesores")({
  validateSearch: (search: Record<string, unknown>): ProfesoresSearch => {
    const tab = search.tab;
    const profesorId = search.profesorId;
    return {
      ...(tab === "personal" || tab === "profesores" ? { tab } : {}),
      ...(typeof profesorId === "string" && profesorId ? { profesorId } : {}),
    };
  },
  component: ProfesoresPage,
});

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
  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);
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
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <UserCircle className="h-6 w-6 text-muted-foreground" />
              Mis datos personales
            </span>
          }
          description="Actualiza tu información de contacto. Los datos de contrato y saldos son de solo lectura."
        />
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
                Actualiza tu información de contacto. Los datos de contrato y saldos son de solo
                lectura.
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
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  {query ? "Sin resultados." : "Aún no hay profesores."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.ID_PROFESOR}>
                  <TableCell className="py-2 font-medium text-sm truncate">
                    {p.NOMBRE_PROFESOR}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {p.EMAIL_PROFESORES ? (
                      <span className="flex items-center gap-1">
                        <span className="truncate">{p.EMAIL_PROFESORES}</span>
                        <EmailQuickAction email={p.EMAIL_PROFESORES} variant="compact" />
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-sm whitespace-nowrap">
                    {p.TELEFONO ? (
                      <span className="flex items-center gap-1">
                        <span>{p.TELEFONO}</span>
                        <PhoneQuickActions phone={p.TELEFONO} variant="compact" />
                      </span>
                    ) : (
                      "—"
                    )}
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
      <PageHeader
        title="Profesores"
        description={`${profesores.length} en total · consulta el equipo o actualiza tus datos personales`}
      />

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
  const { tab: searchTab, profesorId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { rol, perfil } = useActiveTenant();
  const { list, create, update } = useProfesores();

  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);
  const aulas = useMemo(() => list.data?.aulas ?? [], [list.data?.aulas]);
  const especialidades = useMemo(
    () => list.data?.especialidades ?? [],
    [list.data?.especialidades],
  );

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusConfirming, setStatusConfirming] = useState<ProfesorData | null>(null);

  const isPersonalDataView = isProfesorRole(rol);
  const isDireccionView = isDireccionRole(rol);
  const isTableView = isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol);
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

  const overlayProfesor = useMemo(
    () => profesores.find((p) => p.ID_PROFESOR === overlay?.id) ?? null,
    [profesores, overlay?.id],
  );

  const handleCloseOverlay = useCallback(() => {
    setOverlay(null);
    navigate({ search: (prev) => ({ ...prev, profesorId: undefined }), replace: true });
  }, [navigate]);
  const handleEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((current) => (current ? { id: current.id, mode: "detail" } : null));
  }, []);

  useEffect(() => {
    if (profesorId) {
      setOverlay({ id: profesorId, mode: "detail" });
    }
  }, [profesorId]);

  const handleUpdate = async (id: string, values: ProfesorUpdateInput) => {
    await update.mutateAsync({ id, patch: values });
    toast.success("Profesor actualizado.");
    setOverlay({ id, mode: "detail" });
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
      <PageHeader
        title="Profesores"
        description={`${profesores.length} en total · activos primero, luego alfabético`}
        actions={
          canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo profesor
            </Button>
          )
        }
      />

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
                <TableHead className="h-9 text-xs font-semibold">Vacaciones</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Asuntos Propios</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Especialidades</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Aulas</TableHead>
                <TableHead className="h-9 text-xs font-semibold">Estado</TableHead>
                {canManage && <TableHead className="w-[50px]"></TableHead>}
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
                      canManage ? "cursor-pointer hover:bg-muted/50 transition-colors" : undefined
                    }
                    onClick={
                      canManage
                        ? () => setOverlay({ id: p.ID_PROFESOR, mode: "detail" })
                        : undefined
                    }
                  >
                    <TableCell className="py-2 font-medium text-sm">{p.NOMBRE_PROFESOR}</TableCell>
                    <TableCell className="py-2 text-sm">
                      <ContactCompactCell phone={p.TELEFONO} email={p.EMAIL_PROFESORES} />
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
                    {canManage && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setOverlay({ id: p.ID_PROFESOR, mode: "edit" })}
                            >
                              Editar
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

      <ProfesorDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        profesor={overlayProfesor}
        aulas={aulas}
        especialidades={especialidades}
        submitting={update.isPending}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onSubmit={async (values: ProfesorCreateInput | ProfesorUpdateInput) => {
          if (!overlay?.id) return;
          try {
            await handleUpdate(overlay.id, values as ProfesorUpdateInput);
          } catch (err) {
            if (err instanceof ProfesorPerfilRolUpdateError) {
              toast.error(err.message);
              setOverlay({ id: overlay.id, mode: "detail" });
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
                    ¿Seguro que quieres dar de baja a <b>{statusConfirming.NOMBRE_PROFESOR}</b>? Se
                    liberarán sus horarios futuros y se revocará su acceso.
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
              key={isCreate ? "create" : (initial?.ID_PROFESOR ?? "edit")}
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
