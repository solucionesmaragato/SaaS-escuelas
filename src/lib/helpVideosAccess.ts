import { isDemoTenantId } from "@/lib/demoTrial";
import { isAdminRole, isDireccionRole, isMasterRole, isSecretariaRole } from "@/lib/tenantQuery";

export function canAccessHelpVideos(
  rol: string | null | undefined,
  tenantId: string | null | undefined,
): boolean {
  if (!tenantId || isDemoTenantId(tenantId)) return false;
  return isMasterRole(rol) || isAdminRole(rol) || isSecretariaRole(rol) || isDireccionRole(rol);
}
