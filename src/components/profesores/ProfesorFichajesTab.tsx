import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useFichajes } from "@/hooks/useFichajes";
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

function formatFechaHora(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function estadoLegalStatus(estado: string | null): "success" | "pending" | "destructive" {
  const u = (estado ?? "").toUpperCase();
  if (u.includes("VALID") || u.includes("APROB")) return "success";
  if (u.includes("PENDIENTE")) return "pending";
  return "destructive";
}

export function ProfesorFichajesTab({ profesorId }: { profesorId: string }) {
  const navigate = useNavigate();
  const { list } = useFichajes(undefined, profesorId);
  const fichajes = useMemo(() => list.data?.fichajes ?? [], [list.data]);

  const handleOpenFichajes = () => {
    void navigate({ to: "/fichajes", search: { profesorId } });
  };

  if (list.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (list.isError) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        Error al cargar los fichajes: {(list.error as Error)?.message}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha y hora</TableHead>
            <TableHead>Movimiento</TableHead>
            <TableHead>Modalidad</TableHead>
            <TableHead>Estado legal</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fichajes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                Sin fichajes registrados.
              </TableCell>
            </TableRow>
          ) : (
            fichajes.map((f) => (
              <TableRow
                key={f.ID_FICHAJE}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={handleOpenFichajes}
              >
                <TableCell className="text-sm whitespace-nowrap">
                  {formatFechaHora(f.FECHA_HORA_REAL)}
                </TableCell>
                <TableCell className="text-sm">{f.TIPO_MOVIMIENTO}</TableCell>
                <TableCell className="text-sm">{f.MODALIDAD ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge
                    status={estadoLegalStatus(f.ESTADO_LEGAL)}
                    className="text-xs font-normal"
                  >
                    {f.ESTADO_LEGAL ?? "—"}
                  </StatusBadge>
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                  {f.NOTAS ?? "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
