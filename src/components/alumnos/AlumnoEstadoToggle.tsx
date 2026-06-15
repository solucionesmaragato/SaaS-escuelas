import type { AlumnoTree } from "@/hooks/useAlumnosTree";
import { cn } from "@/lib/utils";

export function isAlumnoActivo(estado: string | null | undefined): boolean {
  if (!estado) return false;
  return estado.trim().toLowerCase() === "activo";
}

export function toggleEstadoAlumno(estado: string | null | undefined): "Activo" | "Inactivo" {
  return isAlumnoActivo(estado) ? "Inactivo" : "Activo";
}

export function AlumnoEstadoToggle({
  alumno,
  disabled,
  onToggle,
}: {
  alumno: AlumnoTree;
  disabled?: boolean;
  onToggle: (nextEstado: "Activo" | "Inactivo") => void;
}) {
  const activo = isAlumnoActivo(alumno.ESTADO_ALUMNO);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(toggleEstadoAlumno(alumno.ESTADO_ALUMNO));
      }}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        "transition-colors hover:opacity-80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        activo
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white",
      )}
    >
      {activo ? "Activo" : "Inactivo"}
    </button>
  );
}
