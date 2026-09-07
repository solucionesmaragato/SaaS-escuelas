import { EntityLink } from "@/components/navigation/EntityLink";
import { ShieldAlert } from "lucide-react";
import {
  fichajeVinculoLabel,
  parseFichajeIncidencias,
  parseFichajeVinculos,
} from "@/lib/fichajeIncidencias";

export function FichajeIncidenciasPanel({
  notas,
  profesorId,
  className = "",
}: {
  notas: string | null | undefined;
  profesorId?: string | null;
  className?: string;
}) {
  const incidencias = parseFichajeIncidencias(notas);
  const vinculos = parseFichajeVinculos(notas);

  if (incidencias.length === 0 && vinculos.length === 0) return null;

  return (
    <div
      className={`rounded-md border border-amber-200/70 bg-amber-50/60 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-900/20 ${className}`}
    >
      <div className="mb-2 flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-300">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Incidencias
      </div>
      <ul className="space-y-1.5 text-xs text-amber-950 dark:text-amber-100">
        {incidencias.map((text) => (
          <li key={text}>{text}</li>
        ))}
        {vinculos.map(({ tipo, fichajeId }) => (
          <li key={`${tipo}-${fichajeId}`}>
            {fichajeVinculoLabel(tipo)}:{" "}
            <EntityLink type="fichaje" id={fichajeId} profesorId={profesorId} className="text-xs">
              {fichajeId}
            </EntityLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
