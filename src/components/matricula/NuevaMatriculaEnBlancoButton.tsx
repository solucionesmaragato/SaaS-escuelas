import { FileText, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getActiveCursoEscolar, type CentroData } from "@/hooks/useCentros";
import {
  buildMatriculaWhatsAppUrl,
  crearSolicitudMatriculaDesdeCero,
} from "@/lib/matriculaWhatsApp";
import { buildMatriculaSignLink } from "@/lib/solicitudMatricula";

type NuevaMatriculaEnBlancoButtonProps = {
  idCliente: string;
  centros: CentroData[];
  assignedCenterId?: string | null;
  defaultCenterId?: string | null;
  canWrite: boolean;
  disabled?: boolean;
};

export function NuevaMatriculaEnBlancoButton({
  idCliente,
  centros,
  assignedCenterId,
  defaultCenterId,
  canWrite,
  disabled = false,
}: NuevaMatriculaEnBlancoButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [idCentro, setIdCentro] = useState("");
  const [telefono, setTelefono] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const showCentroSelect = centros.length > 1 && !assignedCenterId?.trim();

  const resolvedInitialCentro = useMemo(() => {
    return (
      assignedCenterId?.trim() ||
      defaultCenterId?.trim() ||
      centros[0]?.ID_CENTRO?.trim() ||
      ""
    );
  }, [assignedCenterId, centros, defaultCenterId]);

  useEffect(() => {
    if (!open) return;
    setIdCentro(resolvedInitialCentro);
    setTelefono("");
  }, [open, resolvedInitialCentro]);

  if (!canWrite) return null;

  const handleGenerate = async () => {
    const centroId = idCentro.trim();
    if (!centroId) {
      toast.error("Seleccione un centro.");
      return;
    }

    const centro = centros.find((item) => item.ID_CENTRO === centroId);
    const cursoActivo = centro ? getActiveCursoEscolar(centro.CURSO_ESCOLAR) : null;

    setIsGenerating(true);
    try {
      const result = await crearSolicitudMatriculaDesdeCero({
        idCliente,
        idCentro: centroId,
        idCurso: cursoActivo?.ID_CURSO ?? null,
      });

      if (!result.ok || !result.token_publico?.trim()) {
        toast.error(result.error ?? "No se pudo generar el enlace de matrícula.");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["alumnosTree", idCliente] });

      const url = buildMatriculaSignLink(result.token_publico);
      await navigator.clipboard.writeText(url);

      const phone = telefono.trim();
      if (phone) {
        window.open(
          buildMatriculaWhatsAppUrl(phone, {
            nombreAlumno: "el alumno",
            url,
          }),
          "_blank",
          "noopener,noreferrer",
        );
      }

      toast.success(
        phone
          ? "Enlace generado, copiado y abierto en WhatsApp."
          : "Enlace generado y copiado al portapapeles.",
      );
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo generar la matrícula.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="brand-outline"
        disabled={disabled || centros.length === 0}
        onClick={() => setOpen(true)}
      >
        <FileText className="mr-2 h-4 w-4" aria-hidden />
        Nueva matrícula online
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva matrícula online</DialogTitle>
            <DialogDescription>
              Se creará un alumno en preinscripción y un enlace público para que la familia complete
              el formulario de matrícula.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {showCentroSelect ? (
              <div className="space-y-2">
                <Label htmlFor="matricula-blanco-centro">Centro</Label>
                <Select value={idCentro} onValueChange={setIdCentro}>
                  <SelectTrigger id="matricula-blanco-centro">
                    <SelectValue placeholder="Seleccionar centro" />
                  </SelectTrigger>
                  <SelectContent>
                    {centros.map((centro) => (
                      <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
                        {centro.NOMBRE_CENTRO}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-muted-foreground">Centro</Label>
                <p className="text-sm font-medium">
                  {centros.find((centro) => centro.ID_CENTRO === idCentro)?.NOMBRE_CENTRO ?? "—"}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="matricula-blanco-telefono">Teléfono (opcional)</Label>
              <Input
                id="matricula-blanco-telefono"
                type="tel"
                value={telefono}
                onChange={(event) => setTelefono(event.target.value)}
                placeholder="Para enviar por WhatsApp"
              />
              <p className="text-xs text-muted-foreground">
                Si no indica teléfono, solo se copiará el enlace al portapapeles.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isGenerating}>
              Cancelar
            </Button>
            <Button type="button" variant="brand" onClick={() => void handleGenerate()} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Generando…
                </>
              ) : (
                "Generar y copiar enlace"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
