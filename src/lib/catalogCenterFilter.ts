export const CATALOG_ALL_CENTROS_LABEL = "Todas las sedes";

export function catalogMatchesCenter(
  rowIdCentro: string | null | undefined,
  activeCenterId: string | null | undefined,
): boolean {
  if (!activeCenterId) return true;
  return rowIdCentro == null || rowIdCentro === activeCenterId;
}

export function filterCatalogByCenter<T extends { ID_CENTRO?: string | null }>(
  rows: readonly T[],
  activeCenterId: string | null | undefined,
): T[] {
  return rows.filter((row) => catalogMatchesCenter(row.ID_CENTRO, activeCenterId));
}

export function formatCatalogCentroLabel(
  idCentro: string | null | undefined,
  centroNombreById: ReadonlyMap<string, string>,
): string {
  if (idCentro == null || idCentro === "") return CATALOG_ALL_CENTROS_LABEL;
  return centroNombreById.get(idCentro) ?? idCentro;
}

/** PostgREST OR: tenant-wide catalog (null) + rows for the active center. */
export function appendCatalogCenterOrFilter<Q extends { or: (filters: string) => Q }>(
  query: Q,
  centerId: string | null | undefined,
): Q {
  const trimmed = typeof centerId === "string" ? centerId.trim() : "";
  if (!trimmed) return query;
  return query.or(`ID_CENTRO.is.null,ID_CENTRO.eq.${trimmed}`);
}

/** Strict match: row belongs to exactly one center (aulas, profesores). */
export function filterRowsByExactCenter<T extends { ID_CENTRO?: string | null }>(
  rows: readonly T[],
  centerId: string | null | undefined,
): T[] {
  const trimmed = centerId?.trim();
  if (!trimmed) return [];
  return rows.filter((row) => row.ID_CENTRO === trimmed);
}

export type AlumnoCatalogSources = {
  tarifas: ReadonlyArray<{ ID_TARIFA: string; SERVICIO: string; ID_CENTRO?: string | null }>;
  especialidades: ReadonlyArray<{
    ID_ESPECIALIDAD: string;
    ESPECIALIDAD: string;
    ID_CENTRO?: string | null;
  }>;
  profesores: ReadonlyArray<{
    ID_PROFESOR: string;
    NOMBRE_PROFESOR: string;
    ID_CENTRO?: string | null;
    FECHA_BAJA?: string | null;
  }>;
  aulas: ReadonlyArray<{ ID_AULA: string; NOMBRE_AULA: string; ID_CENTRO?: string | null }>;
};

export function scopeAlumnoCatalogSources(
  sources: AlumnoCatalogSources,
  centerId: string | null | undefined,
) {
  const centro = centerId?.trim() ?? "";
  if (!centro) {
    return {
      tarifas: [] as AlumnoCatalogSources["tarifas"][number][],
      especialidades: [] as AlumnoCatalogSources["especialidades"][number][],
      profesores: [] as AlumnoCatalogSources["profesores"][number][],
      aulas: [] as AlumnoCatalogSources["aulas"][number][],
    };
  }
  return {
    tarifas: filterCatalogByCenter(sources.tarifas, centro),
    especialidades: filterCatalogByCenter(sources.especialidades, centro),
    profesores: filterRowsByExactCenter(sources.profesores, centro),
    aulas: filterRowsByExactCenter(sources.aulas, centro),
  };
}
