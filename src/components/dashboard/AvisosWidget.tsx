import { useMemo } from "react";
import { Bell, CheckCircle2 } from "lucide-react";
import { useAvisosInternos } from "@/hooks/useAvisosInternos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

function formatAvisoFecha(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ").slice(0, 16);
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TipoBadge({ tipo }: { tipo: string | null | undefined }) {
  if (!tipo) return null;
  const normalized = tipo.trim().toUpperCase();
  const isUrgent = normalized === "URGENTE";
  return (
    <Badge
      variant={isUrgent ? "destructive" : "secondary"}
      className={
        isUrgent
          ? "text-xs font-normal"
          : "text-xs font-normal bg-orange-100 text-orange-800 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-300"
      }
    >
      {tipo}
    </Badge>
  );
}

export function AvisosWidget() {
  const { list, markAsRead } = useAvisosInternos();

  const pending = useMemo(
    () => (list.data ?? []).filter((aviso) => aviso.LEIDO === false),
    [list.data],
  );

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsRead.mutateAsync(id);
      toast.success("Aviso marcado como resuelto.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo marcar el aviso.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-md border bg-muted/50 p-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">Avisos internos pendientes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Alertas que requieren atención tras bajas de profesor u otras incidencias.
            </p>
          </div>
        </div>
        <Badge variant={pending.length > 0 ? "destructive" : "secondary"}>
          {pending.length} pendiente{pending.length === 1 ? "" : "s"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : list.isError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
            Error al cargar avisos: {(list.error as Error)?.message}
          </p>
        ) : pending.length === 0 ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No hay avisos pendientes. Todo al día.
          </p>
        ) : (
          pending.map((aviso) => (
            <div
              key={aviso.ID_AVISO}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatAvisoFecha(aviso.FECHA)}
                  </span>
                  <TipoBadge tipo={aviso.TIPO} />
                </div>
                {aviso.NOMBRE_LEAD?.trim() ? (
                  <p className="text-sm font-medium">{aviso.NOMBRE_LEAD}</p>
                ) : null}
                <p className="text-sm leading-relaxed">{aviso.MENSAJE ?? "—"}</p>
              </div>

              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-2"
                disabled={markAsRead.isPending}
                onClick={() => handleMarkAsRead(aviso.ID_AVISO)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Marcar como resuelto
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
