import { useEffect, useState } from "react";
import type { FichajeData } from "@/hooks/useFichajes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function toLocalDatetimeValue(iso: string | null | undefined): string {
  if (!iso) {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function CorrectionRequestDialog({
  open,
  record,
  submitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  record: FichajeData | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (values: { fechaHoraManual: string; motivo: string }) => Promise<void>;
}) {
  const [fechaHoraManual, setFechaHoraManual] = useState("");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!open || !record) return;
    setFechaHoraManual(toLocalDatetimeValue(record.FECHA_HORA));
    setMotivo("");
  }, [open, record]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar corrección</DialogTitle>
          <DialogDescription>
            No se modifica el registro sellado. Se creará una solicitud de corrección para
            revisión administrativa.
          </DialogDescription>
        </DialogHeader>

        {record && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!fechaHoraManual.trim() || !motivo.trim()) return;
              await onSubmit({
                fechaHoraManual: new Date(fechaHoraManual).toISOString(),
                motivo: motivo.trim(),
              });
            }}
          >
            <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Registro original:</span>{" "}
                {record.TIPO_MOVIMIENTO} · {record.FECHA_HORA.replace("T", " ").slice(0, 16)}
              </p>
              <p className="mt-1 font-mono">ID: {record.ID_FICHAJE}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fecha-hora-manual">Hora correcta *</Label>
              <Input
                id="fecha-hora-manual"
                type="datetime-local"
                value={fechaHoraManual}
                onChange={(e) => setFechaHoraManual(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivo-correccion">Motivo de la corrección *</Label>
              <Textarea
                id="motivo-correccion"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={4}
                placeholder="Explica por qué el fichaje original es incorrecto..."
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submitting || !fechaHoraManual.trim() || !motivo.trim()}
              >
                {submitting ? "Enviando..." : "Enviar solicitud"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
