import { Calendar, CreditCard } from "lucide-react";
import { useRecibos, normalizeEstadoPago, estadoPagoStatus, type ReciboRow } from "@/hooks/useRecibos";
import { FacturaPdfDownloadButton, formatFacturaReferencia } from "@/components/facturas/FacturaTableCells";
import { formatCurrency } from "@/lib/format";
import type { OnNavigateToEntity } from "@/lib/entityNavigation";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TABLE_COLS = 7;

function FacturaReferenciaReadOnly({ row }: { row: ReciboRow }) {
  const ref = formatFacturaReferencia(row);
  if (ref.isPending) {
    return (
      <div className="space-y-1">
        <Badge variant="secondary" className="bg-muted text-muted-foreground font-normal">
          Pendiente
        </Badge>
        <div className="font-mono text-[10px] text-muted-foreground">{row.ID_RECIBO}</div>
      </div>
    );
  }
  return (
    <div className="font-mono text-xs font-semibold text-slate-900">
      <div>{ref.label}</div>
      {ref.sublabel && (
        <div className="text-[10px] font-normal text-muted-foreground font-sans">
          Ref: {ref.sublabel}
        </div>
      )}
    </div>
  );
}

export function AlumnoFacturasTable({
  alumnoId,
  onNavigateToEntity,
}: {
  alumnoId: string;
  onNavigateToEntity: OnNavigateToEntity;
}) {
  const { list } = useRecibos({ alumnoId });
  const rows = list.data?.pages.flat() ?? [];

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Referencia / Factura</TableHead>
            <TableHead>Receptor / Alumno</TableHead>
            <TableHead>Fecha / Periodo</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Total Doc</TableHead>
            <TableHead className="text-center">Factura</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={TABLE_COLS}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : list.isError ? (
            <TableRow>
              <TableCell colSpan={TABLE_COLS} className="py-6 text-center text-sm text-destructive">
                {(list.error as Error)?.message ?? "Error al cargar las facturas."}
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={TABLE_COLS} className="py-10 text-center text-muted-foreground">
                Este alumno no tiene facturas registradas.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow
                key={r.ID_RECIBO}
                role="button"
                tabIndex={0}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() =>
                  onNavigateToEntity({
                    to: "/facturas",
                    search: { invoiceId: r.ID_RECIBO },
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onNavigateToEntity({
                      to: "/facturas",
                      search: { invoiceId: r.ID_RECIBO },
                    });
                  }
                }}
              >
                <TableCell>
                  <FacturaReferenciaReadOnly row={r} />
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{r.RECEPTOR_NOMBRE || "—"}</div>
                  {r.ALUMNOS?.NOMBRE_ALUMNO && (
                    <div className="text-xs text-muted-foreground">
                      Alumno: {r.ALUMNOS.NOMBRE_ALUMNO}
                    </div>
                  )}
                </TableCell>
                <TableCell className="space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {r.FECHA ?? "—"}
                  </div>
                  {r.MES_PERIODO && (
                    <div className="font-medium capitalize text-slate-700">{r.MES_PERIODO}</div>
                  )}
                </TableCell>
                <TableCell className="text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <CreditCard className="h-3 w-3" /> {r.METODO_PAGO || "Remesa"}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm font-bold text-blue-950">
                  {formatCurrency(r.TOTAL_DOC)}
                </TableCell>
                <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                  {r.LINK_PDF_RECIBO ? (
                    <div className="flex justify-center">
                      <FacturaPdfDownloadButton link={r.LINK_PDF_RECIBO} />
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    status={estadoPagoStatus(normalizeEstadoPago(r.ESTADO_PAGO))}
                    className="capitalize text-[10px]"
                  >
                    {normalizeEstadoPago(r.ESTADO_PAGO)}
                  </StatusBadge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
