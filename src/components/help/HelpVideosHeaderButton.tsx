import { Link } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveTenant } from "@/context/AppContext";
import { canAccessHelpVideos } from "@/lib/helpVideosAccess";
import { cn } from "@/lib/utils";

export function HelpVideosHeaderButton({ className }: { className?: string }) {
  const { rol, tenantId } = useActiveTenant();

  if (!canAccessHelpVideos(rol, tenantId)) return null;

  return (
    <Button variant="brand-outline" size="sm" className={cn("shrink-0", className)} asChild>
      <Link to="/videos">
        <Video className="mr-1.5 h-4 w-4" />
        Videos
      </Link>
    </Button>
  );
}
