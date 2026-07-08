import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Pencil,
  FileText,
  Check,
  Upload,
  X,
} from "lucide-react";
import {
  useDocumentos,
  type DocumentoCreateInput,
  type DocumentoData,
  type DocumentoUpdateInput,
  type ProfesorLookup,
} from "@/hooks/useDocumentos";
import { useAdminCentroFilter, type CentroData } from "@/hooks/useAdminCentroFilter";
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
import { formatProfesorOptionLabel, profesorSelectorOptions } from "@/lib/profesorSelector";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { PageHeader } from "@/components/layout/PageHeader";
import { EntityLink } from "@/components/navigation/EntityLink";
import { cn } from "@/lib/utils";

type DocumentosSearch = {
  documentoId?: string;
};

export const Route = createFileRoute("/_authenticated/documentos")({
  validateSearch: (search: Record<string, unknown>): DocumentosSearch => {
    const documentoId = search.documentoId;
    return typeof documentoId === "string" && documentoId ? { documentoId } : {};
  },
  component: DocumentosPage,
});

const CATEGORIA_OPTIONS = [
  "Contrato laboral",
  "Acuerdo de confidencialidad",
  "Protocolo interno",
  "Formación obligatoria",
  "Otro",
] as const;

const GLOBAL_CENTRO_VALUE = "__global__";

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

function isOwnDocument(doc: DocumentoData, perfilProfesorId: string | null | undefined): boolean {
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
    ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:text-emerald-300 dark:hover:bg-emerald-900/30"
    : "text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/30";

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
        className="gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 dark:border-emerald-900/50"
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
        className="gap-1 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
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

function DocumentoDetailOverlay({
  open,
  mode,
  doc,
  rol,
  perfilProfesorId,
  canMutate,
  isMaster,
  centros,
  submitting,
  profesores,
  onClose,
  onEdit,
  onCancelEdit,
  onOpenDocument,
  onSubmit,
}: {
  open: boolean;
  mode: "detail" | "edit";
  doc: DocumentoData | null;
  rol: string | null | undefined;
  perfilProfesorId: string | null | undefined;
  canMutate: boolean;
  isMaster: boolean;
  centros: CentroData[];
  submitting: boolean;
  profesores: ProfesorLookup[];
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onOpenDocument: (doc: DocumentoData) => void;
  onSubmit: (values: DocumentoUpdateInput) => void;
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

  if (!doc) {
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

  const centroNombre =
    centros.find((c) => c.ID_CENTRO === doc.ID_CENTRO)?.NOMBRE_CENTRO ??
    (doc.ID_CENTRO ? doc.ID_CENTRO : "Global (todas las sedes)");

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle del documento"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="documento-overlay-title"
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
                <h2 id="documento-overlay-title" className="truncate text-xl font-semibold">
                  Editar documento legal
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
            <DocumentoFormDialog
              open
              embedded
              title="Editar documento legal"
              submitLabel="Guardar cambios"
              initial={doc}
              submitting={submitting}
              profesores={profesores}
              centros={centros}
              onClose={onCancelEdit}
              onSubmit={onSubmit}
            />
            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={onCancelEdit}>
                Cancelar
              </Button>
              <Button type="submit" form="documento-form" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar cambios"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="documento-overlay-title" className="truncate text-xl font-semibold">
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
                <>
                  <div>
                    <dt className="text-muted-foreground">ID_DOCUMENTO</dt>
                    <dd className="font-mono text-xs">{doc.ID_DOCUMENTO}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ID_CLIENTE</dt>
                    <dd className="font-mono text-xs">{doc.ID_CLIENTE}</dd>
                  </div>
                </>
              )}
              <div>
                <dt className="text-muted-foreground">Trabajador</dt>
                <dd className="font-medium">
                  <EntityLink type="profesor" id={doc.ID_PROFESOR}>
                    {doc.NOMBRE_PROFESOR}
                  </EntityLink>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Centro</dt>
                <dd>{centroNombre}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Categoría</dt>
                <dd className="font-medium">{doc.CATEGORIA}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha de subida</dt>
                <dd>{doc.FECHA_SUBIDA ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha de caducidad</dt>
                <dd>{doc.FECHA_CADUCIDAD ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Requiere firma</dt>
                <dd>{doc.REQUIERE_FIRMA ? "Sí" : "No (solo lectura)"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Estado de firma</dt>
                <dd>{doc.ESTADO_FIRMA ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fecha de firma</dt>
                <dd>{doc.FECHA_FIRMA ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Apertura</dt>
                <dd>{isAbiertoForViewer(doc, rol, perfilProfesorId) ? "Abierto" : "Sin abrir"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Documento original</dt>
                <dd className="mt-1">
                  <AperturaPdfButton
                    doc={doc}
                    rol={rol}
                    perfilProfesorId={perfilProfesorId}
                    onOpen={onOpenDocument}
                  />
                </dd>
              </div>
              {doc.URL_FIRMADO && (
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Documento firmado</dt>
                  <dd className="mt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => window.open(doc.URL_FIRMADO!, "_blank", "noopener,noreferrer")}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Ver documento firmado
                    </Button>
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function DocumentosPage() {
  const { rol, perfil } = useActiveTenant();
  const { documentoId } = Route.useSearch();
  const navigate = Route.useNavigate();
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

  const documentos = useMemo(() => list.data?.documentos ?? [], [list.data?.documentos]);
  const profesores = useMemo(() => list.data?.profesores ?? [], [list.data?.profesores]);

  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [overlay, setOverlay] = useState<{ id: string; mode: "detail" | "edit" } | null>(null);
  const [deleting, setDeleting] = useState<DocumentoData | null>(null);
  const [signingDoc, setSigningDoc] = useState<DocumentoData | null>(null);

  const overlayDocumento = useMemo(
    () => documentos.find((d) => d.ID_DOCUMENTO === overlay?.id) ?? null,
    [documentos, overlay?.id],
  );

  useEffect(() => {
    if (documentoId && documentos.length > 0) {
      const target = documentos.find((d) => d.ID_DOCUMENTO === documentoId);
      if (target) setOverlay({ id: target.ID_DOCUMENTO, mode: "detail" });
    }
  }, [documentoId, documentos]);

  const handleCloseOverlay = useCallback(() => {
    setOverlay(null);
    navigate({ search: (prev) => ({ ...prev, documentoId: undefined }), replace: true });
  }, [navigate]);
  const handleEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "edit" } : null));
  }, []);
  const handleCancelEditOverlay = useCallback(() => {
    setOverlay((prev) => (prev ? { ...prev, mode: "detail" } : null));
  }, []);

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

    const patch: DocumentoUpdateInput = usesManagerDocumentView(rol, doc, perfil?.ID_PROFESOR)
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
      <PageHeader
        title="Documentos Legales"
        description={`${documentos.length} documentos registrados`}
        actions={
          canMutate && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo documento
            </Button>
          )
        }
      />

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
                  <TableRow
                    key={d.ID_DOCUMENTO}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setOverlay({ id: d.ID_DOCUMENTO, mode: "detail" })}
                  >
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
                    <TableCell className="font-medium" onClick={(e) => e.stopPropagation()}>
                      <EntityLink type="profesor" id={d.ID_PROFESOR}>
                        {d.NOMBRE_PROFESOR}
                      </EntityLink>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{d.CATEGORIA}</div>
                      {d.FECHA_CADUCIDAD && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Caduca: {d.FECHA_CADUCIDAD}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{d.FECHA_SUBIDA ?? "—"}</TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <AperturaPdfButton
                        doc={d}
                        rol={rol}
                        perfilProfesorId={perfil?.ID_PROFESOR}
                        onOpen={handleOpenDocument}
                      />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <FirmaCell
                        doc={d}
                        rol={rol}
                        perfilProfesorId={perfil?.ID_PROFESOR}
                        onUploadSignature={setSigningDoc}
                      />
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
                            <DropdownMenuItem
                              onClick={() => setOverlay({ id: d.ID_DOCUMENTO, mode: "edit" })}
                            >
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
        centros={centrosOrdenados}
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

      <DocumentoDetailOverlay
        open={!!overlay}
        mode={overlay?.mode ?? "detail"}
        doc={overlayDocumento}
        rol={rol}
        perfilProfesorId={perfil?.ID_PROFESOR}
        canMutate={canMutate}
        isMaster={isMaster}
        centros={centrosOrdenados}
        submitting={update.isPending}
        profesores={profesores}
        onClose={handleCloseOverlay}
        onEdit={handleEditOverlay}
        onCancelEdit={handleCancelEditOverlay}
        onOpenDocument={handleOpenDocument}
        onSubmit={async (patch: DocumentoUpdateInput) => {
          if (!overlay?.id) return;
          try {
            await update.mutateAsync({ id: overlay.id, patch });
            toast.success("Documento actualizado");
            setOverlay({ id: overlay.id, mode: "detail" });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error al actualizar");
          }
        }}
      />

      <ProfesorFirmaDialog
        open={!!signingDoc}
        doc={signingDoc}
        perfilProfesorId={perfil?.ID_PROFESOR}
        onClose={() => setSigningDoc(null)}
        submitting={update.isPending}
        onSubmit={async (signedFile) => {
          if (!signingDoc) return;
          if (!isOwnDocument(signingDoc, perfil?.ID_PROFESOR)) {
            toast.error("Solo puedes firmar tus propios documentos.");
            return;
          }
          try {
            await update.mutateAsync({
              id: signingDoc.ID_DOCUMENTO,
              patch: { signedFile },
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
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
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
  centros: CentroData[];
  embedded?: boolean;
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
  centros: CentroData[];
  embedded?: boolean;
  onSubmit: (values: DocumentoUpdateInput) => void;
};

type DocumentoFormDialogProps = DocumentoFormDialogCreateProps | DocumentoFormDialogEditProps;

function DocumentoFormDialog(props: DocumentoFormDialogProps) {
  const { open, onClose, title, submitLabel, submitting, profesores, centros, embedded } = props;
  const initial = "initial" in props ? props.initial : undefined;
  const isEdit = initial != null;

  const [idProfesor, setIdProfesor] = useState("");
  const [idCentro, setIdCentro] = useState("");
  const [categoria, setCategoria] = useState<string>(CATEGORIA_OPTIONS[0]);
  const [categoriaCustom, setCategoriaCustom] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [requiereFirma, setRequiereFirma] = useState(false);
  const [fechaCaducidad, setFechaCaducidad] = useState("");

  useEffect(() => {
    if (!open) return;
    setIdProfesor(initial?.ID_PROFESOR ?? "");
    setIdCentro(initial?.ID_CENTRO ?? "");
    const cat = initial?.CATEGORIA ?? CATEGORIA_OPTIONS[0];
    if (CATEGORIA_OPTIONS.includes(cat as (typeof CATEGORIA_OPTIONS)[number])) {
      setCategoria(cat);
      setCategoriaCustom("");
    } else {
      setCategoria("Otro");
      setCategoriaCustom(cat);
    }
    setFile(null);
    setRequiereFirma(initial?.REQUIERE_FIRMA ?? false);
    setFechaCaducidad(initial?.FECHA_CADUCIDAD ?? "");
  }, [open, initial]);

  const categoriaFinal = categoria === "Otro" ? categoriaCustom.trim() : categoria;

  const profesoresSelector = useMemo(
    () => profesorSelectorOptions(profesores, idProfesor),
    [profesores, idProfesor],
  );

  const formBody = (
    <form
      id={embedded ? "documento-form" : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!idProfesor || !categoriaFinal) return;
        if (!isEdit && !file) return;

        if (isEdit && initial) {
          const patch: DocumentoUpdateInput = {
            ID_PROFESOR: idProfesor,
            ID_CENTRO: idCentro || null,
            CATEGORIA: categoriaFinal,
            REQUIERE_FIRMA: requiereFirma,
            FECHA_CADUCIDAD: fechaCaducidad || null,
          };
          (props as DocumentoFormDialogEditProps).onSubmit(patch);
          return;
        }

        const payload: DocumentoCreateInput = {
          ID_PROFESOR: idProfesor,
          ID_CENTRO: idCentro || null,
          CATEGORIA: categoriaFinal,
          file: file ?? undefined,
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
        <Label>Centro</Label>
        <Select
          value={idCentro || GLOBAL_CENTRO_VALUE}
          onValueChange={(v) => setIdCentro(v === GLOBAL_CENTRO_VALUE ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar centro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GLOBAL_CENTRO_VALUE}>
              Global (Válido para todas las sedes)
            </SelectItem>
            {centros.map((centro) => (
              <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                {centro.NOMBRE_CENTRO}
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
        <Label>Archivo PDF *</Label>
        <Input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          required={!isEdit}
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

      {!embedded ? (
        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formBody}
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
  onSubmit: (signedFile: File) => void;
}) {
  const canSign = doc != null && isOwnDocument(doc, perfilProfesorId);
  const [signedFile, setSignedFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) setSignedFile(null);
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
              <EntityLink type="profesor" id={doc.ID_PROFESOR}>
                {doc.NOMBRE_PROFESOR}
              </EntityLink>
            </p>
            <div className="space-y-2">
              <Label>Documento firmado (PDF) *</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setSignedFile(e.target.files?.[0] || null)}
              />
            </div>
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Upload className="h-3 w-3" />
              Sube el PDF firmado desde tu dispositivo.
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
            disabled={submitting || !canSign || !signedFile}
            onClick={() => signedFile && onSubmit(signedFile)}
          >
            {submitting ? "Enviando..." : "Enviar firma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
