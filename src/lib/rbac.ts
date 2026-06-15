import type { Rol } from "@/types/database";
import { isMasterRole } from "@/lib/tenantQuery";

/**
 * Role hierarchy and permission matrix.
 * Centralized so route guards, sidebar, and UI affordances stay in sync.
 */

export type Permission =
  // CLIENTES table (school/tenant config: Stripe, Holded, billing setup)
  | "clientes:write"
  // Operational entities
  | "alumnos:read"
  | "alumnos:write"
  | "profesores:read"
  | "profesores:write"
  | "aulas:write"
  | "especialidades:write"
  | "matriculas:read"
  | "matriculas:write"
  | "grupos:write"
  | "horarios:write"
  // Sessions: profesor can edit OWN; admin/directivo edit all
  | "sesiones:read"
  | "sesiones:write:all"
  | "sesiones:write:own"
  | "incidencias:read"
  | "incidencias:write"
  | "leads:read"
  | "leads:write"
  // HR
  | "fichajes:read:all"
  | "fichajes:write:own"
  | "ausencias:read"
  | "ausencias:write"
  | "documentos:read"
  | "documentos:write"
  | "prestamos:read"
  | "prestamos:write"
  | "evaluaciones:read"
  | "evaluaciones:write"
  | "rubricas:read"
  | "rubricas:write"
  | "turnos:read"
  | "turnos:write"
  // Billing
  | "tarifas:read"
  | "tarifas:write"
  | "recibos:read"
  | "recibos:write"
  | "remesas:write";

const ROLE_PERMISSIONS: Record<Rol, Permission[]> = {
  MASTER: [
    "clientes:write",
    "alumnos:read", "alumnos:write",
    "profesores:read", "profesores:write",
    "aulas:write", "especialidades:write",
    "matriculas:read", "matriculas:write",
    "grupos:write", "horarios:write",
    "sesiones:read", "sesiones:write:all",
    "incidencias:read", "incidencias:write",
    "leads:read", "leads:write",
    "fichajes:read:all", "fichajes:write:own",
    "ausencias:write", "documentos:write", "prestamos:read", "prestamos:write",
    "evaluaciones:read", "evaluaciones:write", "rubricas:read", "rubricas:write",
    "turnos:read", "turnos:write",
    "tarifas:read", "tarifas:write",
    "recibos:read", "recibos:write", "remesas:write",
  ],
  ADMIN: [
    "clientes:write",
    "alumnos:read", "alumnos:write",
    "profesores:read", "profesores:write",
    "aulas:write", "especialidades:write",
    "matriculas:read", "matriculas:write",
    "grupos:write", "horarios:write",
    "sesiones:read", "sesiones:write:all",
    "incidencias:read", "incidencias:write",
    "leads:read", "leads:write",
    "fichajes:read:all", "fichajes:write:own",
    "ausencias:write", "documentos:write", "prestamos:read", "prestamos:write",
    "evaluaciones:read", "evaluaciones:write", "rubricas:read", "rubricas:write",
    "turnos:read", "turnos:write",
    "tarifas:read", "tarifas:write",
    "recibos:read", "recibos:write", "remesas:write",
  ],
  DIRECCION: [
    "alumnos:read", "alumnos:write",
    "profesores:read", "profesores:write",
    "aulas:write", "especialidades:write",
    "matriculas:read", "matriculas:write",
    "grupos:write", "horarios:write",
    "sesiones:read", "sesiones:write:all",
    "incidencias:read", "incidencias:write",
    "leads:read", "leads:write",
    "fichajes:read:all", "fichajes:write:own",
    "ausencias:read",
    "documentos:read",
    "prestamos:read", "prestamos:write",
    "evaluaciones:read", "evaluaciones:write", "rubricas:read", "rubricas:write",
    "turnos:read", "turnos:write",
    "tarifas:read",
    "recibos:read", "recibos:write",
  ],
  SECRETARIA: [
    "alumnos:read", "alumnos:write",
    "profesores:read", "profesores:write",
    "aulas:write", "especialidades:write",
    "matriculas:read", "matriculas:write",
    "grupos:write", "horarios:write",
    "sesiones:read", "sesiones:write:all",
    "incidencias:read", "incidencias:write",
    "leads:read", "leads:write",
    "fichajes:read:all",
    "documentos:read",
    "prestamos:read", "prestamos:write",
    "evaluaciones:read",
    "tarifas:read",
    "recibos:read", "recibos:write",
  ],
  PROFESOR: [
    "alumnos:read",
    "sesiones:read", "sesiones:write:own",
    "incidencias:read", "incidencias:write",
    "fichajes:write:own",
    "ausencias:read",
    "documentos:read",
    "prestamos:read", "prestamos:write",
    "evaluaciones:read", "evaluaciones:write",
    "rubricas:read",
    "turnos:read", "turnos:write",
  ],
};

export function hasPermission(rol: Rol | null | undefined, permission: Permission): boolean {
  if (!rol) return false;
  return ROLE_PERMISSIONS[rol]?.includes(permission) ?? false;
}

/** MASTER always sees Add/Edit/Delete UI affordances. */
export function canWriteUi(rol: Rol | null | undefined, permission: Permission): boolean {
  if (isMasterRole(rol)) return true;
  return hasPermission(rol, permission);
}

export function hasAnyPermission(rol: Rol | null | undefined, perms: Permission[]): boolean {
  return perms.some((p) => hasPermission(rol, p));
}

export const ROLE_LABEL: Record<Rol, string> = {
  MASTER: "Master",
  ADMIN: "Administrador",
  DIRECCION: "Dirección",
  SECRETARIA: "Secretaría",
  PROFESOR: "Profesor",
};
