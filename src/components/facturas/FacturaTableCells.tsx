import { FileText } from "lucide-react";
import {
  normalizeEstadoPago,
  estadoPagoSelectClass,
  estadoPagoStatus,
  getEstadoPagoSelectableOptions,
  isEstadoPagoLocked,
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
  const holded = row.NUM_FACTURA_HOLDED?.trim();
  const ref = row.REF_RECIBO?.trim();
  if (holded) {
    return { label: holded, sublabel: ref || null, isPending: false };
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

export function FacturaPdfDownloadButton({ link }: { link: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-md border border-border/80 bg-background text-slate-700 shadow-sm transition-colors hover:border-primary/30 hover:bg-muted hover:text-slate-900"
      asChild
      title="Descargar PDF de factura"
    >
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        download
        aria-label="Descargar PDF de factura"
      >
        <FileText className="h-4 w-4" />
      </a>
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
