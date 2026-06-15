/** Minimal shape for teacher assignment dropdowns. */
export type ProfesorSelectable = {
  ID_PROFESOR: string;
  NOMBRE_PROFESOR: string;
  FECHA_BAJA?: string | null;
};

export function isProfesorActivo(profesor: { FECHA_BAJA?: string | null }): boolean {
  return profesor.FECHA_BAJA == null || profesor.FECHA_BAJA === "";
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
