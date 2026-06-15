import { useMemo } from "react";
import { CheckCircle2 } from "lucide-react";
import { useFichajes } from "@/hooks/useFichajes";
import { CORRECCION_PENDIENTE } from "@/lib/fichajeEidas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

function formatFechaHora(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace("T", " ").substring(0, 16);
}

export function PendingCorrectionsPanel() {
  const { list, approveCorrection } = useFichajes();

  const pending = useMemo(
    () =>
      (list.data?.fichajes ?? []).filter(
        (f) => (f.TIPO_MOVIMIENTO ?? "").trim() === CORRECCION_PENDIENTE,
      ),
    [list.data?.fichajes],
  );

  const originalById = useMemo(() => {
    const map = new Map<string, (typeof pending)[number]>();
    for (const row of list.data?.fichajes ?? []) {
      map.set(row.ID_FICHAJE, row);
    }
    return map;
  }, [list.data?.fichajes]);

  const handleApprove = async (id: string) => {
    try {
      await approveCorrection.mutateAsync(id);
      toast.success("Corrección aprobada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo aprobar la corrección.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">Correcciones pendientes</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Revisa y aprueba solicitudes de corrección de fichajes sellados.
          </p>
        </div>
        <Badge variant={pending.length > 0 ? "destructive" : "secondary"}>
          {pending.length} pendiente{pending.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : pending.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No hay correcciones pendientes de revisión.
          </p>
        ) : (
          pending.map((correction) => {
            const original = correction.ID_FICHAJE_CORREGIDO
              ? originalById.get(correction.ID_FICHAJE_CORREGIDO)
              : null;

            return (
              <div
                key={correction.ID_FICHAJE}
                className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-medium">
                    {correction.PROFESOR?.NOMBRE_PROFESOR ?? "Profesor desconocido"}
                  </p>
                  <p className="text-muted-foreground">
                    Original:{" "}
                    {original
                      ? `${original.TIPO_MOVIMIENTO} · ${formatFechaHora(original.FECHA_HORA)}`
                      : "—"}
                  </p>
                  <p>
                    Hora solicitada:{" "}
                    <span className="font-mono">
                      {formatFechaHora(correction.FECHA_HORA_MANUAL)}
                    </span>
                  </p>
                  <p className="text-muted-foreground">{correction.MOTIVO_MODIFICACION}</p>
                </div>

                <Button
                  size="sm"
                  className="shrink-0 gap-2"
                  disabled={approveCorrection.isPending}
                  onClick={() => handleApprove(correction.ID_FICHAJE)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Aprobar
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
