import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const COMPACT_BREAKPOINT = 1024;
/** Narrow admin/secretaría phones (~7"); dashboard hides widgets and maximizes calendar. */
const ADMIN_COMPACT_DASHBOARD_BREAKPOINT = 640;

function getInitialMatch(maxWidth: number): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < maxWidth;
}

function useViewportBreakpoint(maxWidth: number): boolean {
  const [matches, setMatches] = React.useState(() => getInitialMatch(maxWidth));

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${maxWidth - 1}px)`);
    const onChange = () => setMatches(window.innerWidth < maxWidth);
    mql.addEventListener("change", onChange);
    setMatches(window.innerWidth < maxWidth);
    return () => mql.removeEventListener("change", onChange);
  }, [maxWidth]);

  return matches;
}

/** Returns true when viewport is a phone (<768px). */
export function useIsMobile(): boolean {
  return useViewportBreakpoint(MOBILE_BREAKPOINT);
}

/** Returns true on phones AND tablets (<1024px) — use to gate the PROFESOR mobile shell. */
export function useIsCompactViewport(): boolean {
  return useViewportBreakpoint(COMPACT_BREAKPOINT);
}

/** Returns true on narrow admin dashboards (<640px, ~7" phones). */
export function useIsAdminCompactDashboard(): boolean {
  return useViewportBreakpoint(ADMIN_COMPACT_DASHBOARD_BREAKPOINT);
}
