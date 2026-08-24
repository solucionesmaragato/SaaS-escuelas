import { useEffect, useState } from "react";
import { calcCargoExtraTotal, type CargoExtraCreateInput } from "@/hooks/useCargosExtra";
import type { Alumno } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CargoExtraFormFields } from "@/components/alumnos/CargoExtraFormFields";
import { toast } from "sonner";

type CargoExtraCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alumnos: Alumno[];
  creating?: boolean;
  onCreate: (input: CargoExtraCreateInput) => Promise<void>;
};

export function CargoExtraCreateDialog({
  open,
  onOpenChange,
  alumnos,
  creating = false,
  onCreate,
}: CargoExtraCreateDialogProps) {
  const [alumnoId, setAlumnoId] = useState("");
  const [concepto, setConcepto] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [porcentajeIva, setPorcentajeIva] = useState("0");

  const alumnoOptions = alumnos
    .filter((alumno) => alumno.ID_ALUMNO?.trim())
    .map((alumno) => ({
      id: alumno.ID_ALUMNO,
      name: alumno.NOMBRE_ALUMNO?.trim() || alumno.ID_ALUMNO,
    }));

  const total = calcCargoExtraTotal(cantidad, precioUnitario, porcentajeIva);

  useEffect(() => {
    if (!open) {
      setAlumnoId("");
      setConcepto("");
      setCantidad("1");
      setPrecioUnitario("");
      setPorcentajeIva("0");
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSave = async () => {
    const selectedAlumno = alumnos.find((alumno) => alumno.ID_ALUMNO === alumnoId);
    const idCentro = selectedAlumno?.ID_CENTRO?.trim();
    if (!alumnoId.trim()) {
      toast.error("Selecciona un alumno.");
      return;
    }
    if (!idCentro) {
      toast.error("El alumno seleccionado no tiene centro asignado.");
      return;
    }

    try {
      await onCreate({
        ID_ALUMNO: alumnoId.trim(),
        ID_CENTRO: idCentro,
        CONCEPTO: concepto,
        CANTIDAD: Number(cantidad),
        PRECIO_UNITARIO: Number(precioUnitario),
        PORCENTAJE_IVA: Number(porcentajeIva),
      });
      toast.success("Cargo extra añadido correctamente.");
      handleClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo añadir el cargo extra.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir cargo extra</DialogTitle>
          <DialogDescription>
            El cargo quedará pendiente hasta generar la remesa mensual del alumno.
          </DialogDescription>
        </DialogHeader>

        <CargoExtraFormFields
          idPrefix="cargo-create"
          showAlumno
          alumnoEditable
          alumnoId={alumnoId}
          alumnoOptions={alumnoOptions}
          onAlumnoIdChange={setAlumnoId}
          concepto={concepto}
          cantidad={cantidad}
          precioUnitario={precioUnitario}
          porcentajeIva={porcentajeIva}
          onConceptoChange={setConcepto}
          onCantidadChange={setCantidad}
          onPrecioUnitarioChange={setPrecioUnitario}
          onPorcentajeIvaChange={setPorcentajeIva}
          disabled={creating}
          editing
          total={total}
        />

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={creating}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={creating}>
            {creating ? "Guardando..." : "Guardar cargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
