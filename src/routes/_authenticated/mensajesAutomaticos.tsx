import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil } from "lucide-react";
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

function MensajesAutomaticosPage() {
  const { rol } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const canView = canViewUsuariosYMensajes(rol);
  const { list, create, update, remove } = useHorarioComercial();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<HorarioData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<HorarioData | null>(null);

  const filtered = useMemo(() => {
    const rows = sortHorarios(list.data ?? []);
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
  }, [list.data, query]);

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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mensajes automáticos</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} horarios registrados
          </p>
        </div>
        {isMaster && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo Horario
          </Button>
        )}
      </div>

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
                    className={
                      canMutate
                        ? "cursor-pointer hover:bg-muted/50 transition-colors"
                        : undefined
                    }
                    onClick={canMutate ? () => setEditing(h) : undefined}
                  >
                    {isMaster && (
                      <TableCell className="font-mono text-xs">{h.ID_CLIENTE}</TableCell>
                    )}
                    <TableCell className="font-medium">{formatDiaSemana(h.DIA_SEMANA)}</TableCell>
                    <TableCell>{formatTime(h.ABRE_MAÑANA)}</TableCell>
                    <TableCell>{formatTime(h.CIERRA_MAÑANA)}</TableCell>
                    <TableCell>{formatTime(h.ABRE_TARDE)}</TableCell>
                    <TableCell>{formatTime(h.CIERRA_TARDE)}</TableCell>
                    {isMaster && <TableCell>{h.TFNO_DESVIO ?? "—"}</TableCell>}
                    {isMaster && <TableCell>{h.SEG_ESPERA ?? "—"}</TableCell>}
                    {canMutate && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(h)}>
                              <Pencil className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            {isMaster && (
                              <DropdownMenuItem
                                onClick={() => setDeleting(h)}
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

      {isMaster && (
        <HorarioFormDialog
          open={creating}
          onClose={() => setCreating(false)}
          title="Nuevo horario"
          submitLabel="Crear"
          isMaster={isMaster}
          isEdit={false}
          submitting={create.isPending}
          onSubmit={async (values) => {
            try {
              await create.mutateAsync(values as HorarioCreateInput);
              toast.success("Horario creado");
              setCreating(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al crear");
            }
          }}
        />
      )}

      {canMutate && editing && (
        <HorarioFormDialog
          open
          onClose={() => setEditing(null)}
          title="Editar horario"
          submitLabel="Guardar"
          isMaster={isMaster}
          isEdit
          initial={editing}
          submitting={update.isPending}
          onSubmit={async (values) => {
            try {
              await update.mutateAsync({
                id: editing.ID_HORARIO,
                patch: values as HorarioUpdateInput,
              });
              toast.success("Horario actualizado");
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
  onChange: (field: keyof Pick<HorarioData, "ABRE_MAÑANA" | "CIERRA_MAÑANA" | "ABRE_TARDE" | "CIERRA_TARDE">, value: string) => void;
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
  onSubmit: (values: HorarioCreateInput | HorarioUpdateInput) => void;
}) {
  const { list: clientesList } = useClientes();
  const clientes = clientesList.data ?? [];

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
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

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
