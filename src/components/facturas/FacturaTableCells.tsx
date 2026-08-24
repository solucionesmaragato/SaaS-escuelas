import { useState, useEffect, type MouseEvent } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  normalizeEstadoPago,
  estadoPagoSelectClass,
  estadoPagoStatus,
  getEstadoPagoSelectableOptions,
  isEstadoPagoLocked,
  reciboTieneFacturaOficial,
  resolveDescargarPdfFacturaKorefactu,
  type ReciboRow,
  type EstadoPagoOption,
} from "@/hooks/useRecibos";
import { EntityLink } from "@/components/navigation/EntityLink";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function formatFacturaReferencia(row: ReciboRow) {
  const numFactura = row.NUM_FACTURA_KOREFACTU?.trim();
  const ref = row.REF_RECIBO?.trim();
  if (numFactura) {
    return { label: numFactura, sublabel: ref || null, isPending: false };
  }
  if (ref) {
    return { label: ref, sublabel: null, isPending: false };
  }
  return { label: row.ID_RECIBO, sublabel: null, isPending: true };
}

export function FacturaReferenciaCell({ row }: { row: ReciboRow }) {
  const ref = formatFacturaReferencia(row);
  if (ref.isPending) {
    return (
      <div className="space-y-1">
        <Badge variant="secondary" className="bg-muted text-muted-foreground font-normal">
          Pendiente
        </Badge>
        <div className="font-mono text-[10px] text-muted-foreground">
          <EntityLink type="factura" id={row.ID_RECIBO}>
            {row.ID_RECIBO}
          </EntityLink>
        </div>
      </div>
    );
  }
  return (
    <div className="font-mono text-xs font-semibold text-slate-900">
      <div>
        <EntityLink type="factura" id={row.ID_RECIBO}>
          {ref.label}
        </EntityLink>
      </div>
      {ref.sublabel && (
        <div className="text-[10px] font-normal text-muted-foreground font-sans">
          Ref: {ref.sublabel}
        </div>
      )}
    </div>
  );
}

export function FacturaPdfDownloadButton({
  link,
  label = "PDF de factura",
  title,
}: {
  link: string;
  label?: string;
  title?: string;
}) {
  const downloadTitle = title ?? label;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-md border border-slate-200 bg-slate-50 text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:bg-slate-900/20 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900/40"
      asChild
      title={downloadTitle}
    >
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        download
        aria-label={downloadTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <FileText className="h-4 w-4" />
      </a>
    </Button>
  );
}

export function FacturaOficialPdfButton({
  idRecibo,
  linkPdfRecibo,
  linkFacturaKorefactu,
  onPdfResolved,
  variant = "icon",
}: {
  idRecibo: string;
  linkPdfRecibo?: string | null;
  linkFacturaKorefactu?: string | null;
  onPdfResolved?: (link: string) => void;
  variant?: "icon" | "block";
}) {
  const [loading, setLoading] = useState(false);
  const [resolvedPdfLink, setResolvedPdfLink] = useState<string | null>(null);
  const pdfLink = linkPdfRecibo?.trim() || resolvedPdfLink || "";

  useEffect(() => {
    if (linkPdfRecibo?.trim()) {
      setResolvedPdfLink(null);
    }
  }, [linkPdfRecibo]);

  if (
    !reciboTieneFacturaOficial({
      LINK_FACTURA_KOREFACTU: linkFacturaKorefactu ?? null,
      LINK_PDF_RECIBO: linkPdfRecibo ?? null,
    })
  ) {
    return null;
  }

  const openPdf = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (pdfLink) {
      openPdf(pdfLink);
      return;
    }
    if (!linkFacturaKorefactu?.trim()) return;

    setLoading(true);
    try {
      const result = await resolveDescargarPdfFacturaKorefactu(idRecibo);
      setResolvedPdfLink(result.linkPdfRecibo);
      onPdfResolved?.(result.linkPdfRecibo);
      openPdf(result.linkPdfRecibo);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo descargar el PDF oficial.");
    } finally {
      setLoading(false);
    }
  };

  if (variant === "block") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 dark:bg-emerald-900/20 dark:border-emerald-900/40 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Factura</p>
            <p className="text-xs text-muted-foreground">PDF de factura — documento oficial</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-2 border-emerald-300 bg-white"
          onClick={handleClick}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Descargar PDF
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-900 dark:bg-emerald-900/20 dark:border-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
      title="PDF de factura"
      aria-label="PDF de factura"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
    </Button>
  );
}

export function EstadoPagoSelect({
  row,
  canWrite,
  updating,
  onRequestChange,
}: {
  row: ReciboRow;
  canWrite: boolean;
  updating: boolean;
  onRequestChange: (estado: EstadoPagoOption) => void;
}) {
  const value = normalizeEstadoPago(row.ESTADO_PAGO);
  const selectableOptions = getEstadoPagoSelectableOptions(value);
  const isLocked = isEstadoPagoLocked(value);

  if (!canWrite || isLocked) {
    return (
      <StatusBadge status={estadoPagoStatus(value)} className="capitalize text-[10px]">
        {value}
      </StatusBadge>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(next) => onRequestChange(next as EstadoPagoOption)}
      disabled={updating}
    >
      <SelectTrigger
        className={cn(
          "h-8 w-[118px] border text-xs font-medium capitalize",
          estadoPagoSelectClass(value),
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {selectableOptions.map((estado) => (
          <SelectItem key={estado} value={estado} className="capitalize">
            {estado}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
