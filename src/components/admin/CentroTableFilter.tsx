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
import { cn } from "@/lib/utils";

type CentroTableFilterProps = {
  centros: CentroData[];
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  hideLabel?: boolean;
};

export function CentroTableFilter({
  centros,
  value,
  onChange,
  id = "admin-centro-filter",
  hideLabel = false,
}: CentroTableFilterProps) {
  if (centros.length <= 1) return null;

  return (
    <div
      className={cn(
        hideLabel ? "min-w-0 w-full max-w-[140px]" : "min-w-[200px] space-y-1.5 sm:max-w-xs",
      )}
    >
      {!hideLabel ? <Label htmlFor={id}>Centro</Label> : null}
      <Select
        value={value ?? ALL_CENTROS_FILTER_VALUE}
        onValueChange={(next) =>
          onChange(next === ALL_CENTROS_FILTER_VALUE ? null : next)
        }
      >
        <SelectTrigger id={id} className={cn(hideLabel && "h-8 min-w-0 [&>span]:truncate")}>
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
