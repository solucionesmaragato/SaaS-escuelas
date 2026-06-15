import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MoreHorizontal, Plus, Search, Trash2, Pencil, Eye, FileCode, FileSpreadsheet, FileArchive, Download, Calendar, HelpCircle } from "lucide-react";
import { useRemesas } from "@/hooks/useRemesas";
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

export const Route = createFileRoute("/_authenticated/remesas")({
  component: RemesasPage,
});

const PAGE_SIZE = 10;

function RemesasPage() {
  const { rol } = useActiveTenant();
  const canWrite = canWriteUi(rol, "remesas:write");
  const { list, create, update, remove } = useRemesas();

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
      r.MES_PERIODO?.toLowerCase().includes(q) ||
      r.ESTADO?.toLowerCase().includes(q) ||
      r.ID_REMESA?.toLowerCase().includes(q)
    );
  }, [list.data, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Cabecera del panel */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gestión de Remesas Bancarias</h1>
          <p className="text-sm text-muted-foreground">
            {list.data?.length ?? 0} remesas SEPA de cobros consolidadas en el sistema
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Generar nueva remesa
          </Button>
        )}
      </div>

      <Card className="p-4">
        {/* Buscador reactivo */}
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar remesa por periodo o estado..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>

        {list.isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive mb-4">
            Error en la lectura de remesas de Supabase: {(list.error as Error)?.message}
          </div>
        )}

        {/* Tabla de operaciones bancarias */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo / Mes</TableHead>
                <TableHead>Estado Remesa</TableHead>
                <TableHead className="text-center">XML SEPA (Banco)</TableHead>
                <TableHead className="text-center">Excel Contable</TableHead>
                <TableHead className="text-center">Recibos ZIP</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados para tu búsqueda." : "No hay registros de remesas SEPA."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((r: any) => {
                  const est = r.ESTADO?.toLowerCase();
                  const badgeVariant = est === "cobrada" || est === "liquidada"
                    ? "default"
                    : est === "enviada" || est === "procesando"
                    ? "secondary"
                    : "outline";

                  return (
                    <TableRow key={r.ID_REMESA}>
                      <TableCell className="font-semibold text-slate-900 capitalize">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {r.MES_PERIODO || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeVariant} className="capitalize text-[10px] px-2">
                          {r.ESTADO ?? "Generada"}
                        </Badge>
                      </TableCell>
                      
                      {/* Enlace XML SEPA */}
                      <TableCell className="text-center">
                        {r.LINK_XML_SEPA ? (
                          <Button variant="ghost" size="sm" className="text-blue-900 h-8 text-xs font-medium" asChild>
                            <a href={r.LINK_XML_SEPA} target="_blank" rel="noreferrer">
                              <FileCode className="mr-1 h-3.5 w-3.5" /> Descargar XML
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Enlace Excel Contabilidad */}
                      <TableCell className="text-center">
                        {r.LINK_EXCEL_CONTABILIDAD ? (
                          <Button variant="ghost" size="sm" className="text-emerald-700 h-8 text-xs font-medium" asChild>
                            <a href={r.LINK_EXCEL_CONTABILIDAD} target="_blank" rel="noreferrer">
                              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> XLS Contable
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Enlace Recibos ZIP */}
                      <TableCell className="text-center">
                        {r.LINK_RECIBOS_ZIP ? (
                          <Button variant="ghost" size="sm" className="text-amber-700 h-8 text-xs font-medium" asChild>
                            <a href={r.LINK_RECIBOS_ZIP} target="_blank" rel="noreferrer">
                              <FileArchive className="mr-1 h-3.5 w-3.5" /> ZIP Recibos
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewing(r)}>
                              <Eye className="mr-2 h-4 w-4" /> Ver metadatos remesa
                            </DropdownMenuItem>
                            {canWrite && (
                              <DropdownMenuItem onClick={() => setEditing(r)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar enlaces / Estado
                              </DropdownMenuItem>
                            )}
                            {canWrite && (
                              <DropdownMenuItem onClick={() => setDeleting(r)} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" /> Eliminar registro
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

        {/* Paginación real */}
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

      {/* MODAL DETALLE COMPLETO */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-blue-900" /> Ficha Técnica de Remesa Bancaria
            </DialogTitle>
            <DialogDescription>Enlaces e identificadores de liquidación generados</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="bg-muted p-2.5 rounded border font-mono">
                <span className="text-muted-foreground block">ID Remesa Técnico (Supabase)</span>
                <span className="text-slate-900 font-semibold break-all">{viewing.ID_REMESA}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground block font-medium">Periodo / Mes</span>
                  <span className="font-bold text-slate-900 capitalize text-sm">{viewing.MES_PERIODO || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block font-medium">Estado Operativo</span>
                  <Badge variant="outline" className="mt-0.5 capitalize">{viewing.ESTADO ?? "Generada"}</Badge>
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <h4 className="font-bold text-slate-900">Historial de Archivos Adjuntos</h4>
                
                {/* Bloque XML */}
                <div className="flex items-center justify-between border p-2 rounded bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-5 w-5 text-blue-900" />
                    <div><span className="font-medium block">Normativa XML SEPA</span><span className="text-[10px] text-muted-foreground">Para subir a banca online</span></div>
                  </div>
                  {viewing.LINK_XML_SEPA ? (
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" asChild>
                      <a href={viewing.LINK_XML_SEPA} target="_blank" rel="noreferrer"><Download className="h-3 w-3 mr-1" /> Bajar</a>
                    </Button>
                  ) : <span className="text-[10px] text-muted-foreground italic">No generado</span>}
                </div>

                {/* Bloque Excel */}
                <div className="flex items-center justify-between border p-2 rounded bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
                    <div><span className="font-medium block">Libro Diario Excel</span><span className="text-[10px] text-muted-foreground">Asientos para contabilidad</span></div>
                  </div>
                  {viewing.LINK_EXCEL_CONTABILIDAD ? (
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" asChild>
                      <a href={viewing.LINK_EXCEL_CONTABILIDAD} target="_blank" rel="noreferrer"><Download className="h-3 w-3 mr-1" /> Bajar</a>
                    </Button>
                  ) : <span className="text-[10px] text-muted-foreground italic">No generado</span>}
                </div>

                {/* Bloque ZIP */}
                <div className="flex items-center justify-between border p-2 rounded bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <FileArchive className="h-5 w-5 text-amber-700" />
                    <div><span className="font-medium block">Paquete Comprobantes ZIP</span><span className="text-[10px] text-muted-foreground">Todos los PDFs comprimidos</span></div>
                  </div>
                  {viewing.LINK_RECIBOS_ZIP ? (
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" asChild>
                      <a href={viewing.LINK_RECIBOS_ZIP} target="_blank" rel="noreferrer"><Download className="h-3 w-3 mr-1" /> Bajar</a>
                    </Button>
                  ) : <span className="text-[10px] text-muted-foreground italic">No generado</span>}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Modal */}
      <RemesaFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Generar Registro de Remesa Bancaria"
        submitLabel="Generar Entrada"
        submitting={create.isPending}
        onSubmit={async (values) => {
          try {
            await create.mutateAsync(values);
            toast.success("Remesa registrada. n8n inyectará los archivos en unos minutos");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al registrar");
          }
        }}
      />

      {/* Edit Modal */}
      <RemesaFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Modificar Configuración de Remesa"
        submitLabel="Guardar Cambios"
        initial={editing}
        submitting={update.isPending}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await update.mutateAsync({ id: editing.ID_REMESA, patch: values });
            toast.success("Registro de remesa actualizado correctamente");
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
            <AlertDialogTitle>¿Eliminar este histórico bancario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará definitivamente el registro de la remesa del periodo <b>{deleting?.MES_PERIODO}</b>. Los archivos XML o ZIP enlazados dejarán de estar disponibles en esta consola. Esta operación es definitiva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_REMESA);
                  toast.success("Registro purgado de la base de datos");
                  setDeleting(null);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Error al eliminar");
                }
              }}
            >
              Eliminar Remesa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DIÁLOGO FORMULARIO INTERACTIVO 🛠️
// ---------------------------------------------------------------------------

function RemesaFormDialog({
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
  const [mesPeriodo, setMesPeriodo] = useState(initial?.MES_PERIODO ?? "");
  const [estado, setEstado] = useState(initial?.ESTADO ?? "Generada");
  const [linkXmlSepa, setLinkXmlSepa] = useState(initial?.LINK_XML_SEPA ?? "");
  const [linkExcelContabilidad, setLinkExcelContabilidad] = useState(initial?.LINK_EXCEL_CONTABILIDAD ?? "");
  const [linkRecibosZip, setLinkRecibosZip] = useState(initial?.LINK_RECIBOS_ZIP ?? "");

  useMemo(() => {
    if (open) {
      setMesPeriodo(initial?.MES_PERIODO ?? "");
      setEstado(initial?.ESTADO ?? "Generada");
      setLinkXmlSepa(initial?.LINK_XML_SEPA ?? "");
      setLinkExcelContabilidad(initial?.LINK_EXCEL_CONTABILIDAD ?? "");
      setLinkRecibosZip(initial?.LINK_RECIBOS_ZIP ?? "");
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
            if (!mesPeriodo.trim()) return;
            onSubmit({
              MES_PERIODO: mesPeriodo.trim(),
              ESTADO: estado || null,
              LINK_XML_SEPA: linkXmlSepa || null,
              LINK_EXCEL_CONTABILIDAD: linkExcelContabilidad || null,
              LINK_RECIBOS_ZIP: linkRecibosZip || null,
            });
          }}
          className="space-y-4 pt-1"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Mes / Periodo de la Remesa *</Label>
              <Input value={mesPeriodo} onChange={(e) => setMesPeriodo(e.target.value)} placeholder="Ej: Junio 2026" required />
            </div>
            <div className="space-y-2">
              <Label>Estado Inicial de Operación</Label>
              <Input value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="Generada, Enviada, Cobrada, Devuelta..." />
            </div>
          </div>

          <div className="border-t pt-3 space-y-3 mt-2 bg-slate-50/50 p-2.5 rounded border">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <HelpCircle className="h-4 w-4 text-blue-900" />
              Direcciones URL de Repositorio (Alimentadas por n8n)
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Archivo XML SEPA (.xml)</Label>
              <Input className="h-8 text-xs font-mono" value={linkXmlSepa} onChange={(e) => setLinkXmlSepa(e.target.value)} placeholder="https://..." />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Libro Excel Contable (.xlsx)</Label>
              <Input className="h-8 text-xs font-mono" value={linkExcelContabilidad} onChange={(e) => setLinkExcelContabilidad(e.target.value)} placeholder="https://..." />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Ruta Comprobantes Comprimidos (.zip)</Label>
              <Input className="h-8 text-xs font-mono" value={linkRecibosZip} onChange={(e) => setLinkRecibosZip(e.target.value)} placeholder="https://..." />
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
