import type { ReactNode } from "react";
import type { Rol } from "@/types/database";
import type { ProfesorData } from "@/hooks/useProfesores";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const sortLocale = { sensitivity: "base" } as const;

export const PROFESOR_ROL_OPTIONS: { value: Rol; label: string }[] = [
  { value: "PROFESOR", label: "Profesor" },
  { value: "ADMIN", label: "Administrador" },
  { value: "SECRETARIA", label: "Secretaría" },
  { value: "DIRECCION", label: "Dirección" },
];

export function formatFechaDisplay(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10);
}

export function formatSaldoDisplay(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

export function sortProfesoresByEstado(profesores: ProfesorData[]): ProfesorData[] {
  return [...profesores].sort((a, b) => {
    const aActive = !a.FECHA_BAJA;
    const bActive = !b.FECHA_BAJA;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (a.NOMBRE_PROFESOR ?? "").localeCompare(b.NOMBRE_PROFESOR ?? "", "es", sortLocale);
  });
}

export function ReadOnlyField({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-muted-foreground">{label}</Label>
      <p className="mt-1 text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

export function TagBadges({ text }: { text: string }) {
  if (!text || text === "—") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const items = text.split(", ").filter(Boolean);
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1 max-w-[220px]">
      {items.map((item) => (
        <Badge key={item} variant="secondary" className="text-xs font-normal px-1.5 py-0">
          {item}
        </Badge>
      ))}
    </div>
  );
}

export function EstadoProfesorBadge({ fechaBaja }: { fechaBaja: string | null }) {
  const isActive = !fechaBaja;
  return (
    <StatusBadge status={isActive ? "success" : "destructive"} className="text-xs font-normal">
      {isActive ? "Activo" : `Inactivo${fechaBaja ? ` · ${fechaBaja.slice(0, 10)}` : ""}`}
    </StatusBadge>
  );
}

export function EstadoProfesorToggle({
  fechaBaja,
  onClick,
  disabled,
}: {
  fechaBaja: string | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  const isActive = !fechaBaja;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        isActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {isActive ? "Activo" : `Inactivo${fechaBaja ? ` · ${fechaBaja.slice(0, 10)}` : ""}`}
    </button>
  );
}
