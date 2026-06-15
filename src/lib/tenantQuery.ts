type TenantScopedQuery<Q> = Q & { eq: (column: string, value: string) => Q };

/** Case-insensitive MASTER check; treats undefined/null as non-master. */
export function isMasterRole(rol: string | null | undefined): boolean {
  return rol?.toUpperCase() === "MASTER";
}

/** Case-insensitive ADMIN check. */
export function isAdminRole(rol: string | null | undefined): boolean {
  return rol?.toUpperCase() === "ADMIN";
}

/** Read-only administrator (DB enum: DIRECCION). */
export function isDireccionRole(rol: string | null | undefined): boolean {
  return rol?.toUpperCase() === "DIRECCION";
}

export function isSecretariaRole(rol: string | null | undefined): boolean {
  return rol?.toUpperCase() === "SECRETARIA";
}

/** Alumnos module: ADMIN and SECRETARÍA only. */
export function canViewAlumnosModule(rol: string | null | undefined): boolean {
  return isAdminRole(rol) || isSecretariaRole(rol);
}

/** DIRECCION and SECRETARIA: inspect admin views without mutating. */
export function isReadOnlyAdminRole(rol: string | null | undefined): boolean {
  return isDireccionRole(rol) || isSecretariaRole(rol);
}

export function isProfesorRole(rol: string | null | undefined): boolean {
  return rol?.toUpperCase() === "PROFESOR";
}

/** PROFESOR and DIRECCION with a linked ID_PROFESOR may open self-service profile. */
export function canViewMiPerfilNav(
  rol: string | null | undefined,
  profesorId: string | null | undefined,
): boolean {
  if (!profesorId) return false;
  return isProfesorRole(rol) || isDireccionRole(rol);
}

/** MASTER and ADMIN may create, update, and delete. */
export function canManageUsuarios(rol: string | null | undefined): boolean {
  return isMasterRole(rol) || isAdminRole(rol);
}

/** MASTER, ADMIN, DIRECCION, and SECRETARIA may view usuarios / mensajes automáticos. */
export function canViewUsuariosYMensajes(rol: string | null | undefined): boolean {
  return canManageUsuarios(rol) || isReadOnlyAdminRole(rol);
}

/** MASTER: all tenants; other roles: scoped to active ID_CLIENTE. */
export function scopeTenantQuery<Q extends TenantScopedQuery<Q>>(
  query: Q,
  rol: string | null | undefined,
  tenantId: string,
): Q {
  if (isMasterRole(rol)) {
    return query;
  }
  return query.eq("ID_CLIENTE", tenantId);
}

/**
 * Explicit workspace scope for multi-profile accounts.
 * Always filters by active school; adds center when the profile has one.
 */
export function scopeWorkspaceQuery<Q extends TenantScopedQuery<Q>>(
  query: Q,
  tenantId: string,
  centerId: string | null | undefined,
): Q {
  let scoped = query.eq("ID_CLIENTE", tenantId);
  if (centerId) {
    scoped = scoped.eq("ID_CENTRO", centerId);
  }
  return scoped;
}

export function workspaceScopeFields(
  tenantId: string,
  centerId: string | null | undefined,
): { ID_CLIENTE: string; ID_CENTRO?: string } {
  const fields: { ID_CLIENTE: string; ID_CENTRO?: string } = { ID_CLIENTE: tenantId };
  if (centerId) fields.ID_CENTRO = centerId;
  return fields;
}

export function tenantListKey(scope: string, rol: string | null | undefined, tenantId: string) {
  return [scope, isMasterRole(rol) ? "MASTER" : tenantId] as const;
}

export function workspaceListKey(
  scope: string,
  tenantId: string,
  centerId: string | null | undefined,
) {
  return [scope, tenantId, centerId ?? "none"] as const;
}
