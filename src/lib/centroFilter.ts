import { supabase } from "@/integrations/supabase/client";
import {
  isAdminRole,
  isMasterRole,
  scopeTenantQuery,
  scopeWorkspaceQuery,
} from "@/lib/tenantQuery";

export const ALL_CENTROS_FILTER_VALUE = "__all_centros__";

/** Tables with a direct ID_CENTRO column (per database types). */
export const TABLES_WITH_DIRECT_ID_CENTRO = new Set([
  "PERFILES",
  "ALUMNOS",
  "MATRICULAS",
  "GRUPOS",
  "CENTROS",
]);

export function resolveCenterFilterId(filterCenterId: string | null | undefined): string | null {
  const trimmed = typeof filterCenterId === "string" ? filterCenterId.trim() : "";
  return trimmed || null;
}

export function appendCenterFilter<Q extends { eq: (column: string, value: string) => Q }>(
  query: Q,
  filterCenterId: string | null | undefined,
): Q {
  const centerId = resolveCenterFilterId(filterCenterId);
  if (!centerId) return query;
  return query.eq("ID_CENTRO", centerId);
}

interface InFilterable<Q> {
  in: (column: string, values: string[]) => Q;
}

export function appendIdInFilter<Q extends InFilterable<Q>>(
  query: Q,
  column: string,
  ids: string[] | null,
): Q | "empty" {
  if (!ids) return query;
  if (ids.length === 0) return "empty";
  return query.in(column, ids);
}

export async function fetchAlumnoIdsForCenter(
  tenantId: string,
  rol: string | null | undefined,
  filterCenterId: string | null | undefined,
): Promise<string[] | null> {
  const centerId = resolveCenterFilterId(filterCenterId);
  if (!centerId) return null;

  let query = supabase.from("ALUMNOS").select("ID_ALUMNO");
  query = scopeTenantQuery(query, rol, tenantId);
  query = query.eq("ID_CENTRO", centerId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => row.ID_ALUMNO);
}

export async function fetchProfesorIdsForCenter(
  tenantId: string,
  filterCenterId: string | null | undefined,
): Promise<string[] | null> {
  const centerId = resolveCenterFilterId(filterCenterId);
  if (!centerId) return null;

  const { data, error } = await supabase
    .from("PERFILES")
    .select("ID_PROFESOR")
    .eq("ID_CLIENTE", tenantId)
    .eq("ID_CENTRO", centerId)
    .not("ID_PROFESOR", "is", null);

  if (error) throw error;
  return (data ?? []).map((row) => row.ID_PROFESOR as string).filter((id) => Boolean(id));
}

export function centerFilterQueryKey(filterCenterId: string | null | undefined): string {
  return resolveCenterFilterId(filterCenterId) ?? "all";
}

/**
 * Effective list center: ADMIN/MASTER use optional UI filter; other roles use
 * profile ID_CENTRO (UI filter ignored).
 */
export function resolveProfileListCenterId(
  rol: string | null | undefined,
  profileCenterId: string | null | undefined,
  uiFilterCenterId?: string | null,
): string | null {
  if (isMasterRole(rol) || isAdminRole(rol)) {
    return resolveCenterFilterId(uiFilterCenterId);
  }
  return resolveCenterFilterId(profileCenterId);
}

export function profileListCenterQueryKey(
  rol: string | null | undefined,
  profileCenterId: string | null | undefined,
  uiFilterCenterId?: string | null,
): string {
  return centerFilterQueryKey(resolveProfileListCenterId(rol, profileCenterId, uiFilterCenterId));
}

/** Scope tables with a direct ID_CENTRO column (ALUMNOS, MATRICULAS, GRUPOS, …). */
export function scopeDirectCentroTableQuery<Q extends { eq: (column: string, value: string) => Q }>(
  query: Q,
  rol: string | null | undefined,
  tenantId: string,
  profileCenterId: string | null | undefined,
  uiFilterCenterId?: string | null,
): Q {
  const effectiveCenterId = resolveProfileListCenterId(rol, profileCenterId, uiFilterCenterId);
  if (isMasterRole(rol)) {
    return effectiveCenterId ? query.eq("ID_CENTRO", effectiveCenterId) : query;
  }
  if (isAdminRole(rol)) {
    const scoped = scopeTenantQuery(query, rol, tenantId);
    return effectiveCenterId ? scoped.eq("ID_CENTRO", effectiveCenterId) : scoped;
  }
  if (effectiveCenterId) {
    return scopeWorkspaceQuery(query, tenantId, effectiveCenterId);
  }
  return scopeTenantQuery(query, rol, tenantId);
}
