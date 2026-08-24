import { calcCargoExtraTotal } from "@/hooks/useCargosExtra";
import { formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CargoExtraAlumnoOption = {
  id: string;
  name: string;
};

export type CargoExtraFormFieldsProps = {
  idPrefix?: string;
  concepto: string;
  cantidad: string;
  precioUnitario: string;
  porcentajeIva: string;
  onConceptoChange?: (value: string) => void;
  onCantidadChange?: (value: string) => void;
  onPrecioUnitarioChange?: (value: string) => void;
  onPorcentajeIvaChange?: (value: string) => void;
  disabled?: boolean;
  editing?: boolean;
  total?: number | null;
  showAlumno?: boolean;
  alumnoEditable?: boolean;
  alumnoId?: string;
  alumnoNombre?: string;
  alumnoOptions?: CargoExtraAlumnoOption[];
  onAlumnoIdChange?: (value: string) => void;
};

export function CargoExtraFormFields({
  idPrefix = "cargo",
  concepto,
  cantidad,
  precioUnitario,
  porcentajeIva,
  onConceptoChange,
  onCantidadChange,
  onPrecioUnitarioChange,
  onPorcentajeIvaChange,
  disabled = false,
  editing = true,
  total,
  showAlumno = false,
  alumnoEditable = false,
  alumnoId = "",
  alumnoNombre,
  alumnoOptions = [],
  onAlumnoIdChange,
}: CargoExtraFormFieldsProps) {
  const computedTotal =
    total !== undefined
      ? total
      : calcCargoExtraTotal(cantidad, precioUnitario, porcentajeIva);

  return (
    <div className="space-y-4">
      {showAlumno ? (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-alumno`}>Alumno *</Label>
          {alumnoEditable ? (
            <Select
              value={alumnoId || undefined}
              onValueChange={(value) => onAlumnoIdChange?.(value)}
              disabled={disabled}
            >
              <SelectTrigger id={`${idPrefix}-alumno`} className="h-9 w-full min-w-0 [&>span]:truncate">
                <SelectValue placeholder="Seleccionar alumno" />
              </SelectTrigger>
              <SelectContent>
                {alumnoOptions.map((alumno) => (
                  <SelectItem key={alumno.id} value={alumno.id}>
                    {alumno.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${idPrefix}-alumno`}
              value={alumnoNombre?.trim() || "—"}
              readOnly
              disabled
              className="bg-muted/40"
            />
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-concepto`}>Concepto *</Label>
        {editing ? (
          <Input
            id={`${idPrefix}-concepto`}
            value={concepto}
            onChange={(e) => onConceptoChange?.(e.target.value)}
            disabled={disabled}
          />
        ) : (
          <Input value={concepto} readOnly disabled className="bg-muted/40" />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-cantidad`}>Cantidad *</Label>
          {editing ? (
            <Input
              id={`${idPrefix}-cantidad`}
              type="number"
              min="0.01"
              step="0.01"
              value={cantidad}
              onChange={(e) => onCantidadChange?.(e.target.value)}
              disabled={disabled}
            />
          ) : (
            <Input value={cantidad} readOnly disabled className="bg-muted/40" />
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-precio`}>Precio unitario (€) *</Label>
          {editing ? (
            <Input
              id={`${idPrefix}-precio`}
              type="number"
              step="0.01"
              value={precioUnitario}
              onChange={(e) => onPrecioUnitarioChange?.(e.target.value)}
              disabled={disabled}
            />
          ) : (
            <Input
              value={formatCurrency(Number(precioUnitario))}
              readOnly
              disabled
              className="bg-muted/40"
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-iva`}>IVA (%) *</Label>
          {editing ? (
            <Input
              id={`${idPrefix}-iva`}
              type="number"
              step="0.01"
              value={porcentajeIva}
              onChange={(e) => onPorcentajeIvaChange?.(e.target.value)}
              disabled={disabled}
            />
          ) : (
            <Input value={`${porcentajeIva}%`} readOnly disabled className="bg-muted/40" />
          )}
        </div>
        <div className="space-y-2">
          <Label>Total</Label>
          <Input
            value={computedTotal != null ? formatCurrency(computedTotal) : "—"}
            readOnly
            disabled
            className="bg-muted/40"
          />
        </div>
      </div>
    </div>
  );
}
