import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_CENTROS_FILTER_VALUE } from "@/lib/centroFilter";
import type { CentroData } from "@/hooks/useCentros";

type CentroTableFilterProps = {
  centros: CentroData[];
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
};

export function CentroTableFilter({
  centros,
  value,
  onChange,
  id = "admin-centro-filter",
}: CentroTableFilterProps) {
  if (centros.length <= 1) return null;

  return (
    <div className="space-y-1.5 min-w-[200px] sm:max-w-xs">
      <Label htmlFor={id}>Centro</Label>
      <Select
        value={value ?? ALL_CENTROS_FILTER_VALUE}
        onValueChange={(next) =>
          onChange(next === ALL_CENTROS_FILTER_VALUE ? null : next)
        }
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Todos los centros" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CENTROS_FILTER_VALUE}>Todos los centros</SelectItem>
          {centros.map((centro) => (
            <SelectItem key={centro.ID_CENTRO} value={centro.ID_CENTRO}>
              {centro.NOMBRE_CENTRO}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
