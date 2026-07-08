import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, MoreVertical, Plus, Search, Pencil, X } from "lucide-react";
import {
  useHorarioComercial,
  sortHorarios,
  type HorarioCreateInput,
  type HorarioData,
  type HorarioUpdateInput,
} from "@/hooks/useHorarioComercial";
import { useClientes } from "@/hooks/useClientes";
import { useActiveTenant } from "@/context/AppContext";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mensajesAutomaticos")({
  component: MensajesAutomaticosPage,
});

const DIA_OPTIONS = [
  { value: "1", label: "Lunes" },
  { value: "2", label: "Martes" },
  { value: "3", label: "Miércoles" },
  { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" },
  { value: "6", label: "Sábado" },
  { value: "7", label: "Domingo" },
] as const;

const DIA_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  DIA_OPTIONS.map((d) => [d.value, d.label]),
);

const DIA_LABEL_BY_NAME: Record<string, string> = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  MIÉRCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
  SÁBADO: "Sábado",
  DOMINGO: "Domingo",
};

function formatDiaSemana(dia: string | null | undefined): string {
  if (!dia) return "—";
  const trimmed = dia.trim();
  const asNum = parseInt(trimmed, 10);
  if (!Number.isNaN(asNum) && DIA_LABEL_BY_VALUE[String(asNum)]) {
    return DIA_LABEL_BY_VALUE[String(asNum)];
  }
  return DIA_LABEL_BY_NAME[trimmed.toUpperCase()] ?? trimmed;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function toTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.length >= 5 ? value.slice(0, 5) : value;
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function emptyToNullNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

const EMPTY_HORARIO: HorarioCreateInput = {
  ID_CLIENTE: "",
  DIA_SEMANA: "",
  ABRE_MAÑANA: null,
  CIERRA_MAÑANA: null,
  ABRE_TARDE: null,
  CIERRA_TARDE: null,
  TFNO_DESVIO: null,
  SEG_ESPERA: null,
};

type PendingSave =
  | { kind: "create"; values: HorarioCreateInput }
  | { kind: "update"; id: string; values: HorarioUpdateInput };

function HorarioDetailOverlay({
  open,
  mode,
  horario,
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
  horario: HorarioData | null;
  canMutate: boolean;
  isMaster: boolean;
  submitting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onRequestSave: (values: HorarioUpdateInput) => void;
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

  if (!horario) {
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
        aria-label="Cerrar detalle del horario"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="horario-overlay-title"
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
                <h2 id="horario-overlay-title" className="truncate text-xl font-semibold">
                  Editar horario
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
            <HorarioFormDialog
              open
              embedded
              title="Editar horario"
              submitLabel="Guardar"
              isMaster={isMaster}
              isEdit
              initial={horario}
              submitting={submitting}
              onClose={onCancelEdit}
              onSubmit={onRequestSave}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="horario-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="horario-overlay-title" className="truncate text-xl font-semibold">
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
                  <dd className="font-mono text-xs">{horario.ID_CLIENTE}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Día</dt>
                <dd className="font-semibold">{formatDiaSemana(horario.DIA_SEMANA)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hora inicio mañana</dt>
                <dd>{formatTime(horario.ABRE_MAÑANA)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cierre mañana</dt>
                <dd>{formatTime(horario.CIERRA_MAÑANA)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hora inicio tarde</dt>
                <dd>{formatTime(horario.ABRE_TARDE)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cierra tarde</dt>
                <dd>{formatTime(horario.CIERRA_TARDE)}</dd>
              </div>
              {isMaster && (
                <>
                  <div>
                    <dt className="text-muted-foreground">TFNO_DESVIO</dt>
                    <dd>{horario.TFNO_DESVIO ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">SEG_ESPERA</dt>
                    <dd>{horario.SEG_ESPERA ?? "—"}</dd>
                  </div>
                </>
              )}
            </dl>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function MensajesAutomaticosPage() {
  const { rol } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const canView = canViewUsuariosYMensajes(rol);
  const { list, create, update, remove } = useHorarioComercial();

  const [query, setQuery] = useState("");
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<HorarioData | null>(null);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  const horarios = useMemo(() => list.data ?? [], [list.data]);

  const overlayHorario = useMemo(
    () => horarios.find((h) => h.ID_HORARIO === overlay?.id) ?? null,
    [horarios, overlay?.id],
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
        toast.success("Horario creado");
        setCreating(false);
      } else {
        await update.mutateAsync({
          id: pendingSave.id,
          patch: pendingSave.values,
        });
        toast.success("Horario actualizado");
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
    const rows = sortHorarios(horarios);
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return sortHorarios(
      rows.filter(
        (h) =>
          formatDiaSemana(h.DIA_SEMANA).toLowerCase().includes(q) ||
          h.DIA_SEMANA?.toLowerCase().includes(q) ||
          h.ID_CLIENTE?.toLowerCase().includes(q) ||
          h.ABRE_MAÑANA?.toLowerCase().includes(q) ||
          h.CIERRA_MAÑANA?.toLowerCase().includes(q) ||
          h.ABRE_TARDE?.toLowerCase().includes(q) ||
          h.CIERRA_TARDE?.toLowerCase().includes(q) ||
          h.TFNO_DESVIO?.toLowerCase().includes(q) ||
          String(h.SEG_ESPERA ?? "").includes(q),
      ),
    );
  }, [horarios, query]);

  if (isProfesorRole(rol) || !canView) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const colSpan = isMaster ? 9 : canMutate ? 6 : 5;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Mensajes automáticos"
        description={`${horarios.length} horarios registrados`}
        actions={
          isMaster && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nuevo Horario
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por día, horario, cliente o centralita..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar horarios: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isMaster && <TableHead>ID_CLIENTE</TableHead>}
                <TableHead>Día</TableHead>
                <TableHead>Hora inicio mañana</TableHead>
                <TableHead>Cierre mañana</TableHead>
                <TableHead>Hora inicio tarde</TableHead>
                <TableHead>Cierra tarde</TableHead>
                {isMaster && <TableHead>TFNO_DESVIO</TableHead>}
                {isMaster && <TableHead>SEG_ESPERA</TableHead>}
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
                    {query ? "Sin resultados." : "Aún no hay horarios registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((h) => (
                  <TableRow
                    key={h.ID_HORARIO}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: h.ID_HORARIO, mode: "detail" })}
                  >
                    {isMaster && (
                      <TableCell className="font-mono text-xs">{h.ID_CLIENTE}</TableCell>
                    )}
                    <TableCell className="font-medium" onClick={(e) => e.stopPropagation()}>
                      {formatDiaSemana(h.DIA_SEMANA)}
                    </TableCell>
                    <TableCell>{formatTime(h.ABRE_MAÑANA)}</TableCell>
                    <TableCell>{formatTime(h.CIERRA_MAÑANA)}</TableCell>
                    <TableCell>{formatTime(h.ABRE_TARDE)}</TableCell>
                    <TableCell>{formatTime(h.CIERRA_TARDE)}</TableCell>
                    {isMaster && <TableCell>{h.TFNO_DESVIO ?? "—"}</TableCell>}
                    {isMaster && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {h.SEG_ESPERA ?? "—"}
                      </TableCell>
                    )}
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
                              onClick={() => setOverlay({ id: h.ID_HORARIO, mode: "edit" })}
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

      {isMaster && (
        <HorarioFormDialog
          open={creating}
          onClose={() => setCreating(false)}
          title="Nuevo horario"
          submitLabel="Crear"
          isMaster={isMaster}
          isEdit={false}
          submitting={create.isPending}
          onSubmit={(values) => {
            setPendingSave({ kind: "create", values: values as HorarioCreateInput });
          }}
        />
      )}

      <HorarioDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        horario={overlayHorario}
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
                ? "Se creará un nuevo horario comercial. ¿Deseas continuar?"
                : "Se actualizarán los datos de este horario. ¿Deseas continuar?"}
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
              <AlertDialogTitle>Eliminar horario</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará el horario de <b>{formatDiaSemana(deleting?.DIA_SEMANA)}</b> (
                {deleting?.ID_CLIENTE}). Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!deleting) return;
                  try {
                    await remove.mutateAsync(deleting.ID_HORARIO);
                    toast.success("Horario eliminado");
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

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function HorarioTimeFields({
  abreManana,
  cierraManana,
  abreTarde,
  cierraTarde,
  onChange,
}: {
  abreManana: string;
  cierraManana: string;
  abreTarde: string;
  cierraTarde: string;
  onChange: (
    field: keyof Pick<HorarioData, "ABRE_MAÑANA" | "CIERRA_MAÑANA" | "ABRE_TARDE" | "CIERRA_TARDE">,
    value: string,
  ) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Hora inicio mañana">
        <Input
          type="time"
          value={abreManana}
          onChange={(e) => onChange("ABRE_MAÑANA", e.target.value)}
        />
      </FormField>
      <FormField label="Cierre mañana">
        <Input
          type="time"
          value={cierraManana}
          onChange={(e) => onChange("CIERRA_MAÑANA", e.target.value)}
        />
      </FormField>
      <FormField label="Hora inicio tarde">
        <Input
          type="time"
          value={abreTarde}
          onChange={(e) => onChange("ABRE_TARDE", e.target.value)}
        />
      </FormField>
      <FormField label="Cierra tarde">
        <Input
          type="time"
          value={cierraTarde}
          onChange={(e) => onChange("CIERRA_TARDE", e.target.value)}
        />
      </FormField>
    </div>
  );
}

function HorarioFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  isMaster,
  isEdit,
  initial,
  submitting,
  embedded,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  isMaster: boolean;
  isEdit: boolean;
  initial?: HorarioData | null;
  submitting: boolean;
  embedded?: boolean;
  onSubmit: (values: HorarioCreateInput | HorarioUpdateInput) => void;
}) {
  const { list: clientesList } = useClientes();
  const clientes = useMemo(() => clientesList.data ?? [], [clientesList.data]);

  const [idCliente, setIdCliente] = useState("");
  const [diaSemana, setDiaSemana] = useState("");
  const [abreManana, setAbreManana] = useState("");
  const [cierraManana, setCierraManana] = useState("");
  const [abreTarde, setAbreTarde] = useState("");
  const [cierraTarde, setCierraTarde] = useState("");
  const [tfnoDesvio, setTfnoDesvio] = useState("");
  const [segEspera, setSegEspera] = useState("");

  useEffect(() => {
    if (open) {
      if (initial) {
        setIdCliente(initial.ID_CLIENTE);
        setDiaSemana(initial.DIA_SEMANA);
        setAbreManana(toTimeInputValue(initial.ABRE_MAÑANA));
        setCierraManana(toTimeInputValue(initial.CIERRA_MAÑANA));
        setAbreTarde(toTimeInputValue(initial.ABRE_TARDE));
        setCierraTarde(toTimeInputValue(initial.CIERRA_TARDE));
        setTfnoDesvio(initial.TFNO_DESVIO ?? "");
        setSegEspera(initial.SEG_ESPERA != null ? String(initial.SEG_ESPERA) : "");
      } else {
        setIdCliente("");
        setDiaSemana("");
        setAbreManana("");
        setCierraManana("");
        setAbreTarde("");
        setCierraTarde("");
        setTfnoDesvio("");
        setSegEspera("");
      }
    }
  }, [open, initial]);

  const handleTimeChange = (
    field: "ABRE_MAÑANA" | "CIERRA_MAÑANA" | "ABRE_TARDE" | "CIERRA_TARDE",
    value: string,
  ) => {
    if (field === "ABRE_MAÑANA") setAbreManana(value);
    if (field === "CIERRA_MAÑANA") setCierraManana(value);
    if (field === "ABRE_TARDE") setAbreTarde(value);
    if (field === "CIERRA_TARDE") setCierraTarde(value);
  };

  const buildPayload = (): HorarioCreateInput | HorarioUpdateInput => {
    const timePatch = {
      ABRE_MAÑANA: emptyToNull(abreManana),
      CIERRA_MAÑANA: emptyToNull(cierraManana),
      ABRE_TARDE: emptyToNull(abreTarde),
      CIERRA_TARDE: emptyToNull(cierraTarde),
    };

    if (!isMaster) {
      return timePatch;
    }

    if (isEdit) {
      return {
        ...timePatch,
        TFNO_DESVIO: emptyToNull(tfnoDesvio),
        SEG_ESPERA: emptyToNullNumber(segEspera),
      };
    }

    return {
      ID_CLIENTE: idCliente,
      DIA_SEMANA: diaSemana,
      ...timePatch,
      TFNO_DESVIO: emptyToNull(tfnoDesvio),
      SEG_ESPERA: emptyToNullNumber(segEspera),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMaster && !isEdit && (!idCliente || !diaSemana)) {
      toast.error("Debes seleccionar cliente y día de la semana");
      return;
    }
    onSubmit(buildPayload());
  };

  const formBody = (
    <form id={embedded ? "horario-form" : undefined} onSubmit={handleSubmit}>
      {isMaster ? (
        <Tabs defaultValue="horarios" className="w-full">
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="horarios">Horarios Comerciales</TabsTrigger>
            <TabsTrigger value="centralita">Configuración Centralita</TabsTrigger>
          </TabsList>

          <TabsContent value="horarios" className="space-y-4">
            {!isEdit ? (
              <FormField label="Día de la semana *">
                <Select value={diaSemana} onValueChange={setDiaSemana}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar día" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIA_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            ) : (
              <FormField label="Día de la semana">
                <Input value={formatDiaSemana(diaSemana)} disabled readOnly />
              </FormField>
            )}

            <HorarioTimeFields
              abreManana={abreManana}
              cierraManana={cierraManana}
              abreTarde={abreTarde}
              cierraTarde={cierraTarde}
              onChange={handleTimeChange}
            />
          </TabsContent>

          <TabsContent value="centralita" className="space-y-4">
            <FormField label="ID_CLIENTE">
              {!isEdit ? (
                clientes.length > 0 ? (
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
                )
              ) : (
                <Input value={idCliente} disabled readOnly className="font-mono text-sm" />
              )}
            </FormField>
            <FormField label="TFNO_DESVIO">
              <Input
                value={tfnoDesvio}
                onChange={(e) => setTfnoDesvio(e.target.value)}
                placeholder="Teléfono de desvío"
              />
            </FormField>
            <FormField label="SEG_ESPERA">
              <Input
                type="number"
                min={0}
                value={segEspera}
                onChange={(e) => setSegEspera(e.target.value)}
                placeholder="Segundos de espera"
              />
            </FormField>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4">
          <FormField label="Día de la semana">
            <Input value={formatDiaSemana(diaSemana)} disabled readOnly />
          </FormField>
          <HorarioTimeFields
            abreManana={abreManana}
            cierraManana={cierraManana}
            abreTarde={abreTarde}
            cierraTarde={cierraTarde}
            onChange={handleTimeChange}
          />
        </div>
      )}

      {!embedded ? (
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitLabel}
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}
