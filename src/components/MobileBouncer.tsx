import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/AppContext";
import { useIsCompactViewport } from "@/hooks/use-mobile";
import { isDemoTenantId } from "@/lib/demoTrial";

const MOBILE_BOUNCER_DISMISSED_KEY = "mobile_bouncer_dismissed";

const BOUNCER_MESSAGE =
  "👋 ¡Bienvenido a tu cuenta demo! Esta herramienta está diseñada con funciones avanzadas de gestión. Para disfrutar de la experiencia completa, inicia sesión desde un ordenador o tablet grande.";

export function MobileBouncer() {
  const { activePerfil } = useApp();
  const isCompactViewport = useIsCompactViewport();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(MOBILE_BOUNCER_DISMISSED_KEY) === "1",
  );

  if (!activePerfil) return null;
  if (!isDemoTenantId(activePerfil.ID_CLIENTE)) return null;
  if (!isCompactViewport) return null;
  if (dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(MOBILE_BOUNCER_DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background px-6 text-center">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4"
        aria-label="Cerrar"
        onClick={dismiss}
      >
        <X className="h-5 w-5" />
      </Button>
      <p className="max-w-md text-base leading-relaxed text-foreground">{BOUNCER_MESSAGE}</p>
      <Button className="mt-6" onClick={dismiss}>
        Entendido
      </Button>
    </div>
  );
}
