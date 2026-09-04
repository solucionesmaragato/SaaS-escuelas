import { MYSINCOPPA_APP_NAME, MYSINCOPPA_LOGO_URL } from "@/lib/brand";
import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  variant?: "default" | "compact";
  /** Reservado: antes forzaba fondo oscuro; ahora se ignora (logo sin caja). */
  onLight?: boolean;
};

export function AppLogo({ className, variant = "default" }: AppLogoProps) {
  return (
    <img
      src={MYSINCOPPA_LOGO_URL}
      alt={MYSINCOPPA_APP_NAME}
      className={cn(
        "h-auto w-auto object-contain",
        variant === "compact" ? "max-h-10" : "max-h-16",
        className,
      )}
      loading="eager"
      decoding="async"
    />
  );
}
