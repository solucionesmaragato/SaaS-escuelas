import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useDocumentos,
  type DocumentoData,
} from "@/hooks/useDocumentos";
import { useActiveTenant } from "@/context/AppContext";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type FilterTab = "pendientes" | "todos";

function estadoFirmaKey(estado: string | null | undefined): string {
  return (estado ?? "").trim().toLowerCase();
}

function estadoFirmaStatus(estado: string | null | undefined): "success" | "pending" | "neutral" {
  const key = estadoFirmaKey(estado);
  if (key.includes("firmado")) return "success";
  if (key.includes("pendiente")) return "pending";
  return "neutral";
}

function formatDate(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value;
}

function isPendingSignature(doc: DocumentoData): boolean {
  if (!doc.REQUIERE_FIRMA) return false;
  return !estadoFirmaKey(doc.ESTADO_FIRMA).includes("firmado");
}

function FirmaBadge({ doc }: { doc: DocumentoData }) {
  if (!doc.REQUIERE_FIRMA) {
    return (
      <Badge variant="secondary" className="text-xs font-normal">
        Solo lectura
      </Badge>
    );
  }

  return (
    <StatusBadge status={estadoFirmaStatus(doc.ESTADO_FIRMA)} className="text-xs font-normal">
      {doc.ESTADO_FIRMA?.trim() || "Pendiente"}
    </StatusBadge>
  );
}

function DocumentoCard({
  doc,
  onOpen,
  onSign,
}: {
  doc: DocumentoData;
  onOpen: () => void;
  onSign: () => void;
}) {
  const pending = isPendingSignature(doc);
  const abierto = doc.ABIERTO_PROFESOR;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold leading-snug">{doc.CATEGORIA}</h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            Subido: {formatDate(doc.FECHA_SUBIDA)}
            {doc.FECHA_CADUCIDAD ? ` · Caduca: ${formatDate(doc.FECHA_CADUCIDAD)}` : ""}
          </p>
        </div>
        <FirmaBadge doc={doc} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!abierto ? (
          <Badge variant="outline" className="text-xs font-normal text-amber-700 border-amber-300">
            Sin abrir
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs font-normal text-emerald-700 border-emerald-300">
            Abierto
          </Badge>
        )}
        {doc.URL_FIRMADO ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => window.open(doc.URL_FIRMADO!, "_blank", "noopener,noreferrer")}
          >
            <Check className="h-3.5 w-3.5" />
            Ver firmado
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="brand"
          className="gap-1"
          disabled={!doc.URL_ORIGINAL}
          onClick={onOpen}
        >
          <FileText className="h-3.5 w-3.5" />
          Abrir documento
        </Button>
        {pending ? (
          <Button type="button" size="sm" variant="brand-outline" className="gap-1" onClick={onSign}>
            <Upload className="h-3.5 w-3.5" />
            Subir firmado
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function FirmaDialog({
  doc,
  open,
  submitting,
  onClose,
  onSubmit,
}: {
  doc: DocumentoData | null;
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (file: File) => Promise<void>;
}) {
  const [signedFile, setSignedFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) setSignedFile(null);
  }, [open, doc?.ID_DOCUMENTO]);

  if (!doc) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Subir documento firmado</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{doc.CATEGORIA}</span>
          </p>
          {doc.URL_ORIGINAL ? (
            <Button
              type="button"
              variant="link"
              className="h-auto gap-1 px-0 text-primary"
              onClick={() => window.open(doc.URL_ORIGINAL!, "_blank", "noopener,noreferrer")}
            >
              Ver original
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          ) : null}
          <div className="space-y-2">
            <Label>Documento firmado (PDF) *</Label>
            <Input
              type="file"
              accept="application/pdf"
              disabled={submitting}
              onChange={(e) => setSignedFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="brand"
            disabled={submitting || !signedFile}
            onClick={() => signedFile && void onSubmit(signedFile)}
          >
            {submitting ? "Enviando..." : "Enviar firma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TeacherDocumentosDashboardProps = {
  initialDocumentoId?: string;
};

export function TeacherDocumentosDashboard({
  initialDocumentoId,
}: TeacherDocumentosDashboardProps) {
  const { perfil } = useActiveTenant();
  const { list, update } = useDocumentos();
  const [filterTab, setFilterTab] = useState<FilterTab>("pendientes");
  const [signingDoc, setSigningDoc] = useState<DocumentoData | null>(null);
  const handledDeepLinkRef = useRef<string | null>(null);

  const documentos = useMemo(() => list.data?.documentos ?? [], [list.data?.documentos]);

  const pendingCount = useMemo(
    () => documentos.filter(isPendingSignature).length,
    [documentos],
  );

  const filtered = useMemo(() => {
    if (filterTab === "pendientes") {
      return documentos.filter(isPendingSignature);
    }
    return documentos;
  }, [documentos, filterTab]);

  useEffect(() => {
    if (!initialDocumentoId || documentos.length === 0) return;
    if (handledDeepLinkRef.current === initialDocumentoId) return;

    const target = documentos.find((d) => d.ID_DOCUMENTO === initialDocumentoId);
    if (!target) return;

    handledDeepLinkRef.current = initialDocumentoId;

    if (isPendingSignature(target)) {
      setFilterTab("pendientes");
      setSigningDoc(target);
      return;
    }

    if (target.URL_ORIGINAL) {
      window.open(target.URL_ORIGINAL, "_blank", "noopener,noreferrer");
      void update.mutateAsync({
        id: target.ID_DOCUMENTO,
        patch: { ABIERTO_PROFESOR: true },
      });
    }
  }, [initialDocumentoId, documentos, update]);

  const handleOpenDocument = async (doc: DocumentoData) => {
    if (!doc.URL_ORIGINAL) {
      toast.error("Este documento no tiene URL original.");
      return;
    }
    window.open(doc.URL_ORIGINAL, "_blank", "noopener,noreferrer");
    try {
      await update.mutateAsync({
        id: doc.ID_DOCUMENTO,
        patch: { ABIERTO_PROFESOR: true },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar la apertura");
    }
  };

  const handleSubmitSignature = async (signedFile: File) => {
    if (!signingDoc) return;
    try {
      await update.mutateAsync({
        id: signingDoc.ID_DOCUMENTO,
        patch: { signedFile },
      });
      toast.success("Documento firmado enviado correctamente");
      setSigningDoc(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al subir la firma");
    }
  };

  if (list.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (list.isError) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Error al cargar documentos: {(list.error as Error)?.message}
      </Card>
    );
  }

  if (!perfil.ID_PROFESOR) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Tu perfil no está vinculado a un profesor.
      </Card>
    );
  }

  return (
    <>
      <Tabs
        value={filterTab}
        onValueChange={(value) => setFilterTab(value as FilterTab)}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="pendientes">
              Pendientes de firma
              {pendingCount > 0 ? ` (${pendingCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="todos">Todos</TabsTrigger>
          </TabsList>
          <span className="text-sm text-muted-foreground">
            {documentos.length} documento{documentos.length === 1 ? "" : "s"}
          </span>
        </div>

        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {filterTab === "pendientes"
              ? "No tienes documentos pendientes de firma."
              : "No hay documentos legales registrados."}
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((doc) => (
              <DocumentoCard
                key={doc.ID_DOCUMENTO}
                doc={doc}
                onOpen={() => void handleOpenDocument(doc)}
                onSign={() => setSigningDoc(doc)}
              />
            ))}
          </div>
        )}
      </Tabs>

      <FirmaDialog
        doc={signingDoc}
        open={!!signingDoc}
        submitting={update.isPending}
        onClose={() => setSigningDoc(null)}
        onSubmit={handleSubmitSignature}
      />
    </>
  );
}
