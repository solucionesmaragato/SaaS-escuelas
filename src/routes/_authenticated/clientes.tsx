import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil } from "lucide-react";
import { useClientes, type ClienteData } from "@/hooks/useClientes";
import { useActiveTenant } from "@/context/AppContext";
import { isMasterRole } from "@/lib/tenantQuery";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clientes")({
  component: ClientesPage,
});

const EMPTY_CLIENTE: ClienteData = {
  ID_CLIENTE: "",
  NOMBRE_ESCUELA: "",
  REF_FACTURA: null,
  TLF_REAL: null,
  VAPI_ASSISTANT_ID: null,
  VAPI_PHONE_NUMBER: null,
  URL_WEB: null,
  EMAIL_CLIENTE: null,
  APP_LOGO: null,
  CIF: null,
  DIRECCION: null,
  ESTADO_CLIENTE: null,
  PLAN: null,
  METODO_PAGO_PROPIO: null,
  PAGO: null,
  TARIFA: null,
  FECHA_PROXIMO_PLAN: null,
  NOMINAS: null,
  SECRETARIA: null,
  MONTAJE: null,
  MONTAJE_PENDIENTE: null,
  DESCUENTO: null,
  TIPO_COBRO: null,
  ESTADO_MANDATO: null,
  IBAN: null,
  STRIPE_ID: null,
  STRIPE_API_KEY: null,
  DOCUMENTO_SEPA: null,
  HOLDED_CONTACT_ID: null,
  HOLDED_API_KEY: null,
};

function ClientesPage() {
  const { rol } = useActiveTenant();
  const { list, create, update, remove } = useClientes();

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ClienteData | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<ClienteData | null>(null);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (c) =>
        c.ID_CLIENTE?.toLowerCase().includes(q) ||
        c.NOMBRE_ESCUELA?.toLowerCase().includes(q) ||
        c.EMAIL_CLIENTE?.toLowerCase().includes(q) ||
        c.PLAN?.toLowerCase().includes(q) ||
        c.ESTADO_CLIENTE?.toLowerCase().includes(q),
    );
  }, [list.data, query]);

  if (!isMasterRole(rol)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. Exclusivo para Master.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Clientes"
        description={`${list.data?.length ?? 0} registrados en el sistema`}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
          </Button>
        }
      />

      <Card className="p-4">
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por ID, escuela, email, plan o estado..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar clientes: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID_CLIENTE</TableHead>
                <TableHead>NOMBRE_ESCUELA</TableHead>
                <TableHead>EMAIL_CLIENTE</TableHead>
                <TableHead>PLAN</TableHead>
                <TableHead>ESTADO_CLIENTE</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "Aún no hay clientes registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow
                    key={c.ID_CLIENTE}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditing(c)}
                  >
                    <TableCell className="font-mono text-xs">{c.ID_CLIENTE}</TableCell>
                    <TableCell className="font-medium">{c.NOMBRE_ESCUELA}</TableCell>
                    <TableCell>{c.EMAIL_CLIENTE ?? "—"}</TableCell>
                    <TableCell>{c.PLAN ?? "—"}</TableCell>
                    <TableCell>{c.ESTADO_CLIENTE ?? "—"}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(c)}>
                            <Pencil className="mr-2 h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleting(c)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ClienteFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Nuevo cliente"
        submitLabel="Crear"
        submitting={create.isPending}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(values);
            toast.success("Cliente creado");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al crear");
          }
        }}
      />

      <ClienteFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Editar cliente"
        submitLabel="Guardar"
        initial={editing}
        submitting={update.isPending}
        onSubmit={async (values) => {
          if (!editing) return;
          const { ID_CLIENTE: _id, ...patch } = values;
          try {
            await update.mutateAsync({ id: editing.ID_CLIENTE, patch });
            toast.success("Cliente actualizado");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el cliente <b>{deleting?.NOMBRE_ESCUELA}</b> ({deleting?.ID_CLIENTE}).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_CLIENTE);
                  toast.success("Cliente eliminado");
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

function ClienteFormDialog({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: ClienteData | null;
  submitting: boolean;
  onSubmit: (values: ClienteData) => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState<ClienteData>(EMPTY_CLIENTE);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...initial } : { ...EMPTY_CLIENTE });
    }
  }, [open, initial]);

  const setNum = (key: "TARIFA" | "DESCUENTO") => (value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value === "" ? null : Number(value),
    }));
  };

  const setStr = (key: keyof ClienteData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (key === "ID_CLIENTE" || key === "NOMBRE_ESCUELA") {
      setForm((prev) => ({ ...prev, [key]: raw }));
    } else {
      setForm((prev) => ({ ...prev, [key]: raw || null }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.ID_CLIENTE.trim() || !form.NOMBRE_ESCUELA.trim()) return;
            onSubmit({
              ...form,
              ID_CLIENTE: form.ID_CLIENTE.trim(),
              NOMBRE_ESCUELA: form.NOMBRE_ESCUELA.trim(),
            });
          }}
        >
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-4">
              <TabsTrigger value="general">Datos Generales</TabsTrigger>
              <TabsTrigger value="facturacion">Facturación y Planes</TabsTrigger>
              <TabsTrigger value="modulos">Módulos Internos</TabsTrigger>
              <TabsTrigger value="integraciones">Integraciones API</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="grid gap-4 sm:grid-cols-2">
              <FormField label="ID_CLIENTE *">
                <Input
                  value={form.ID_CLIENTE}
                  onChange={setStr("ID_CLIENTE")}
                  disabled={isEdit}
                  required
                />
              </FormField>
              <FormField label="NOMBRE_ESCUELA *">
                <Input value={form.NOMBRE_ESCUELA} onChange={setStr("NOMBRE_ESCUELA")} required />
              </FormField>
              <FormField label="CIF">
                <Input value={form.CIF ?? ""} onChange={setStr("CIF")} />
              </FormField>
              <FormField label="DIRECCION">
                <Input value={form.DIRECCION ?? ""} onChange={setStr("DIRECCION")} />
              </FormField>
              <FormField label="TLF_REAL">
                <Input value={form.TLF_REAL ?? ""} onChange={setStr("TLF_REAL")} />
              </FormField>
              <FormField label="EMAIL_CLIENTE">
                <Input
                  type="email"
                  value={form.EMAIL_CLIENTE ?? ""}
                  onChange={setStr("EMAIL_CLIENTE")}
                />
              </FormField>
              <FormField label="URL_WEB">
                <Input value={form.URL_WEB ?? ""} onChange={setStr("URL_WEB")} />
              </FormField>
              <FormField label="APP_LOGO">
                <Input value={form.APP_LOGO ?? ""} onChange={setStr("APP_LOGO")} />
              </FormField>
            </TabsContent>

            <TabsContent value="facturacion" className="grid gap-4 sm:grid-cols-2">
              <FormField label="ESTADO_CLIENTE">
                <Input value={form.ESTADO_CLIENTE ?? ""} onChange={setStr("ESTADO_CLIENTE")} />
              </FormField>
              <FormField label="PLAN">
                <Input value={form.PLAN ?? ""} onChange={setStr("PLAN")} />
              </FormField>
              <FormField label="TARIFA">
                <Input
                  type="number"
                  step="0.01"
                  value={form.TARIFA ?? ""}
                  onChange={(e) => setNum("TARIFA")(e.target.value)}
                />
              </FormField>
              <FormField label="FECHA_PROXIMO_PLAN">
                <Input
                  type="date"
                  value={form.FECHA_PROXIMO_PLAN ?? ""}
                  onChange={setStr("FECHA_PROXIMO_PLAN")}
                />
              </FormField>
              <FormField label="REF_FACTURA">
                <Input value={form.REF_FACTURA ?? ""} onChange={setStr("REF_FACTURA")} />
              </FormField>
              <FormField label="METODO_PAGO_PROPIO">
                <Input
                  value={form.METODO_PAGO_PROPIO ?? ""}
                  onChange={setStr("METODO_PAGO_PROPIO")}
                />
              </FormField>
              <FormField label="PAGO">
                <Input value={form.PAGO ?? ""} onChange={setStr("PAGO")} />
              </FormField>
              <FormField label="DESCUENTO">
                <Input
                  type="number"
                  step="0.01"
                  value={form.DESCUENTO ?? ""}
                  onChange={(e) => setNum("DESCUENTO")(e.target.value)}
                />
              </FormField>
              <FormField label="TIPO_COBRO">
                <Input value={form.TIPO_COBRO ?? ""} onChange={setStr("TIPO_COBRO")} />
              </FormField>
              <FormField label="ESTADO_MANDATO">
                <Input value={form.ESTADO_MANDATO ?? ""} onChange={setStr("ESTADO_MANDATO")} />
              </FormField>
              <FormField label="IBAN">
                <Input value={form.IBAN ?? ""} onChange={setStr("IBAN")} />
              </FormField>
              <FormField label="DOCUMENTO_SEPA">
                <Input value={form.DOCUMENTO_SEPA ?? ""} onChange={setStr("DOCUMENTO_SEPA")} />
              </FormField>
            </TabsContent>

            <TabsContent value="modulos" className="grid gap-4 sm:grid-cols-2">
              <FormField label="NOMINAS">
                <Input value={form.NOMINAS ?? ""} onChange={setStr("NOMINAS")} />
              </FormField>
              <FormField label="SECRETARIA">
                <Input value={form.SECRETARIA ?? ""} onChange={setStr("SECRETARIA")} />
              </FormField>
              <FormField label="MONTAJE">
                <Input value={form.MONTAJE ?? ""} onChange={setStr("MONTAJE")} />
              </FormField>
              <FormField label="MONTAJE_PENDIENTE">
                <Input
                  value={form.MONTAJE_PENDIENTE ?? ""}
                  onChange={setStr("MONTAJE_PENDIENTE")}
                />
              </FormField>
            </TabsContent>

            <TabsContent value="integraciones" className="grid gap-4 sm:grid-cols-2">
              <FormField label="VAPI_ASSISTANT_ID">
                <Input
                  value={form.VAPI_ASSISTANT_ID ?? ""}
                  onChange={setStr("VAPI_ASSISTANT_ID")}
                />
              </FormField>
              <FormField label="VAPI_PHONE_NUMBER">
                <Input
                  value={form.VAPI_PHONE_NUMBER ?? ""}
                  onChange={setStr("VAPI_PHONE_NUMBER")}
                />
              </FormField>
              <FormField label="STRIPE_ID">
                <Input value={form.STRIPE_ID ?? ""} onChange={setStr("STRIPE_ID")} />
              </FormField>
              <FormField label="STRIPE_API_KEY">
                <Input value={form.STRIPE_API_KEY ?? ""} onChange={setStr("STRIPE_API_KEY")} />
              </FormField>
              <FormField label="HOLDED_CONTACT_ID">
                <Input
                  value={form.HOLDED_CONTACT_ID ?? ""}
                  onChange={setStr("HOLDED_CONTACT_ID")}
                />
              </FormField>
              <FormField label="HOLDED_API_KEY">
                <Input value={form.HOLDED_API_KEY ?? ""} onChange={setStr("HOLDED_API_KEY")} />
              </FormField>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
