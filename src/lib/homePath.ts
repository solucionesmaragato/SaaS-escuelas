import { isProfesorRole } from "@/lib/tenantQuery";

export type HomePath = "/app" | "/dashboard";

/** Post-login / workspace home. PROFESOR → /app; all other roles → /dashboard. */
export function homePathForRole(rol: string | null | undefined): HomePath {
  return isProfesorRole(rol) ? "/app" : "/dashboard";
}
