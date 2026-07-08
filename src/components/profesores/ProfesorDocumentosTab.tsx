import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useDocumentos } from "@/hooks/useDocumentos";
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
import { formatFechaDisplay } from "./profesoresShared";

function estadoFirmaStatus(estado: string | null): "success" | "pending" | "neutral" {
  const u = (estado ?? "").toUpperCase();
  if (u.includes("FIRMADO")) return "success";
  if (u.includes("PENDIENTE")) return "pending";
  return "neutral";
}

export function ProfesorDocumentosTab({ profesorId }: { profesorId: string }) {
  const navigate = useNavigate();
  const { list } = useDocumentos(undefined, profesorId);
  const documentos = useMemo(() => list.data?.documentos ?? [], [list.data]);

  const handleOpenDocumento = (idDocumento: string) => {
    void navigate({ to: "/documentos", search: { documentoId: idDocumento } });
  };

  if (list.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (list.isError) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        Error al cargar los documentos: {(list.error as Error)?.message}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Categoría</TableHead>
            <TableHead>Estado firma</TableHead>
            <TableHead>Fecha subida</TableHead>
            <TableHead>Fecha caducidad</TableHead>
            <TableHead>Documento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documentos.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                Sin documentos legales registrados.
              </TableCell>
            </TableRow>
          ) : (
            documentos.map((d) => (
              <TableRow
                key={d.ID_DOCUMENTO}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => handleOpenDocumento(d.ID_DOCUMENTO)}
              >
                <TableCell className="font-medium text-sm">{d.CATEGORIA}</TableCell>
                <TableCell>
                  {d.REQUIERE_FIRMA ? (
                    <StatusBadge
                      status={estadoFirmaStatus(d.ESTADO_FIRMA)}
                      className="text-xs font-normal"
                    >
                      {d.ESTADO_FIRMA ?? "—"}
                    </StatusBadge>
                  ) : (
                    <span className="text-xs text-muted-foreground">No requiere</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">{formatFechaDisplay(d.FECHA_SUBIDA)}</TableCell>
                <TableCell className="text-sm">{formatFechaDisplay(d.FECHA_CADUCIDAD)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    {d.URL_ORIGINAL && (
                      <a
                        href={d.URL_ORIGINAL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Original <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {d.URL_FIRMADO && (
                      <a
                        href={d.URL_FIRMADO}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Firmado <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {!d.URL_ORIGINAL && !d.URL_FIRMADO && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
