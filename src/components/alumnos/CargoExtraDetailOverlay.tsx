import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Pencil, X } from "lucide-react";
import {
  calcCargoExtraTotal,
  isCargoExtraPendiente,
  type CargoExtraRow,
  type CargoExtraUpdateInput,
} from "@/hooks/useCargosExtra";
import { ALUMNO_OVERLAY_PANEL_CLASS } from "@/components/alumnos/AlumnoDetailOverlay";
import { CargoExtraFormFields } from "@/components/alumnos/CargoExtraFormFields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CargoExtraDetailOverlayProps = {
  open: boolean;
  cargo: CargoExtraRow | null;
  canEdit: boolean;
  updating?: boolean;
  alumnoNombre?: string;
  onClose: () => void;
  onUpdate: (input: CargoExtraUpdateInput) => Promise<CargoExtraRow>;
  onUpdated?: (cargo: CargoExtraRow) => void;
};

export function CargoExtraDetailOverlay({
  open,
  cargo,
  canEdit,
  updating = false,
  alumnoNombre,
  onClose,
  onUpdate,
  onUpdated,
}: CargoExtraDetailOverlayProps) {
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

  const handleCancelEdit = () => {
    if (!cargo) return;
    setConcepto(cargo.CONCEPTO ?? "");
    setCantidad(String(cargo.CANTIDAD ?? ""));
    setPrecioUnitario(String(cargo.PRECIO_UNITARIO ?? ""));
    setPorcentajeIva(String(cargo.PORCENTAJE_IVA ?? ""));
    setMode("detail");
  };

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (mode === "edit") {
        if (!cargo) return;
        setConcepto(cargo.CONCEPTO ?? "");
        setCantidad(String(cargo.CANTIDAD ?? ""));
        setPrecioUnitario(String(cargo.PRECIO_UNITARIO ?? ""));
        setPorcentajeIva(String(cargo.PORCENTAJE_IVA ?? ""));
        setMode("detail");
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, mode, onClose, cargo]);

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar el cargo extra.");
    }
  };

  if (!open || !cargo) return null;

  const resolvedAlumnoNombre = alumnoNombre?.trim() || "Sin nombre";

  return createPortal(
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/10"
        aria-label="Cerrar detalle del cargo extra"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cargo-extra-overlay-title"
        className={cn(ALUMNO_OVERLAY_PANEL_CLASS, "max-w-md p-6")}
      >
        {isEditing ? (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-2"
                  onClick={handleCancelEdit}
                  disabled={updating}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver
                </Button>
                <h2 id="cargo-extra-overlay-title" className="truncate text-xl font-semibold">
                  Editar cargo extra
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar"
                onClick={onClose}
                disabled={updating}
              >
                <X className="h-5 w-5" />
              </Button>
            </header>

            <CargoExtraFormFields
              idPrefix="cargo-extra-edit"
              showAlumno
              alumnoNombre={resolvedAlumnoNombre}
              concepto={concepto}
              cantidad={cantidad}
              precioUnitario={precioUnitario}
              porcentajeIva={porcentajeIva}
              onConceptoChange={setConcepto}
              onCantidadChange={setCantidad}
              onPrecioUnitarioChange={setPrecioUnitario}
              onPorcentajeIvaChange={setPorcentajeIva}
              disabled={updating}
              editing
              total={totalPreview}
            />

            <div className="mt-4 flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={updating}>
                Cancelar
              </Button>
              <Button type="button" variant="brand" onClick={() => void handleSave()} disabled={updating}>
                {updating ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <h2 id="cargo-extra-overlay-title" className="truncate text-xl font-semibold">
                  Detalle del cargo extra
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editable ? (
                  <Button
                    type="button"
                    variant="brand"
                    size="sm"
                    className="gap-2"
                    onClick={() => setMode("edit")}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar"
                  onClick={onClose}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </header>

            <CargoExtraFormFields
              idPrefix="cargo-extra-detail"
              showAlumno
              alumnoNombre={resolvedAlumnoNombre}
              concepto={cargo.CONCEPTO ?? ""}
              cantidad={String(cargo.CANTIDAD ?? "")}
              precioUnitario={String(cargo.PRECIO_UNITARIO ?? "")}
              porcentajeIva={String(cargo.PORCENTAJE_IVA ?? "")}
              editing={false}
              total={totalPreview}
            />
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
