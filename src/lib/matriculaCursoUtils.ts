import type { CentroData, CursoEscolarData } from "@/hooks/useCentros";

function sortCursosEscolares(cursos: CursoEscolarData[]): CursoEscolarData[] {
  return [...cursos].sort((a, b) =>
    (a.NOMBRE_CURSO ?? "").localeCompare(b.NOMBRE_CURSO ?? "", "es", {
      sensitivity: "base",
    }),
  );
}

export function getLatestCursoForCentro(cursos: CursoEscolarData[]): CursoEscolarData | null {
  if (cursos.length === 0) return null;
  return (
    [...cursos].sort((a, b) => (b.FECHA_INICIO ?? "").localeCompare(a.FECHA_INICIO ?? ""))[0] ??
    null
  );
}

export function cursosForCentro(centros: CentroData[], centroId: string): CursoEscolarData[] {
  const centro = centros.find((c) => c.ID_CENTRO === centroId);
  return sortCursosEscolares(centro?.CURSO_ESCOLAR ?? []);
}

export function getActiveCursoIdsForCentro(centros: CentroData[], centroId: string): Set<string> {
  const ids = new Set<string>();
  for (const curso of cursosForCentro(centros, centroId)) {
    if (curso.ESTADO?.trim().toLowerCase() === "activo") {
      ids.add(curso.ID_CURSO);
    }
  }
  return ids;
}

export function isCursoActivoEnCentro(
  centros: CentroData[],
  centroId: string,
  idCurso: string | null | undefined,
): boolean {
  const id = idCurso?.trim();
  if (!id) return false;
  return getActiveCursoIdsForCentro(centros, centroId).has(id);
}

export function resolveCursoIdForCentro(
  centros: CentroData[],
  centroId: string,
  currentCursoId: string,
): string {
  const cursos = cursosForCentro(centros, centroId);
  const current = currentCursoId?.trim();
  if (current && cursos.some((c) => c.ID_CURSO === current)) return current;
  const latest = getLatestCursoForCentro(cursos);
  return latest?.ID_CURSO ?? "";
}

export function formatCursoNombre(
  idCurso: string | null | undefined,
  centros: CentroData[],
  centroId?: string | null,
): string {
  const id = idCurso?.trim();
  if (!id) return "—";
  const scopedCentroId = centroId?.trim();
  if (scopedCentroId) {
    const found = cursosForCentro(centros, scopedCentroId).find((c) => c.ID_CURSO === id);
    if (found?.NOMBRE_CURSO) return found.NOMBRE_CURSO;
  }
  for (const centro of centros) {
    const found = (centro.CURSO_ESCOLAR ?? []).find((c) => c.ID_CURSO === id);
    if (found?.NOMBRE_CURSO) return found.NOMBRE_CURSO;
  }
  return id;
}
