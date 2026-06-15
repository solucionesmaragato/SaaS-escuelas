import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Pencil,
  FileText,
  Check,
  Upload,
  ExternalLink,
} from "lucide-react";
import {
  useDocumentos,
  type DocumentoCreateInput,
  type DocumentoData,
  type DocumentoUpdateInput,
  type ProfesorLookup,
} from "@/hooks/useDocumentos";
import { useAdminCentroFilter } from "@/hooks/useAdminCentroFilter";
import { CentroTableFilter } from "@/components/admin/CentroTableFilter";
import { useActiveTenant } from "@/context/AppContext";
import {
  canManageUsuarios,
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
import {
  formatProfesorOptionLabel,
  profesorSelectorOptions,
} from "@/lib/profesorSelector";

export const Route = createFileRoute("/_authenticated/documentos")({
  component: DocumentosPage,
});

const CATEGORIA_OPTIONS = [
  "Contrato laboral",
  "Acuerdo de confidencialidad",
  "Protocolo interno",
  "Formación obligatoria",
  "Otro",
] as const;

function estadoFirmaKey(estado: string | null | undefined): string {
  return (estado ?? "").trim().toLowerCase();
}

function canAccessDocumentosPage(rol: string | null | undefined): boolean {
  return (
    isMasterRole(rol) ||
    isAdminRole(rol) ||
    isDireccionRole(rol) ||
    isSecretariaRole(rol) ||
    isProfesorRole(rol)
  );
}

function isOwnDocument(
  doc: DocumentoData,
  perfilProfesorId: string | null | undefined,
): boolean {
  return !!perfilProfesorId && doc.ID_PROFESOR === perfilProfesorId;
}

function isEmployeeDocumentViewer(rol: string | null | undefined): boolean {
  return isProfesorRole(rol) || isDireccionRole(rol) || isSecretariaRole(rol);
}

function usesManagerDocumentView(
  rol: string | null | undefined,
  doc: DocumentoData,
  perfilProfesorId: string | null | undefined,
): boolean {
  if (isEmployeeDocumentViewer(rol)) return false;
  if (isOwnDocument(doc, perfilProfesorId)) return false;
  return isMasterRole(rol) || isAdminRole(rol);
}

function isAbiertoForViewer(
  doc: DocumentoData,
  rol: string | null | undefined,
  perfilProfesorId: string | null | undefined,
): boolean {
  if (isEmployeeDocumentViewer(rol) || isOwnDocument(doc, perfilProfesorId)) {
    return doc.ABIERTO_PROFESOR;
  }
  return doc.ABIERTO_ADMIN;
}

function AperturaPdfButton({
  doc,
  rol,
  perfilProfesorId,
  onOpen,
}: {
  doc: DocumentoData;
  rol: string | null | undefined;
  perfilProfesorId: string | null | undefined;
  onOpen: (doc: DocumentoData) => void;
}) {
  const abierto = isAbiertoForViewer(doc, rol, perfilProfesorId);
  const colorClass = abierto
    ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
    : "text-red-600 hover:text-red-700 hover:bg-red-50";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-12 w-12 ${colorClass}`}
      title={abierto ? "Documento abierto" : "Documento sin abrir"}
      onClick={() => onOpen(doc)}
    >
      <FileText className="h-8 w-8" />
    </Button>
  );
}

function FirmaCell({
  doc,
  rol,
  perfilProfesorId,
  onUploadSignature,
}: {
  doc: DocumentoData;
  rol: string | null | undefined;
  perfilProfesorId: string | null | undefined;
  onUploadSignature: (doc: DocumentoData) => void;
}) {
  if (!doc.REQUIERE_FIRMA) {
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        Solo Lectura
      </Badge>
    );
  }

  const estado = estadoFirmaKey(doc.ESTADO_FIRMA);

  if (estado === "firmado") {
    return (
      <Button
        type="button"
        size="sm"
        className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200"
        onClick={() => {
          if (doc.URL_FIRMADO) {
            window.open(doc.URL_FIRMADO, "_blank", "noopener,noreferrer");
          } else {
            toast.error("No hay URL del documento firmado.");
          }
        }}
      >
        <Check className="h-3.5 w-3.5" />
        Ver Documento Firmado
      </Button>
    );
  }

  if (isOwnDocument(doc, perfilProfesorId)) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
        onClick={() => onUploadSignature(doc)}
      >
        <Upload className="h-3.5 w-3.5" />
        Subir Documento Firmado
      </Button>
    );
  }

  if (usesManagerDocumentView(rol, doc, perfilProfesorId)) {
    return (
      <Badge variant="destructive" className="gap-1">
        Falta Firma Prof.
      </Badge>
    );
  }

  return <span className="text-muted-foreground text-xs">Pendiente de firma</span>;
}

function DocumentosPage() {
  const { rol, perfil } = useActiveTenant();
  const isMaster = isMasterRole(rol);
  const canMutate = canManageUsuarios(rol);
  const {
    centrosOrdenados,
    showCentroFilter,
    selectedCenterId,
    setSelectedCenterId,
    filterCenterId,
  } = useAdminCentroFilter();
  const { list, create, update, remove } = useDocumentos(filterCenterId);

  const documentos = list.data?.documentos ?? [];
  const profesores = list.data?.profesores ?? [];

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<DocumentoData | null>(null);
  const [deleting, setDeleting] = useState<DocumentoData | null>(null);
  const [signingDoc, setSigningDoc] = useState<DocumentoData | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return documentos;
    const q = query.toLowerCase();
    return documentos.filter(
      (d) =>
        d.NOMBRE_PROFESOR?.toLowerCase().includes(q) ||
        d.CATEGORIA?.toLowerCase().includes(q) ||
        d.ESTADO_FIRMA?.toLowerCase().includes(q),
    );
  }, [documentos, query]);

  const handleOpenDocument = (doc: DocumentoData) => {
    if (doc.URL_ORIGINAL) {
      window.open(doc.URL_ORIGINAL, "_blank", "noopener,noreferrer");
    } else {
      toast.error("Este documento no tiene URL original.");
    }

    const patch: DocumentoUpdateInput =
      usesManagerDocumentView(rol, doc, perfil?.ID_PROFESOR)
        ? { ABIERTO_ADMIN: true }
        : { ABIERTO_PROFESOR: true };

    update.mutate({ id: doc.ID_DOCUMENTO, patch });
  };

  if (!canAccessDocumentosPage(rol)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acceso denegado. No tienes permiso para ver esta página.
      </div>
    );
  }

  const colSpan = canMutate ? (isMaster ? 7 : 5) : isMaster ? 6 : 4;

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documentos Legales</h1>
          <p className="text-sm text-muted-foreground">
            {documentos.length} documentos registrados
          </p>
        </div>
        {canMutate && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo documento
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por trabajador, categoría o estado..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {showCentroFilter && (
            <CentroTableFilter
              id="documentos-centro-filter"
              centros={centrosOrdenados}
              value={selectedCenterId}
              onChange={setSelectedCenterId}
            />
          )}
        </div>

        {list.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Error al cargar documentos: {(list.error as Error)?.message}
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isMaster && <TableHead>ID_DOCUMENTO</TableHead>}
                {isMaster && <TableHead>ID_CLIENTE</TableHead>}
                <TableHead>Trabajador</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Fecha de subida</TableHead>
                <TableHead className="text-center">Apertura</TableHead>
                <TableHead>Firma</TableHead>
                {canMutate && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={colSpan}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
                    {query ? "Sin resultados." : "No hay documentos registrados."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => (
                  <TableRow key={d.ID_DOCUMENTO}>
                    {isMaster && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {d.ID_DOCUMENTO}
                      </TableCell>
                    )}
                    {isMaster && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {d.ID_CLIENTE}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{d.NOMBRE_PROFESOR}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{d.CATEGORIA}</div>
                      {d.FECHA_CADUCIDAD && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Caduca: {d.FECHA_CADUCIDAD}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{d.FECHA_SUBIDA ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      <AperturaPdfButton
                        doc={d}
                        rol={rol}
                        perfilProfesorId={perfil?.ID_PROFESOR}
                        onOpen={handleOpenDocument}
                      />
                    </TableCell>
                    <TableCell>
                      <FirmaCell
                        doc={d}
                        rol={rol}
                        perfilProfesorId={perfil?.ID_PROFESOR}
                        onUploadSignature={setSigningDoc}
                      />
                    </TableCell>
                    {canMutate && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(d)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleting(d)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
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

      <DocumentoFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Nuevo documento legal"
        submitLabel="Registrar documento"
        submitting={create.isPending}
        profesores={profesores}
        onSubmit={async (values: DocumentoCreateInput) => {
          try {
            await create.mutateAsync(values);
            toast.success("Documento registrado correctamente");
            setCreating(false);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al registrar");
          }
        }}
      />

      {editing && (
        <DocumentoFormDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          title="Editar documento legal"
          submitLabel="Guardar cambios"
          initial={editing}
          submitting={update.isPending}
          profesores={profesores}
          onSubmit={async (patch: DocumentoUpdateInput) => {
            try {
              await update.mutateAsync({ id: editing.ID_DOCUMENTO, patch });
              toast.success("Documento actualizado");
              setEditing(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Error al actualizar");
            }
          }}
        />
      )}

      <ProfesorFirmaDialog
        open={!!signingDoc}
        doc={signingDoc}
        perfilProfesorId={perfil?.ID_PROFESOR}
        onClose={() => setSigningDoc(null)}
        submitting={update.isPending}
        onSubmit={async (urlFirmado) => {
          if (!signingDoc) return;
          if (!isOwnDocument(signingDoc, perfil?.ID_PROFESOR)) {
            toast.error("Solo puedes firmar tus propios documentos.");
            return;
          }
          try {
            await update.mutateAsync({
              id: signingDoc.ID_DOCUMENTO,
              patch: { URL_FIRMADO: urlFirmado },
            });
            toast.success("Documento firmado enviado correctamente");
            setSigningDoc(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al subir la firma");
          }
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará definitivamente el documento legal. Esta acción es irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.ID_DOCUMENTO);
                  toast.success("Documento eliminado");
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

type DocumentoFormDialogCreateProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial?: undefined;
  submitting: boolean;
  profesores: ProfesorLookup[];
  onSubmit: (values: DocumentoCreateInput) => void;
};

type DocumentoFormDialogEditProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial: DocumentoData;
  submitting: boolean;
  profesores: ProfesorLookup[];
  onSubmit: (values: DocumentoUpdateInput) => void;
};

type DocumentoFormDialogProps = DocumentoFormDialogCreateProps | DocumentoFormDialogEditProps;

function DocumentoFormDialog(props: DocumentoFormDialogProps) {
  const { open, onClose, title, submitLabel, submitting, profesores } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;

  const [idProfesor, setIdProfesor] = useState("");
  const [categoria, setCategoria] = useState<string>(CATEGORIA_OPTIONS[0]);
  const [categoriaCustom, setCategoriaCustom] = useState("");
  const [urlOriginal, setUrlOriginal] = useState("");
  const [requiereFirma, setRequiereFirma] = useState(false);
  const [fechaCaducidad, setFechaCaducidad] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdProfesor(initial?.ID_PROFESOR ?? "");
    const cat = initial?.CATEGORIA ?? CATEGORIA_OPTIONS[0];
    if (CATEGORIA_OPTIONS.includes(cat as (typeof CATEGORIA_OPTIONS)[number])) {
      setCategoria(cat);
      setCategoriaCustom("");
    } else {
      setCategoria("Otro");
      setCategoriaCustom(cat);
    }
    setUrlOriginal(initial?.URL_ORIGINAL ?? "");
    setRequiereFirma(initial?.REQUIERE_FIRMA ?? false);
    setFechaCaducidad(initial?.FECHA_CADUCIDAD ?? "");
  }, [open, initial]);

  const categoriaFinal = categoria === "Otro" ? categoriaCustom.trim() : categoria;

  const profesoresSelector = useMemo(
    () => profesorSelectorOptions(profesores, idProfesor),
    [profesores, idProfesor],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!idProfesor || !categoriaFinal || !urlOriginal.trim()) return;

            if (isEdit && initial) {
              const patch: DocumentoUpdateInput = {
                ID_PROFESOR: idProfesor,
                CATEGORIA: categoriaFinal,
                URL_ORIGINAL: urlOriginal.trim(),
                REQUIERE_FIRMA: requiereFirma,
                FECHA_CADUCIDAD: fechaCaducidad || null,
              };
              (props as DocumentoFormDialogEditProps).onSubmit(patch);
              return;
            }

            const payload: DocumentoCreateInput = {
              ID_PROFESOR: idProfesor,
              CATEGORIA: categoriaFinal,
              URL_ORIGINAL: urlOriginal.trim(),
              REQUIERE_FIRMA: requiereFirma,
              FECHA_CADUCIDAD: fechaCaducidad || null,
            };
            (props as DocumentoFormDialogCreateProps).onSubmit(payload);
          }}
          className="space-y-4 pt-1"
        >
          <div className="space-y-2">
            <Label>Trabajador *</Label>
            <Select value={idProfesor} onValueChange={setIdProfesor}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar trabajador" />
              </SelectTrigger>
              <SelectContent>
                {profesoresSelector.map((p) => (
                  <SelectItem key={p.ID_PROFESOR} value={p.ID_PROFESOR}>
                    {formatProfesorOptionLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Categoría *</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIA_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoria === "Otro" && (
              <Input
                value={categoriaCustom}
                onChange={(e) => setCategoriaCustom(e.target.value)}
                placeholder="Especificar categoría"
                required
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>URL original (Drive) *</Label>
            <Input
              value={urlOriginal}
              onChange={(e) => setUrlOriginal(e.target.value)}
              placeholder="https://drive.google.com/..."
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="requiere-firma"
              checked={requiereFirma}
              onCheckedChange={(v) => setRequiereFirma(v === true)}
            />
            <Label htmlFor="requiere-firma" className="cursor-pointer">
              Requiere firma del profesor
            </Label>
          </div>

          <div className="space-y-2">
            <Label>Fecha de caducidad</Label>
            <Input
              type="date"
              value={fechaCaducidad}
              onChange={(e) => setFechaCaducidad(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
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

function ProfesorFirmaDialog({
  open,
  doc,
  perfilProfesorId,
  onClose,
  submitting,
  onSubmit,
}: {
  open: boolean;
  doc: DocumentoData | null;
  perfilProfesorId: string | null | undefined;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (urlFirmado: string) => void;
}) {
  const canSign = doc != null && isOwnDocument(doc, perfilProfesorId);
  const [urlFirmado, setUrlFirmado] = useState("");

  useEffect(() => {
    if (open) setUrlFirmado("");
  }, [open, doc?.ID_DOCUMENTO]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subir documento firmado</DialogTitle>
        </DialogHeader>
        {doc && canSign && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">{doc.CATEGORIA}</span>
              {" — "}
              {doc.NOMBRE_PROFESOR}
            </p>
            <div className="space-y-2">
              <Label>URL del documento firmado (Drive) *</Label>
              <Input
                value={urlFirmado}
                onChange={(e) => setUrlFirmado(e.target.value)}
                placeholder="https://drive.google.com/..."
              />
            </div>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              Pega el enlace público o compartido del PDF firmado.
            </p>
          </div>
        )}
        {doc && !canSign && (
          <p className="text-sm text-muted-foreground">
            Solo puedes firmar documentos asignados a tu perfil de trabajador.
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={submitting || !canSign || !urlFirmado.trim()}
            onClick={() => onSubmit(urlFirmado.trim())}
          >
            {submitting ? "Enviando..." : "Enviar firma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
