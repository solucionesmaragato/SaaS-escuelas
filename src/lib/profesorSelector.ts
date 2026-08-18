import { format } from "date-fns";

/** Minimal shape for teacher assignment dropdowns. */
export type ProfesorSelectable = {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  FECHA_BAJA?: string | null;
};

function normalizeFechaBaja(fechaBaja: string): string {
  return fechaBaja.slice(0, 10);
}

/** Equivalent to SQL: FECHA_BAJA IS NULL OR FECHA_BAJA::date >= CURRENT_DATE */
export function isProfesorActivo(profesor: { FECHA_BAJA?: string | null }): boolean {
  const { FECHA_BAJA } = profesor;
  if (FECHA_BAJA == null || FECHA_BAJA === "") return true;
  const fechaBaja = normalizeFechaBaja(FECHA_BAJA);
  const hoy = format(new Date(), "yyyy-MM-dd");
  return fechaBaja >= hoy;
}

export function isProfesorBajaEfectiva(fechaBaja: string | null | undefined): boolean {
  return !isProfesorActivo({ FECHA_BAJA: fechaBaja });
}

export function filterProfesoresActivos<T extends { FECHA_BAJA?: string | null }>(
  profesores: T[],
): T[] {
  return profesores.filter(isProfesorActivo);
}

/**
 * Active teachers for new assignments, plus the currently selected teacher when editing
 * an existing record that points to an inactive teacher.
 */
export function profesoresParaSelector<T extends ProfesorSelectable>(
  profesores: T[],
  selectedId?: string | null,
): T[] {
  const active = filterProfesoresActivos(profesores);
  if (!selectedId) return active;

  const selected = profesores.find((p) => p.ID_PROFESOR === selectedId);
  if (!selected || isProfesorActivo(selected)) return active;

  return [selected, ...active.filter((p) => p.ID_PROFESOR !== selectedId)];
}

export function formatProfesorOptionLabel(profesor: ProfesorSelectable): string {
  return isProfesorActivo(profesor)
    ? profesor.NOMBRE_PROFESOR
    : `${profesor.NOMBRE_PROFESOR} (Inactivo)`;
}

export function sortProfesoresByNombre<T extends { NOMBRE_PROFESOR: string }>(
  profesores: T[],
): T[] {
  return [...profesores].sort((a, b) =>
    a.NOMBRE_PROFESOR.localeCompare(b.NOMBRE_PROFESOR, "es", { sensitivity: "base" }),
  );
}

export function profesorSelectorOptions<T extends ProfesorSelectable>(
  profesores: T[],
  selectedId?: string | null,
): T[] {
  return sortProfesoresByNombre(profesoresParaSelector(profesores, selectedId));
}

export function toProfesorEntityOptions(
  profesores: ProfesorSelectable[],
  selectedId?: string | null,
): { id: string; label: string }[] {
  return profesorSelectorOptions(profesores, selectedId).map((p) => ({
    id: p.ID_PROFESOR,
    label: formatProfesorOptionLabel(p),
  }));
}
