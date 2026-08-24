import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  calcCargoExtraTotal,
  cargoExtraEstadoStatus,
  formatCargoExtraFecha,
  isCargoExtraPendiente,
  type CargoExtraRow,
  type CargoExtraUpdateInput,
} from "@/hooks/useCargosExtra";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CargoExtraFormFields } from "@/components/alumnos/CargoExtraFormFields";
import { toast } from "sonner";

type CargoExtraDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cargo: CargoExtraRow | null;
  canEdit: boolean;
  onUpdate: (input: CargoExtraUpdateInput) => Promise<CargoExtraRow>;
  updating?: boolean;
  onUpdated?: (cargo: CargoExtraRow) => void;
  showAlumno?: boolean;
  alumnoNombre?: string;
  showMeta?: boolean;
  editInHeader?: boolean;
};

export function CargoExtraDetailDialog({
  open,
  onOpenChange,
  cargo,
  canEdit,
  onUpdate,
  updating = false,
  onUpdated,
  showAlumno = false,
  alumnoNombre,
  showMeta = true,
  editInHeader = false,
}: CargoExtraDetailDialogProps) {
  const [mode, setMode] = useState<"detail" | "edit">("detail");
  const [concepto, setConcepto] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [porcentajeIva, setPorcentajeIva] = useState("0");

  const pendiente = isCargoExtraPendiente(cargo?.ESTADO);
  const editable = canEdit && pendiente;
  const isEditing = mode === "edit";
  const totalPreview = calcCargoExtraTotal(
    isEditing ? cantidad : (cargo?.CANTIDAD ?? ""),
    isEditing ? precioUnitario : (cargo?.PRECIO_UNITARIO ?? ""),
    isEditing ? porcentajeIva : (cargo?.PORCENTAJE_IVA ?? ""),
  );

  useEffect(() => {
    if (!open) {
      setMode("detail");
      return;
    }
    if (!cargo) return;
    setMode("detail");
    setConcepto(cargo.CONCEPTO ?? "");
    setCantidad(String(cargo.CANTIDAD ?? ""));
    setPrecioUnitario(String(cargo.PRECIO_UNITARIO ?? ""));
    setPorcentajeIva(String(cargo.PORCENTAJE_IVA ?? ""));
  }, [open, cargo?.ID_CARGO]);

  const handleClose = () => {
    setMode("detail");
    onOpenChange(false);
  };

  const handleCancelEdit = () => {
    if (!cargo) return;
    setConcepto(cargo.CONCEPTO ?? "");
    setCantidad(String(cargo.CANTIDAD ?? ""));
    setPrecioUnitario(String(cargo.PRECIO_UNITARIO ?? ""));
    setPorcentajeIva(String(cargo.PORCENTAJE_IVA ?? ""));
    setMode("detail");
  };

  const handleSave = async () => {
    if (!cargo || !editable) return;
    try {
      const updated = await onUpdate({
        ID_CARGO: cargo.ID_CARGO,
        CONCEPTO: concepto,
        CANTIDAD: Number(cantidad),
        PRECIO_UNITARIO: Number(precioUnitario),
        PORCENTAJE_IVA: Number(porcentajeIva),
      });
      toast.success("Cargo extra actualizado correctamente.");
      onUpdated?.(updated);
      setMode("detail");
      if (!editInHeader) {
        handleClose();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el cargo extra.");
    }
  };

  if (!cargo) return null;

  const resolvedAlumnoNombre = alumnoNombre?.trim() || "Sin nombre";
  const showHeaderEdit = editInHeader && mode === "detail" && editable;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        {showHeaderEdit ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="absolute right-10 top-4 z-10 gap-2 bg-black text-white hover:bg-black/90"
            onClick={() => setMode("edit")}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        ) : null}

        <DialogHeader className={showHeaderEdit ? "pr-24" : undefined}>
          <DialogTitle>Detalle del cargo extra</DialogTitle>
        </DialogHeader>

        <CargoExtraFormFields
          idPrefix="cargo-detail"
          showAlumno={showAlumno}
          alumnoNombre={resolvedAlumnoNombre}
          concepto={isEditing ? concepto : (cargo.CONCEPTO ?? "")}
          cantidad={isEditing ? cantidad : String(cargo.CANTIDAD ?? "")}
          precioUnitario={isEditing ? precioUnitario : String(cargo.PRECIO_UNITARIO ?? "")}
          porcentajeIva={isEditing ? porcentajeIva : String(cargo.PORCENTAJE_IVA ?? "")}
          onConceptoChange={setConcepto}
          onCantidadChange={setCantidad}
          onPrecioUnitarioChange={setPrecioUnitario}
          onPorcentajeIvaChange={setPorcentajeIva}
          disabled={updating}
          editing={isEditing}
          total={totalPreview}
        />

        {showMeta ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Estado</Label>
                <div>
                  <StatusBadge status={cargoExtraEstadoStatus(cargo.ESTADO)} className="capitalize">
                    {cargo.ESTADO ?? "—"}
                  </StatusBadge>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input value={formatCargoExtraFecha(cargo)} readOnly disabled className="bg-muted/40" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Recibo vinculado</Label>
              <Input
                value={cargo.ID_RECIBO_VINCULADO ?? "—"}
                readOnly
                disabled
                className="bg-muted/40 font-mono text-xs"
              />
            </div>
          </>
        ) : null}

        <DialogFooter>
          {mode === "edit" ? (
            <>
              <Button type="button" variant="ghost" onClick={handleCancelEdit} disabled={updating}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={updating}>
                {updating ? "Guardando..." : "Guardar"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cerrar
              </Button>
              {!editInHeader && editable ? (
                <Button type="button" onClick={() => setMode("edit")}>
                  Editar
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
