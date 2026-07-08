import type { AlumnoTree } from "@/hooks/useAlumnosTree";

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
  onClick,
}: {
  alumno: AlumnoTree;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isActive = isAlumnoActivo(alumno.ESTADO_ALUMNO);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className={
        isActive
          ? "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          : "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-normal transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 border-destructive/30 bg-destructive/10 text-destructive"
      }
    >
      {isActive ? "Activo" : "Inactivo"}
    </button>
  );
}
