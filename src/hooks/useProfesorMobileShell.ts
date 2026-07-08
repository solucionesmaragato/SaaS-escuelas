import { useActiveTenant } from "@/context/AppContext";
import { isProfesorRole } from "@/lib/tenantQuery";
import { useIsCompactViewport } from "@/hooks/use-mobile";

/**
 * Returns true ONLY when the active user is a PROFESOR AND the viewport is
 * compact (<1024px — phones and tablets).
 *
 * When true, the authenticated shell hides the sidebar and shows a Home
 * button instead of the sidebar toggle.
 */
export function useProfesorMobileShell(): boolean {
  const { rol } = useActiveTenant();
  const isCompact = useIsCompactViewport();
  return isCompact && isProfesorRole(rol?.trim());
}
