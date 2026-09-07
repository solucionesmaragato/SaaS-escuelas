import { useSidebar } from "@/components/ui/sidebar";
import { MYSINCOPPA_APP_NAME, MYSINCOPPA_SIDEBAR_LOGO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function SidebarLogoToggle({ className }: { className?: string }) {
  const { toggleSidebar, isMobile, openMobile, state } = useSidebar();
  const isSidebarExpanded = isMobile ? openMobile : state === "expanded";

  return (
    <button
      type="button"
      className={cn(
        "h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border/40 bg-white p-0",
        className,
      )}
      onClick={toggleSidebar}
      aria-label={isSidebarExpanded ? "Contraer menú lateral" : "Expandir menú lateral"}
      aria-expanded={isSidebarExpanded}
    >
      <img
        src={MYSINCOPPA_SIDEBAR_LOGO_URL}
        alt={MYSINCOPPA_APP_NAME}
        className="h-full w-full object-contain"
      />
    </button>
  );
}
