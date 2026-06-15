import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil, Eye, FileText, ExternalLink, Download, CreditCard, Calendar } from "lucide-react";
import { useRecibos } from "@/hooks/useRecibos";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useActiveTenant } from "@/context/AppContext";
import { canWriteUi } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/recibos")({
  component: RecibosPage,
});

const PAGE_SIZE = 10;

function RecibosPage() {
  const { rol } = useActiveTenant();
  const canWrite = canWriteUi(rol, "recibos:write");
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update, remove } = useRecibos(filterCenterId);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r: any) =>
      r.REF_RECIBO?.toLowerCase().includes(q) ||
      r.NUM_FACTURA_HOLDED?.toLowerCase().includes(q) ||
      r.RECEPTOR_NOMBRE?.toLowerCase().includes(q) ||
      r.ALUMNOS?.NOMBRE_ALUMNO?.toLowerCase().includes(q) ||
      r.MES_PERIODO?.toLowerCase().includes(q) ||
      r.ESTADO_PAGO?.toLowerCase().includes(q)
    );
  }, [list.data, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabecera de control */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recibos y Facturación</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} comprobantes consolidados en el sistema
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Emitir recibo manual
          </Button>
        )}
      </div>

      <Card className="p-4">
        {/* Buscador inteligente */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por referencia, cliente, mes o estado..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="recibos-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={(v) => { setSelectedCenterId(v); setPage(1); }}
            />
          )}
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error en la lectura financiera de Supabase: {(list.error as Error)?.message}
          </div>
        )}

        {/* Tabla compacta y estilizada */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referencia / Factura</TableHead>
                <TableHead>Receptor / Alumno</TableHead>
                <TableHead>Fecha / Periodo</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Total Doc</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados financieros." : "No hay registros de cobros aún."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r: any) => {
                  // Lógica cromática limpia para estados comerciales de caja
                  const estado = r.ESTADO_PAGO?.toLowerCase();
                  const badgeVariant = estado === "cobrado" || estado === "pagado"
                    ? "default" 
                    : estado === "pendiente" || estado === "emitido"
                    ? "secondary" 
                    : "destructive";

                  return (
                    <TableRow key={r.ID_RECIBO}>
                      <TableCell className="font-mono text-xs font-semibold text-slate-900">
                        <div>{r.REF_RECIBO || "—"}</div>
                        {r.NUM_FACTURA_HOLDED && <div className="text-[10px] text-muted-foreground font-sans">Holded: {r.NUM_FACTURA_HOLDED}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{r.RECEPTOR_NOMBRE || "—"}</div>
                        {r.ALUMNOS?.NOMBRE_ALUMNO && <div className="text-xs text-muted-foreground">Alumno: {r.ALUMNOS.NOMBRE_ALUMNO}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {r.FECHA ?? "—"}</div>
                        {r.MES_PERIODO && <div className="capitalize font-medium text-slate-700">{r.MES_PERIODO}</div>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><CreditCard className="h-3 w-3" /> {r.METODO_PAGO || "Remesa"}</span>
                      </TableCell>
                      <TableCell className="font-mono font-bold text-sm text-blue-950">
                        {r.TOTAL_DOC != null ? `${Number(r.TOTAL_DOC).toFixed(2)}€` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeVariant} className="capitalize text-[10px] px-2 py-0.5">
                          {r.ESTADO_PAGO ?? "Pendiente"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewing(r)}>
                              <Eye className="mr-2 h-4 w-4" /> Ver detalle completo
                            </DropdownMenuItem>
                            {canWrite && (
                              <DropdownMenuItem onClick={() => setEditing(r)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar importes
                              </DropdownMenuItem>
                            )}
                            {canWrite && (
                              <DropdownMenuItem onClick={() => setDeleting(r)} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" /> Anular / Eliminar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación Real */}
        {filtered.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm border-t pt-4">
            <div className="text-muted-foreground">
              Página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* MODAL DETALLE: Organiza de forma impecable las columnas internas y externas */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-blue-900" /> Ficha de Liquidación de Recibo</DialogTitle>
            <DialogDescription>Información estructurada de caja y pasarelas</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 pt-2 text-xs">
              
              {/* Bloque 1: Cabecera Técnica */}
              <div className="grid grid-cols-2 gap-3 bg-muted/50 p-2.5 rounded-lg border">
                <div><span className="text-muted-foreground block font-medium">Referencia Interna</span><span className="font-mono font-semibold text-slate-900">{viewing.REF_RECIBO || "—"}</span></div>
                <div><span className="text-muted-foreground block font-medium">Estado de Operación</span><Badge variant="outline" className="mt-0.5 capitalize">{viewing.ESTADO_PAGO ?? "Pendiente"}</Badge></div>
              </div>

              {/* Bloque 2: Datos del Receptor Financiero */}
              <div className="space-y-2 border-t pt-2">
                <h3 className="font-bold text-slate-900 text-xs">Datos del Cliente / Pagador</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground block">Nombre del Receptor</span><span className="font-medium text-slate-900">{viewing.RECEPTOR_NOMBRE || "—"}</span></div>
                  <div><span className="text-muted-foreground block">DNI / CIF</span><span className="font-mono font-medium">{viewing.CIF_DNI || "—"}</span></div>
                  <div><span className="text-muted-foreground block">Contacto Electrónico</span><span>{viewing.MAIL || "—"}</span></div>
                  <div><span className="text-muted-foreground block">Teléfono Móvil</span><span>{viewing.TLF || "—"}</span></div>
                  <div className="col-span-2"><span className="text-muted-foreground block">Dirección Fiscal</span><span>{viewing.DIRECCION || "—"}</span></div>
                </div>
              </div>

              {/* Bloque 3: Desglose Económico */}
              <div className="space-y-2 border-t pt-2 bg-slate-50 p-2.5 rounded-md border">
                <h3 className="font-bold text-blue-950 text-xs">Desglose Fiscal de Importes</h3>
                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  <div className="bg-white p-1.5 rounded border">
                    <span className="text-[10px] text-muted-foreground block">Base Imp.</span>
                    <span className="font-semibold text-slate-900">{viewing.TOTAL_BASE != null ? `${Number(viewing.TOTAL_BASE).toFixed(2)}€` : "0.00€"}</span>
                  </div>
                  <div className="bg-white p-1.5 rounded border">
                    <span className="text-[10px] text-muted-foreground block">Descuento</span>
                    <span className="font-semibold text-amber-700">-{viewing.DESCUENTO != null ? `${Number(viewing.DESCUENTO).toFixed(2)}€` : "0.00€"}</span>
                  </div>
                  <div className="bg-white p-1.5 rounded border">
                    <span className="text-[10px] text-muted-foreground block">Impuestos (IVA)</span>
                    <span className="font-semibold text-slate-900">{viewing.TOTAL_IVA != null ? `${Number(viewing.TOTAL_IVA).toFixed(2)}€` : "0.00€"}</span>
                  </div>
                  <div className="bg-blue-900/10 p-1.5 rounded border border-blue-900/20">
                    <span className="text-[10px] text-blue-900 block font-bold">Total Doc</span>
                    <span className="font-bold text-blue-950 text-sm">{viewing.TOTAL_DOC != null ? `${Number(viewing.TOTAL_DOC).toFixed(2)}€` : "0.00€"}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div><span className="text-muted-foreground">Tipo de Documento:</span> <span className="font-medium">{viewing.TIPO_DOC ?? "Factura Simplificada"}</span></div>
                  <div><span className="text-muted-foreground">Método Liquidación:</span> <span className="font-medium">{viewing.METODO_PAGO ?? "Remesa Bancaria"}</span></div>
                </div>
              </div>

              {/* Bloque 4: Integración Externa Holded y Enlaces (Aquí organizamos los campos de n8n) */}
              <div className="space-y-2 border-t pt-2">
                <h3 className="font-bold text-slate-900 text-xs">Pasarelas y Documentación Externa (n8n / Holded)</h3>
                <div className="grid grid-cols-2 gap-2">
                  {viewing.NUM_FACTURA_HOLDED && (
                    <div className="flex items-center justify-between border p-2 rounded bg-white">
                      <div><span className="text-[10px] text-muted-foreground block">Factura Holded</span><span className="font-mono font-semibold">{viewing.NUM_FACTURA_HOLDED}</span></div>
                      {viewing.LINK_FACTURA_HOLDED && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-950" asChild>
                          <a href={viewing.LINK_FACTURA_HOLDED} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                        </Button>
                      )}
                    </div>
                  )}
                  {viewing.LINK_PDF_RECIBO && (
                    <div className="flex items-center justify-between border p-2 rounded bg-white col-span-1">
                      <div><span className="text-[10px] text-muted-foreground block">Archivo PDF Oficial</span><span className="font-medium">Descargar copia</span></div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-700" asChild>
                        <a href={viewing.LINK_PDF_RECIBO} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
                      </Button>
                    </div>
                  )}
                  {viewing.URL_QR && (
                    <div className="col-span-2 flex items-center justify-between border p-2 rounded bg-white">
                      <div><span className="text-[10px] text-muted-foreground block">Enlace de Validación QR</span><span className="font-mono text-[10px] truncate max-w-md block">{viewing.URL_QR}</span></div>
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" asChild>
                        <a href={viewing.URL_QR} target="_blank" rel="noreferrer">Ver QR</a>
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bloque 5: Seguridad Estricta Oculta a la vista principal */}
              {viewing.HUELLA_HASH && (
                <div className="border-t pt-2 text-[10px] text-muted-foreground bg-muted/20 p-2 rounded">
                  <span className="font-mono block font-semibold">Criptografía / Huella Hash de Auditoría (Sistema):</span>
                  <span className="font-mono block break-all mt-0.5 select-all">{viewing.HUELLA_HASH}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <ReciboFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Emitir Nuevo Comprobante / Recibo"
        submitLabel="Emitir Documento"
        submitting={create.isPending}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(values);
            toast.success("Recibo guardado y encolado para n8n");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al guardar");
          }
        }}
      />

      {/* Edit Modal */}
      <ReciboFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Modificar Datos Económicos del Recibo"
        submitLabel="Guardar Cambios"
        initial={editing}
        submitting={update.isPending}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.ID_RECIBO, patch: values });
            toast.success("Comprobante actualizado");
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      {/* Delete Modal */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Proceder a anular este Recibo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará de la base de datos el registro de cobro con referencia <b>{deleting?.REF_RECIBO || deleting?.ID_RECIBO}</b>. Esta acción descuadrará las métricas de caja diarias.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_RECIBO);
                  toast.success("Registro eliminado de caja");
                  setDeleting(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al eliminar");
                }
              }}
            >
              Anular Recibo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DIÁLOGO DEL FORMULARIO DE RECIBOS 🛠️ (Inputs limpios controlados)
// ---------------------------------------------------------------------------

function ReciboFormDialog({
  open, onClose, title, submitLabel, initial, submitting, onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: any | null;
  submitting: boolean;
  onSubmit: (values: any) => void;
}) {
  const [refRecibo, setRefRecibo] = useState(initial?.REF_RECIBO ?? "");
  const [idAlumno, setIdAlumno] = useState(initial?.ID_ALUMNO ?? "");
  const [receptorNombre, setReceptorNombre] = useState(initial?.RECEPTOR_NOMBRE ?? "");
  const [cifDni, setCifDni] = useState(initial?.CIF_DNI ?? "");
  const [mail, setMail] = useState(initial?.MAIL ?? "");
  const [tlf, setTlf] = useState(initial?.TLF ?? "");
  const [fecha, setFecha] = useState(initial?.FECHA ?? "");
  const [mesPeriodo, setMesPeriodo] = useState(initial?.MES_PERIODO ?? "");
  const [direccion, setDireccion] = useState(initial?.DIRECCION ?? "");
  const [tipoDoc, setTipoDoc] = useState(initial?.TIPO_DOC ?? "Factura Simplificada");
  const [metodoPago, setMetodoPago] = useState(initial?.METODO_PAGO ?? "Remesa Bancaria");
  const [totalBase, setTotalBase] = useState(initial?.TOTAL_BASE?.toString() ?? "");
  const [descuento, setDescuento] = useState(initial?.DESCUENTO?.toString() ?? "");
  const [totalIva, setTotalIva] = useState(initial?.TOTAL_IVA?.toString() ?? "0");
  const [totalDoc, setTotalDoc] = useState(initial?.TOTAL_DOC?.toString() ?? "");
  const [estadoPago, setEstadoPago] = useState(initial?.ESTADO_PAGO ?? "Cobrado");
  const [numFacturaHolded, setNumFacturaHolded] = useState(initial?.NUM_FACTURA_HOLDED ?? "");
  const [linkFacturaHolded, setLinkFacturaHolded] = useState(initial?.LINK_FACTURA_HOLDED ?? "");
  const [linkPdfRecibo, setLinkPdfRecibo] = useState(initial?.LINK_PDF_RECIBO ?? "");

  useMemo(() => {
    if (open) {
      setRefRecibo(initial?.REF_RECIBO ?? "");
      setIdAlumno(initial?.ID_ALUMNO ?? "");
      setReceptorNombre(initial?.RECEPTOR_NOMBRE ?? "");
      setCifDni(initial?.CIF_DNI ?? "");
      setMail(initial?.MAIL ?? "");
      setTlf(initial?.TLF ?? "");
      setFecha(initial?.FECHA ?? "");
      setMesPeriodo(initial?.MES_PERIODO ?? "");
      setDireccion(initial?.DIRECCION ?? "");
      setTipoDoc(initial?.TIPO_DOC ?? "Factura Simplificada");
      setMetodoPago(initial?.METODO_PAGO ?? "Remesa Bancaria");
      setTotalBase(initial?.TOTAL_BASE?.toString() ?? "");
      setDescuento(initial?.DESCUENTO?.toString() ?? "");
      setTotalIva(initial?.TOTAL_IVA?.toString() ?? "0");
      setTotalDoc(initial?.TOTAL_DOC?.toString() ?? "");
      setEstadoPago(initial?.ESTADO_PAGO ?? "Cobrado");
      setNumFacturaHolded(initial?.NUM_FACTURA_HOLDED ?? "");
      setLinkFacturaHolded(initial?.LINK_FACTURA_HOLDED ?? "");
      setLinkPdfRecibo(initial?.LINK_PDF_RECIBO ?? "");
    }
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!refRecibo.trim() || !receptorNombre.trim()) return;
            onSubmit({
              REF_RECIBO: refRecibo.trim(),
              ID_ALUMNO: idAlumno || null,
              RECEPTOR_NOMBRE: receptorNombre.trim(),
              CIF_DNI: cifDni || null,
              MAIL: mail || null,
              TLF: tlf || null,
              FECHA: fecha || null,
              MES_PERIODO: mesPeriodo || null,
              DIRECCION: direccion || null,
              TIPO_DOC: tipoDoc || null,
              METODO_PAGO: metodoPago || null,
              TOTAL_BASE: totalBase ? parseFloat(totalBase) : null,
              DESCUENTO: descuento ? parseFloat(descuento) : null,
              TOTAL_IVA: totalIva ? parseFloat(totalIva) : null,
              TOTAL_DOC: totalDoc ? parseFloat(totalDoc) : null,
              ESTADO_PAGO: estadoPago || null,
              NUM_FACTURA_HOLDED: numFacturaHolded || null,
              LINK_FACTURA_HOLDED: linkFacturaHolded || null,
              LINK_PDF_RECIBO: linkPdfRecibo || null,
            });
          }}
          className="space-y-4 pt-1"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Referencia Interna Recibo *</Label>
              <Input value={refRecibo} onChange={(e) => setRefRecibo(e.target.value)} placeholder="Ej: REC-2026-001" required />
            </div>
            <div className="space-y-2">
              <Label>ID del Alumno Relacionado</Label>
              <Input value={idAlumno} onChange={(e) => setIdAlumno(e.target.value)} placeholder="Ej: ESC_004_ALU_0017" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre completo Receptor *</Label>
              <Input value={receptorNombre} onChange={(e) => setReceptorNombre(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>CIF / DNI Fiscal</Label>
              <Input value={cifDni} onChange={(e) => setCifDni(e.target.value)} placeholder="12345678Z" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Email Envío</Label>
              <Input type="email" value={mail} onChange={(e) => setMail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Teléfono Móvil</Label>
              <Input value={tlf} onChange={(e) => setTlf(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Fecha Emisión</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Mes / Periodo de cobro</Label>
              <Input value={mesPeriodo} onChange={(e) => setMesPeriodo(e.target.value)} placeholder="Ej: Junio 2026" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Dirección Fiscal Facturación</Label>
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-4 font-mono">
            <div className="space-y-1 col-span-1">
              <Label className="font-sans text-xs">Base (€)</Label>
              <Input type="number" step="0.01" value={totalBase} onChange={(e) => setTotalBase(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1 col-span-1">
              <Label className="font-sans text-xs">Dto (€)</Label>
              <Input type="number" step="0.01" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1 col-span-1">
              <Label className="font-sans text-xs">IVA (€)</Label>
              <Input type="number" step="0.01" value={totalIva} onChange={(e) => setTotalIva(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1 col-span-1">
              <Label className="font-sans text-xs font-bold">TOTAL (€)</Label>
              <Input type="number" step="0.01" value={totalDoc} onChange={(e) => setTotalDoc(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Tipo Doc</Label>
              <Input value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Método de Pago</Label>
              <Input value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Estado Pago</Label>
              <Input value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)} placeholder="Cobrado, Pendiente..." />
            </div>
          </div>

          <div className="border-t pt-2 space-y-3">
            <p className="text-[11px] font-semibold text-muted-foreground">Enlaces y Sincronizaciones Externas (Opcionales)</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Num Factura Holded</Label>
                <Input value={numFacturaHolded} onChange={(e) => setNumFacturaHolded(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Link Factura Holded</Label>
                <Input value={linkFacturaHolded} onChange={(e) => setLinkFacturaHolded(e.target.value)} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Link PDF Recibo (URL)</Label>
                <Input value={linkPdfRecibo} onChange={(e) => setLinkPdfRecibo(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Guardando..." : submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
